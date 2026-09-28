import { useState, useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../supabase'
import styles from './Ubicacion.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { puedeUbicacionEnVivo } from '../plan'
import { useNavContext } from '../components/NavContext'
import { LocalNotifications } from '@capacitor/local-notifications'

/** Cada cuanto se envia la posicion mientras se comparte (web; en Android lo hace el servicio nativo). */
const INTERVALO_MS = 1000

const OPCIONES_TIEMPO = [
  { clave: 'ubiT15', minutos: 15 },
  { clave: 'ubiT60', minutos: 60 },
  { clave: 'ubiT480', minutos: 480 },
]

const EN_CAPACITOR = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

/**
 * Margen de vida de la sesion. No es un limite duro: cada envio lo empuja
 * hacia adelante, asi que mientras se este compartiendo nunca vence. Solo
 * sirve para que una sesion abandonada no quede activa para siempre.
 */
const DURACION_MIN = 720

/**
 * El vigilante de GPS vive FUERA del componente a proposito.
 * El servicio nativo sigue corriendo aunque React desmonte la pantalla
 * (al cambiar de pestaña o al salir de la app), asi que su identificador
 * no puede guardarse en un useRef: ese se reinicia en cada montaje y
 * terminariamos creando vigilantes duplicados o perdiendo el control del
 * que ya corre. Solo detener() lo libera.
 */
let vigilanteGlobal = null
let ultimoEnvioMs = 0
/** Con señal lenta no se amontonan envíos: si uno va saliendo, se espera al siguiente turno. */
let enviandoPosicion = false
let uidEnvioGlobal = null
/** Hasta cuando eligio compartir el usuario (15 min, 1 h u 8 h). */
let tiempoFinGlobal = null
/** Ultima posicion conocida, para que el envio en segundo plano no dependa del componente. */
let ultimaPosGlobal = null
/**
 * Pantalla de Ubicación montada en este momento. El vigilante de GPS sobrevive a los
 * cambios de pestaña: si le avisara a la pantalla con la que se creó, al volver a
 * Ubicación el punto propio no se dibujaba más. Por eso avisa siempre a la actual.
 */
let alNuevaPosicion = null
function publicarPosicion(p) {
  ultimaPosGlobal = p
  alNuevaPosicion?.(p)
}

/** Rastreo de movimiento por familiar: ultima pos notificada y timestamp del último aviso */
const _ultimaPosNotif = {}   // uid → {lat, lng}
const _ultimaNotifMovMs = {} // uid → timestamp ms

/** Haversine: distancia en metros entre dos coordenadas */
function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

let _notifId = 1000

/**
 * Punto inmediato (wifi/antenas o uno de hace menos de 2 min) para que la familia vea
 * algo de una vez mientras el GPS fino responde. Si es muy impreciso no se usa.
 */
function posicionRapida() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      p => resolve(p.coords.accuracy <= 300
        ? { lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy, ts: Date.now() }
        : null),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 120000, timeout: 5000 },
    )
  })
}

/** Un punto de antenas (>150 m) no reemplaza uno bueno de GPS de hace menos de 1 minuto. */
function sirvePunto(p) {
  const prev = ultimaPosGlobal
  if (!prev || p.precision == null || prev.precision == null) return true
  return !(p.precision > 150 && prev.precision <= 50 && Date.now() - (prev.ts || 0) < 60000)
}

/** Reverse geocoding con Nominatim (OSM, gratis, sin key) */
async function geocodearDireccion(lat, lng, cerca = 'Cerca de') {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=es`,
      { headers: { 'Accept-Language': 'es' } }
    )
    const d = await r.json()
    const a = d.address || {}
    const calle = [a.road, a.house_number].filter(Boolean).join(' ')
    // county = ciudad en Colombia (ej. "Cali"), municipality puede ser barrio/vereda
    const ciudad = a.city || a.county || a.town || a.village || ''
    const dpto = a.state || ''
    return [calle ? `${cerca} ${calle}` : null, ciudad, dpto].filter(Boolean).join(', ')
  } catch {
    return null
  }
}

async function mostrarNotifLocal(titulo, cuerpo) {
  if (!EN_CAPACITOR) return
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: _notifId++,
        title: titulo,
        body: cuerpo,
        schedule: { at: new Date(Date.now() + 100) },
        channelId: 'alertas_v3',
        sound: 'default',
        smallIcon: 'ic_stat_notification',
        iconColor: '#e8302a',
      }],
    })
  } catch {}
}

export default function Ubicacion() {
  const { t } = useLanguage()
  const { abrirOpciones, abrirPlanes } = useNavContext()
  const [perfil, setPerfil] = useState(null)
  // Persiste en sessionStorage para que al volver de otra pestaña el botón
  // muestre "Deja de compartir" de inmediato, sin parpadear a "Compartir"
  // mientras init() comprueba la DB en segundo plano.
  const [compartiendo, setCompartiendoRaw] = useState(() => sessionStorage.getItem('ubi_sharing') === '1')
  const setCompartiendo = (v) => { sessionStorage.setItem('ubi_sharing', v ? '1' : '0'); setCompartiendoRaw(v) }
  const [miPos, setMiPos] = useState(null)
  // "Ver mi punto": el punto propio se muestra solo en este celular, se comparta o no
  const [verMiPunto, setVerMiPunto] = useState(false)
  const [buscandoYo, setBuscandoYo] = useState(false)
  const [centrarYo, setCentrarYo] = useState(0)
  const [reencuadrar, setReencuadrar] = useState(0)
  const [avisoOk, setAvisoOk] = useState('')
  const [familiares, setFamiliares] = useState([])
  const [error, setError] = useState('')
  const [enfocado, setEnfocado] = useState(null)
  const [mostrarTiempo, setMostrarTiempo] = useState(false)
  const [minRestantes, setMinRestantes] = useState(null)
  const [recargando, setRecargando] = useState(false)
  const [fichaDir, setFichaDir] = useState(null)
  const [fichaDesde, setFichaDesde] = useState(null)
  const fichaUidRef = useRef(null)
  const tiempoFinRef = useRef(null)
  const cuentaRef = useRef(null)
  const detenidoRef = useRef(false)  // evita que init() reactive tras detener() manual
  const pollingRef = useRef(null)

  const vigilanteRef = useRef(null)
  const envioRef = useRef(null)
  const ultimaRef = useRef(null)
  const canalRef = useRef(null)
  const linksRef = useRef([])   // cache de vínculos familiares (cambian poco)
  const uidGlobalRef = useRef(null)

  useEffect(() => {
    // Esta pantalla recibe los puntos del vigilante de GPS, aunque se haya creado en otra
    const recibir = (pos) => { ultimaRef.current = pos; setMiPos(pos) }
    alNuevaPosicion = recibir
    if (ultimaPosGlobal) recibir(ultimaPosGlobal)
    init()

    if (EN_CAPACITOR) {
      LocalNotifications.requestPermissions().catch(() => {})
    }

    supabase.auth.getSession().then(({ data: { session } }) => { uidGlobalRef.current = session?.user?.id })

    // Polling de respaldo: solo recarga ubicaciones (links en caché) cada 4s
    pollingRef.current = setInterval(() => {
      if (uidGlobalRef.current) cargarUbicaciones()
    }, 4000)

    const onVisible = () => {
      if (document.visibilityState === 'visible' && uidGlobalRef.current) {
        reconectarVivo()
        cargarUbicaciones()
        resincronizarTokenNativo()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    let appListener
    if (EN_CAPACITOR) {
      try {
        const { App } = window.Capacitor.Plugins
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive && uidGlobalRef.current) {
            reconectarVivo()
            cargarUbicaciones()
            resincronizarTokenNativo()
          }
        }).then(l => { appListener = l })
      } catch {}
    }

    return () => {
      if (alNuevaPosicion === recibir) alNuevaPosicion = null
      // OJO: no se suelta el vigilante de GPS. Debe seguir corriendo en
      // segundo plano aunque se cambie de pestaña o se salga de la app,
      // igual que WhatsApp. Solo detener() lo apaga.
      if (envioRef.current) { clearInterval(envioRef.current); envioRef.current = null }
      if (canalRef.current) { supabase.removeChannel(canalRef.current); canalRef.current = null }
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
      document.removeEventListener('visibilitychange', onVisible)
      if (appListener) appListener.remove()
      if (cuentaRef.current) clearInterval(cuentaRef.current)
    }
  }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    uidGlobalRef.current = user.id

    const [{ data: p }, , { data: mia }] = await Promise.all([
      supabase.from('users').select('id, full_name, username, plan, is_premium, premium_hasta, auto_alert_enabled').eq('id', user.id).maybeSingle(),
      cargarFamiliaresCompleto(user.id),
      supabase.from('live_locations').select('activo, expires_at').eq('user_id', user.id).maybeSingle(),
    ])
    setPerfil(p)
    escuchar()

    if (detenidoRef.current || sessionStorage.getItem('ubi_stopped') === '1') return

    if (mia?.activo && new Date(mia.expires_at) > new Date()) {
      const msRestantes = new Date(mia.expires_at).getTime() - Date.now()
      empezar(false, Math.ceil(msRestantes / 60000))
    } else {
      setCompartiendo(false)
      // Si la BD dice activo pero el tiempo ya venció (app estaba cerrada), limpiar
      if (mia?.activo) {
        supabase.from('live_locations').update({ activo: false }).eq('user_id', user.id)
      }
    }
  }

  /**
   * Supabase rota el refresh_token en cada renovación: si el WebView renueva
   * mientras la app está abierta, el token que guardó el servicio nativo queda
   * obsoleto y fallaría al renovarse solo. Al volver al frente le pasamos los
   * vigentes. iniciar() es idempotente: si ya corre, solo actualiza tokens.
   */
  async function resincronizarTokenNativo() {
    if (!EN_CAPACITOR || sessionStorage.getItem('ubi_sharing') !== '1') return
    if (!tiempoFinGlobal || !uidEnvioGlobal) return
    try {
      const { GpsShare } = window.Capacitor.Plugins
      if (!GpsShare) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await GpsShare.iniciar({
        userId: uidEnvioGlobal,
        finMs: tiempoFinGlobal,
        accessToken: session.access_token,
        refreshToken: session.refresh_token || '',
      })
    } catch {}
  }

  // Reconecta el canal en vivo (Android lo corta en silencio al dormir la pantalla)
  function reconectarVivo() {
    if (canalRef.current) { supabase.removeChannel(canalRef.current); canalRef.current = null }
    escuchar()
  }

  const recargar = useCallback(async () => {
    if (recargando || !uidGlobalRef.current) return
    setRecargando(true)
    fichaUidRef.current = null
    reconectarVivo()
    resincronizarTokenNativo()
    await Promise.all([
      cargarFamiliaresCompleto(uidGlobalRef.current),
      supabase.from('users').select('id, full_name, username, plan, is_premium, premium_hasta, auto_alert_enabled').eq('id', uidGlobalRef.current).maybeSingle().then(({ data }) => data && setPerfil(data)),
    ])
    // Que se note: el mapa se acomoda para ver a todos y sale un aviso corto
    setEnfocado(null)
    setReencuadrar(n => n + 1)
    setAvisoOk(t('ubiActualizadoOk'))
    setTimeout(() => setAvisoOk(''), 2500)
    setTimeout(() => setRecargando(false), 400)
  }, [recargando, t])

  /** Muestra el punto propio en el mapa (solo en este celular) y lo centra, se comparta o no. */
  function verMiUbicacion() {
    setError('')
    setEnfocado(null)
    setVerMiPunto(true)
    if (ultimaPosGlobal) { setMiPos(ultimaPosGlobal); setCentrarYo(n => n + 1) }
    if (!navigator.geolocation) { setError(t('gpsNoDisponible')); return }
    setBuscandoYo(true)
    let centrado = false
    const mostrar = (p, preciso) => {
      const pos = { lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy, ts: Date.now() }
      // Uno aproximado no reemplaza uno preciso que ya se tenga
      setMiPos(prev => (!preciso && prev?.precision != null && prev.precision < pos.precision) ? prev : pos)
      if (!centrado || preciso) { centrado = true; setCentrarYo(n => n + 1) }
      if (preciso) setBuscandoYo(false)
    }
    // Primero el rápido (wifi/antenas) y luego el GPS fino
    navigator.geolocation.getCurrentPosition(p => mostrar(p, false), () => {},
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 5000 })
    navigator.geolocation.getCurrentPosition(
      p => mostrar(p, true),
      err => {
        setBuscandoYo(false)
        if (!centrado) setError(err.code === 1 ? t('ubiPermisoDenegado') : t('gpsNoDisponible'))
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    )
  }

  /** Carga links Y ubicaciones — solo al inicio o cuando cambia el grupo familiar */
  async function cargarFamiliaresCompleto(uid) {
    const { data: links } = await supabase
      .from('family_links')
      .select('user_id, users!family_links_user_id_fkey(id, full_name, username)')
      .eq('linked_user_id', uid)
      .eq('status', 'accepted')

    linksRef.current = links || []
    await cargarUbicaciones()
  }

  /** Solo recarga ubicaciones usando el caché de links — rápido, 1 sola query */
  async function cargarUbicaciones() {
    const links = linksRef.current
    if (links.length === 0) { setFamiliares([]); return }

    const ids = links.map(l => l.user_id)
    const { data: ubis } = await supabase
      .from('live_locations').select('*').in('user_id', ids).eq('activo', true)

    const porId = Object.fromEntries((ubis || []).map(u => [u.user_id, u]))
    setFamiliares(links.map(l => ({
      id: l.user_id,
      nombre: l.users?.full_name || l.users?.username || '—',
      ubicacion: porId[l.user_id] || null,
    })))
  }

  /** Realtime: actualiza el marcador DIRECTAMENTE desde el payload (sin query extra) */
  function escuchar() {
    if (canalRef.current) return
    canalRef.current = supabase.channel('ubicaciones-vivo')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_locations' },
        (payload) => {
          const u = payload.new
          const uid = u.user_id

          // "Empezó a compartir" lo avisa el servidor por FCM (llega aunque la app esté cerrada)

          // Notif: familiar en movimiento (>150 m, mínimo cada 10 min)
          if (u.activo && u.latitude != null && u.longitude != null) {
            const ultima = _ultimaPosNotif[uid]
            if (ultima) {
              const dist = distanciaMetros(ultima.lat, ultima.lng, u.latitude, u.longitude)
              const ahora = Date.now()
              const sinceUltima = ahora - (_ultimaNotifMovMs[uid] || 0)
              if (dist > 150 && sinceUltima > 10 * 60 * 1000) {
                const fam = linksRef.current.find(l => l.user_id === uid)
                const nombre = fam?.users?.full_name || fam?.users?.username || t('unFamiliar')
                mostrarNotifLocal(`🚶 ${t('notifMovTitulo')}`, `${nombre} ${t('notifEnMovimiento')}`)
                _ultimaNotifMovMs[uid] = ahora
              }
            }
            _ultimaPosNotif[uid] = { lat: u.latitude, lng: u.longitude }
          }

          setFamiliares(prev => prev.map(f =>
            f.id === uid
              ? { ...f, ubicacion: u.activo ? u : null }
              : f
          ))
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_locations' },
        (payload) => {
          cargarUbicaciones()
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'live_locations' },
        () => cargarUbicaciones())
      .subscribe()
  }

  async function empezar(manual = true, minutos = 60) {
    setError('')
    if (vigilanteRef.current != null || envioRef.current) return

    if (manual && !puedeUbicacionEnVivo(perfil)) { abrirPlanes(); return }

    if (manual) {
      detenidoRef.current = false
      sessionStorage.removeItem('ubi_stopped')
    }

    const fin = Date.now() + minutos * 60 * 1000
    tiempoFinRef.current = fin
    tiempoFinGlobal = fin
    setMinRestantes(minutos)
    if (cuentaRef.current) clearInterval(cuentaRef.current)
    cuentaRef.current = setInterval(() => {
      const restMs = tiempoFinRef.current - Date.now()
      if (restMs <= 0) { detener(); return }
      setMinRestantes(Math.ceil(restMs / 60000))
    }, 10000)

    // getSession es inmediato; getUser iba a internet y con poca señal demoraba el arranque
    const { data: { session: sesion } } = await supabase.auth.getSession()
    const user = sesion?.user
    if (!user) return

    uidEnvioGlobal = user.id

    // Primer punto de una vez: sin esto la familia esperaba a que el GPS fino respondiera
    posicionRapida().then(p => {
      if (!p || uidEnvioGlobal !== user.id || sessionStorage.getItem('ubi_stopped') === '1') return
      if (!ultimaPosGlobal) publicarPosicion(p)
      enviarPosicion(user.id)
    })

    if (EN_CAPACITOR) {
      // Arrancar el Service nativo: sube GPS a Supabase directamente por HTTP,
      // sin depender del WebView. Sobrevive cuando el usuario cierra la app.
      // Se le pasa el JWT porque live_locations tiene RLS (auth.uid() = user_id):
      // con la clave pública sola, Supabase responde 401 y la ubicación se congela.
      try {
        const { GpsShare } = window.Capacitor.Plugins
        const { data: { session } } = await supabase.auth.getSession()
        if (GpsShare && session?.access_token) {
          await GpsShare.iniciar({
            userId: user.id,
            finMs: fin,
            accessToken: session.access_token,
            refreshToken: session.refresh_token || '',
          })
        }
      } catch (e) {
        console.warn('[GpsShare] no se pudo arrancar el servicio nativo:', e)
      }

      // Vigilante de GPS para actualizar el marcador en pantalla mientras la app está abierta
      if (!vigilanteGlobal) {
        try {
          const { BackgroundGeolocation } = window.Capacitor.Plugins
          vigilanteGlobal = await BackgroundGeolocation.addWatcher(
            { backgroundMessage: t('ubiBgMsg'), backgroundTitle: 'Botón de Emergencias', requestPermissions: true, stale: false, distanceFilter: 0 },
            (pos, err) => {
              if (err || !pos) return
              const p = { lat: pos.latitude, lng: pos.longitude, precision: pos.accuracy, ts: Date.now() }
              if (!sirvePunto(p)) return
              publicarPosicion(p)
            }
          )
          vigilanteRef.current = vigilanteGlobal
        } catch {
          if (navigator.geolocation) {
            vigilanteGlobal = navigator.geolocation.watchPosition(
              p => {
                const pos = { lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy, ts: Date.now() }
                if (!sirvePunto(pos)) return
                publicarPosicion(pos)
              },
              () => {},
              { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
            )
            vigilanteRef.current = vigilanteGlobal
          }
        }
      }
    } else {
      // Web: vigilante normal + setInterval de subida
      if (!vigilanteGlobal) {
        if (!navigator.geolocation) { setError(t('ubiSinSoporte')); return }
        vigilanteGlobal = navigator.geolocation.watchPosition(
          p => {
            const pos = { lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy, ts: Date.now() }
            if (!sirvePunto(pos)) return
            publicarPosicion(pos)
          },
          () => setError(t('ubiPermisoDenegado')),
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
        )
        vigilanteRef.current = vigilanteGlobal
      }
      envioRef.current = setInterval(() => enviarPosicion(user.id), INTERVALO_MS)
      enviarPosicion(user.id)
    }

    setCompartiendo(true)
  }

  async function enviarPosicion(uid) {
    // Se leen los globales: en segundo plano el componente puede estar
    // desmontado y sus refs ya no sirven.
    const p = ultimaPosGlobal || ultimaRef.current
    if (!p || enviandoPosicion) return
    // Si ya paso el tiempo elegido, se apaga solo y no se envia mas.
    if (tiempoFinGlobal && Date.now() >= tiempoFinGlobal) {
      soltarTemporizadores()
      await supabase.from('live_locations').update({ activo: false }).eq('user_id', uid)
      return
    }
    // Usar el tiempo de fin elegido por el usuario; si no hay (sesión recuperada), 12h
    const vence = tiempoFinGlobal
      ? new Date(tiempoFinGlobal)
      : new Date(Date.now() + DURACION_MIN * 60 * 1000)
    enviandoPosicion = true
    try {
      await supabase.from('live_locations').upsert({
        user_id: uid,
        latitude: p.lat,
        longitude: p.lng,
        precision_m: p.precision,
        activo: true,
        updated_at: new Date().toISOString(),
        expires_at: vence.toISOString(),
      })
    } finally {
      enviandoPosicion = false
    }
  }

  /** Apaga el GPS de verdad, incluido el servicio nativo de segundo plano. */
  function soltarTemporizadores() {
    const id = vigilanteGlobal ?? vigilanteRef.current
    if (id != null) {
      if (EN_CAPACITOR && typeof id === 'string') {
        try { window.Capacitor.Plugins.BackgroundGeolocation.removeWatcher({ id }) } catch {}
      } else {
        navigator.geolocation.clearWatch(id)
      }
    }
    vigilanteGlobal = null
    vigilanteRef.current = null
    uidEnvioGlobal = null
    ultimoEnvioMs = 0
    tiempoFinGlobal = null
    ultimaPosGlobal = null
    if (envioRef.current) { clearInterval(envioRef.current); envioRef.current = null }
  }

  /** Corta el seguimiento de verdad. Solo lo llama el boton de detener. */
  async function detener() {
    detenidoRef.current = true
    sessionStorage.setItem('ubi_stopped', '1')
    soltarTemporizadores()
    if (cuentaRef.current) { clearInterval(cuentaRef.current); cuentaRef.current = null }
    tiempoFinRef.current = null
    setMinRestantes(null)
    setCompartiendo(false)
    // getSession lee la sesión del celular al instante (getUser iba a internet y demoraba la parada)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (user) {
      // Parar el servicio nativo si está corriendo
      if (EN_CAPACITOR) {
        try {
          const { GpsShare } = window.Capacitor.Plugins
          if (GpsShare) await GpsShare.detener({ userId: user.id })
        } catch {}
      }
      await supabase.from('live_locations').update({ activo: false }).eq('user_id', user.id)
      // Un envío del GPS que ya iba en camino puede llegar después y "revivir" la ubicación:
      // se confirma otra vez en unos segundos, si no se volvió a compartir
      setTimeout(() => {
        if (sessionStorage.getItem('ubi_sharing') !== '1') {
          supabase.from('live_locations').update({ activo: false }).eq('user_id', user.id)
        }
      }, 7000)
    }
  }

  const premium = puedeUbicacionEnVivo(perfil)  // Familiar y Premium incluyen el mapa en vivo
  const enVivo = familiares.filter(f => f.ubicacion)

  // Historial corto de posiciones por familiar para saber si se está moviendo
  const histRef = useRef({})
  useEffect(() => {
    const ahora = Date.now()
    for (const f of familiares) {
      const u = f.ubicacion
      if (!u?.updated_at || u.latitude == null) continue
      const ts = new Date(u.updated_at).getTime()
      const h = histRef.current[f.id] || []
      if (!h.length || h[h.length - 1].ts !== ts) h.push({ lat: u.latitude, lng: u.longitude, ts })
      histRef.current[f.id] = h.filter(p => ahora - p.ts < 60000)
    }
  }, [familiares])

  // Solo mira los últimos 30 s: así detecta rápido cuando para o arranca
  function estadoMovimiento(uid) {
    const h = histRef.current[uid] || []
    if (h.length < 2) return null
    const b = h[h.length - 1]
    const a = h.find(p => b.ts - p.ts <= 30000) || h[0]
    const seg = (b.ts - a.ts) / 1000
    if (seg < 8) return null
    const dist = distanciaMetros(a.lat, a.lng, b.lat, b.lng)
    const kmh = (dist / seg) * 3.6
    // Menos de 12 m o 2.5 km/h es el "baile" normal del GPS estando quieto
    if (dist < 12 || kmh < 2.5) return { icono: '🧍', clave: 'ubiMovQuieto', color: 'var(--text2)' }
    if (kmh >= 12) return { icono: '🚗', clave: 'ubiMovVehiculo', color: '#2471A3', kmh }
    return { icono: '🚶', clave: 'ubiMovCaminando', color: '#1E8449', kmh }
  }

  // Dirección de la ficha: se calcula al abrirla y se recalcula cuando el familiar se mueve >40 m
  const famEnfocado = enVivo.find(f => f.id === enfocado)
  const latEnf = famEnfocado?.ubicacion?.latitude
  const lngEnf = famEnfocado?.ubicacion?.longitude
  const updEnf = famEnfocado?.ubicacion?.updated_at
  useEffect(() => {
    if (!enfocado) { setFichaDir(null); setFichaDesde(null); fichaUidRef.current = null; return }
    if (latEnf == null || lngEnf == null) return
    setFichaDesde(new Date(updEnf || Date.now()).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true }))
    const prev = fichaUidRef.current
    const cambioPersona = !prev || prev.uid !== enfocado
    if (!cambioPersona && distanciaMetros(prev.lat, prev.lng, latEnf, lngEnf) < 40) return
    fichaUidRef.current = { uid: enfocado, lat: latEnf, lng: lngEnf }
    if (cambioPersona) setFichaDir(t('ubiFichaBuscandoDir'))
    geocodearDireccion(latEnf, lngEnf, t('ubiCerca')).then(dir => {
      if (fichaUidRef.current?.uid !== enfocado) return
      setFichaDir(dir || `${latEnf.toFixed(5)}, ${lngEnf.toFixed(5)}`)
    })
  }, [enfocado, latEnf, lngEnf, updEnf])

  // Al abrir la ficha, desplaza lo justo para que se vea completa (sin centrar)
  useEffect(() => {
    if (!enfocado || !fichaDir) return
    const id = setTimeout(() => {
      document.getElementById(`ficha-${enfocado}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 60)
    return () => clearTimeout(id)
  }, [enfocado, fichaDir === null])

  // Pantalla de bloqueo para Plan Básico
  if (perfil !== null && !premium) {
    return (
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1>📍 {t('ubiTitulo')}</h1>
            <button className={styles.gear} onClick={abrirOpciones} title={t('tituloOpciones')} aria-label={t('tituloOpciones')}>⚙️</button>
          </div>
        </header>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 20, textAlign: 'center' }}>
          <div style={{ fontSize: '4rem' }}>🔒</div>
          <h2 style={{ color: 'var(--text)', fontWeight: 800, margin: 0 }}>{t('ubiPremTitulo')}</h2>
          <p style={{ color: 'var(--text2)', lineHeight: 1.6, margin: 0, maxWidth: 300 }}>
            {t('ubiPremDesc')}
          </p>
          <div style={{ background: 'var(--card)', border: '1.5px solid #e6a817', borderRadius: 12, padding: '16px 20px', maxWidth: 300, width: '100%' }}>
            <p style={{ color: 'var(--text2)', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
              👑 <strong>{t('ubiPremIncluye')}</strong><br />
              • {t('ubiPremF1')}<br />
              • {t('ubiPremF2')}<br />
              • {t('ubiPremF3')}<br />
              • {t('ubiPremF4')}
            </p>
          </div>
          <button
            onClick={abrirPlanes}
            style={{ background: '#e6a817', color: '#fff', fontWeight: 700, fontSize: '1rem', padding: '14px 28px', borderRadius: 10, border: 'none', cursor: 'pointer' }}
          >
            👑 {t('verPlanes')}
          </button>
        </div>
        <div className={styles.pb} />
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>📍 {t('ubiTitulo')}</h1>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className={styles.gear}
              onClick={recargar}
              disabled={recargando}
              title={t('ubiActualizar')}
              aria-label={t('ubiActualizar')}
              style={{ fontSize: '1.1rem', opacity: recargando ? 0.5 : 1, transition: recargando ? 'transform 0.4s' : 'none', transform: recargando ? 'rotate(360deg)' : 'none' }}
            >🔄</button>
            <button className={styles.gear} onClick={abrirOpciones} title={t('tituloOpciones')} aria-label={t('tituloOpciones')}>⚙️</button>
          </div>
        </div>
        <p className={styles.sub}>{t('ubiSubtitulo')}</p>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      {/* Selector de duración: ventana flotante en el centro (tocar afuera la cierra) */}
      {mostrarTiempo && (
        <div className={styles.selectorFondo} onClick={() => setMostrarTiempo(false)}>
          <div
            className={styles.selectorVentana}
            role="dialog"
            aria-modal="true"
            aria-labelledby="selector-tiempo-titulo"
            onClick={e => e.stopPropagation()}
          >
            <div className={styles.selectorIcono} aria-hidden="true">📍</div>
            <h3 id="selector-tiempo-titulo" className={styles.selectorTitulo}>{t('ubiSelectorTitulo')}</h3>
            <p className={styles.selectorDesc}>{t('ubiSelectorDesc')}</p>
            <div className={styles.selectorOpciones}>
              {OPCIONES_TIEMPO.map(op => (
                <button
                  key={op.minutos}
                  className={styles.selectorOpcion}
                  onClick={() => { setMostrarTiempo(false); empezar(true, op.minutos) }}
                >
                  <span aria-hidden="true">⏱</span> {t(op.clave)}
                </button>
              ))}
            </div>
            <button className={styles.selectorCancelar} onClick={() => setMostrarTiempo(false)}>
              {t('cancelar')}
            </button>
          </div>
        </div>
      )}

      <div className={styles.acciones}>
        {compartiendo ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className={styles.btnDetener} onClick={() => detener()}>
              ⏹ {t('ubiDetener')}
            </button>
            {minRestantes !== null && (
              <p style={{ textAlign: 'center', color: 'var(--text2)', fontSize: '0.82rem', margin: 0 }}>
                ⏱ {t('ubiCompartiendoPor')} {minRestantes < 60 ? `${minRestantes} ${t('ubiMinMas')}` : `${Math.ceil(minRestantes / 60)} ${t('ubiHorasMas')}`}
              </p>
            )}
          </div>
        ) : (
          <button className={styles.btnCompartir} onClick={() => setMostrarTiempo(true)}>
            🛰 {t('ubiCompartir')}
          </button>
        )}
      </div>


      {avisoOk && <p className={styles.avisoOk} role="status">✓ {avisoOk}</p>}

      <Mapa
        yo={compartiendo || verMiPunto ? miPos : null}
        yoCompartiendo={compartiendo}
        familiares={enVivo}
        enfocado={enVivo.find(f => f.id === enfocado) || null}
        t={t}
        centrarYo={centrarYo}
        reencuadrar={reencuadrar}
        onVerMiPunto={verMiUbicacion}
        buscandoYo={buscandoYo}
      />

      <section className={styles.lista}>
        <h2>{t('ubiFamiliaresEnVivo')} ({enVivo.length})</h2>
        {enVivo.length === 0 ? (
          <p className={styles.gris}>{t('ubiNadieEnVivo')}</p>
        ) : enVivo.map(f => {
          // Se envia cada 3 s, asi que 3 min sin recibir nada si indica un
          // problema real. Un minuto era muy poco: cualquier bache de red
          // marcaba como desconectado a alguien que si estaba transmitiendo.
          const viejo = Date.now() - new Date(f.ubicacion.updated_at).getTime() > 600000
          return (
          <div key={f.id} className={styles.fila} style={enfocado === f.id ? { flexDirection: 'column', alignItems: 'stretch' } : {}}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className={viejo ? styles.puntoViejo : styles.punto} />
              <div className={styles.filaInfo}>
                <strong>{f.nombre}</strong>
                <span className={viejo ? styles.haceViejo : styles.hace}>
                  {viejo ? `⚠️ ${t('ubiDesactualizado')} · ` : ''}{haceCuanto(f.ubicacion.updated_at, t)}
                </span>
              </div>
              <div className={styles.filaAcciones}>
                <button
                  className={enfocado === f.id ? styles.verMapaActivo : styles.verMapa}
                  onClick={() => setEnfocado(enfocado === f.id ? null : f.id)}
                >
                  {enfocado === f.id ? `✓ ${t('ubiEnMapa')}` : t('ubiAbrirMapa')}
                </button>
                <a
                  className={styles.comoLlegar}
                  href={`https://www.google.com/maps/dir/?api=1&destination=${f.ubicacion.latitude},${f.ubicacion.longitude}`}
                  target="_blank" rel="noreferrer"
                >
                  🗺️ {t('ubiTrazarRuta')}
                </a>
              </div>
            </div>
            {/* Ficha debajo de la fila cuando está enfocado */}
            {enfocado === f.id && (fichaDir || fichaDesde) && (() => {
              const partes = f.nombre.trim().split(/\s+/)
              const iniciales = ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase()
              const fin = f.ubicacion?.expires_at ? new Date(f.ubicacion.expires_at) : null
              const restMin = fin ? Math.max(0, Math.ceil((fin.getTime() - Date.now()) / 60000)) : null
              const quedan = restMin == null ? null
                : restMin < 60 ? `${restMin} ${t('ubiMinMas')}`
                : `${Math.floor(restMin / 60)} h${restMin % 60 ? ` ${restMin % 60} min` : ''}`
              return (
                <div id={`ficha-${f.id}`} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', scrollMarginBottom: 'calc(var(--barra-alto, 110px) + 12px)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: 'linear-gradient(135deg,#1E8449,#27ae60)',
                      color: '#fff', fontWeight: 800, fontSize: '0.82rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>{iniciales}</div>
                    <div>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: '0.88rem', color: 'var(--text)' }}>{f.nombre}</p>
                      <p style={{ margin: 0, fontSize: '0.68rem', color: '#1E8449', fontWeight: 600 }}>
                        {quedan ? `${t('ubiFichaEnVivoCorto')} · ${t('ubiCompartiendoPor')} ${quedan}` : t('ubiFichaEnVivo')}
                      </p>
                    </div>
                  </div>
                  {(() => {
                    const mov = estadoMovimiento(f.id)
                    return (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '3px 10px', borderRadius: 999, border: `1px solid ${mov ? mov.color : 'var(--border)'}`, fontSize: '0.74rem', fontWeight: 700, color: mov ? mov.color : 'var(--text2)' }}>
                        <span>{mov ? mov.icono : '⏳'}</span>
                        <span>{mov ? t(mov.clave) : t('ubiMovCalculando')}</span>
                        {mov?.kmh != null && <span style={{ fontWeight: 600, opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>· {Math.round(mov.kmh)} km/h</span>}
                      </div>
                    )
                  })()}
                  {fichaDir && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>📍</span>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text2)', lineHeight: 1.4 }}>{fichaDir}</p>
                    </div>
                  )}
                  {fichaDesde && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                      <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>🕐</span>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text2)' }}>{t('ubiFichaActualizado')} {fichaDesde}</p>
                    </div>
                  )}
                  {fin && (() => {
                    const hora = d => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })
                    const inicio = f.ubicacion?.iniciado_at ? new Date(f.ubicacion.iniciado_at) : null
                    return (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                        <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>⏱</span>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text2)' }}>
                          {inicio
                            ? <>{t('ubiFichaDe')} <strong style={{ color: 'var(--text)' }}>{hora(inicio)}</strong> {t('ubiFichaA')} <strong style={{ color: 'var(--text)' }}>{hora(fin)}</strong></>
                            : <>{t('ubiFichaFinaliza')} <strong style={{ color: 'var(--text)' }}>{hora(fin)}</strong></>}
                        </p>
                      </div>
                    )
                  })()}
                </div>
              )
            })()}
          </div>
          )
        })}
      </section>
    </div>
  )
}

function haceCuanto(iso, t) {
  const seg = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seg < 10) return t('ubiAhora')
  if (seg < 60) return `${t('ubiHace')} ${seg} s`
  return `${t('ubiHace')} ${Math.floor(seg / 60)} min`
}

const CAPA_OSM = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  opts: { subdomains: 'abc', maxZoom: 19 },
}

function Mapa({ yo, yoCompartiendo, familiares, enfocado, t, centrarYo, reencuadrar, onVerMiPunto, buscandoYo }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const yoMarkerRef = useRef(null)
  const famMarkersRef = useRef({})
  const fittedRef = useRef(false)
  const capaBaseRef = useRef(null)
  // Cambia cada vez que se crea el mapa: los marcadores se dibujan aunque lleguen antes que él
  const [mapaVersion, setMapaVersion] = useState(0)
  // Quiénes estaban en el mapa la última vez que se acomodó: solo se re-acomoda cuando
  // cambia la gente, no con cada punto nuevo (antes no dejaba mover el mapa con el dedo)
  const idsRef = useRef('')
  // "Ver mi punto": el mapa sigue a la persona hasta que elija a un familiar
  const modoYoRef = useRef(false)
  // Color actual del punto propio: el ícono solo se cambia cuando cambia el modo (si se
  // cambiara con cada punto, el pulso se reiniciaba cada segundo)
  const modoIconoRef = useRef(null)

  const hayPuntos = yo || familiares.some(f => f.ubicacion)

  // CSS personalizado de marcadores (una sola vez)
  useEffect(() => {
    if (document.getElementById('lf-mapa-styles')) return
    const s = document.createElement('style')
    s.id = 'lf-mapa-styles'
    s.textContent = `
      @keyframes lfpulse{0%{box-shadow:0 0 0 0 rgba(30,132,73,.55)}70%{box-shadow:0 0 0 14px rgba(30,132,73,0)}100%{box-shadow:0 0 0 0 rgba(30,132,73,0)}}
      .lf-yo{width:18px;height:18px;border-radius:50%;background:#1E8449;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);animation:lfpulse 2s ease-out infinite}
      .lf-yo-local{width:18px;height:18px;border-radius:50%;background:#2471A3;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)}
      .lf-fam{width:44px;height:44px;border-radius:50%;background:#1E8449;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;color:#fff;font-family:system-ui,sans-serif;animation:lfpulse 2.5s ease-out infinite}
      .lf-fam-label{position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.72);color:#fff;font-size:11px;font-weight:700;white-space:nowrap;padding:2px 7px;border-radius:6px;font-family:system-ui,sans-serif;pointer-events:none}
    `
    document.head.appendChild(s)
  }, [])

  // Inicializar mapa — usa callback ref para que funcione aunque el div
  // empiece oculto (cuando aún no hay puntos) y se revele después.
  const initMap = useRef(false)
  const setContainer = (node) => {
    containerRef.current = node
    if (!node || initMap.current) return
    initMap.current = true
    const map = L.map(node, { zoomControl: false, attributionControl: false })
      .setView([4.711, -74.072], 13)
    capaBaseRef.current = L.tileLayer(CAPA_OSM.url, CAPA_OSM.opts).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map
    setMapaVersion(v => v + 1)
    setTimeout(() => map.invalidateSize(), 100)
  }

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; initMap.current = false; fittedRef.current = false }
      // Los marcadores eran de ese mapa: uno nuevo los vuelve a crear
      yoMarkerRef.current = null
      famMarkersRef.current = {}
      idsRef.current = ''
    }
  }, [])

  // Cuando el div pasa de oculto a visible, invalidar tamaño
  useEffect(() => {
    if (hayPuntos && mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 50)
    }
  }, [hayPuntos])

  /** Acomoda el mapa para que se vean todos los puntos. */
  function verTodos() {
    const map = mapRef.current
    if (!map) return
    const all = [...(yoMarkerRef.current ? [yoMarkerRef.current] : []), ...Object.values(famMarkersRef.current)]
    if (all.length === 1) map.setView(all[0].getLatLng(), 16, { animate: true })
    else if (all.length > 1) { try { map.fitBounds(L.featureGroup(all).getBounds().pad(0.25), { maxZoom: 17 }) } catch (_) {} }
  }

  // Marcador "Yo": verde si se está compartiendo (la familia lo ve), azul si solo lo ve esta persona
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (yo) {
      const icon = L.divIcon({ className: '', html: `<div class="${yoCompartiendo ? 'lf-yo' : 'lf-yo-local'}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] })
      if (yoMarkerRef.current) {
        yoMarkerRef.current.setLatLng([yo.lat, yo.lng])
        if (modoIconoRef.current !== yoCompartiendo) yoMarkerRef.current.setIcon(icon)
      } else {
        yoMarkerRef.current = L.marker([yo.lat, yo.lng], { icon, zIndexOffset: 1000 })
          .bindPopup(`📍 ${t('ubiYo')}`).addTo(map)
        if (!fittedRef.current) { map.setView([yo.lat, yo.lng], 16); fittedRef.current = true }
      }
      modoIconoRef.current = yoCompartiendo
      if (modoYoRef.current) map.panTo([yo.lat, yo.lng], { animate: true })
    } else {
      if (yoMarkerRef.current) { map.removeLayer(yoMarkerRef.current); yoMarkerRef.current = null }
      modoIconoRef.current = null
    }
  }, [yo, yoCompartiendo, mapaVersion])

  // Marcadores familia
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const activeIds = new Set(familiares.filter(f => f.ubicacion).map(f => f.id))
    Object.keys(famMarkersRef.current).forEach(id => {
      if (!activeIds.has(id)) { map.removeLayer(famMarkersRef.current[id]); delete famMarkersRef.current[id] }
    })
    familiares.forEach(f => {
      if (!f.ubicacion) return
      const nombre = f.nombre || '?'
      const partes = nombre.trim().split(/\s+/)
      const iniciales = (partes[0]?.[0] || '') + (partes[1]?.[0] || '')
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative"><div class="lf-fam">${iniciales.toUpperCase()}</div><div class="lf-fam-label">${nombre}</div></div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      })
      const pos = [f.ubicacion.latitude, f.ubicacion.longitude]
      if (famMarkersRef.current[f.id]) {
        famMarkersRef.current[f.id].setLatLng(pos)
      } else {
        famMarkersRef.current[f.id] = L.marker(pos, { icon })
          .addTo(map)
        if (!fittedRef.current) { map.setView(pos, 15); fittedRef.current = true }
      }
    })
    const ids = [...activeIds].sort().join(',')
    if (!enfocado && !modoYoRef.current && ids !== idsRef.current) verTodos()
    idsRef.current = ids
  }, [familiares, mapaVersion])

  // Pan a familiar enfocado (lo sigue mientras se mueve)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !enfocado) return
    modoYoRef.current = false
    const m = famMarkersRef.current[enfocado.id]
    if (m) { map.setView(m.getLatLng(), 17, { animate: true }); m.openPopup() }
  }, [enfocado])

  // Botón "Ver mi punto"
  useEffect(() => {
    const map = mapRef.current
    if (!map || !centrarYo || !yo) return
    modoYoRef.current = true
    fittedRef.current = true
    map.setView([yo.lat, yo.lng], 17, { animate: true })
  }, [centrarYo])

  // Botón de actualizar: ver a todos
  useEffect(() => {
    if (!reencuadrar) return
    modoYoRef.current = false
    verTodos()
  }, [reencuadrar])

  return (
    <div className={styles.mapa} style={{ position: 'relative' }}>
      {enfocado && <div className={styles.mapaEtiqueta}>📍 {enfocado.nombre}</div>}

      <div ref={setContainer} style={{ height: '100%', width: '100%' }} />
      {/* Estado vacío como overlay, no early-return */}
      {!hayPuntos && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
          fontSize: '2.5rem', color: 'var(--text2)',
          background: 'var(--bg2)', zIndex: 900, borderRadius: 'inherit',
          pointerEvents: 'none',
        }}>
          🗺️
          <span style={{ fontSize: '0.82rem', textAlign: 'center', padding: '0 24px' }}>{t('ubiMapaVacio')}</span>
        </div>
      )}
      <button type="button" className={styles.btnMiPunto} onClick={onVerMiPunto} disabled={buscandoYo}>
        📍 {buscandoYo ? t('ubiBuscandoMiPunto') : t('ubiVerMiPunto')}
      </button>
    </div>
  )
}


