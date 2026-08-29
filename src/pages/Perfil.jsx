import { useState } from 'react'
import { supabase } from '../supabase'
import styles from './Perfil.module.css'

export default function Perfil({ onCerrar }) {
  const [paso, setPaso] = useState('menu')
  const [form, setForm] = useState({ nueva: '', confirmar: '' })
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [cargando, setCargando] = useState(false)

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
            <button className={styles.opcion} onClick={() => setPaso('contrasena')}>
              🔑 Cambiar contraseña
            </button>
            <button className={styles.opcionRojo} onClick={() => supabase.auth.signOut()}>
              ⏻ Cerrar sesión
            </button>
          </div>
        )}

        {paso === 'contrasena' && (
          <form onSubmit={cambiarContrasena} className={styles.form}>
            <p className={styles.desc}>Ingresa tu nueva contraseña</p>
            <div className={styles.field}>
              <label>Nueva contraseña</label>
              <input type="password" placeholder="Mínimo 6 caracteres" value={form.nueva} onChange={set('nueva')} autoComplete="new-password" />
            </div>
            <div className={styles.field}>
              <label>Confirmar contraseña</label>
              <input type="password" placeholder="Repite la contraseña" value={form.confirmar} onChange={set('confirmar')} autoComplete="new-password" />
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
