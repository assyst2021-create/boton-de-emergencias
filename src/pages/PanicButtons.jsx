import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { registerPlugin } from '@capacitor/core'
import { supabase } from '../supabase'
import styles from './PanicButtons.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { puedeEnviarAlerta, esPremium, esFamiliar, esPlanPago, puedeSegundaAlerta } from '../plan'
import { useNavContext } from '../components/NavContext'
import { PAISES } from '../registro'
import { nuevoUUID } from '../uuid'

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
/** Solo los dígitos de un teléfono, para comparar "+57 300-123 4567" con "573001234567". */
const soloDigitos = (n) => (n || '').replace(/\D/g, '')
/** Mismo número si coinciden completos o en los últimos 10 dígitos (con o sin indicativo). */
function mismoNumero(a, b) {
  const x = soloDigitos(a), y = soloDigitos(b)
  if (!x || !y) return false
  return x === y || (x.length >= 10 && y.length >= 10 && x.slice(-10) === y.slice(-10))
}
/** Indicativo del país de un número completo (+57, +1809...), buscado en la lista del registro. */
function indicativoDe(numero) {
  const n = (numero || '').replace(/[^\d+]/g, '')
  if (!n.startsWith('+')) return null
  return PAISES.map(p => p.codigo).filter(c => n.startsWith(c)).sort((a, b) => b.length - a.length)[0] || null
}
/**
 * Número en formato internacional (+57300...). Las cuentas más viejas guardaron el número
 * sin indicativo: algunos celulares (p. ej. Honor) no entregaban ese SMS y WhatsApp no
 * abría el chat. Si falta, se usa el indicativo de quien envía.
 */
function numeroCompleto(numero, propio) {
  const limpio = (numero || '').trim().replace(/[\s\-().]/g, '')
  if (!limpio || limpio.startsWith('+')) return limpio
  const ind = indicativoDe(propio)
  if (!ind) return limpio
  // +1809 (Rep. Dominicana) y +1 comparten el país +1: el 809 ya viene en el número local
  const pais = ind.startsWith('+1') ? '+1' : ind
  return `${pais}${limpio.replace(/^0+/, '')}`
}
/**
 * Números a los que sale el SMS: completos, sin repetidos y nunca el propio. Si un familiar
 * quedó registrado con el número de quien pide ayuda, el SMS le llegaba a esa misma persona.
 */
function numerosDestino(familiares, propio) {
  const lista = []
  for (const f of familiares) {
    const n = numeroCompleto(f.users?.phone_number, propio)
    if (!n || mismoNumero(n, propio) || lista.some(x => mismoNumero(x, n))) continue
    lista.push(n)
  }
  return lista
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
          insertarConRespaldo('alerts', { ...item, sender_id: session.user.id }, 'destinatarios'), 10000)
        // 23505 = ya llegó antes; LIMITE_ALERTAS = rechazo definitivo. Ninguno se reintenta.
        if (error && error.code !== '23505' && !/LIMITE_ALERTAS/.test(error.message || '')) pendientes.push(item)
        else if (!error && !item.is_auto && (item.status_type === 'red' || item.status_type === 'orange')) {
          supabase.rpc('programar_alerta_auto', {
            p_tipo: item.status_type, p_lat: item.latitude, p_lng: item.longitude, p_destinatarios: item.destinatarios || null,
          }).then(() => {}, () => {})
        }
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

/**
 * Inserta una fila; si la base todavía no tiene la columna nueva (el SQL de la versión 84
 * aún no se corrió), la vuelve a mandar sin ella: la alerta nunca se pierde por eso.
 */
async function insertarConRespaldo(tabla, fila, campo) {
  let res = await supabase.from(tabla).insert(fila)
  if (res.error && fila[campo] != null && (res.error.message || '').includes(campo)) {
    const sinCampo = { ...fila }
    delete sinCampo[campo]
    res = await supabase.from(tabla).insert(sinCampo)
  }
  return res
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
  // A quién NO le llega la alerta (se guarda la exclusión: un familiar nuevo entra marcado)
  const [excluidos, setExcluidos] = useState([])
  const [mostrarDestinos, setMostrarDestinos] = useState(false)
  const [avisoMinimo, setAvisoMinimo] = useState(false)
  // Familiares que reciben la alerta. Si quedaran todos desmarcados (p. ej. se desvinculó al
  // único marcado), va a todos: nunca se presiona el botón sin que le llegue a nadie.
  const elegidosDestino = familiares.filter(f => !excluidos.includes(f.linked_user_id))
  const destinosEfectivos = elegidosDestino.length ? elegidosDestino : familiares
  const todosElegidos = destinosEfectivos.length === familiares.length

  /**
   * Los desmarcados solo valen para quien sigue en el grupo: si alguien se desvincula y vuelve,
   * entra marcado. Si no quedara nadie marcado, vuelve a "todos". Se lee lo guardado en este
   * momento (no al empezar a cargar) para no deshacer una casilla que se tocó mientras tanto.
   */
  function limpiarExcluidos(uid, links) {
    const clave = `destinosExcluidos_${uid}`
    let guardados = []
    try { guardados = JSON.parse(localStorage.getItem(clave) || '[]') } catch (_) {}
    const ids = links.map(l => l.linked_user_id)
    const vigentes = guardados.filter(id => ids.includes(id))
    const limpia = vigentes.length && vigentes.length >= ids.length ? [] : vigentes
    if (limpia.length !== guardados.length) {
      try { localStorage.setItem(clave, JSON.stringify(limpia)) } catch (_) {}
    }
    setExcluidos(limpia)
  }

  // Abrir la lista de a quién llega la alerta trae los familiares al día por detrás
  function abrirDestinos() {
    setMostrarDestinos(true)
    cargarDatos()
  }

  function guardarExcluidos(lista) {
    setExcluidos(lista)
    if (user?.id) {
      try { localStorage.setItem(`destinosExcluidos_${user.id}`, JSON.stringify(lista)) } catch (_) {}
    }
  }
  function alternarDestino(id) {
    setAvisoMinimo(false)
    const base = elegidosDestino.length ? excluidos : []
    if (base.includes(id)) { guardarExcluidos(base.filter(x => x !== id)); return }
    // Mínimo una persona marcada
    if (familiares.filter(f => !base.includes(f.linked_user_id)).length <= 1) { setAvisoMinimo(true); return }
    guardarExcluidos([...base, id])
  }
  const [gps, setGps] = useState('buscando')
  // La ubicacion se mantiene lista de antemano: al pulsar hay que abrir
  // Mensajes en el mismo instante del toque, sin esperar nada, o iOS pide
  // confirmacion para salir de la pagina.
  const posRef = useRef(null)

  const vigilanteRef = useRef(null)
  const ultimoToqueRef = useRef({ tipo: null, ms: 0 })

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
    let vivo = true
    // Cola offline: se reintenta al volver la red, al volver a la app y cada 20 s
    window.addEventListener('online', procesarCola)
    // Al volver a la app también se traen los familiares: si alguien te desvinculó mientras
    // tanto, deja de estar en la lista (el tiempo real no avisa cuando se borra una fila)
    const onVisible = () => { if (document.visibilityState === 'visible') { procesarCola(); cargarDatos() } }
    document.addEventListener('visibilitychange', onVisible)
    const reintentoCola = setInterval(procesarCola, 20000)
    procesarCola()

    let canal = null
    cargarDatos().then(uid => {
      // Si ya se cambió de pestaña, no se abre un canal que nadie cerraría
      if (!uid || !vivo) return
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
      vivo = false
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

    try { setExcluidos(JSON.parse(localStorage.getItem(`destinosExcluidos_${authUser.id}`) || '[]')) } catch (_) {}

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
      supabase.from('users').select('id, full_name, username, plan, is_premium, premium_hasta, auto_alert_enabled, phone_number').eq('id', authUser.id).single(),
      supabase.from('family_links')
        .select('linked_user_id, users!family_links_linked_user_id_fkey(full_name, phone_number)')
        .eq('user_id', authUser.id)
        .eq('status', 'accepted'),
    ])
    // Sin señal las consultas fallan: se conserva lo último conocido para que el SMS igual salga
    if (perfil) setUser(perfil)
    if (links) {
      setFamiliares(links)
      limpiarExcluidos(authUser.id, links)
    }
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
   * Espera el primer punto de GPS (máximo 3 minutos). Lo comparten el SMS de seguimiento y
   * la alerta guardada, y sigue funcionando aunque se cambie de pestaña.
   */
  const esperaRef = useRef(null)
  function esperarUbicacion() {
    if (posRef.current) return Promise.resolve(posRef.current)
    if (!navigator.geolocation) return Promise.resolve(null)
    if (esperaRef.current) return esperaRef.current
    esperaRef.current = new Promise(resolve => {
      let terminado = false
      let vigia = null
      const terminar = (p) => {
        if (terminado) return
        terminado = true
        clearInterval(revisar)
        clearTimeout(tope)
        if (vigia !== null) navigator.geolocation.clearWatch(vigia)
        esperaRef.current = null
        resolve(p)
      }
      // El vigilante de la pantalla puede tener el punto primero
      const revisar = setInterval(() => { if (posRef.current) terminar(posRef.current) }, 2000)
      const tope = setTimeout(() => terminar(null), 180000)
      vigia = navigator.geolocation.watchPosition(
        p => {
          posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }
          setGps('listo')
          terminar(posRef.current)
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 180000 },
      )
    })
    return esperaRef.current
  }

  /**
   * Si al pulsar todavía no había GPS (sin datos el primer punto puede tardar), el SMS
   * salió sin ubicación. Apenas llegue un punto, dentro de 3 minutos, se manda otro SMS
   * solo con la ubicación.
   */
  function enviarUbicacionCuandoLlegue(numeros) {
    const idioma = LOCALES[lang] || 'es-CO'
    const encabezado = `${t('smsUbicacionDe')} ${user?.full_name || ''}`
    esperarUbicacion().then(p => {
      if (p) SilentSms.enviar({ numeros, cuerpo: textoSms(`${encabezado}: ${linkMapa(p)} - ${horaSms(idioma)}`) }).catch(() => {})
    })
  }

  /** Pitido y vibración corta: confirman el toque aunque no se esté mirando la pantalla. */
  function tocarSonidoAlerta() {
    try { navigator.vibrate?.([120, 60, 120]) } catch (_) {}
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
      // Cada toque abría un reproductor nuevo que nunca se cerraba
      osc.onended = () => { ctx.close().catch(() => {}) }
    } catch (e) { /* silencioso si el navegador lo bloquea */ }
  }

  /**
   * Se ejecuta de forma SINCRONA dentro del toque del usuario: abre Mensajes
   * en ese mismo instante, que es la unica forma de que iOS no muestre el
   * aviso de "abrir esta pagina en Mensajes". El guardado va despues, aparte.
   */
  function pulsarBoton(boton) {
    // Un toque doble por nervios no debe mandar dos alertas ni gastar dos del cupo.
    // Otro botón sí sale enseguida (p. ej. se tocó naranja y en realidad es rojo).
    const ahoraMs = Date.now()
    if (ultimoToqueRef.current.tipo === boton.tipo && ahoraMs - ultimoToqueRef.current.ms < 4000) return
    ultimoToqueRef.current = { tipo: boton.tipo, ms: ahoraMs }
    tocarSonidoAlerta()
    // Plan gratuito: 6 alertas al mes. Se corta antes de tocar nada más.
    // Familiar y Premium no gastan cupo (si el plan se vence, no llega con el mes ya gastado).
    if (!esPlanPago(user)) {
      const usadas = Math.max(alertasMes, user ? leerContadorLocal(user.id) : 0)
      if (!puedeEnviarAlerta(user, usadas)) { setMostrarLimite('alertas'); return }
      setAlertasMes(usadas + 1)
      if (user) guardarContadorLocal(user.id, usadas + 1)
    }

    // Solo a los familiares elegidos con el botón 👥 (por defecto, todos)
    const elegidos = destinosEfectivos
    const destinatarios = todosElegidos ? null : elegidos.map(f => f.linked_user_id)
    const numeros = numerosDestino(elegidos, user?.phone_number)
    const cuerpo = construirCuerpo(boton)

    setConfirmacion(boton)
    setSinNube(false)

    if (numeros.length > 0) {
      if (EN_CAPACITOR) {
        // Android: SMS silencioso — sin abrir la app de mensajes
        setRespaldo({ numeros, cuerpo, contactos: elegidos, boton, smsSilencioso: true })
        SilentSms.enviar({ numeros, cuerpo }).catch(() => {
          // Si el plugin falla (permiso denegado, etc.), fallback a URL scheme
          window.location.href = `sms:${numeros.join(',')}?body=${encodeURIComponent(cuerpo)}`
        })
        if (!posRef.current) enviarUbicacionCuandoLlegue(numeros)
      } else if (ES_IOS && numeros.length > 1) {
        setRespaldo({ numeros, cuerpo, contactos: elegidos, boton })
        // iOS no soporta múltiples destinatarios en un solo sms: — abre uno por uno
        numeros.forEach((n, i) => {
          setTimeout(() => {
            window.location.href = `sms:${n}&body=${encodeURIComponent(cuerpo)}`
          }, i * 1200)
        })
      } else {
        setRespaldo({ numeros, cuerpo, contactos: elegidos, boton })
        window.location.href = `sms:${numeros.join(',')}${SEP_SMS}body=${encodeURIComponent(cuerpo)}`
      }
    } else {
      // Nadie con número (o todavía sin familiares): el SMS no puede salir solo. Se avisa y
      // quedan WhatsApp y Mensajes a mano para mandarla a quien sea.
      setRespaldo({ numeros: [], cuerpo, contactos: [], boton, sinNumeros: true })
    }

    guardarEnHistorial(boton, destinatarios)
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
        // Sin posición: la del sistema de hasta 10 min, o esperar máximo 1.5 s. La alerta no
        // se demora esperando el GPS (antes eran 3 s); la ubicación sigue llegando por SMS.
        navigator.geolocation.getCurrentPosition(
          p => { posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }; resolve(posRef.current) },
          () => resolve(null),
          { timeout: 1500, maximumAge: 600000, enableHighAccuracy: false }
        )
      }
    })
  }

  /**
   * La alerta salió sin GPS: cuando llegue el punto (máximo 3 min) se le agrega. Si sigue en la
   * cola sin señal, se le pone ahí y sale ya con el mapa. Si ya está en la base, el servidor la
   * completa y avisa a la familia. Se reintenta por si el guardado todavía iba en camino.
   */
  async function completarUbicacion(id) {
    const p = await esperarUbicacion()
    if (!p) return
    for (let intento = 0; intento < 4; intento++) {
      try {
        const cola = JSON.parse(localStorage.getItem(COLA_KEY) || '[]')
        const enCola = cola.find(a => a.id === id)
        if (enCola) {
          if (enCola.latitude == null) {
            enCola.latitude = p.lat
            enCola.longitude = p.lng
            localStorage.setItem(COLA_KEY, JSON.stringify(cola))
          }
          return
        }
      } catch (_) {}
      const { data: puesta, error } = await supabase.rpc('ubicar_alerta', { p_id: id, p_lat: p.lat, p_lng: p.lng })
        .then(r => r, e => ({ error: e }))
      if (puesta) return
      // El servidor todavía no tiene esta función (falta el SQL): no hay nada que reintentar
      if (error?.code === 'PGRST202' || error?.code === '42883') return
      await new Promise(r => setTimeout(r, 5000))
    }
  }

  /** Guarda la alerta sin bloquear el aviso a la familia. */
  async function guardarEnHistorial(boton, destinatarios = null) {
    const ahora = new Date()
    const expiresAt = new Date(ahora.getTime() + 24 * 60 * 60 * 1000)
    const p = await obtenerPosicion()

    const payload = {
      // ID único desde el celular: si un reintento llega dos veces, la base rechaza la copia
      id: nuevoUUID(),
      status_type: boton.tipo,
      latitude: p?.lat ?? null,
      longitude: p?.lng ?? null,
      sent_at: ahora.toISOString(),
      expires_at: expiresAt.toISOString(),
      is_auto: false,
      // null = todo el grupo familiar; si no, solo esos familiares reciben notificación e historial
      ...(destinatarios ? { destinatarios } : {}),
    }

    // Sin ubicación al guardar: apenas llegue el GPS se le agrega a la alerta (y a la que esté
    // en la cola sin señal). La familia recibe un segundo aviso con el mapa.
    if (!p) completarUbicacion(payload.id)

    // Sin internet: encolar y avisar. Se enviará automáticamente al volver la señal.
    if (!navigator.onLine) { encolar(payload); setSinNube(true); return }

    // getSession lee la sesión del celular al instante (getUser iba a internet y tardaba)
    const { data: { session } } = await supabase.auth.getSession()
    const authUser = session?.user
    if (!authUser) { encolar(payload); setSinNube(true); return }

    try {
      const res = await conTiempoLimite(
        insertarConRespaldo('alerts', { ...payload, sender_id: authUser.id }, 'destinatarios'),
        10000,
      )
      if (res?.error) throw res.error
    } catch (e) {
      if (/LIMITE_ALERTAS/.test(e?.message || '')) { setMostrarLimite('alertas'); return }
      encolar(payload)
      setSinNube(true)
      return
    }

    if (boton.tipo === 'red' || boton.tipo === 'orange') programarAlertaAuto(boton.tipo, p, destinatarios, authUser.id)
  }

  /**
   * Alerta automática cada 2 horas (Familiar y Premium, con la opción encendida): una alerta roja o
   * naranja inicia o reinicia la cadena. El servidor revisa si la opción está encendida y el plan
   * vigente (lo que haya en este celular puede estar viejo), y la envía aunque el celular se apague.
   */
  async function programarAlertaAuto(tipo, p, destinatarios, uid) {
    const { error } = await supabase.rpc('programar_alerta_auto', {
      p_tipo: tipo, p_lat: p?.lat ?? null, p_lng: p?.lng ?? null, p_destinatarios: destinatarios || null,
    }).then(r => r, e => ({ error: e }))
    // El servidor aún no tiene la función (falta el SQL): una sola alerta a las 2 horas, como antes
    if (error && (error.code === 'PGRST202' || error.code === '42883') && user?.auto_alert_enabled && puedeSegundaAlerta(user)) {
      insertarConRespaldo('scheduled_alerts', {
        user_id: uid, status_type: tipo,
        latitude: p?.lat ?? null, longitude: p?.lng ?? null,
        scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), fired: false,
        ...(destinatarios ? { destinatarios } : {}),
      }, 'destinatarios').then(() => {}, () => {})
    }
  }

  /** Dispara alertas programadas que ya vencieron (el servidor también lo hace cada minuto). */
  async function verificarAlertasAuto() {
    const { data: { session } } = await supabase.auth.getSession()
    const authUser = session?.user
    if (!authUser) return
    const pos = posRef.current
    const { error: errRpc } = await supabase.rpc('disparar_mis_alertas_auto', { p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null })
      .then(r => r, e => ({ error: e }))
    // Con la función del servidor ya está; si la base aún no la tiene, se hace como antes
    if (!errRpc || !(errRpc.code === 'PGRST202' || errRpc.code === '42883')) return
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
      const { error } = await insertarConRespaldo('alerts', {
        sender_id: authUser.id,
        status_type: item.status_type,
        latitude: item.latitude,
        longitude: item.longitude,
        sent_at: sentAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        is_auto: true,
        ...(item.destinatarios?.length ? { destinatarios: item.destinatarios } : {}),
      }, 'destinatarios')
      // No salió: vuelve a pendiente para el próximo intento (de la app o del servidor)
      if (error) await supabase.from('scheduled_alerts').update({ fired: false }).eq('id', item.id)
    }
  }

  return (
    <div className={respaldo ? `${styles.wrap} ${styles.wrapLibre}` : styles.wrap}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <img src="/logo.png" alt={t('appNombre')} className={styles.logoImg} />
          <h1>{t('appNombre')}</h1>
          <div className={styles.headerBotones}>
            {familiares.length > 1 && (
              <button className={styles.salir} onClick={abrirDestinos} title={t('destBoton')} aria-label={t('destBoton')}>👥</button>
            )}
            <button className={styles.salir} onClick={abrirOpciones} title={t('tituloOpciones')} aria-label={t('tituloOpciones')}>⚙️</button>
          </div>
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
              <li>{t('elegirGratisF6')}</li>
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
              <li>{t('elegirPremiumF8')}</li>
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

      {respaldo && (() => {
        // El texto se vuelve a armar aquí: si al tocar aún no había GPS, el mensaje salía sin el
        // mapa; cuando el punto llega (setGps('listo') repinta), el link de WhatsApp ya lo incluye.
        const cuerpoActual = respaldo.boton ? construirCuerpo(respaldo.boton) : respaldo.cuerpo
        const faltaUbicacion = !posRef.current
        return (
        <div className={styles.respaldo}>
          <strong>📤 {t('envioManualTitulo')}</strong>
          {sinNube && <p className={styles.respaldoAviso}>⚠️ {t('sinConexionNube')}</p>}
          {respaldo.smsSilencioso && (
            <p className={styles.respaldoAviso} style={{ color: '#1E8449', marginBottom: 4 }}>✓ {t('smsEnviadoAuto')}</p>
          )}
          {respaldo.sinNumeros && (
            <p className={styles.respaldoAviso} style={{ marginBottom: 4 }}>⚠️ {t(familiares.length ? 'alertaSinNumeros' : 'alertaSinFamiliares')}</p>
          )}
          {faltaUbicacion && (
            <p className={styles.respaldoAviso} style={{ color: '#e67e22', marginBottom: 4 }}>⏳ {t('buscandoUbicacionEnvio')}</p>
          )}
          <a
            className={styles.respaldoSms}
            href={`sms:${respaldo.numeros.join(',')}${SEP_SMS}body=${encodeURIComponent(cuerpoActual)}`}
          >
            {t('abrirMensajes')}
          </a>
          <a
            className={styles.respaldoWa}
            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(cuerpoActual)}`}
            target="_blank"
            rel="noreferrer"
          >
            <LogoWhatsApp size={18} /> {t('waVarios')}
          </a>
          {respaldo.contactos.length > 0 && (
            <>
              <span className={styles.respaldoSub}>{t('waIndividual')}</span>
              <div className={styles.respaldoChats}>
                {respaldo.contactos.map((c, i) => (
                  <a
                    key={c.linked_user_id || i}
                    className={styles.respaldoChat}
                    href={`https://wa.me/${numeroCompleto(c.users?.phone_number, user?.phone_number).replace(/[^0-9]/g, '')}?text=${encodeURIComponent(cuerpoActual)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <LogoWhatsApp size={16} color="#25D366" /> {c.users?.full_name || c.users?.phone_number || t('familiar')}
                  </a>
                ))}
              </div>
            </>
          )}
          <button className={styles.respaldoCerrar} onClick={() => { setRespaldo(null); setConfirmacion(null); setSinNube(false) }}>
            {t('cerrar')}
          </button>
        </div>
        )
      })()}

      <div className={styles.instruccion}>
        {t('instruccion')}
      </div>

      {/* A quién le llega la alerta: siempre a la vista, para no olvidar que se desmarcó a alguien */}
      {familiares.length > 1 && (
        <button type="button" className={todosElegidos ? styles.destChip : styles.destChipParcial} onClick={abrirDestinos}>
          👥 {todosElegidos
            ? t('destLlegaATodos')
            : `${t('destLlegaA')} ${destinosEfectivos.length} ${t('destDe')} ${familiares.length} ${t('destFamiliares')}`}
          {' · '}<u>{t('destCambiar')}</u>
        </button>
      )}

      {/* Ventana para elegir a quién avisar (se dibuja en el body: siempre encima de todo) */}
      {mostrarDestinos && createPortal(
        <div className={styles.destFondo} onClick={() => setMostrarDestinos(false)}>
          <div className={styles.destVentana} role="dialog" aria-modal="true" aria-labelledby="dest-titulo" onClick={e => e.stopPropagation()}>
            <div className={styles.destIcono} aria-hidden="true">👥</div>
            <h3 id="dest-titulo" className={styles.destTitulo}>{t('destTitulo')}</h3>
            <p className={styles.destDesc}>{t('destDesc')}</p>
            <button type="button" className={styles.destTodos} onClick={() => { setAvisoMinimo(false); guardarExcluidos([]) }} disabled={todosElegidos}>
              ✓ {t('destTodos')}
            </button>
            <div className={styles.destLista}>
              {familiares.map(f => {
                const marcado = !elegidosDestino.length || !excluidos.includes(f.linked_user_id)
                return (
                  <label key={f.linked_user_id} className={marcado ? styles.destFilaOn : styles.destFila}>
                    <input type="checkbox" checked={marcado} onChange={() => alternarDestino(f.linked_user_id)} />
                    <span>{f.users?.full_name || '—'}</span>
                  </label>
                )
              })}
            </div>
            {avisoMinimo && <p className={styles.destAviso} role="alert">{t('destMinimo')}</p>}
            <button type="button" className={styles.destListo} onClick={() => setMostrarDestinos(false)}>{t('destListo')}</button>
          </div>
        </div>,
        document.body,
      )}

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

    </div>
  )
}
