import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import styles from './Login.module.css'

const toEmail = (username) => `${username.toLowerCase().trim()}@botondeemergencias.app`

export default function Login() {
  const [modo, setModo] = useState('login')
  const [form, setForm] = useState({ nombre: '', username: '', telefono: '', password: '' })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [instalada, setInstalada] = useState(false)
  const [verPassword, setVerPassword] = useState(false)

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setInstalada(true))
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function instalarApp() {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstalada(true)
    setInstallPrompt(null)
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    if (!form.username || !form.password) { setError('Completa todos los campos'); return }
    setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: toEmail(form.username),
      password: form.password,
    })
    if (error) setError('Usuario o contraseña incorrectos')
    setCargando(false)
  }

  async function handleRegistro(e) {
    e.preventDefault()
    setError('')
    if (!form.nombre || !form.username || !form.telefono || !form.password) {
      setError('Completa todos los campos')
      return
    }
    if (form.username.includes(' ')) { setError('El usuario no puede tener espacios'); return }
    if (form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    setCargando(true)

    const { data: existe } = await supabase
      .from('users')
      .select('id')
      .eq('username', form.username.toLowerCase().trim())
      .maybeSingle()

    if (existe) { setError('Ese nombre de usuario ya existe, elige otro'); setCargando(false); return }

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: toEmail(form.username),
      password: form.password,
    })

    if (authErr) { setError(authErr.message); setCargando(false); return }

    if (authData.user) {
      await supabase.from('users').insert({
        id: authData.user.id,
        username: form.username.toLowerCase().trim(),
        full_name: form.nombre,
        phone_number: form.telefono,
      })
    }
    setCargando(false)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.logo}>
        <div className={styles.sos}>🆘</div>
        <h1>Botón de Emergencias</h1>
        <p>para Sismos y Avalanchas</p>
      </div>

      {(installPrompt || instalada) && (
        <div className={styles.installBox}>
          {instalada ? (
            <span>✅ Aplicación instalada</span>
          ) : (
            <button className={styles.installBtn} onClick={instalarApp}>
              📲 Instalar aplicación en tu celular
            </button>
          )}
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.tabs}>
          <button className={modo === 'login' ? styles.tabActive : styles.tab} onClick={() => { setModo('login'); setError('') }}>Ingresar</button>
          <button className={modo === 'registro' ? styles.tabActive : styles.tab} onClick={() => { setModo('registro'); setError('') }}>Registrarse</button>
        </div>

        <form onSubmit={modo === 'login' ? handleLogin : handleRegistro} className={styles.form}>
          {modo === 'registro' && (
            <div className={styles.field}>
              <label>Nombre completo</label>
              <input type="text" placeholder="Tu nombre completo" value={form.nombre} onChange={set('nombre')} />
            </div>
          )}

          <div className={styles.field}>
            <label>Nombre de usuario</label>
            <input type="text" placeholder="sin espacios, ej: juan123" value={form.username} onChange={set('username')} autoComplete="username" />
          </div>

          {modo === 'registro' && (
            <div className={styles.field}>
              <label>Teléfono (privado)</label>
              <input type="tel" placeholder="+57 300 000 0000" value={form.telefono} onChange={set('telefono')} />
            </div>
          )}

          <div className={styles.field}>
            <label>Contraseña</label>
            <div className={styles.passwordWrap}>
              <input
                type={verPassword ? 'text' : 'password'}
                placeholder={modo === 'registro' ? 'Mínimo 6 caracteres' : '••••••••'}
                value={form.password}
                onChange={set('password')}
                autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
              />
              <button type="button" className={styles.eyeBtn} onClick={() => setVerPassword(v => !v)}>
                {verPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {modo === 'registro' && (
              <div className={styles.hint}>
                🔐 Mínimo 6 caracteres. <strong>Recuerda bien tu contraseña</strong> — por seguridad no podemos recuperarla si la olvidas.
              </div>
            )}
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.btn} disabled={cargando}>
            {cargando ? 'Procesando...' : modo === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  )
}
