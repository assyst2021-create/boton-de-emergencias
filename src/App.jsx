import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { LanguageProvider } from './i18n/LanguageContext'
import Login from './pages/Login'
import Bienvenida from './pages/Bienvenida'
import PanicButtons from './pages/PanicButtons'
import Historial from './pages/Historial'
import GrupoFamiliar from './pages/GrupoFamiliar'
import Nav from './components/Nav'

export default function App() {
  return <LanguageProvider><AppInner /></LanguageProvider>
}

function AppInner() {
  const [session, setSession] = useState(undefined)
  const [bienvenidaVista, setBienvenidaVista] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return <Cargando />

  if (!session) return <Login />

  if (!bienvenidaVista) {
    return <Bienvenida onContinuar={() => setBienvenidaVista(true)} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<><PanicButtons /><Nav /></>} />
        <Route path="/historial" element={<><Historial /><Nav /></>} />
        <Route path="/familia" element={<><GrupoFamiliar /><Nav /></>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
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
