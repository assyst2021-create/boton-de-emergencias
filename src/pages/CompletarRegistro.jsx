import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import styles from './Login.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import {
  PAISES, USUARIO_VALIDO, normalizarUsuario, limpiarUsuario, useAvisoUsuario, usuarioDisponible,
  leerDatosRegistro, borrarDatosRegistro,
} from '../registro'

/**
 * Cuenta creada sin perfil: se cortó la señal o se cerró la app justo al registrarse.
 * Sin esta pantalla la persona entraba a la app sin @usuario y nadie podía agregarla.
 */
export default function CompletarRegistro({ userId, onListo }) {
  const { t } = useLanguage()
  const [previo] = useState(leerDatosRegistro)
  const [form, setForm] = useState({
    nombre: previo.nombre || '',
    username: previo.username || '',
    telefono: previo.telefono || '',
  })
  const [pais, setPais] = useState(() => PAISES.find(p => p.codigo + p.nombre === previo.pais) || PAISES[0])
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState(null)
  const debounceRef = useRef(null)
  const [avisoUsuario, revisarUsuario] = useAvisoUsuario()

  useEffect(() => {
    const u = normalizarUsuario(form.username)
    if (!u) { setUsernameStatus(null); return }
    if (!USUARIO_VALIDO.test(u)) { setUsernameStatus('invalid'); return }
    setUsernameStatus('checking')
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const libre = await usuarioDisponible(u)
      setUsernameStatus(libre === null ? 'error' : libre ? 'ok' : 'taken')
    }, 500)
    return () => clearTimeout(debounceRef.current)
  }, [form.username])

  const set = (k) => (e) => {
    const valor = e.target.value
    if (k === 'username') revisarUsuario(valor)
    setForm(f => ({ ...f, [k]: k === 'username' ? limpiarUsuario(valor) : valor }))
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    const nombre = form.nombre.trim()
    const telefono = form.telefono.trim()
    const username = normalizarUsuario(form.username)
    if (!nombre || !username || !telefono) { setError(t('errorCampos')); return }
    if (!USUARIO_VALIDO.test(username)) { setError(t('errorUsuarioInvalido')); return }
    setCargando(true)

    const { error: err } = await supabase.from('users').insert({
      id: userId,
      username,
      full_name: nombre,
      phone_number: `${pais.codigo}${telefono}`,
    })
    // Clave repetida en el id: el perfil sí alcanzó a guardarse, se continúa
    const yaExistia = err?.code === '23505' && !/username/i.test(err.message || '')
    if (err && !yaExistia) {
      if (err.code === '23505') { setError(t('errorUsuarioExiste')); setUsernameStatus('taken') }
      else setError(t('errorConexion'))
      setCargando(false)
      return
    }
    borrarDatosRegistro()
    sessionStorage.setItem('nuevoRegistro', '1')
    onListo()
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.topSection}>
        <div className={styles.logo}>
          <img src="/logo.png" alt="" className={styles.logoImg} />
          <h1>{t('completarTitulo')}</h1>
        </div>
      </div>

      <div className={styles.bottomSection}>
        <div className={styles.card}>
          <form onSubmit={guardar} className={styles.form}>
            <div className={styles.hint}>{t('completarDesc')}</div>

            <div className={styles.field}>
              <label>{t('nombreCompleto')}</label>
              <input type="text" placeholder={t('nombrePh')} value={form.nombre} onChange={set('nombre')} autoComplete="name" />
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
                        {p.bandera} {p.codigo} — {p.nombre}
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

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.btn} disabled={cargando}>
              {cargando ? t('procesando') : t('completarBoton')}
            </button>
            <button type="button" className={styles.resetLink} onClick={() => supabase.auth.signOut()} style={{ alignSelf: 'center' }}>
              {t('completarSalir')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
