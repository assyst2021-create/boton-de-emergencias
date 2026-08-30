import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import styles from './GrupoFamiliar.module.css'
import { useLanguage } from '../i18n/LanguageContext'

export default function GrupoFamiliar() {
  const { t } = useLanguage()
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
    const { data: existe } = await supabase
      .from('family_links')
      .select('id, status')
      .eq('user_id', userId)
      .eq('linked_user_id', destId)
      .maybeSingle()

    if (existe) {
      setMensaje(existe.status === 'pending' ? t('errorYaVinculado') : t('errorYaVinculado'))
      return
    }

    const { data: perfil } = await supabase.from('users').select('is_premium').eq('id', userId).single()
    const limite = perfil?.is_premium ? 10 : 2
    if (vinculados.length >= limite) {
      setMostrarUpgrade(true)
      return
    }

    await supabase.from('family_links').insert({ user_id: userId, linked_user_id: destId, status: 'pending' })
    setMensaje(t('solicitudEnviada'))
    setResultado(null)
    setBusqueda('')
    setTimeout(() => setMensaje(''), 3000)
  }

  async function responderSolicitud(linkId, accion) {
    await supabase.from('family_links').update({ status: accion }).eq('id', linkId)
    if (accion === 'accepted') {
      const sol = solicitudes.find(s => s.id === linkId)
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
        <h1>👨‍👩‍👧‍👦 {t('grupoTitulo')}</h1>
      </header>

      {mensaje && <div className={styles.msg}>{mensaje}</div>}

      {mostrarUpgrade && (
        <div className={styles.upgradeBox}>
          <div className={styles.upgradeIcon}>🔒</div>
          <h3>{t('upgradeTitulo')}</h3>
          <p>{t('upgradeDesc')}</p>
          <button
            className={styles.upgradBtn}
            onClick={() => window.open('https://botondeemergencias.mefacil.com/premium', '_blank')}
          >
            Ver plan Premium
          </button>
          <button className={styles.cerrarUpgrade} onClick={() => setMostrarUpgrade(false)}>{t('cancelar')}</button>
        </div>
      )}

      {solicitudes.length > 0 && (
        <section className={styles.seccion}>
          <h2>{t('pendientes')}</h2>
          {solicitudes.map(s => (
            <div key={s.id} className={styles.solicitudCard}>
              <div>
                <strong>{s.users?.full_name}</strong>
                <span className={styles.username}>@{s.users?.username}</span>
              </div>
              <div className={styles.acciones}>
                <button className={styles.aceptar} onClick={() => responderSolicitud(s.id, 'accepted')}>{t('aceptar')}</button>
                <button className={styles.rechazar} onClick={() => responderSolicitud(s.id, 'rejected')}>{t('rechazar')}</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className={styles.seccion}>
        <h2>{t('agregarFamiliar')}</h2>
        <div className={styles.buscador}>
          <input
            type="text"
            placeholder={t('usernameFamiliar')}
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscarUsuario()}
          />
          <button className={styles.btnBuscar} onClick={buscarUsuario} disabled={buscando}>
            {buscando ? '...' : '🔍'}
          </button>
        </div>

        {resultado === false && (
          <p className={styles.noEncontrado}>{t('errorNoExiste')}</p>
        )}
        {resultado && (
          <div className={styles.resultadoCard}>
            <div>
              <strong>{resultado.full_name}</strong>
              <span className={styles.username}>@{resultado.username}</span>
            </div>
            <button className={styles.btnVincular} onClick={() => enviarSolicitud(resultado.id)}>
              {t('enviarSolicitud')}
            </button>
          </div>
        )}
      </section>

      <section className={styles.seccion}>
        <h2>{t('misVinculados')} ({vinculados.length})</h2>
        {vinculados.length === 0 && (
          <p className={styles.noEncontrado}>{t('sinVinculados')}</p>
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
