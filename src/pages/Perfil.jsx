import { useState } from 'react'
import { supabase } from '../supabase'
import styles from './Perfil.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { IDIOMAS } from '../i18n/translations'

export default function Perfil({ onCerrar }) {
  const { t, lang, cambiarIdioma } = useLanguage()
  const [paso, setPaso] = useState('menu')
  const [form, setForm] = useState({ nueva: '', confirmar: '' })
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [cargando, setCargando] = useState(false)
  const [verNueva, setVerNueva] = useState(false)
  const [verConfirmar, setVerConfirmar] = useState(false)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function cambiarContrasena(e) {
    e.preventDefault()
    setError('')
    if (form.nueva.length < 6) { setError(t('errorMin')); return }
    if (form.nueva !== form.confirmar) { setError(t('errorNoCoinciden')); return }
    setCargando(true)
    const { error } = await supabase.auth.updateUser({ password: form.nueva })
    if (error) { setError(t('errorCambio')); setCargando(false); return }
    setExito(t('exitoCambio'))
    setForm({ nueva: '', confirmar: '' })
    setCargando(false)
    setTimeout(() => { setExito(''); setPaso('menu') }, 2500)
  }

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{t('opciones')}</h2>
          <button className={styles.cerrar} onClick={onCerrar}>✕</button>
        </div>

        {paso === 'menu' && (
          <div className={styles.menu}>
            <button className={styles.opcion} onClick={() => setPaso('idioma')}>
              {t('cambiarIdioma')}
            </button>
            <button className={styles.opcion} onClick={() => setPaso('contrasena')}>
              {t('cambiarContrasena')}
            </button>
            <button className={styles.opcionRojo} onClick={() => supabase.auth.signOut()}>
              {t('cerrarSesion')}
            </button>
          </div>
        )}

        {paso === 'idioma' && (
          <div className={styles.form}>
            <p className={styles.desc}>{t('seleccionarIdioma')}</p>
            {IDIOMAS.map(i => (
              <button
                key={i.code}
                className={lang === i.code ? styles.idiomaActivo : styles.idioma}
                onClick={() => cambiarIdioma(i.code)}
              >
                <span>{i.flag}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{i.label}</span>
                {lang === i.code && <span style={{ color: 'var(--rojo)', fontWeight: 800 }}>✓</span>}
              </button>
            ))}
            <button type="button" className={styles.volver} onClick={() => setPaso('menu')}>{t('volver')}</button>
          </div>
        )}

        {paso === 'contrasena' && (
          <form onSubmit={cambiarContrasena} className={styles.form}>
            <p className={styles.desc}>{t('ingresarDesc')}</p>
            <div className={styles.field}>
              <label>{t('nuevaContrasena')}</label>
              <div className={styles.passwordWrap}>
                <input type={verNueva ? 'text' : 'password'} placeholder={t('nuevaPh')} value={form.nueva} onChange={set('nueva')} autoComplete="new-password" />
                <button type="button" className={styles.eyeBtn} onClick={() => setVerNueva(v => !v)}>{verNueva ? '🙈' : '👁️'}</button>
              </div>
            </div>
            <div className={styles.field}>
              <label>{t('confirmarContrasena')}</label>
              <div className={styles.passwordWrap}>
                <input type={verConfirmar ? 'text' : 'password'} placeholder={t('confirmarPh')} value={form.confirmar} onChange={set('confirmar')} autoComplete="new-password" />
                <button type="button" className={styles.eyeBtn} onClick={() => setVerConfirmar(v => !v)}>{verConfirmar ? '🙈' : '👁️'}</button>
              </div>
            </div>
            {error && <div className={styles.error}>{error}</div>}
            {exito && <div className={styles.exito}>{exito}</div>}
            <button type="submit" className={styles.btn} disabled={cargando}>
              {cargando ? t('procesando') : t('cambiarBtn')}
            </button>
            <button type="button" className={styles.volver} onClick={() => { setPaso('menu'); setError('') }}>
              {t('volver')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
