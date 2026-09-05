import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import styles from './PanicButtons.module.css'
import Perfil from './Perfil'
import { useLanguage } from '../i18n/LanguageContext'

const BOTONES = [
  { tipo: 'red',    emoji: '🔴', tituloKey: 'btnRojoTitulo',    mensajeKey: 'btnRojoMensaje',    color: '#C0392B', colorHover: '#a93226', estado: 'EN PELIGRO' },
  { tipo: 'orange', emoji: '🟠', tituloKey: 'btnNaranjaTitulo', mensajeKey: 'btnNaranjaMensaje', color: '#E67E22', colorHover: '#ca6f1e', estado: 'HERIDO, NECESITO AYUDA MÉDICA' },
  { tipo: 'green',  emoji: '🟢', tituloKey: 'btnVerdeTitulo',   mensajeKey: 'btnVerdeMensaje',   color: '#1E8449', colorHover: '#196f3d', estado: 'ESTOY BIEN Y A SALVO' },
]

/** iOS separa los parametros de sms: con &, el resto con ?. */
const ES_IOS = typeof navigator !== 'undefined'
  && (/iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
const SEP_SMS = ES_IOS ? '&' : '?'

/** Corta una promesa de red para que la emergencia nunca se quede esperando. */
function conTiempoLimite(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), ms)),
  ])
}

export default function PanicButtons() {
  const { t } = useLanguage()
  const [respaldo, setRespaldo] = useState(null)
  const [sinNube, setSinNube] = useState(false)
  const [user, setUser] = useState(null)
  const [familiares, setFamiliares] = useState([])
  const [enviando, setEnviando] = useState(null)
  const [confirmacion, setConfirmacion] = useState(null)
  const [confirmarBtn, setConfirmarBtn] = useState(null)
  const [mostrarPerfil, setMostrarPerfil] = useState(false)

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: perfil } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setUser(perfil)

    const { data: links } = await supabase
      .from('family_links')
      .select('linked_user_id, users!family_links_linked_user_id_fkey(full_name, phone_number)')
      .eq('user_id', authUser.id)
      .eq('status', 'accepted')
    setFamiliares(links || [])
  }

  async function enviarAlerta(boton) {
    if (enviando) return
    setConfirmarBtn(null)
    setEnviando(boton.tipo)

    const { data: { user: authUser } } = await supabase.auth.getUser()
    const ahora = new Date()
    const expiresAt = new Date(ahora.getTime() + 24 * 60 * 60 * 1000)

    let lat = null, lng = null
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000, maximumAge: 10000 })
      )
      lat = pos.coords.latitude
      lng = pos.coords.longitude
    } catch {}

    // Hay que esperar a que termine el guardado ANTES de abrir Mensajes:
    // en iOS, Safari descarga la pagina al ir a sms: y cancela la peticion.
    // Se corta a los 12 s para no dejar la emergencia esperando indefinidamente.
    let guardadaEnNube = false
    try {
      const res = await conTiempoLimite(
        supabase.from('alerts').insert({
          sender_id: authUser.id,
          status_type: boton.tipo,
          latitude: lat,
          longitude: lng,
          sent_at: ahora.toISOString(),
          expires_at: expiresAt.toISOString(),
        }),
        12000,
      )
      if (res?.error) console.warn('[alerta] no se guardo:', res.error.message)
      guardadaEnNube = !res?.error
    } catch (e) {
      console.warn('[alerta] no se guardo:', e?.message || e)
    }

    let datosRespaldo = null
    if (familiares.length > 0) {
      const numeros = familiares.map(f => f.users?.phone_number).filter(Boolean)
      if (numeros.length > 0) {
        const hora = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
        const fecha = ahora.toLocaleDateString('es-CO')
        const smsMsg = t(boton.mensajeKey)
        const mapsLink = lat ? `https://maps.google.com/?q=${lat},${lng}` : 'GPS no disponible'
        // Sin emoji ni guion largo: obliga a codificacion cara y parte el SMS en mas trozos.
        const cuerpo = `${smsMsg} - ${user?.full_name || 'Usuario'} | ${boton.estado} | ${mapsLink} | ${hora} - ${fecha}`
        datosRespaldo = { numeros, cuerpo, contactos: familiares }
        // iOS usa & como separador; con ? no rellena el mensaje.
        window.location.href = `sms:${numeros.join(',')}${SEP_SMS}body=${encodeURIComponent(cuerpo)}`
      }
    }

    setEnviando(null)
    setConfirmacion(boton)
    setSinNube(!guardadaEnNube)
    setRespaldo(datosRespaldo)
    if (!datosRespaldo) setTimeout(() => setConfirmacion(null), 5000)
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <img src="/logo.png" alt="Botón de Emergencias" className={styles.logoImg} />
          <h1>Botón de Emergencias</h1>
          <button className={styles.salir} onClick={() => setMostrarPerfil(true)} title="Opciones">⚙️</button>
        </div>
        {user && <div className={styles.usuario}>{t('hola')} <strong>{user.full_name}</strong></div>}
      </header>

      {confirmacion && (
        <div className={styles.confirmacion} style={{ borderColor: confirmacion.color }}>
          <span style={{ fontSize: '1.5rem' }}>{confirmacion.emoji}</span>
          <div>
            <strong>{t('alertaEnviada')}</strong>
            <p>{t(confirmacion.mensajeKey)}</p>
          </div>
        </div>
      )}

      {respaldo && (
        <div className={styles.respaldo}>
          <strong>📤 {t('envioManualTitulo') || 'Envía la alerta ahora'}</strong>
          {sinNube && <p className={styles.respaldoAviso}>⚠️ Sin conexión: no se guardó en el historial.</p>}
          <a
            className={styles.respaldoSms}
            href={`sms:${respaldo.numeros.join(',')}${SEP_SMS}body=${encodeURIComponent(respaldo.cuerpo)}`}
          >
            📩 Abrir Mensajes (SMS)
          </a>
          <a
            className={styles.respaldoWa}
            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(respaldo.cuerpo)}`}
            target="_blank"
            rel="noreferrer"
          >
            💬 WhatsApp: elegir varios y enviar
          </a>
          <span className={styles.respaldoSub}>O abre el chat de uno solo:</span>
          <div className={styles.respaldoChats}>
            {respaldo.contactos.map((c, i) => (
              <a
                key={c.linked_user_id || i}
                className={styles.respaldoChat}
                href={`https://wa.me/${(c.users?.phone_number || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(respaldo.cuerpo)}`}
                target="_blank"
                rel="noreferrer"
              >
                💬 {c.users?.full_name || respaldo.numeros[i]}
              </a>
            ))}
          </div>
          <button className={styles.respaldoCerrar} onClick={() => { setRespaldo(null); setConfirmacion(null); setSinNube(false) }}>
            {t('cerrar') || 'Cerrar'}
          </button>
        </div>
      )}

      <div className={styles.instruccion}>
        {t('instruccion')}
      </div>

      {/* El aviso va arriba para que la banda quede pegada bajo el ultimo boton. */}
      {familiares.length === 0 && (
        <div className={styles.aviso}>
          {t('sinFamiliares')}
        </div>
      )}

      <div className={styles.botonesWrap}>
      <img src="/logo-empresa.png" alt="" className={styles.watermark} />
      <div className={styles.botones}>
        {BOTONES.map(b => (
          <div key={b.tipo}>
            {confirmarBtn === b.tipo ? (
              <div className={styles.confirmBox}>
                <p>{t('confirmar')} <strong>{t(b.tituloKey)}</strong>?</p>
                <div className={styles.confirmBtns}>
                  <button onClick={() => enviarAlerta(b)} style={{ background: b.color }}>{t('siEnviar')}</button>
                  <button onClick={() => setConfirmarBtn(null)} className={styles.cancelar}>{t('cancelar')}</button>
                </div>
              </div>
            ) : (
              <button
                className={styles.panico}
                style={{ background: b.color, '--hover': b.colorHover }}
                onClick={() => setConfirmarBtn(b.tipo)}
                disabled={enviando !== null}
              >
                <span className={styles.btnEmoji}>{b.emoji}</span>
                <span className={styles.btnTitulo}>{t(b.tituloKey)}</span>
                <span className={styles.btnMensaje}>{t(b.mensajeKey)}</span>
                {enviando === b.tipo && <span className={styles.spinner}>{t('enviando')}</span>}
              </button>
            )}
          </div>
        ))}
      </div>
      </div>

      <div className={styles.pb} />
      {mostrarPerfil && <Perfil onCerrar={() => setMostrarPerfil(false)} />}
    </div>
  )
}
