import { useState } from 'react'
import { supabase } from '../supabase'
import styles from './Login.module.css'

export default function Login() {
  const [modo, setModo] = useState('login')
  const [form, setForm] = useState({ nombre: '', username: '', telefono: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
    if (error) setError('Usuario o contraseña incorrectos')
    setCargando(false)
  }

  async function handleRegistro(e) {
    e.preventDefault()
    setError('')
    if (!form.nombre || !form.username || !form.telefono || !form.email || !form.password) {
      setError('Completa todos los campos')
      return
    }
    if (form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    setCargando(true)

    // Verificar username unico
    const { data: existe } = await supabase.from('users').select('id').eq('username', form.username.toLowerCase()).maybeSingle()
    if (existe) { setError('Ese nombre de usuario ya existe, elige otro'); setCargando(false); return }

    const { data: authData, error: authErr } = await supabase.auth.signUp({ email: form.email, password: form.password })
    if (authErr) { setError(authErr.message); setCargando(false); return }

    if (authData.user) {
      await supabase.from('users').insert({
        id: authData.user.id,
        username: form.username.toLowerCase(),
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
        <p>Alertas de Emergencia</p>
      </div>

      <div className={styles.card}>
        <div className={styles.tabs}>
          <button className={modo === 'login' ? styles.tabActive : styles.tab} onClick={() => { setModo('login'); setError('') }}>Ingresar</button>
          <button className={modo === 'registro' ? styles.tabActive : styles.tab} onClick={() => { setModo('registro'); setError('') }}>Registrarse</button>
        </div>

        <form onSubmit={modo === 'login' ? handleLogin : handleRegistro} className={styles.form}>
          {modo === 'registro' && (
            <>
              <div className={styles.field}>
                <label>Nombre completo</label>
                <input type="text" placeholder="Tu nombre" value={form.nombre} onChange={set('nombre')} />
              </div>
              <div className={styles.field}>
                <label>Nombre de usuario</label>
                <input type="text" placeholder="sin espacios, ej: juan123" value={form.username} onChange={set('username')} />
              </div>
              <div className={styles.field}>
                <label>Teléfono (privado)</label>
                <input type="tel" placeholder="+57 300 000 0000" value={form.telefono} onChange={set('telefono')} />
              </div>
            </>
          )}

          <div className={styles.field}>
            <label>Correo electrónico</label>
            <input type="email" placeholder="correo@ejemplo.com" value={form.email} onChange={set('email')} />
          </div>
          <div className={styles.field}>
            <label>Contraseña</label>
            <input type="password" placeholder={modo === 'registro' ? 'Mínimo 6 caracteres' : '••••••••'} value={form.password} onChange={set('password')} />
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
