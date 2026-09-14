import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback } from 'react'
import { suscribirPush } from './pushSubscription'
import { ThemeProvider } from './ThemeContext'
import { supabase } from './supabase'
import { LanguageProvider, useLanguage } from './i18n/LanguageContext'
import Login from './pages/Login'
import Bienvenida from './pages/Bienvenida'
import AvisoLegal from './pages/AvisoLegal'
import ElegirPlan from './pages/ElegirPlan'
import PanicButtons from './pages/PanicButtons'
import Historial from './pages/Historial'
import GrupoFamiliar from './pages/GrupoFamiliar'
import Ubicacion from './pages/Ubicacion'
import { AppActionsContext } from './pages/Perfil'
import Perfil from './pages/Perfil'
import Nav from './components/Nav'
import { NavContext } from './components/NavContext'

export default function App() {
  return <ThemeProvider><LanguageProvider><AppInner /></LanguageProvider></ThemeProvider>
}

function AppInner() {
  const [session, setSession] = useState(undefined)
  const [bienvenidaVista, setBienvenidaVista] = useState(false)
  const [avisoLegalAceptado, setAvisoLegalAceptado] = useState(false)
  const [planElegido, setPlanElegido] = useState(false)
  const [contratoAceptado, setContratoAceptado] = useState(false)
  const [initDone, setInitDone] = useState(false)
  const [gpsPrompt, setGpsPrompt] = useState(false)
  const [notifPrompt, setNotifPrompt] = useState(false)
  const [mostrarPerfil, setMostrarPerfil] = useState(false)
  const [soloVerLegal, setSoloVerLegal] = useState(false)

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
        setPlanElegido(true)
        setInitDone(true)
      } else {
        // Usuarios premium existentes saltan la pantalla de planes
        supabase.from('users').select('plan, is_premium, premium_hasta').eq('id', uid).maybeSingle()
          .then(({ data: p }) => {
            const premium = p?.plan === 'premium' ||
              (p?.is_premium && (!p.premium_hasta || new Date(p.premium_hasta) > new Date()))
            if (premium) {
              localStorage.setItem(`planElegido_${uid}`, '1')
              setPlanElegido(true)
            }
            setInitDone(true)
          })
      }
    }
    if (!session) { setInitDone(false); setGpsPrompt(false); setContratoAceptado(false); setAvisoLegalAceptado(false) }
  }, [session, initDone])

  useEffect(() => {
    if (initDone && bienvenidaVista && avisoLegalAceptado) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        if (result.state === 'denied') setGpsPrompt('denied')
        else if (result.state === 'prompt') setGpsPrompt(true)
        else setGpsPrompt(false)
      }).catch(() => setGpsPrompt(true))

      // Notificaciones: mostrar pantalla si aún no se ha dado permiso
      if ('Notification' in window && Notification.permission === 'default') {
        setNotifPrompt(true)
      } else if ('Notification' in window && Notification.permission === 'granted') {
        // Ya tiene permiso: suscribir al push silenciosamente
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) suscribirPush(supabase, user.id)
        })
      }
    }
  }, [initDone, bienvenidaVista, avisoLegalAceptado])

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
  // ElegirPlan solo aparece para cuentas recién creadas (no en inicio de sesión normal)
  if (!planElegido && sessionStorage.getItem('nuevoRegistro')) return <ElegirPlan onElegido={marcarPlanElegido} />
  if (!bienvenidaVista || !avisoLegalAceptado) return <AvisoLegal onAceptar={marcarAvisoLegal} />
  if (soloVerLegal) return <AvisoLegal soloVer onAceptar={() => setSoloVerLegal(false)} />
  if (notifPrompt) return <NotifRequestScreen onContinuar={() => setNotifPrompt(false)} />
  if (gpsPrompt === 'denied') return <GpsPromptScreen onContinuar={() => setGpsPrompt(false)} />
  if (gpsPrompt === true) return <GpsRequestScreen onContinuar={() => setGpsPrompt(false)} />

  return (
    <NavContext.Provider value={{ abrirOpciones: () => setMostrarPerfil(true) }}>
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
        src="/logo-empresa.png"
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
      {mostrarPerfil && <Perfil onCerrar={() => setMostrarPerfil(false)} />}
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
    // Solo swipe horizontal (eje X dominante) con al menos 60px
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    const idx = RUTAS.indexOf(location.pathname)
    if (idx === -1) return
    if (dx < 0 && idx < RUTAS.length - 1) navigate(RUTAS[idx + 1])
    if (dx > 0 && idx > 0) navigate(RUTAS[idx - 1])
  }, [location.pathname, navigate])

  return (
    <div
      style={{ minHeight: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
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
        <img src="/logo-empresa.png" alt="" style={{ width: 80, height: 80, objectFit: 'contain', mixBlendMode: 'multiply' }} />
        <h2 style={{ color: 'var(--text)', fontWeight: 800, margin: 0, fontSize: '1.3rem' }}>Activar notificaciones</h2>
        <p style={{ color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
          Necesitamos enviarte alertas cuando tus familiares activen el botón de emergencia. Activa las notificaciones para no perderte ninguna alerta.
        </p>
        <button
          onClick={pedirPermiso}
          disabled={pidiendo}
          style={{ background: 'var(--verde)', color: '#fff', fontWeight: 700, fontSize: '1rem', padding: '14px', borderRadius: 10, width: '100%', border: 'none', cursor: 'pointer' }}
        >
          {pidiendo ? 'Activando...' : 'Activar notificaciones'}
        </button>
        <button
          onClick={onContinuar}
          style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: '0.875rem', cursor: 'pointer', padding: '4px' }}
        >
          Ahora no
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
