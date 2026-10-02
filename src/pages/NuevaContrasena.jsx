import { useState } from 'react'
import { supabase } from '../supabase'
import styles from './Login.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { validarClave, mensajeErrorClave } from '../clave'

/**
 * Se abre al entrar por el enlace del correo "¿Olvidaste tu contraseña?". Antes, ese enlace solo
 * iniciaba sesión y nunca pedía la contraseña nueva: la persona seguía sin poder entrar en la app.
 */
export default function NuevaContrasena({ onListo }) {
  const { t } = useLanguage()
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)
  const [cargando, setCargando] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    setError('')
    const invalida = validarClave(nueva, confirmar, t)
    if (invalida) { setError(invalida); return }
    setCargando(true)
    const { error: err } = await supabase.auth.updateUser({ password: nueva })
      .then(r => r, e => ({ error: e }))
    setCargando(false)
    if (err) { setError(mensajeErrorClave(err, t)); return }
    setListo(true)
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
          {listo ? (
            <div className={styles.form}>
              <p style={{ color: 'var(--text)', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>✅ {t('claveRecOk')}</p>
              <button type="button" className={styles.btn} onClick={onListo}>{t('completarBoton')}</button>
            </div>
          ) : (
            <form onSubmit={guardar} className={styles.form}>
              <p style={{ color: 'var(--text)', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>🔑 {t('claveRecTitulo')}</p>
              <p style={{ color: 'var(--text2)', margin: 0, lineHeight: 1.45 }}>{t('claveRecDesc')}</p>
              <div className={styles.field}>
                <label>{t('nuevaContrasena')}</label>
                <div className={styles.passwordWrap}>
                  <input type={ver ? 'text' : 'password'} placeholder={t('nuevaPh')} value={nueva}
                    onChange={e => setNueva(e.target.value)} autoComplete="new-password" />
                  <button type="button" className={styles.eyeBtn} onClick={() => setVer(v => !v)}>{ver ? '🙈' : '👁️'}</button>
                </div>
              </div>
              <div className={styles.field}>
                <label>{t('confirmarContrasena')}</label>
                <input type={ver ? 'text' : 'password'} placeholder={t('confirmarPh')} value={confirmar}
                  onChange={e => setConfirmar(e.target.value)} autoComplete="new-password" />
              </div>
              {error && <div className={styles.error}>{error}</div>}
              <button type="submit" className={styles.btn} disabled={cargando}>
                {cargando ? t('procesando') : t('cambiarBtn')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
