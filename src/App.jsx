import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { LanguageProvider, useLanguage } from './i18n/LanguageContext'
import Login from './pages/Login'
import Bienvenida from './pages/Bienvenida'
import Disclaimer from './pages/Disclaimer'
import Privacidad from './pages/Privacidad'
import PanicButtons from './pages/PanicButtons'
import Historial from './pages/Historial'
import GrupoFamiliar from './pages/GrupoFamiliar'
import { AppActionsContext } from './pages/Perfil'
import Nav from './components/Nav'

export default function App() {
  return <LanguageProvider><AppInner /></LanguageProvider>
}

function AppInner() {
  const [session, setSession] = useState(undefined)
  const [bienvenidaVista, setBienvenidaVista] = useState(false)
  const [disclaimerAceptado, setDisclaimerAceptado] = useState(false)
  const [privacidadVista, setPrivacidadVista] = useState(false)
  const [initDone, setInitDone] = useState(false)
  const [gpsPrompt, setGpsPrompt] = useState(false)

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
      setDisclaimerAceptado(!!localStorage.getItem(`disclaimer_${uid}`))
      setPrivacidadVista(!!localStorage.getItem(`privacidad_${uid}`))
      setInitDone(true)
    }
    if (!session) { setInitDone(false); setGpsPrompt(false) }
  }, [session, initDone])

  // GPS check solo para usuarios que ya vieron todo (usuarios recurrentes)
  useEffect(() => {
    if (initDone && bienvenidaVista && disclaimerAceptado && privacidadVista) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        setGpsPrompt(result.state === 'denied')
      }).catch(() => setGpsPrompt(false))
    }
  }, [initDone, bienvenidaVista, disclaimerAceptado, privacidadVista])

  function marcarBienvenida() {
    localStorage.setItem(`bienvenida_${session.user.id}`, '1')
    setBienvenidaVista(true)
  }

  function marcarDisclaimer() {
    localStorage.setItem(`disclaimer_${session.user.id}`, '1')
    setDisclaimerAceptado(true)
  }

  function marcarPrivacidad() {
    localStorage.setItem(`privacidad_${session.user.id}`, '1')
    setPrivacidadVista(true)
  }

  if (session === undefined || (session && !initDone)) return <Cargando />
  if (!session) return <Login />
  if (!bienvenidaVista) return <Bienvenida onContinuar={marcarBienvenida} />
  if (!disclaimerAceptado) return <Disclaimer onAceptar={marcarDisclaimer} />
  if (!privacidadVista) return <Privacidad onAceptar={marcarPrivacidad} />
  if (gpsPrompt) return <GpsPromptScreen onContinuar={() => setGpsPrompt(false)} />

  return (
    <AppActionsContext.Provider value={{
      verBienvenida: () => setBienvenidaVista(false),
      verTerminos: () => setDisclaimerAceptado(false),
      verPrivacidad: () => setPrivacidadVista(false),
      bienvenidaLeida: bienvenidaVista,
      avisoLeido: disclaimerAceptado,
      privacidadLeida: privacidadVista,
    }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<><PanicButtons /><Nav /></>} />
          <Route path="/historial" element={<><Historial /><Nav /></>} />
          <Route path="/familia" element={<><GrupoFamiliar /><Nav /></>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppActionsContext.Provider>
  )
}

function GpsPromptScreen({ onContinuar }) {
  const { t } = useLanguage()

  async function reVerificar() {
    const result = await navigator.permissions.query({ name: 'geolocation' })
    if (result.state === 'granted') onContinuar()
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg)' }}>
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

function Cargando() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🆘</div>
        <p style={{ color: 'var(--text2)' }}>Cargando...</p>
      </div>
    </div>
  )
}
