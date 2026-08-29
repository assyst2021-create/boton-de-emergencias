import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import styles from './Perfil.module.css'

const IDIOMAS = [
  { code: 'es', label: 'Español', flag: '🇨🇴' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
]

export default function Perfil({ onCerrar }) {
  const [paso, setPaso] = useState('menu')
  const [lang, setLang] = useState(() => localStorage.getItem('app_lang') || 'es')

  function seleccionarIdioma(code) {
    setLang(code)
    localStorage.setItem('app_lang', code)
  }
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
    if (form.nueva.length < 6) { setError('Mínimo 6 caracteres'); return }
    if (form.nueva !== form.confirmar) { setError('Las contraseñas no coinciden'); return }
    setCargando(true)
    const { error } = await supabase.auth.updateUser({ password: form.nueva })
    if (error) { setError('Error al cambiar contraseña. Intenta de nuevo.'); setCargando(false); return }
    setExito('Contraseña cambiada exitosamente.')
    setForm({ nueva: '', confirmar: '' })
    setCargando(false)
    setTimeout(() => { setExito(''); setPaso('menu') }, 2500)
  }

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>⚙️ Opciones</h2>
          <button className={styles.cerrar} onClick={onCerrar}>✕</button>
        </div>

        {paso === 'menu' && (
          <div className={styles.menu}>
            <button className={styles.opcion} onClick={() => setPaso('idioma')}>
              🌐 Cambiar idioma
            </button>
            <button className={styles.opcion} onClick={() => setPaso('contrasena')}>
              🔑 Cambiar contraseña
            </button>
            <button className={styles.opcionRojo} onClick={() => supabase.auth.signOut()}>
              ⏻ Cerrar sesión
            </button>
          </div>
        )}

        {paso === 'idioma' && (
          <div className={styles.form}>
            <p className={styles.desc}>Selecciona tu idioma preferido</p>
            {IDIOMAS.map(i => (
              <button
                key={i.code}
                className={lang === i.code ? styles.idiomaActivo : styles.idioma}
                onClick={() => seleccionarIdioma(i.code)}
              >
                <span>{i.flag}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{i.label}</span>
                {lang === i.code && <span style={{ color: 'var(--rojo)', fontWeight: 800 }}>✓</span>}
              </button>
            ))}
            <button type="button" className={styles.volver} onClick={() => setPaso('menu')}>Volver</button>
          </div>
        )}

        {paso === 'contrasena' && (
          <form onSubmit={cambiarContrasena} className={styles.form}>
            <p className={styles.desc}>Ingresa tu nueva contraseña</p>
            <div className={styles.field}>
              <label>Nueva contraseña</label>
              <div className={styles.passwordWrap}>
                <input type={verNueva ? 'text' : 'password'} placeholder="Mínimo 6 caracteres" value={form.nueva} onChange={set('nueva')} autoComplete="new-password" />
                <button type="button" className={styles.eyeBtn} onClick={() => setVerNueva(v => !v)}>{verNueva ? '🙈' : '👁️'}</button>
              </div>
            </div>
            <div className={styles.field}>
              <label>Confirmar contraseña</label>
              <div className={styles.passwordWrap}>
                <input type={verConfirmar ? 'text' : 'password'} placeholder="Repite la contraseña" value={form.confirmar} onChange={set('confirmar')} autoComplete="new-password" />
                <button type="button" className={styles.eyeBtn} onClick={() => setVerConfirmar(v => !v)}>{verConfirmar ? '🙈' : '👁️'}</button>
              </div>
            </div>
            {error && <div className={styles.error}>{error}</div>}
            {exito && <div className={styles.exito}>{exito}</div>}
            <button type="submit" className={styles.btn} disabled={cargando}>
              {cargando ? 'Guardando...' : 'Cambiar contraseña'}
            </button>
            <button type="button" className={styles.volver} onClick={() => { setPaso('menu'); setError('') }}>
              Volver
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
