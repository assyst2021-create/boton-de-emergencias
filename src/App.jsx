import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react'
import { registerPlugin } from '@capacitor/core'
import { suscribirPush } from './pushSubscription'
import { registrarFCM } from './fcmRegistro'
import { escucharCompras, sincronizarCompras } from './billing'
import { revisarActualizacion, instalarActualizacion } from './actualizacion'
import { revisarPerfil } from './registro'

const Permisos = registerPlugin('Permisos')
const EN_CAPACITOR = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()
import { ThemeProvider } from './ThemeContext'
import { supabase } from './supabase'
import { LanguageProvider, useLanguage } from './i18n/LanguageContext'
import PrivacidadPublica from './pages/PrivacidadPublica'
import Login from './pages/Login'
import Bienvenida from './pages/Bienvenida'
import CompletarRegistro from './pages/CompletarRegistro'
import Nav from './components/Nav'
import { NavContext } from './components/NavContext'
import { AppActionsContext } from './AppActionsContext'

const ElegirPlan    = lazy(() => import('./pages/ElegirPlan'))
const PanicButtons  = lazy(() => import('./pages/PanicButtons'))
const Historial     = lazy(() => import('./pages/Historial'))
const GrupoFamiliar = lazy(() => import('./pages/GrupoFamiliar'))
const Ubicacion     = lazy(() => import('./pages/Ubicacion'))
const Perfil        = lazy(() => import('./pages/Perfil'))
const AvisoLegal    = lazy(() => import('./pages/AvisoLegal'))

export default function App() {
  if (window.location.pathname === '/privacidad') return <PrivacidadPublica />
  return <ThemeProvider><LanguageProvider><AppInner /></LanguageProvider></ThemeProvider>
}

function AppInner() {
  const [session, setSession] = useState(undefined)
  const [bienvenidaVista, setBienvenidaVista] = useState(false)
  const [avisoLegalAceptado, setAvisoLegalAceptado] = useState(false)
  const [planElegido, setPlanElegido] = useState(false)
  const [contratoAceptado, setContratoAceptado] = useState(false)
  const [initDone, setInitDone] = useState(false)
  const [perfilFalta, setPerfilFalta] = useState(false)
  const [mostrarPerfil, setMostrarPerfil] = useState(false)
  const [soloVerLegal, setSoloVerLegal] = useState(false)
  const [actualizacionLista, setActualizacionLista] = useState(false)
  const [faltanPermisos, setFaltanPermisos] = useState([])
  const permisosPedidosRef = useRef(false)
  const { t } = useLanguage()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  // Cargar flags por usuario desde localStorage
  useEffect(() => {
    if (session && !initDone) {
      const uid = session.user.id
      setBienvenidaVista(!!localStorage.getItem(`bienvenida_${uid}`))
      // Compatibilidad: si ya aceptó ambos docs por separado, marcar combinado también
      const avisoOk = !!localStorage.getItem(`aviso_${uid}`) ||
        (!!localStorage.getItem(`disclaimer_${uid}`) && !!localStorage.getItem(`privacidad_${uid}`))
      setAvisoLegalAceptado(avisoOk)
      setContratoAceptado(!!localStorage.getItem(`contrato_${uid}`))

      if (!!localStorage.getItem(`planElegido_${uid}`)) {
        // Entra de una (también sin internet); el perfil se confirma por detrás
        setPlanElegido(true)
        setInitDone(true)
        revisarPerfil(uid).then(({ falta }) => { if (falta) setPerfilFalta(true) })
      } else {
        // Usuarios que ya tienen plan saltan la pantalla de planes
        revisarPerfil(uid).then(({ perfil: p, falta }) => {
          setPerfilFalta(falta)
          const tienePlan = p?.plan === 'premium' || p?.plan === 'familiar' || p?.plan === 'basico' ||
            (p?.is_premium && (!p.premium_hasta || new Date(p.premium_hasta) > new Date()))
          if (tienePlan) {
            localStorage.setItem(`planElegido_${uid}`, '1')
            setPlanElegido(true)
          }
          setInitDone(true)
        })
      }
    }
    if (!session) { setInitDone(false); setPerfilFalta(false); setContratoAceptado(false); setAvisoLegalAceptado(false) }
  }, [session, initDone])

  // Las pestañas se cargan por partes: se dejan listas apenas la app queda libre, para que
  // Historial, Familia y En vivo abran al instante la primera vez que se tocan
  useEffect(() => {
    if (!initDone) return
    const precargar = () => {
      import('./pages/Historial'); import('./pages/GrupoFamiliar')
      import('./pages/Ubicacion'); import('./pages/Perfil')
    }
    const id = window.requestIdleCallback ? window.requestIdleCallback(precargar, { timeout: 3000 }) : setTimeout(precargar, 1500)
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(id) : clearTimeout(id))
  }, [initDone])

  useEffect(() => {
    if (initDone && !perfilFalta && bienvenidaVista && avisoLegalAceptado) {
      // Pedir todos los permisos nativos de una sola vez (SMS, GPS, contactos, notificaciones)
      // FCM después de los permisos, para no encimar diálogos
      permisosPedidosRef.current = true
      Permisos.pedirTodos().catch(() => {}).finally(() => {
        registrarFCM(supabase, session?.user?.id)
        verificarPermisos()
      })
      // Renovaciones, cancelaciones y compras que no alcanzaron a activarse
      const recargarPlan = () => window.dispatchEvent(new Event('recargarPlan'))
      escucharCompras(supabase, recargarPlan)
      sincronizarCompras(supabase).then(r => { if (r.length) recargarPlan() })
      revisarActualizacion(supabase, () => setActualizacionLista(true))

      // Suscribir push si ya tiene permiso
      if ('Notification' in window && Notification.permission === 'granted') {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) suscribirPush(supabase, user.id)
        })
      }
    }
  }, [initDone, perfilFalta, bienvenidaVista, avisoLegalAceptado])

  // SMS, ubicación y notificaciones son indispensables para el botón de emergencia
  async function verificarPermisos() {
    if (!EN_CAPACITOR) return
    try {
      const p = await Permisos.verificar()
      setFaltanPermisos(['sms', 'ubicacion', 'notificaciones'].filter(k => !p[k]))
    } catch (_) {}
  }

  // Al volver de Ajustes se revisa de nuevo
  useEffect(() => {
    if (!EN_CAPACITOR) return
    const alVolver = () => {
      if (document.visibilityState === 'visible' && permisosPedidosRef.current) {
        verificarPermisos()
        revisarActualizacion(supabase, () => setActualizacionLista(true))
      }
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])

  async function activarPermisos() {
    await Permisos.pedirTodos().catch(() => {})
    const p = await Permisos.verificar().catch(() => null)
    const faltan = p ? ['sms', 'ubicacion', 'notificaciones'].filter(k => !p[k]) : []
    setFaltanPermisos(faltan)
    // Si Android ya no muestra el diálogo ("no volver a preguntar"), solo queda Ajustes
    if (faltan.length) Permisos.abrirAjustes().catch(() => {})
    else registrarFCM(supabase, session?.user?.id)
  }

  function marcarBienvenida() {
    localStorage.setItem(`bienvenida_${session.user.id}`, '1')
    setBienvenidaVista(true)
  }

  function marcarAvisoLegal() {
    const uid = session.user.id
    localStorage.setItem(`aviso_${uid}`, '1')
    localStorage.setItem(`bienvenida_${uid}`, '1')
    setAvisoLegalAceptado(true)
    setBienvenidaVista(true)
  }

  function marcarContrato() {
    localStorage.setItem(`contrato_${session.user.id}`, '1')
    setContratoAceptado(true)
  }

  function marcarPlanElegido() {
    localStorage.setItem(`planElegido_${session.user.id}`, '1')
    sessionStorage.removeItem('nuevoRegistro')
    setPlanElegido(true)
  }

  if (session === undefined || (session && !initDone)) return <Cargando />
  if (!session) return <Login />
  if (perfilFalta) return <CompletarRegistro userId={session.user.id} onListo={() => setPerfilFalta(false)} />
  if (!planElegido) return <Suspense fallback={<div style={{minHeight:'100dvh',background:'var(--bg)'}}/>}><ElegirPlan onElegido={marcarPlanElegido} /></Suspense>
  if (!bienvenidaVista || !avisoLegalAceptado) return <Suspense fallback={<div style={{minHeight:'100dvh',background:'var(--bg)'}}/>}><AvisoLegal onAceptar={marcarAvisoLegal} /></Suspense>
  if (soloVerLegal) return <Suspense fallback={<div style={{minHeight:'100dvh',background:'var(--bg)'}}/>}><AvisoLegal soloVer onAceptar={() => setSoloVerLegal(false)} /></Suspense>

  if (faltanPermisos.length) {
    const ICONO = { sms: '💬', ubicacion: '📍', notificaciones: '🔔' }
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 18, textAlign: 'center' }}>
        <div style={{ fontSize: '3.2rem' }}>🛡️</div>
        <h2 style={{ color: 'var(--text)', fontWeight: 800, margin: 0, fontSize: '1.3rem', textWrap: 'balance' }}>{t('permTitulo')}</h2>
        <p style={{ color: 'var(--text2)', lineHeight: 1.55, margin: 0, maxWidth: 330 }}>{t('permDesc')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 330 }}>
          {faltanPermisos.map(k => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 14px', textAlign: 'left' }}>
              <span style={{ fontSize: '1.4rem' }}>{ICONO[k]}</span>
              <div>
                <strong style={{ color: 'var(--text)', fontSize: '0.92rem' }}>{t(`perm_${k}`)}</strong>
                <p style={{ margin: 0, color: 'var(--text2)', fontSize: '0.78rem', lineHeight: 1.4 }}>{t(`perm_${k}_por`)}</p>
              </div>
            </div>
          ))}
        </div>
        <button onClick={activarPermisos} style={{ background: '#C0392B', color: '#fff', fontWeight: 800, fontSize: '1rem', padding: '15px 28px', borderRadius: 12, border: 'none', width: '100%', maxWidth: 330, cursor: 'pointer' }}>
          {t('permBoton')}
        </button>
        <p style={{ color: 'var(--text2)', fontSize: '0.75rem', margin: 0, maxWidth: 330 }}>{t('permAyuda')}</p>
      </div>
    )
  }

  return (
    <NavContext.Provider value={{ abrirOpciones: () => setMostrarPerfil(true), abrirPlanes: () => setMostrarPerfil('plan') }}>
    {actualizacionLista && (
      <div role="status" style={{
        position: 'fixed', left: 12, right: 12, zIndex: 9998,
        bottom: 'calc(var(--barra-alto, 110px) + 12px)',
        background: '#1E8449', color: '#fff', borderRadius: 14,
        padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
      }}>
        <span style={{ fontSize: '1.3rem' }}>⬇️</span>
        <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 600, lineHeight: 1.35 }}>{t('actualizacionLista')}</span>
        <button onClick={instalarActualizacion} style={{ background: '#fff', color: '#1E8449', border: 'none', borderRadius: 10, padding: '9px 14px', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer' }}>
          {t('actualizacionReiniciar')}
        </button>
      </div>
    )}
    <AppActionsContext.Provider value={{
      verBienvenida: () => setSoloVerLegal(true),
      verTerminos: () => setSoloVerLegal(true),
      verPrivacidad: () => setSoloVerLegal(true),
      verContrato: () => setSoloVerLegal(true),
      bienvenidaLeida: bienvenidaVista,
      avisoLeido: avisoLegalAceptado,
      privacidadLeida: avisoLegalAceptado,
      contratoLeido: contratoAceptado,
    }}>
      <img
        src="/logo-empresa.webp"
        alt=""
        aria-hidden="true"
        className="watermark-bg"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(440px, 94vw)',
          height: 'min(440px, 94vw)',
          objectFit: 'contain',
          opacity: 0.09,
          pointerEvents: 'none',
          zIndex: 0,
          userSelect: 'none',
        }}
      />
      <BrowserRouter>
        <SwipeRouter />
      </BrowserRouter>
      {mostrarPerfil && <Perfil pasoInicial={mostrarPerfil === 'plan' ? 'plan' : 'menu'} onCerrar={() => setMostrarPerfil(false)} />}
    </AppActionsContext.Provider>
    </NavContext.Provider>
  )
}

const RUTAS = ['/', '/historial', '/familia', '/ubicacion']

function SwipeRouter() {
  const navigate = useNavigate()
  const location = useLocation()
  const touchStart = useRef(null)

  const onTouchStart = useCallback((e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])

  const onTouchEnd = useCallback((e) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    // En Ubicacion el mapa necesita libertad de movimiento, no navegamos con swipe
    if (location.pathname === '/ubicacion') return
    // Solo swipe horizontal (eje X dominante) con al menos 60px
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    const idx = RUTAS.indexOf(location.pathname)
    if (idx === -1) return
    if (dx < 0 && idx < RUTAS.length - 1) navigate(RUTAS[idx + 1])
    if (dx > 0 && idx > 0) navigate(RUTAS[idx - 1])
  }, [location.pathname, navigate])

  return (
    <div
      style={{ height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div key={location.pathname} className="pagina-entrada">
        <Routes>
          <Route path="/" element={<><PanicButtons /><Nav /></>} />
          <Route path="/historial" element={<><Historial /><Nav /></>} />
          <Route path="/familia" element={<><GrupoFamiliar /><Nav /></>} />
          <Route path="/ubicacion" element={<><Ubicacion /><Nav /></>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

function GpsRequestScreen({ onContinuar }) {
  const { t } = useLanguage()
  const [pidiendo, setPidiendo] = useState(false)
  const [bloqueada, setBloqueada] = useState(false)

  async function pedirGPS() {
    setPidiendo(true)
    try {
      await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      )
      onContinuar()
    } catch (err) {
      if (err.code === 1) setBloqueada(true)
    }
    setPidiendo(false)
  }

  if (bloqueada) return <GpsPromptScreen onContinuar={onContinuar} />

  return (
    <div style={{ height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(24px + env(safe-area-inset-top,0px)) 24px calc(24px + env(safe-area-inset-bottom,0px))', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
        <div style={{ fontSize: '3.5rem' }}>📍</div>
        <h2 style={{ color: 'var(--text)', fontWeight: 800, margin: 0 }}>{t('permisoUbicacion')}</h2>
        <p style={{ color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>{t('permisoTexto')}</p>
        <button onClick={pedirGPS} disabled={pidiendo} style={{ background: 'var(--rojo)', color: '#fff', fontWeight: 700, fontSize: '1rem', padding: '14px', borderRadius: 10, width: '100%', border: 'none', cursor: 'pointer' }}>
          {pidiendo ? t('verificando') : t('activarGps')}
        </button>
      </div>
    </div>
  )
}

function GpsPromptScreen({ onContinuar }) {
  const { t } = useLanguage()

  async function reVerificar() {
    const result = await navigator.permissions.query({ name: 'geolocation' })
    if (result.state === 'granted') onContinuar()
  }

  return (
    <div style={{ height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(24px + env(safe-area-inset-top,0px)) 24px calc(24px + env(safe-area-inset-bottom,0px))', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
        <div style={{ fontSize: '3.5rem' }}>🚫</div>
        <h2 style={{ color: 'var(--text)', fontWeight: 800, margin: 0 }}>{t('gpsBloqueada')}</h2>
        <p style={{ color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>{t('gpsBloqueadaTexto')}</p>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', fontSize: '0.825rem', color: 'var(--text2)', lineHeight: 1.6, textAlign: 'left', width: '100%' }}>
          {t('gpsInstruccion')}
        </div>
        <button onClick={reVerificar} style={{ background: 'var(--rojo)', color: '#fff', fontWeight: 700, fontSize: '1rem', padding: '14px', borderRadius: 10, width: '100%' }}>
          {t('gpsYaActive')}
        </button>
      </div>
    </div>
  )
}

function NotifRequestScreen({ onContinuar }) {
  const { t } = useLanguage()
  const [pidiendo, setPidiendo] = useState(false)

  async function pedirPermiso() {
    setPidiendo(true)
    try {
      await Notification.requestPermission()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await suscribirPush(supabase, user.id)
    } catch (_) {}
    setPidiendo(false)
    onContinuar()
  }

  return (
    <div style={{ height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(24px + env(safe-area-inset-top,0px)) 24px calc(24px + env(safe-area-inset-bottom,0px))', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
        <img src="/logo-empresa.webp" alt="" style={{ width: 80, height: 80, objectFit: 'contain', mixBlendMode: 'multiply' }} />
        <h2 style={{ color: 'var(--text)', fontWeight: 800, margin: 0, fontSize: '1.3rem' }}>{t('notifActivarTitulo')}</h2>
        <p style={{ color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
          {t('notifActivarDesc')}
        </p>
        <button
          onClick={pedirPermiso}
          disabled={pidiendo}
          style={{ background: 'var(--verde)', color: '#fff', fontWeight: 700, fontSize: '1rem', padding: '14px', borderRadius: 10, width: '100%', border: 'none', cursor: 'pointer' }}
        >
          {pidiendo ? t('notifActivando') : t('notifActivarTitulo')}
        </button>
        <button
          onClick={onContinuar}
          style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: '0.875rem', cursor: 'pointer', padding: '4px' }}
        >
          {t('ahoraNo')}
        </button>
      </div>
    </div>
  )
}

function Cargando() {
  const { t } = useLanguage()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🆘</div>
        <p style={{ color: 'var(--text2)' }}>{t('cargando')}</p>
      </div>
    </div>
  )
}
