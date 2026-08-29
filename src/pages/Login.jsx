import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import styles from './Login.module.css'
import { useLanguage } from '../i18n/LanguageContext'

export default function Login() {
  const { t } = useLanguage()
  const [modo, setModo] = useState('login')
  const [form, setForm] = useState({ nombre: '', username: '', email: '', telefono: '', password: '' })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [instalada, setInstalada] = useState(false)
  const [verPassword, setVerPassword] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState(null) // 'ok' | 'taken' | 'checking'
  const debounceRef = useRef(null)

  useEffect(() => {
    if (modo !== 'registro' || form.username.length < 3) { setUsernameStatus(null); return }
    setUsernameStatus('checking')
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase.from('users').select('id').eq('username', form.username.toLowerCase().trim()).maybeSingle()
      setUsernameStatus(data ? 'taken' : 'ok')
    }, 500)
    return () => clearTimeout(debounceRef.current)
  }, [form.username, modo])

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
    if (!form.email || !form.password) { setError(t('errorCampos')); return }
    setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.toLowerCase().trim(),
      password: form.password,
    })
    if (error) setError(t('errorLogin'))
    setCargando(false)
  }

  async function handleRegistro(e) {
    e.preventDefault()
    setError('')
    if (!form.nombre || !form.username || !form.email || !form.telefono || !form.password) {
      setError(t('errorCampos'))
      return
    }
    if (form.username.includes(' ')) { setError(t('errorEspacios')); return }
    if (form.password.length < 6) { setError(t('errorContrasenaCorta')); return }
    setCargando(true)

    const { data: existe } = await supabase
      .from('users')
      .select('id')
      .eq('username', form.username.toLowerCase().trim())
      .maybeSingle()

    if (existe) { setError(t('errorUsuarioExiste')); setCargando(false); return }

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: form.email.toLowerCase().trim(),
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
        <img src="/logo.png" alt="Botón de Emergencias" className={styles.logoImg} />
        <h1>Botón de Emergencias</h1>
      </div>

      {(installPrompt || instalada) && (
        <div className={styles.installBox}>
          {instalada ? (
            <span>{t('appInstalada')}</span>
          ) : (
            <button className={styles.installBtn} onClick={instalarApp}>
              {t('instalarApp')}
            </button>
          )}
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.tabs}>
          <button className={modo === 'login' ? styles.tabActive : styles.tab} onClick={() => { setModo('login'); setError('') }}>{t('ingresar')}</button>
          <button className={modo === 'registro' ? styles.tabActive : styles.tab} onClick={() => { setModo('registro'); setError('') }}>{t('registrarse')}</button>
        </div>

        <form onSubmit={modo === 'login' ? handleLogin : handleRegistro} className={styles.form}>
          {modo === 'registro' && (
            <>
              <div className={styles.field}>
                <label>{t('nombreCompleto')}</label>
                <input type="text" placeholder={t('nombrePh')} value={form.nombre} onChange={set('nombre')} />
              </div>
              <div className={styles.field}>
                <label>{t('nombreUsuario')}</label>
                <input type="text" placeholder={t('userPh')} value={form.username} onChange={set('username')} autoComplete="username" />
                {usernameStatus === 'checking' && <span className={styles.usernameChecking}>Verificando...</span>}
                {usernameStatus === 'ok' && <span className={styles.usernameOk}>✓ Disponible</span>}
                {usernameStatus === 'taken' && <span className={styles.usernameTaken}>✗ No disponible</span>}
              </div>
            </>
          )}

          <div className={styles.field}>
            <label>{t('correo')}</label>
            <input type="email" placeholder={t('correoPh')} value={form.email} onChange={set('email')} autoComplete="email" />
          </div>

          {modo === 'registro' && (
            <div className={styles.field}>
              <label>{t('telefono')}</label>
              <input type="tel" placeholder={t('telPh')} value={form.telefono} onChange={set('telefono')} />
            </div>
          )}

          <div className={styles.field}>
            <label>{t('contrasena')}</label>
            <div className={styles.passwordWrap}>
              <input
                type={verPassword ? 'text' : 'password'}
                placeholder={modo === 'registro' ? t('contrasenaRegPh') : t('contrasenaPh')}
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
                🔐 {t('hintContrasena')}
              </div>
            )}
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.btn} disabled={cargando}>
            {cargando ? t('procesando') : modo === 'login' ? t('ingresar') : t('crearCuenta')}
          </button>
        </form>
      </div>
    </div>
  )
}
