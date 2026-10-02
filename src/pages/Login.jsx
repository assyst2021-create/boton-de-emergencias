import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import styles from './Login.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { IDIOMAS } from '../i18n/translations'
import {
  PAISES, USUARIO_VALIDO, normalizarUsuario, limpiarUsuario, useAvisoUsuario, usuarioDisponible, nombrePais,
  guardarDatosRegistro, borrarDatosRegistro, marcarRegistroEnCurso,
} from '../registro'

function mensajeErrorRegistro(err, t) {
  const texto = `${err?.code || ''} ${err?.message || ''}`
  if (/already|exists|registered/i.test(texto)) return t('errorCorreoYaRegistrado')
  if (/email/i.test(texto) && /invalid|valid/i.test(texto)) return t('errorCorreoInvalido')
  if (/fetch|network|failed to/i.test(texto)) return t('errorConexion')
  return t('errorRegistro')
}

export default function Login() {
  const { t, lang, cambiarIdioma } = useLanguage()
  const [modo, setModo] = useState('login')
  const [form, setForm] = useState({ nombre: '', username: '', email: '', telefono: '', password: '' })
  const [pais, setPais] = useState(PAISES[0])
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [verPassword, setVerPassword] = useState(false)
  const esIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  const [usernameStatus, setUsernameStatus] = useState(null) // 'ok' | 'taken' | 'checking'
  const debounceRef = useRef(null)
  const [avisoUsuario, revisarUsuario] = useAvisoUsuario()
  const [resetEnviado, setResetEnviado] = useState(false)
  const [resetCargando, setResetCargando] = useState(false)
  useEffect(() => {
    const u = normalizarUsuario(form.username)
    if (modo !== 'registro' || !u) { setUsernameStatus(null); return }
    if (!USUARIO_VALIDO.test(u)) { setUsernameStatus('invalid'); return }
    setUsernameStatus('checking')
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const libre = await usuarioDisponible(u)
      // Sin respuesta no se puede afirmar que está libre
      setUsernameStatus(libre === null ? 'error' : libre ? 'ok' : 'taken')
    }, 500)
    return () => clearTimeout(debounceRef.current)
  }, [form.username, modo])

  const set = (k) => (e) => {
    const valor = e.target.value
    if (k === 'username') revisarUsuario(valor)
    setForm(f => ({ ...f, [k]: k === 'username' ? limpiarUsuario(valor) : valor }))
  }

  async function handleReset() {
    setError('')
    if (!form.email) { setError(t('errorCorreoReset')); return }
    setResetCargando(true)
    await supabase.auth.resetPasswordForEmail(form.email.toLowerCase().trim())
    setResetEnviado(true)
    setResetCargando(false)
  }

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
    const username = normalizarUsuario(form.username)
    if (!USUARIO_VALIDO.test(username)) { setError(t('errorUsuarioInvalido')); return }
    if (form.password.length < 6) { setError(t('errorContrasenaCorta')); return }
    setCargando(true)

    const libre = await usuarioDisponible(username)
    if (libre === null) { setError(t('errorConexion')); setCargando(false); return }
    if (!libre) { setError(t('errorUsuarioExiste')); setUsernameStatus('taken'); setCargando(false); return }

    // Si el perfil no alcanza a guardarse (señal, app cerrada), "Completa tu registro"
    // aparece con estos datos ya llenos
    guardarDatosRegistro({ nombre: form.nombre, username, telefono: form.telefono, pais: pais.codigo + pais.nombre })
    marcarRegistroEnCurso(true)
    try {
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email.toLowerCase().trim(),
        password: form.password,
      })

      if (authErr) { setError(mensajeErrorRegistro(authErr, t)); return }

      if (authData.user) {
        // Si esto falla, la sesión ya existe y la app muestra "Completa tu registro":
        // cerrar sesión aquí dejaba la cuenta a medias y el correo ya no se podía usar
        const { error: errPerfil } = await supabase.from('users').insert({
          id: authData.user.id,
          username,
          full_name: form.nombre,
          phone_number: `${pais.codigo}${form.telefono}`,
        })
        if (!errPerfil) borrarDatosRegistro()
        sessionStorage.setItem('nuevoRegistro', '1')
      }
    } finally {
      marcarRegistroEnCurso(false)
      setCargando(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.topSection}>
        <div className={styles.logo}>
          <img src="/logo.png" alt={t('appNombre')} className={styles.logoImg} />
          <h1>{t('appNombre')}</h1>
        </div>

      </div>

      <div className={styles.bottomSection}>
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
                <input type="text" placeholder={t('userPh')} value={form.username} onChange={set('username')} autoComplete="username" maxLength={20} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                {avisoUsuario && <span className={styles.usernameAviso}>{t('usuarioCorregido')}</span>}
                {usernameStatus === 'checking' && <span className={styles.usernameChecking}>{t('verificandoDisponibilidad')}</span>}
                {usernameStatus === 'ok' && <span className={styles.usernameOk}>{t('usuarioDisponible')}</span>}
                {usernameStatus === 'taken' && <span className={styles.usernameTaken}>{t('usuarioNoDisponible')}</span>}
                {usernameStatus === 'invalid' && <span className={styles.usernameTaken}>{t('errorUsuarioInvalido')}</span>}
                {usernameStatus === 'error' && <span className={styles.usernameTaken}>{t('errorConexion')}</span>}
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
              <div className={styles.telWrap}>
                <div className={styles.paisPill}>
                  <span className={styles.paisBandera}>{pais.bandera}</span>
                  <span className={styles.paisCodigo}>{pais.codigo}</span>
                  <select
                    className={styles.paisSelectOverlay}
                    value={pais.codigo + pais.nombre}
                    onChange={e => setPais(PAISES.find(p => p.codigo + p.nombre === e.target.value))}
                  >
                    {PAISES.map(p => (
                      <option key={p.codigo + p.nombre} value={p.codigo + p.nombre}>
                        {p.bandera} {p.codigo} — {nombrePais(p, lang)}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="tel"
                  placeholder="300 000 0000"
                  value={form.telefono}
                  onChange={set('telefono')}
                  className={styles.telInput}
                />
              </div>
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

          {modo === 'login' && (
            <div style={{ textAlign: 'right', marginTop: -8 }}>
              {resetEnviado ? (
                <span className={styles.resetOk}>{t('resetEnviado')}</span>
              ) : (
                <button type="button" className={styles.resetLink} onClick={handleReset} disabled={resetCargando}>
                  {resetCargando ? t('procesando') : t('olvidaste')}
                </button>
              )}
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.idiomaSelector}>
            <span className={styles.idiomaLabel}>🌐</span>
            <select
              className={styles.idiomaSelect}
              value={lang}
              onChange={e => cambiarIdioma(e.target.value)}
            >
              {IDIOMAS.map(i => (
                <option key={i.code} value={i.code}>{i.flag} {i.label}</option>
              ))}
            </select>
          </div>

          <button type="submit" className={styles.btn} disabled={cargando}>
            {cargando ? t('procesando') : modo === 'login' ? t('ingresar') : t('crearCuenta')}
          </button>
        </form>
      </div>
      </div>
    </div>
  )
}
