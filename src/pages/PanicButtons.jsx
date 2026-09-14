import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import styles from './PanicButtons.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { puedeEnviarAlerta, esPremium } from '../plan'
import { useNavContext } from '../components/NavContext'

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
  const { abrirOpciones } = useNavContext()
  const [respaldo, setRespaldo] = useState(null)
  const [sinNube, setSinNube] = useState(false)
  const [user, setUser] = useState(null)
  const [familiares, setFamiliares] = useState([])
  const [confirmacion, setConfirmacion] = useState(null)
  const [mostrarLimite, setMostrarLimite] = useState(null)
  const [avisoPlan, setAvisoPlan] = useState(false)
  const [avisoPremium, setAvisoPremium] = useState(false)
  const [gps, setGps] = useState('buscando')
  // La ubicacion se mantiene lista de antemano: al pulsar hay que abrir
  // Mensajes en el mismo instante del toque, sin esperar nada, o iOS pide
  // confirmacion para salir de la pagina.
  const posRef = useRef(null)

  const vigilanteRef = useRef(null)

  function iniciarWatch() {
    if (vigilanteRef.current !== null || !navigator.geolocation) return
    vigilanteRef.current = navigator.geolocation.watchPosition(
      p => {
        posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }
        setGps('listo')
      },
      err => setGps(err.code === err.PERMISSION_DENIED ? 'denegado' : 'error'),
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 },
    )
  }

  useEffect(() => {
    let canal = null
    cargarDatos().then(uid => {
      if (!uid) return
      // Suscripción en tiempo real: cuando cambian los familiares vinculados, recargar
      canal = supabase
        .channel('family_links_rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'family_links', filter: `user_id=eq.${uid}` }, () => cargarDatos())
        .subscribe()
    })
    verificarAlertasAuto()
    const intervalo = setInterval(verificarAlertasAuto, 60000)
    if (!navigator.geolocation) { setGps('sin-soporte'); return }

    async function init() {
      try {
        const perm = await navigator.permissions.query({ name: 'geolocation' })
        if (perm.state === 'denied') { setGps('denegado'); return }
        // 'prompt' o 'granted': iniciamos watch; el navegador pedirá permiso si hace falta
      } catch (_) { /* API no disponible, proceder normalmente */ }
      iniciarWatch()
    }
    init()

    return () => {
      clearInterval(intervalo)
      if (canal) supabase.removeChannel(canal)
      if (vigilanteRef.current !== null) {
        navigator.geolocation.clearWatch(vigilanteRef.current)
        vigilanteRef.current = null
      }
    }
  }, [])

  async function cargarDatos() {
    const { data: { session } } = await supabase.auth.getSession()
    const authUser = session?.user
    if (!authUser) return null

    // perfil y familiares en paralelo
    const [{ data: perfil }, { data: links }] = await Promise.all([
      supabase.from('users').select('*').eq('id', authUser.id).single(),
      supabase.from('family_links')
        .select('linked_user_id, users!family_links_linked_user_id_fkey(full_name, phone_number)')
        .eq('user_id', authUser.id)
        .eq('status', 'accepted'),
    ])
    setUser(perfil)
    setFamiliares(links || [])
    if (!esPremium(perfil) && !localStorage.getItem(`trialAviso_${authUser.id}`)) {
      setAvisoPlan(true)
    }
    if (esPremium(perfil) && !localStorage.getItem(`premiumAviso_${authUser.id}`)) {
      setAvisoPremium(true)
    }
    return authUser.id
  }

  /** Arma el texto del SMS. Sin emoji ni guion largo: encarecen el envio. */
  function construirCuerpo(boton) {
    const ahora = new Date()
    const hora = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    const fecha = ahora.toLocaleDateString('es-CO')
    const p = posRef.current
    const mapsLink = p ? `https://maps.google.com/?q=${p.lat},${p.lng}` : 'GPS no disponible'
    return `${t(boton.mensajeKey)} - ${user?.full_name || 'Usuario'} | ${boton.estado} | ${mapsLink} | ${hora} - ${fecha}`
  }

  /**
   * Se ejecuta de forma SINCRONA dentro del toque del usuario: abre Mensajes
   * en ese mismo instante, que es la unica forma de que iOS no muestre el
   * aviso de "abrir esta pagina en Mensajes". El guardado va despues, aparte.
   */
  function pulsarBoton(boton) {
    // Plan gratuito: 3 alertas de prueba. Se corta antes de tocar nada mas.
    if (!puedeEnviarAlerta(user)) { setMostrarLimite('alertas'); return }

    const numeros = familiares.map(f => f.users?.phone_number).filter(Boolean)
    const cuerpo = construirCuerpo(boton)

    setConfirmacion(boton)
    setSinNube(false)

    if (numeros.length > 0) {
      setRespaldo({ numeros, cuerpo, contactos: familiares })
      if (ES_IOS && numeros.length > 1) {
        // iOS no soporta múltiples destinatarios en un solo sms: — abre uno por uno
        numeros.forEach((n, i) => {
          setTimeout(() => {
            window.location.href = `sms:${n}&body=${encodeURIComponent(cuerpo)}`
          }, i * 1200)
        })
      } else {
        window.location.href = `sms:${numeros.join(',')}${SEP_SMS}body=${encodeURIComponent(cuerpo)}`
      }
    } else {
      setRespaldo(null)
      setTimeout(() => setConfirmacion(null), 5000)
    }

    guardarEnHistorial(boton)
  }

  /** Intenta obtener posición actualizada; devuelve posRef.current si falla. */
  function obtenerPosicion() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(posRef.current)
      if (posRef.current) {
        // Tenemos posición en caché — usarla de inmediato y refrescar en segundo plano
        const cached = posRef.current
        navigator.geolocation.getCurrentPosition(
          p => { posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude } },
          () => {},
          { timeout: 5000, maximumAge: 30000 }
        )
        resolve(cached)
      } else {
        // Sin posición — aceptar caché del sistema hasta 5 min o esperar 8s
        navigator.geolocation.getCurrentPosition(
          p => { posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }; resolve(posRef.current) },
          () => resolve(null),
          { timeout: 8000, maximumAge: 300000, enableHighAccuracy: false }
        )
      }
    })
  }

  /** Guarda la alerta sin bloquear el aviso a la familia. */
  async function guardarEnHistorial(boton) {
    const ahora = new Date()
    const expiresAt = new Date(ahora.getTime() + 24 * 60 * 60 * 1000)
    const p = await obtenerPosicion()
    let authUser = null
    try {
      const { data: { user: u } } = await conTiempoLimite(supabase.auth.getUser(), 8000)
      authUser = u
      if (!authUser) throw new Error('sin sesion')
      const res = await conTiempoLimite(
        supabase.from('alerts').insert({
          sender_id: authUser.id,
          status_type: boton.tipo,
          latitude: p?.lat ?? null,
          longitude: p?.lng ?? null,
          sent_at: ahora.toISOString(),
          expires_at: expiresAt.toISOString(),
          is_auto: false,
        }),
        12000,
      )
      if (res?.error) {
        console.warn('[alerta] no se guardo:', res.error.message)
        setSinNube(true)
      }

      // Segunda alerta automática de 2 horas: exclusiva de Plan Premium
      if ((boton.tipo === 'red' || boton.tipo === 'orange') && user?.auto_alert_enabled && esPremium(user)) {
        const scheduledAt = new Date(ahora.getTime() + 2 * 60 * 60 * 1000)
        await supabase.from('scheduled_alerts').insert({
          user_id: authUser.id,
          status_type: boton.tipo,
          latitude: p?.lat ?? null,
          longitude: p?.lng ?? null,
          scheduled_at: scheduledAt.toISOString(),
          fired: false,
        })
      }
    } catch (e) {
      console.warn('[alerta] no se guardo:', e?.message || e)
      setSinNube(true)
    }

  }

  /** Dispara alertas programadas que ya vencieron. */
  async function verificarAlertasAuto() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const ahora = new Date().toISOString()
    const { data: pendientes } = await supabase
      .from('scheduled_alerts')
      .select('*')
      .eq('user_id', authUser.id)
      .eq('fired', false)
      .lte('scheduled_at', ahora)
    if (!pendientes || pendientes.length === 0) return

    for (const item of pendientes) {
      const sentAt = new Date()
      const expiresAt = new Date(sentAt.getTime() + 24 * 60 * 60 * 1000)
      await supabase.from('alerts').insert({
        sender_id: authUser.id,
        status_type: item.status_type,
        latitude: item.latitude,
        longitude: item.longitude,
        sent_at: sentAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        is_auto: true,
      })
      await supabase.from('scheduled_alerts').update({ fired: true }).eq('id', item.id)
    }
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <img src="/logo.png" alt="Botón de Emergencias" className={styles.logoImg} />
          <h1>{t('appNombre')}</h1>
          <button className={styles.salir} onClick={abrirOpciones} title="Opciones">⚙️</button>
        </div>
        {user && <div className={styles.usuario}>{t('hola')} <strong>{user.full_name}</strong></div>}
      </header>

      {avisoPlan && user && !esPremium(user) && (
        <div className={styles.avisoPlan}>
          <div className={styles.avisoPlanTexto}>
            <strong>🎉 ¡Bienvenido al {t('planTrialNombre')}!</strong>
            <ul className={styles.avisoPlanLista}>
              <li>{t('planTrialF1')}</li>
              <li>{t('planTrialF2')}</li>
              <li>{t('planTrialF3')}</li>
              <li>{t('planTrialF4')}</li>
              <li>{t('planTrialF5')}</li>
            </ul>
          </div>
          <button
            className={styles.avisoPlanCerrar}
            onClick={() => {
              localStorage.setItem(`trialAviso_${user.id}`, '1')
              setAvisoPlan(false)
            }}
          >
            Entendido ✓
          </button>
        </div>
      )}

      {avisoPremium && user && esPremium(user) && (
        <div className={styles.avisoPremium}>
          <div className={styles.avisoPlanTexto}>
            <strong>🎉 ¡Bienvenido al {t('planPremiumNombre')}!</strong>
            <p className={styles.avisoPremiumSub}>{t('planPermanente')}</p>
            <ul className={styles.avisoPlanLista}>
              <li>{t('planPremiumF1')}</li>
              <li>{t('planPremiumF2')}</li>
              <li>{t('planPremiumF3')}</li>
              <li>{t('planPremiumF4')}</li>
              <li>{t('planPremiumF5')}</li>
              <li>{t('planPremiumF6')}</li>
            </ul>
          </div>
          <button
            className={styles.avisoPlanCerrar}
            style={{ background: '#e6a817', color: '#fff' }}
            onClick={() => {
              localStorage.setItem(`premiumAviso_${user.id}`, '1')
              setAvisoPremium(false)
            }}
          >
            Entendido ✓
          </button>
        </div>
      )}

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
          <strong>📤 {t('envioManualTitulo')}</strong>
          {sinNube && <p className={styles.respaldoAviso}>⚠️ {t('sinConexionNube')}</p>}
          <a
            className={styles.respaldoSms}
            href={`sms:${respaldo.numeros.join(',')}${SEP_SMS}body=${encodeURIComponent(respaldo.cuerpo)}`}
          >
            {t('abrirMensajes')}
          </a>
          <a
            className={styles.respaldoWa}
            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(respaldo.cuerpo)}`}
            target="_blank"
            rel="noreferrer"
          >
            {t('waVarios')}
          </a>
          <span className={styles.respaldoSub}>{t('waIndividual')}</span>
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
            {t('cerrar')}
          </button>
        </div>
      )}

      <div className={styles.instruccion}>
        {t('instruccion')}
      </div>

      <div className={gps === 'listo' ? styles.gpsOk : styles.gpsMal}>
        {gps === 'listo' && `📍 ${t('gpsListo')}`}
        {(gps === 'buscando' || gps === 'sin-permiso') && `⏳ ${t('gpsBuscando')}`}
        {gps === 'denegado' && `⚠️ ${t('gpsDenegado')}`}
        {(gps === 'error' || gps === 'sin-soporte') && `⚠️ ${t('gpsError')}`}
      </div>

      {mostrarLimite && (
        <div className={styles.limiteOverlay} onClick={() => setMostrarLimite(null)}>
          <div className={styles.limiteCard} onClick={e => e.stopPropagation()}>
            <div className={styles.limiteIcono}>⭐</div>
            <h3>{t(mostrarLimite === 'alertas' ? 'limiteAlertasTitulo' : 'limiteFamiliaresTitulo')}</h3>
            <p>{t(mostrarLimite === 'alertas' ? 'limiteAlertasTexto' : 'limiteFamiliaresTexto')}</p>
            <a
              className={styles.limiteBtn}
              href={import.meta.env.VITE_WOMPI_LINK || '#'}
              target="_blank" rel="noreferrer"
            >
              {t('verSuscripcion')}
            </a>
            <button className={styles.limiteCerrar} onClick={() => setMostrarLimite(null)}>
              {t('cerrar')}
            </button>
          </div>
        </div>
      )}

      <div className={styles.botonesWrap}>
      <div className={styles.botones}>
        {BOTONES.map(b => (
          <div key={b.tipo}>
            {/* Sin paso de confirmacion: un solo toque abre Mensajes. */}
            <button
              className={styles.panico}
              style={{ background: b.color, '--hover': b.colorHover, opacity: gps === 'listo' ? 1 : 0.55 }}
              onClick={() => pulsarBoton(b)}
              title={gps !== 'listo' ? 'Esperando GPS...' : ''}
            >
              <span className={styles.btnEmoji}>{b.emoji}</span>
              <span className={styles.btnTitulo}>{t(b.tituloKey)}</span>
              <span className={styles.btnMensaje}>{t(b.mensajeKey)}</span>
            </button>
          </div>
        ))}
      </div>
      </div>

      <div className={styles.pb} />
    </div>
  )
}
