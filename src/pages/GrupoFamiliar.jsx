import { useState, useEffect } from 'react'
import { supabase, obtenerSesion } from '../supabase'
import styles from './GrupoFamiliar.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { limiteFamiliares, esPremium, esFamiliar } from '../plan'
import { limpiarUsuario } from '../registro'
import { useNavContext } from '../components/NavContext'

export default function GrupoFamiliar() {
  const { t } = useLanguage()
  const { abrirOpciones, abrirPlanes } = useNavContext()
  const [busqueda, setBusqueda] = useState('')
  const [resultado, setResultado] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [vinculados, setVinculados] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  // Solicitudes que YO envié y siguen esperando: se ven y se pueden cancelar
  const [enviadas, setEnviadas] = useState([])
  const [miPerfil, setMiPerfil] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [userId, setUserId] = useState(null)
  const [mostrarUpgrade, setMostrarUpgrade] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [recargando, setRecargando] = useState(false)
  const [avisoOk, setAvisoOk] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vivo = true
    let canal = null
    init().then(res => {
      const uid = res?.uid
      if (!uid || !vivo) return
      // Solicitudes que llegan y solicitudes que te aceptan aparecen solas, sin tocar 🔄
      canal = supabase.channel('grupo-familiar-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'family_links', filter: `linked_user_id=eq.${uid}` }, () => init())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'family_links', filter: `user_id=eq.${uid}` }, () => init())
        .subscribe()
    })
    // Al volver a la app también: el tiempo real no avisa cuando alguien te desvincula
    const onVisible = () => { if (document.visibilityState === 'visible') init() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', onVisible)
      if (canal) supabase.removeChannel(canal)
    }
  }, [])

  async function init() {
    const session = await obtenerSesion()
    const user = session?.user
    if (!user) return null
    setUserId(user.id)
    const resultados = await Promise.all([
      cargarVinculados(user.id), cargarSolicitudes(user.id), cargarEnviadas(), cargarMiPerfil(user.id),
    ])
    setCargando(false)
    // ok = familiares y solicitudes llegaron (lo que de verdad importa para decir "actualizado")
    return { uid: user.id, ok: resultados[0] && resultados[1] }
  }

  async function cargarMiPerfil(uid) {
    const { data } = await supabase.from('users').select('username, plan, is_premium, premium_hasta').eq('id', uid).maybeSingle()
    if (data) setMiPerfil(data)
    return !!data
  }

  async function cargarEnviadas() {
    const { data, error } = await supabase.rpc('mis_solicitudes_enviadas')
    if (!error && Array.isArray(data)) setEnviadas(data)
    return !error
  }

  // Botón 🔄: vuelve a traer familiares y solicitudes, y avisa que se actualizó
  async function recargar() {
    if (recargando) return
    setRecargando(true)
    setMensaje('')
    // Sin señal se dice, en vez de un "actualizado" falso; con señal débil, máximo 10 s
    const res = await Promise.race([
      init().catch(() => null),
      new Promise(r => setTimeout(() => r(null), 10000)),
    ])
    setAvisoOk(res?.ok ? `✓ ${t('famActualizadoOk')}` : `⚠️ ${t('histSinConexion')}`)
    setTimeout(() => setAvisoOk(''), res?.ok ? 2500 : 4000)
    setTimeout(() => setRecargando(false), 400)
  }

  // Sin señal la consulta falla: se deja la lista que ya se ve (antes quedaba vacía)
  async function cargarVinculados(uid) {
    const { data, error } = await supabase
      .from('family_links')
      .select('id, linked_user_id, users!family_links_linked_user_id_fkey(full_name, username)')
      .eq('user_id', uid)
      .eq('status', 'accepted')
    if (!error && data) setVinculados(data)
    return !error && !!data
  }

  async function cargarSolicitudes(uid) {
    const { data, error } = await supabase
      .from('family_links')
      .select('id, user_id, users!family_links_user_id_fkey(full_name, username)')
      .eq('linked_user_id', uid)
      .eq('status', 'pending')
    if (!error && data) setSolicitudes(data)
    return !error && !!data
  }

  async function buscarUsuario() {
    // Igual que al registrarse: sin tildes, sin espacios, sin @ y en minúsculas.
    // Así "@Michaél " encuentra a @michael.
    const termino = limpiarUsuario(busqueda)
    if (!termino) return
    setMensaje('')
    if (miPerfil?.username && termino === miPerfil.username.toLowerCase()) {
      setResultado(null)
      setMensaje(t('famEresTu'))
      return
    }
    setBuscando(true)
    setResultado(null)
    // Solo coincidencia EXACTA: una búsqueda parcial podía mostrar a otra persona
    // Consulta segura del servidor: devuelve solo id, nombre y usuario (nunca el teléfono)
    const { data, error } = await supabase.rpc('buscar_usuario', { nombre: termino })
    setResultado(error ? null : (data?.[0] || false))
    if (error) setMensaje(t('errorConexion'))
    setBuscando(false)
  }

  async function enviarSolicitud(destId) {
    if (enviando) return
    // Si esa persona ya te había enviado una solicitud, se acepta de una: los dos quieren vincularse
    const suya = solicitudes.find(s => s.user_id === destId)
    if (suya) {
      setResultado(null)
      setBusqueda('')
      await responderSolicitud(suya.id, 'accepted')
      return
    }
    setEnviando(true)
    // Las tres consultas a la vez (antes una tras otra). El límite y el conteo se leen de la
    // base: el estado en memoria puede estar viejo.
    const [{ data: existe }, { data: perfil }, { count: totalActual }] = await Promise.all([
      supabase.from('family_links').select('id, status')
        .eq('user_id', userId).eq('linked_user_id', destId).maybeSingle(),
      supabase.from('users').select('plan, is_premium, premium_hasta').eq('id', userId).maybeSingle(),
      supabase.from('family_links').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'accepted'),
    ])

    if (existe) {
      setEnviando(false)
      setMensaje(t(existe.status === 'accepted' ? 'famYaEnGrupo' : 'famYaEnviada'))
      return
    }
    if ((totalActual || 0) >= limiteFamiliares(perfil)) {
      setEnviando(false)
      setMostrarUpgrade(true)
      return
    }

    const { error } = await supabase.from('family_links').insert({ user_id: userId, linked_user_id: destId, status: 'pending' })
    setEnviando(false)
    if (error) {
      if (error.message?.includes('LIMITE_FAMILIARES')) setMostrarUpgrade(true)
      else setMensaje(t('errorConexion'))
      return
    }
    setMensaje(t('solicitudEnviada'))
    setResultado(null)
    setBusqueda('')
    setTimeout(() => setMensaje(''), 3000)
    cargarEnviadas()
  }

  // Quien envió la solicitud puede retirarla mientras la otra persona no la acepte
  async function cancelarEnviada(e) {
    const nombre = e.full_name || `@${e.username || ''}`
    if (!window.confirm(t('famConfirmarCancelar').replace('{nombre}', nombre))) return
    setEnviadas(prev => prev.filter(x => x.id !== e.id))
    const { error } = await supabase.from('family_links').delete()
      .eq('id', e.id).eq('user_id', userId).eq('status', 'pending')
    if (error) setMensaje(t('errorConexion'))
    await init()
  }

  async function responderSolicitud(linkId, accion) {
    // Rechazar borra la fila: dejarla en 'rejected' bloqueaba para siempre que
    // esa persona te volviera a enviar una solicitud.
    if (accion === 'rejected') {
      // Se quita de la pantalla al instante; si la base no lo permite, vuelve a aparecer
      setSolicitudes(prev => prev.filter(s => s.id !== linkId))
      const { error } = await supabase.from('family_links').delete().eq('id', linkId)
      if (error) setMensaje(t('errorConexion'))
      await init()
      return
    }
    // Al aceptar: verificar que no se supere el límite del plan actual
    if (accion === 'accepted') {
      // Plan y conteo frescos de la BD, a la vez (el estado en memoria puede estar viejo)
      const [{ data: perfil }, { count: totalActual }] = await Promise.all([
        supabase.from('users').select('plan, is_premium, premium_hasta').eq('id', userId).maybeSingle(),
        supabase.from('family_links').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('status', 'accepted'),
      ])
      if ((totalActual || 0) >= limiteFamiliares(perfil)) {
        setMostrarUpgrade(true)
        return
      }
      const sol = solicitudes.find(s => s.id === linkId)
      const { error } = await supabase.from('family_links').update({ status: 'accepted' }).eq('id', linkId)
      if (error) {
        // Aquí el cupo propio ya se revisó: si la base rechaza, es la otra persona la que está llena
        setMensaje(error.message?.includes('LIMITE_FAMILIARES') ? t('limiteOtraPersona') : t('errorConexion'))
        setTimeout(() => setMensaje(''), 5000)
        return
      }
      // Aceptada: sale de pendientes de una vez, sin esperar la recarga
      setSolicitudes(prev => prev.filter(s => s.id !== linkId))
      if (sol) {
        await supabase.from('family_links').upsert({
          user_id: userId,
          linked_user_id: sol.user_id,
          status: 'accepted'
        }, { onConflict: 'user_id,linked_user_id' })
      }
      await init()
      return
    }
    await supabase.from('family_links').update({ status: accion }).eq('id', linkId)
    await init()
  }

  // El vinculo son dos filas, una por sentido. Si solo se borra la propia, el
  // otro sigue enviandote alertas y tu sigues viendo las suyas.
  async function desvincular(v) {
    const linkId = v.id
    const otroId = v.linked_user_id
    // Un toque sin querer en la X no debe sacar a alguien de las alertas de emergencia
    const nombre = v.users?.full_name || `@${v.users?.username || ''}`
    if (!window.confirm(t('confirmarDesvincular').replace('{nombre}', nombre))) return
    // Sale de la lista al instante; las dos filas se borran a la vez
    setVinculados(prev => prev.filter(x => x.id !== linkId))
    const [{ error }] = await Promise.all([
      supabase.from('family_links').delete().eq('id', linkId),
      userId && otroId
        ? supabase.from('family_links').delete().eq('user_id', otroId).eq('linked_user_id', userId)
        : Promise.resolve({}),
    ])
    if (error) setMensaje(t('errorConexion'))
    // La pantalla de Alerta guarda los familiares en el celular para mandar el SMS sin señal:
    // se quita ahí también, para que la alerta nunca le salga a quien ya no está en el grupo
    if (!error && userId && otroId) {
      try {
        const clave = `panicCache_${userId}`
        const cache = JSON.parse(localStorage.getItem(clave) || 'null')
        if (cache?.links) localStorage.setItem(clave, JSON.stringify({ ...cache, links: cache.links.filter(l => l.linked_user_id !== otroId) }))
      } catch (_) {}
    }
    await cargarVinculados(userId)
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1>👨‍👩‍👧‍👦 {t('grupoTitulo')}</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <button
            className={styles.gear}
            onClick={recargar}
            disabled={recargando}
            title={t('ubiActualizar')}
            aria-label={t('ubiActualizar')}
            style={{ fontSize: '1.1rem', opacity: recargando ? 0.5 : 1, transition: 'transform 0.4s', transform: recargando ? 'rotate(360deg)' : 'none' }}
          >🔄</button>
          <button className={styles.gear} onClick={abrirOpciones} title={t('tituloOpciones')} aria-label={t('tituloOpciones')}>⚙️</button>
        </div>
      </header>

      {avisoOk && <p className={styles.avisoOk} role="status">{avisoOk}</p>}

      {mensaje && <div className={styles.msg}>{mensaje}</div>}

      {mostrarUpgrade && (
        <div className={styles.upgradeBox}>
          <div className={styles.upgradeIcon}>🔒</div>
          <h3>{t('upgradeTitulo')}</h3>
          {/* Lo que dice depende del plan: a quien ya es Premium no se le ofrece "activar Premium" */}
          <p>{t(esPremium(miPerfil) ? 'upgradeDescPremium' : esFamiliar(miPerfil) ? 'upgradeDescFamiliar' : 'upgradeDescGratis')}</p>
          {!esPremium(miPerfil) && (
            <button
              className={styles.upgradBtn}
              onClick={() => { setMostrarUpgrade(false); abrirPlanes() }}
            >
              {t('verPlanes')}
            </button>
          )}
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
        {resultado && (() => {
          // Se dice de una vez cómo está esa persona contigo, sin tener que tocar el botón
          const yaEsta = vinculados.some(v => v.linked_user_id === resultado.id)
          const yaEnviada = enviadas.some(e => e.linked_user_id === resultado.id)
          const teEnvio = solicitudes.some(s => s.user_id === resultado.id)
          return (
            <div className={styles.resultadoCard}>
              <div>
                <strong>{resultado.full_name}</strong>
                <span className={styles.username}>@{resultado.username}</span>
              </div>
              {yaEsta ? (
                <span className={styles.username}>{t('famYaEnGrupo')}</span>
              ) : yaEnviada ? (
                <span className={styles.username}>{t('famEsperando')}</span>
              ) : (
                <button className={styles.btnVincular} onClick={() => enviarSolicitud(resultado.id)} disabled={enviando}>
                  {teEnvio ? t('famAceptarSuya') : t('enviarSolicitud')}
                </button>
              )}
            </div>
          )
        })()}
      </section>

      {enviadas.length > 0 && (
        <section className={styles.seccion}>
          <h2>{t('famEnviadas')}</h2>
          {enviadas.map(e => (
            <div key={e.id} className={styles.solicitudCard}>
              <div>
                <strong>{e.full_name}</strong>
                <span className={styles.username}>@{e.username} · {t('famEsperando')}</span>
              </div>
              <div className={styles.acciones}>
                <button className={styles.rechazar} onClick={() => cancelarEnviada(e)}>{t('cancelar')}</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className={styles.seccion}>
        <h2>{t('misVinculados')} ({vinculados.length})</h2>
        {cargando && <p className={styles.noEncontrado}>{t('cargando')}</p>}
        {!cargando && vinculados.length === 0 && (
          <p className={styles.noEncontrado}>{t('sinVinculados')}</p>
        )}
        {vinculados.map(v => (
          <div key={v.id} className={styles.familiarCard}>
            <div className={styles.familiarAvatar}>👤</div>
            <div className={styles.familiarInfo}>
              <strong>{v.users?.full_name}</strong>
              <span className={styles.username}>@{v.users?.username}</span>
            </div>
            <button className={styles.btnDesvincular} onClick={() => desvincular(v)} title={t('desvincular')} aria-label={t('desvincular')}>✕</button>
          </div>
        ))}
      </section>

      <div className={styles.pb} />
    </div>
  )
}
