import { useState, useEffect, useRef } from 'react'
import { registerPlugin } from '@capacitor/core'
import { supabase } from '../supabase'
import styles from './PanicButtons.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { puedeEnviarAlerta, esPremium, esFamiliar, puedeSegundaAlerta } from '../plan'
import { useNavContext } from '../components/NavContext'

const SilentSms = registerPlugin('SilentSms')
const EN_CAPACITOR = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

const BOTONES = [
  { tipo: 'red',    emoji: '🔴', tituloKey: 'btnRojoTitulo',    mensajeKey: 'btnRojoMensaje',    color: '#C0392B', colorHover: '#a93226', estadoKey: 'estadoPeligro' },
  { tipo: 'orange', emoji: '🟠', tituloKey: 'btnNaranjaTitulo', mensajeKey: 'btnNaranjaMensaje', color: '#E67E22', colorHover: '#ca6f1e', estadoKey: 'estadoHerido' },
  { tipo: 'green',  emoji: '🟢', tituloKey: 'btnVerdeTitulo',   mensajeKey: 'btnVerdeMensaje',   color: '#1E8449', colorHover: '#196f3d', estadoKey: 'estadoBien' },
]

/** iOS separa los parametros de sms: con &, el resto con ?. */
const ES_IOS = typeof navigator !== 'undefined'
  && (/iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
const SEP_SMS = ES_IOS ? '&' : '?'

const COLA_KEY = 'alertasCola_v1'
const LOCALES = { es: 'es-CO', en: 'en-US', pt: 'pt-BR' }

// Alfabeto GSM-7 del SMS. Con solo estos caracteres un SMS lleva 160 letras; una sola
// tilde como la de "María" lo pasa a 70 y el mensaje se parte en 3 o 4 pedazos, que
// con poca señal fallan más. Por eso el SMS de emergencia se escribe sin tildes.
const GSM7 = new Set('@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà|')
function textoSms(texto) {
  return [...(texto || '')].map(c => {
    if (GSM7.has(c)) return c
    if (/\s/.test(c)) return ' '
    return [...c.normalize('NFD').replace(/\p{M}/gu, '')].filter(x => GSM7.has(x)).join('')
  }).join('').replace(/ {2,}/g, ' ').trim()
}
// 5 decimales = 1 metro de precisión, y el link queda más corto
const linkMapa = (p) => `https://maps.google.com/?q=${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
const horaSms = (idioma) => new Date().toLocaleTimeString(idioma, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function LogoWhatsApp({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

const claveMes = (uid) => {
  const d = new Date()
  return `alertasMes_${uid}_${d.getFullYear()}-${d.getMonth() + 1}`
}
function leerContadorLocal(uid) {
  try { return parseInt(localStorage.getItem(claveMes(uid)) || '0', 10) || 0 } catch (_) { return 0 }
}
function guardarContadorLocal(uid, n) {
  try { localStorage.setItem(claveMes(uid), String(n)) } catch (_) {}
}

function encolar(payload) {
  try {
    const cola = JSON.parse(localStorage.getItem(COLA_KEY) || '[]')
    cola.push(payload)
    localStorage.setItem(COLA_KEY, JSON.stringify(cola))
  } catch (_) {}
}

let _procesandoCola = false
/** Reenvía la cola; solo saca de la cola las alertas que la base confirmó. */
async function procesarCola() {
  if (_procesandoCola) return
  let cola
  try { cola = JSON.parse(localStorage.getItem(COLA_KEY) || '[]') } catch (_) { return }
  if (!cola.length) return
  _procesandoCola = true
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    const pendientes = []
    for (const item of cola) {
      try {
        const { error } = await conTiempoLimite(
          supabase.from('alerts').insert({ ...item, sender_id: session.user.id }), 10000)
        // 23505 = ya llegó antes; LIMITE_ALERTAS = rechazo definitivo. Ninguno se reintenta.
        if (error && error.code !== '23505' && !/LIMITE_ALERTAS/.test(error.message || '')) pendientes.push(item)
      } catch (_) { pendientes.push(item) }
    }
    // Alertas encoladas mientras se procesaba no se pierden
    const nuevas = JSON.parse(localStorage.getItem(COLA_KEY) || '[]').slice(cola.length)
    const resto = [...pendientes, ...nuevas]
    if (resto.length) localStorage.setItem(COLA_KEY, JSON.stringify(resto))
    else localStorage.removeItem(COLA_KEY)
  } finally {
    _procesandoCola = false
  }
}

/** Corta una promesa de red para que la emergencia nunca se quede esperando. */
function conTiempoLimite(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), ms)),
  ])
}

export default function PanicButtons() {
  const { t, lang } = useLanguage()
  const { abrirOpciones, abrirPlanes } = useNavContext()
  const [respaldo, setRespaldo] = useState(null)
  const [sinNube, setSinNube] = useState(false)
  const [user, setUser] = useState(null)
  const [familiares, setFamiliares] = useState([])
  const [confirmacion, setConfirmacion] = useState(null)
  const [mostrarLimite, setMostrarLimite] = useState(null)
  const [avisoPlan, setAvisoPlan] = useState(false)
  const [avisoFamiliar, setAvisoFamiliar] = useState(false)
  const [avisoPremium, setAvisoPremium] = useState(false)
  const [alertasMes, setAlertasMes] = useState(0)
  const [gps, setGps] = useState('buscando')
  // La ubicacion se mantiene lista de antemano: al pulsar hay que abrir
  // Mensajes en el mismo instante del toque, sin esperar nada, o iOS pide
  // confirmacion para salir de la pagina.
  const posRef = useRef(null)

  const vigilanteRef = useRef(null)
  const ultimoToqueRef = useRef(0)

  function iniciarWatch() {
    if (vigilanteRef.current !== null || !navigator.geolocation) return
    // Ubicación rápida (antenas/wifi o última conocida) mientras llega la de GPS preciso
    navigator.geolocation.getCurrentPosition(
      p => {
        if (!posRef.current) {
          posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }
          setGps('listo')
        }
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 4000 },
    )
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
    // Cola offline: se reintenta al volver la red, al volver a la app y cada 20 s
    window.addEventListener('online', procesarCola)
    const onVisible = () => { if (document.visibilityState === 'visible') procesarCola() }
    document.addEventListener('visibilitychange', onVisible)
    const reintentoCola = setInterval(procesarCola, 20000)
    procesarCola()

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

    // Cuando el usuario suscribe desde Perfil, recargar para mostrar modal de bienvenida
    function onRecargarPlan() { cargarDatos() }
    window.addEventListener('recargarPlan', onRecargarPlan)

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
      window.removeEventListener('online', procesarCola)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(reintentoCola)
      clearInterval(intervalo)
      window.removeEventListener('recargarPlan', onRecargarPlan)
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

    // Familiares y nombre guardados en el celular: disponibles al instante y sin internet
    try {
      const cache = JSON.parse(localStorage.getItem(`panicCache_${authUser.id}`) || 'null')
      if (cache) {
        setUser(prev => prev || cache.perfil)
        setFamiliares(prev => prev.length ? prev : cache.links)
      }
    } catch (_) {}

    // perfil y familiares en paralelo
    const [{ data: perfil }, { data: links }] = await Promise.all([
      supabase.from('users').select('id, full_name, username, plan, is_premium, premium_hasta, auto_alert_enabled').eq('id', authUser.id).single(),
      supabase.from('family_links')
        .select('linked_user_id, users!family_links_linked_user_id_fkey(full_name, phone_number)')
        .eq('user_id', authUser.id)
        .eq('status', 'accepted'),
    ])
    // Sin señal las consultas fallan: se conserva lo último conocido para que el SMS igual salga
    if (perfil) setUser(perfil)
    if (links) setFamiliares(links)
    if (perfil && links) {
      try { localStorage.setItem(`panicCache_${authUser.id}`, JSON.stringify({ perfil, links })) } catch (_) {}
    }
    if (!perfil) return authUser.id

    // Contar alertas manuales enviadas este mes (solo relevante para plan gratis)
    if (!esPremium(perfil) && !esFamiliar(perfil)) {
      // Contador del servidor (no se borra con las alertas) + el del celular (cuenta aunque no haya señal)
      const { data: delServidor } = await supabase.rpc('alertas_usadas_mes')
      setAlertasMes(Math.max(delServidor || 0, leerContadorLocal(authUser.id)))
    }

    if (!esPremium(perfil) && !esFamiliar(perfil) && !localStorage.getItem(`trialAviso_${authUser.id}`)) {
      setAvisoPlan(true)
    } else if (esFamiliar(perfil) && !localStorage.getItem(`familiarAviso_${authUser.id}`)) {
      setAvisoFamiliar(true)
    } else if (esPremium(perfil) && !localStorage.getItem(`premiumAviso_${authUser.id}`)) {
      setAvisoPremium(true)
    }
    return authUser.id
  }

  /** Arma el texto del SMS: sin emoji ni tildes, para que quepa en el menor número de SMS. */
  function construirCuerpo(boton) {
    const idioma = LOCALES[lang] || 'es-CO'
    const fecha = new Date().toLocaleDateString(idioma)
    const p = posRef.current
    const mapsLink = p ? linkMapa(p) : t('gpsNoDisponible')
    // Separado con guiones: la barra | cuenta doble en el SMS
    return textoSms(`${t(boton.mensajeKey)} - ${user?.full_name || ''} - ${t(boton.estadoKey)} - ${mapsLink} - ${horaSms(idioma)} ${fecha}`)
  }

  /**
   * Si al pulsar todavía no había GPS (sin datos el primer punto puede tardar), el SMS
   * salió sin ubicación. Apenas llegue un punto, dentro de 3 minutos, se manda otro SMS
   * solo con la ubicación. Sigue funcionando aunque se cambie de pestaña.
   */
  function enviarUbicacionCuandoLlegue(numeros) {
    if (!navigator.geolocation) return
    const idioma = LOCALES[lang] || 'es-CO'
    const encabezado = `${t('smsUbicacionDe')} ${user?.full_name || ''}`
    let terminado = false
    let revisar = null
    let vigia = null
    const terminar = () => {
      terminado = true
      clearInterval(revisar)
      if (vigia !== null) navigator.geolocation.clearWatch(vigia)
    }
    const enviar = (p) => {
      if (terminado) return
      terminar()
      SilentSms.enviar({ numeros, cuerpo: textoSms(`${encabezado}: ${linkMapa(p)} - ${horaSms(idioma)}`) }).catch(() => {})
    }
    // El vigilante de la pantalla puede tener el punto primero
    revisar = setInterval(() => { if (posRef.current) enviar(posRef.current) }, 2000)
    vigia = navigator.geolocation.watchPosition(
      p => enviar({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 180000 },
    )
    setTimeout(() => { if (!terminado) terminar() }, 180000)
  }

  function tocarSonidoAlerta() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3)
      gain.gain.setValueAtTime(0.4, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch (e) { /* silencioso si el navegador lo bloquea */ }
  }

  /**
   * Se ejecuta de forma SINCRONA dentro del toque del usuario: abre Mensajes
   * en ese mismo instante, que es la unica forma de que iOS no muestre el
   * aviso de "abrir esta pagina en Mensajes". El guardado va despues, aparte.
   */
  function pulsarBoton(boton) {
    // Un toque doble por nervios no debe mandar dos alertas ni gastar dos del cupo
    const ahoraMs = Date.now()
    if (ahoraMs - ultimoToqueRef.current < 4000) return
    ultimoToqueRef.current = ahoraMs
    tocarSonidoAlerta()
    // Plan gratuito: 6 alertas al mes. Se corta antes de tocar nada más.
    const usadas = Math.max(alertasMes, user ? leerContadorLocal(user.id) : 0)
    if (!puedeEnviarAlerta(user, usadas)) { setMostrarLimite('alertas'); return }
    setAlertasMes(usadas + 1)
    if (user) guardarContadorLocal(user.id, usadas + 1)

    const numeros = familiares.map(f => f.users?.phone_number).filter(Boolean)
    const cuerpo = construirCuerpo(boton)

    setConfirmacion(boton)
    setSinNube(false)

    if (numeros.length > 0) {
      if (EN_CAPACITOR) {
        // Android: SMS silencioso — sin abrir la app de mensajes
        setRespaldo({ numeros, cuerpo, contactos: familiares, smsSilencioso: true })
        SilentSms.enviar({ numeros, cuerpo }).catch(() => {
          // Si el plugin falla (permiso denegado, etc.), fallback a URL scheme
          window.location.href = `sms:${numeros.join(',')}?body=${encodeURIComponent(cuerpo)}`
        })
        if (!posRef.current) enviarUbicacionCuandoLlegue(numeros)
      } else if (ES_IOS && numeros.length > 1) {
        setRespaldo({ numeros, cuerpo, contactos: familiares })
        // iOS no soporta múltiples destinatarios en un solo sms: — abre uno por uno
        numeros.forEach((n, i) => {
          setTimeout(() => {
            window.location.href = `sms:${n}&body=${encodeURIComponent(cuerpo)}`
          }, i * 1200)
        })
      } else {
        setRespaldo({ numeros, cuerpo, contactos: familiares })
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
          { timeout: 3000, maximumAge: 600000, enableHighAccuracy: false }
        )
      }
    })
  }

  /** Guarda la alerta sin bloquear el aviso a la familia. */
  async function guardarEnHistorial(boton) {
    const ahora = new Date()
    const expiresAt = new Date(ahora.getTime() + 24 * 60 * 60 * 1000)
    const p = await obtenerPosicion()

    const payload = {
      // ID único desde el celular: si un reintento llega dos veces, la base rechaza la copia
      id: crypto.randomUUID(),
      status_type: boton.tipo,
      latitude: p?.lat ?? null,
      longitude: p?.lng ?? null,
      sent_at: ahora.toISOString(),
      expires_at: expiresAt.toISOString(),
      is_auto: false,
    }

    // Sin internet: encolar y avisar. Se enviará automáticamente al volver la señal.
    if (!navigator.onLine) { encolar(payload); setSinNube(true); return }

    // getSession lee la sesión del celular al instante (getUser iba a internet y tardaba)
    const { data: { session } } = await supabase.auth.getSession()
    const authUser = session?.user
    if (!authUser) { encolar(payload); setSinNube(true); return }

    try {
      const res = await conTiempoLimite(
        supabase.from('alerts').insert({ ...payload, sender_id: authUser.id }),
        10000,
      )
      if (res?.error) throw res.error
    } catch (e) {
      if (/LIMITE_ALERTAS/.test(e?.message || '')) { setMostrarLimite('alertas'); return }
      encolar(payload)
      setSinNube(true)
      return
    }

    // Segunda alerta automática de 2 horas: exclusiva de Plan Premium
    if ((boton.tipo === 'red' || boton.tipo === 'orange') && user?.auto_alert_enabled && puedeSegundaAlerta(user)) {
      const scheduledAt = new Date(ahora.getTime() + 2 * 60 * 60 * 1000)
      supabase.from('scheduled_alerts').insert({
        user_id: authUser.id,
        status_type: boton.tipo,
        latitude: p?.lat ?? null,
        longitude: p?.lng ?? null,
        scheduled_at: scheduledAt.toISOString(),
        fired: false,
      }).then(() => {}, () => {})
    }
  }

  /** Dispara alertas programadas que ya vencieron. */
  async function verificarAlertasAuto() {
    const { data: { session } } = await supabase.auth.getSession()
    const authUser = session?.user
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
      // Primero se "toma" la alerta; si no se pudo marcar, no se envía.
      // Antes se enviaba y luego se marcaba: si el marcado fallaba, se reenviaba cada minuto sin fin.
      const { data: tomada } = await supabase.from('scheduled_alerts')
        .update({ fired: true }).eq('id', item.id).eq('fired', false).select('id')
      if (!tomada?.length) continue
      const sentAt = new Date()
      const expiresAt = new Date(sentAt.getTime() + 24 * 60 * 60 * 1000)
      const { error } = await supabase.from('alerts').insert({
        sender_id: authUser.id,
        status_type: item.status_type,
        latitude: item.latitude,
        longitude: item.longitude,
        sent_at: sentAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        is_auto: true,
      })
      // No salió: vuelve a pendiente para el próximo intento (de la app o del servidor)
      if (error) await supabase.from('scheduled_alerts').update({ fired: false }).eq('id', item.id)
    }
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <img src="/logo.png" alt="Botón de Emergencias" className={styles.logoImg} />
          <h1>{t('appNombre')}</h1>
          <button className={styles.salir} onClick={abrirOpciones} title={t('tituloOpciones')} aria-label={t('tituloOpciones')}>⚙️</button>
        </div>
        {user && <div className={styles.usuario}>{t('hola')} <strong>{user.full_name}</strong></div>}
      </header>

      {/* Modal bienvenida — App Gratis */}
      {avisoPlan && user && (
        <div className={styles.avisoOverlay}>
          <div className={styles.avisoModal}>
            <div className={styles.avisoModalIcono}>🆓</div>
            <h3 className={styles.avisoModalTitulo}>{t('bienvenidaGratisTitulo')}</h3>
            <ul className={styles.avisoModalLista}>
              <li>{t('elegirGratisF1')}</li>
              <li>{t('elegirGratisF2')}</li>
              <li>{t('elegirGratisF3')}</li>
              <li>{t('elegirGratisF4')}</li>
              <li>{t('elegirGratisF5')}</li>
            </ul>
            <button
              className={styles.avisoModalBtn}
              style={{ background: '#4CAF50' }}
              onClick={() => {
                localStorage.setItem(`trialAviso_${user.id}`, '1')
                setAvisoPlan(false)
              }}
            >{t('bienvenidaGratisBtn')}</button>
          </div>
        </div>
      )}

      {/* Modal bienvenida — Plan Familiar */}
      {avisoFamiliar && user && (
        <div className={styles.avisoOverlay}>
          <div className={styles.avisoModal}>
            <div className={styles.avisoModalIcono}>👨‍👩‍👧‍👦</div>
            <h3 className={styles.avisoModalTitulo}>{t('bienvenidaFamiliarTitulo')}</h3>
            <ul className={styles.avisoModalLista}>
              <li>{t('elegirFamiliarF1')}</li>
              <li>{t('elegirFamiliarF2')}</li>
              <li>{t('elegirFamiliarF3')}</li>
              <li>{t('elegirFamiliarF4')}</li>
              <li>{t('elegirFamiliarF5')}</li>
              <li>{t('elegirFamiliarF6')}</li>
              <li>{t('elegirFamiliarF7')}</li>
            </ul>
            <button
              className={styles.avisoModalBtn}
              style={{ background: '#1E8449' }}
              onClick={() => {
                localStorage.setItem(`familiarAviso_${user.id}`, '1')
                setAvisoFamiliar(false)
              }}
            >{t('bienvenidaFamiliarBtn')}</button>
          </div>
        </div>
      )}

      {/* Modal bienvenida — Plan Premium */}
      {avisoPremium && user && (
        <div className={styles.avisoOverlay}>
          <div className={styles.avisoModal}>
            <div className={styles.avisoModalIcono}>⭐</div>
            <h3 className={styles.avisoModalTitulo}>{t('bienvenidaPremiumTitulo')}</h3>
            <ul className={styles.avisoModalLista}>
              <li>{t('elegirPremiumF1')}</li>
              <li>{t('elegirPremiumF2')}</li>
              <li>{t('elegirPremiumF3')}</li>
              <li>{t('elegirPremiumF4')}</li>
              <li>{t('elegirPremiumF5')}</li>
              <li>{t('elegirPremiumF6')}</li>
              <li>{t('elegirPremiumF7')}</li>
            </ul>
            <button
              className={styles.avisoModalBtn}
              style={{ background: '#e6a817' }}
              onClick={() => {
                localStorage.setItem(`premiumAviso_${user.id}`, '1')
                setAvisoPremium(false)
              }}
            >{t('bienvenidaPremiumBtn')}</button>
          </div>
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
          {respaldo.smsSilencioso && (
            <p className={styles.respaldoAviso} style={{ color: '#1E8449', marginBottom: 4 }}>✓ {t('smsEnviadoAuto')}</p>
          )}
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
            <LogoWhatsApp size={18} /> {t('waVarios')}
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
                <LogoWhatsApp size={16} color="#25D366" /> {c.users?.full_name || respaldo.numeros[i]}
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
            <button
              className={styles.limiteBtn}
              style={{ border: 'none', width: '100%', cursor: 'pointer' }}
              onClick={() => { setMostrarLimite(null); abrirPlanes() }}
            >
              {t('verSuscripcion')}
            </button>
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
              title={gps !== 'listo' ? t('esperandoGps') : ''}
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
