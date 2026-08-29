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

export default function PanicButtons() {
  const { t } = useLanguage()
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

    let lat = null, lng = null
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })
      )
      lat = pos.coords.latitude
      lng = pos.coords.longitude
    } catch {
      // GPS no disponible
    }

    const { data: { user: authUser } } = await supabase.auth.getUser()
    const ahora = new Date()
    const expiresAt = new Date(ahora.getTime() + 24 * 60 * 60 * 1000)

    await supabase.from('alerts').insert({
      sender_id: authUser.id,
      status_type: boton.tipo,
      latitude: lat,
      longitude: lng,
      sent_at: ahora.toISOString(),
      expires_at: expiresAt.toISOString(),
    })

    if (familiares.length > 0 && lat) {
      const mapsLink = `https://maps.google.com/?q=${lat},${lng}`
      const hora = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
      const fecha = ahora.toLocaleDateString('es-CO')
      const smsMsg = t(boton.mensajeKey)
      const cuerpo = `${boton.emoji} ${smsMsg} — ${user?.full_name || 'Usuario'} | ${boton.estado} | ${mapsLink} | ${hora} — ${fecha}`
      const numeros = familiares.map(f => f.users?.phone_number).filter(Boolean).join(',')
      if (numeros) {
        window.location.href = `sms:${numeros}?body=${encodeURIComponent(cuerpo)}`
      }
    }

    setEnviando(null)
    setConfirmacion(boton)
    setTimeout(() => setConfirmacion(null), 5000)
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

      <div className={styles.instruccion}>
        {t('instruccion')}
      </div>

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

      {familiares.length === 0 && (
        <div className={styles.aviso}>
          {t('sinFamiliares')}
        </div>
      )}

      <div className={styles.pb} />
      {mostrarPerfil && <Perfil onCerrar={() => setMostrarPerfil(false)} />}
    </div>
  )
}
