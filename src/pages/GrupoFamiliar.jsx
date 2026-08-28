import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import styles from './GrupoFamiliar.module.css'

export default function GrupoFamiliar() {
  const [busqueda, setBusqueda] = useState('')
  const [resultado, setResultado] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [vinculados, setVinculados] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [mensaje, setMensaje] = useState('')
  const [userId, setUserId] = useState(null)
  const [mostrarUpgrade, setMostrarUpgrade] = useState(false)

  useEffect(() => {
    init()
  }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    await Promise.all([cargarVinculados(user.id), cargarSolicitudes(user.id)])
  }

  async function cargarVinculados(uid) {
    const { data } = await supabase
      .from('family_links')
      .select('id, linked_user_id, users!family_links_linked_user_id_fkey(full_name, username)')
      .eq('user_id', uid)
      .eq('status', 'accepted')
    setVinculados(data || [])
  }

  async function cargarSolicitudes(uid) {
    const { data } = await supabase
      .from('family_links')
      .select('id, user_id, users!family_links_user_id_fkey(full_name, username)')
      .eq('linked_user_id', uid)
      .eq('status', 'pending')
    setSolicitudes(data || [])
  }

  async function buscarUsuario() {
    if (!busqueda.trim()) return
    setBuscando(true)
    setResultado(null)
    const { data } = await supabase
      .from('users')
      .select('id, full_name, username')
      .eq('username', busqueda.toLowerCase().trim())
      .neq('id', userId)
      .single()
    setResultado(data || false)
    setBuscando(false)
  }

  async function enviarSolicitud(destId) {
    // Verificar si ya existe
    const { data: existe } = await supabase
      .from('family_links')
      .select('id, status')
      .eq('user_id', userId)
      .eq('linked_user_id', destId)
      .maybeSingle()

    if (existe) {
      setMensaje(existe.status === 'pending' ? 'Ya enviaste una solicitud a esta persona.' : 'Ya están vinculados.')
      return
    }

    // Verificar limite freemium
    const { data: perfil } = await supabase.from('users').select('is_premium').eq('id', userId).single()
    if (!perfil?.is_premium && vinculados.length >= 1) {
      setMostrarUpgrade(true)
      return
    }

    await supabase.from('family_links').insert({ user_id: userId, linked_user_id: destId, status: 'pending' })
    setMensaje('Solicitud enviada.')
    setResultado(null)
    setBusqueda('')
    setTimeout(() => setMensaje(''), 3000)
  }

  async function responderSolicitud(linkId, accion) {
    await supabase.from('family_links').update({ status: accion }).eq('id', linkId)
    if (accion === 'accepted') {
      const sol = solicitudes.find(s => s.id === linkId)
      // Crear el link recíproco
      if (sol) {
        await supabase.from('family_links').upsert({
          user_id: userId,
          linked_user_id: sol.user_id,
          status: 'accepted'
        }, { onConflict: 'user_id,linked_user_id' })
      }
    }
    await init()
  }

  async function desvincular(linkId) {
    await supabase.from('family_links').delete().eq('id', linkId)
    await cargarVinculados(userId)
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1>👨‍👩‍👧‍👦 Grupo Familiar</h1>
        <p>Agrega familiares para que reciban tus alertas</p>
      </header>

      {mensaje && <div className={styles.msg}>{mensaje}</div>}

      {mostrarUpgrade && (
        <div className={styles.upgradeBox}>
          <div className={styles.upgradeIcon}>🔒</div>
          <h3>Plan gratuito: 1 familiar</h3>
          <p>Con el plan gratuito puedes vincular <strong>1 familiar</strong>. Para agregar más personas y proteger a toda tu familia, activa el plan premium.</p>
          <button
            className={styles.upgradBtn}
            onClick={() => window.open('https://botondeemergencias.mefacil.com/premium', '_blank')}
          >
            Ver plan Premium
          </button>
          <button className={styles.cerrarUpgrade} onClick={() => setMostrarUpgrade(false)}>Cerrar</button>
        </div>
      )}

      {/* Solicitudes pendientes */}
      {solicitudes.length > 0 && (
        <section className={styles.seccion}>
          <h2>Solicitudes recibidas</h2>
          {solicitudes.map(s => (
            <div key={s.id} className={styles.solicitudCard}>
              <div>
                <strong>{s.users?.full_name}</strong>
                <span className={styles.username}>@{s.users?.username}</span>
              </div>
              <div className={styles.acciones}>
                <button className={styles.aceptar} onClick={() => responderSolicitud(s.id, 'accepted')}>Aceptar</button>
                <button className={styles.rechazar} onClick={() => responderSolicitud(s.id, 'rejected')}>Rechazar</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Buscar usuario */}
      <section className={styles.seccion}>
        <h2>Agregar familiar</h2>
        <div className={styles.buscador}>
          <input
            type="text"
            placeholder="Buscar por nombre de usuario..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscarUsuario()}
          />
          <button className={styles.btnBuscar} onClick={buscarUsuario} disabled={buscando}>
            {buscando ? '...' : '🔍'}
          </button>
        </div>

        {resultado === false && (
          <p className={styles.noEncontrado}>No se encontró ese usuario.</p>
        )}
        {resultado && (
          <div className={styles.resultadoCard}>
            <div>
              <strong>{resultado.full_name}</strong>
              <span className={styles.username}>@{resultado.username}</span>
            </div>
            <button className={styles.btnVincular} onClick={() => enviarSolicitud(resultado.id)}>
              Enviar solicitud
            </button>
          </div>
        )}
      </section>

      {/* Familiares vinculados */}
      <section className={styles.seccion}>
        <h2>Familiares vinculados ({vinculados.length})</h2>
        {vinculados.length === 0 && (
          <p className={styles.noEncontrado}>Aún no tienes familiares vinculados.</p>
        )}
        {vinculados.map(v => (
          <div key={v.id} className={styles.familiarCard}>
            <div className={styles.familiarAvatar}>👤</div>
            <div className={styles.familiarInfo}>
              <strong>{v.users?.full_name}</strong>
              <span className={styles.username}>@{v.users?.username}</span>
            </div>
            <button className={styles.btnDesvincular} onClick={() => desvincular(v.id)} title="Desvincular">✕</button>
          </div>
        ))}
      </section>

      <div className={styles.pb} />
    </div>
  )
}
