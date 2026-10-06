import { useState, useEffect, lazy, Suspense } from 'react'
import { supabase, clienteVerificacion, obtenerSesion } from '../supabase'
import { validarClave, mensajeErrorClave } from '../clave'
import AyudaClave from '../components/AyudaClave'
import { SONIDOS, leerPreferencia, aplicarSonido, canalLocal, hayPluginSonidos, PREFERENCIA_INICIAL } from '../sonidoAlerta'
import styles from './Perfil.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { IDIOMAS } from '../i18n/translations'
import ElegirPlan, { URL_SUSCRIPCIONES } from './ElegirPlan'
import { useTema } from '../ThemeContext'
import { useAppActions } from '../AppActionsContext'
import { esPremium, esFamiliar, esPlanPago } from '../plan'
import { olvidarFCM } from '../fcmRegistro'
import { VERSION_LEGAL, RESPONSABLE } from '../i18n/legalMeta'

export { AppActionsContext } from '../AppActionsContext'

const AvisoLegal = lazy(() => import('./AvisoLegal'))
// Página pública con cómo se eliminan los datos (la misma que tiene Google Play)
const URL_ELIMINAR = 'https://boton-de-emergencia-privacidad.mefacil.com/'

export default function Perfil({ onCerrar, pasoInicial = 'menu' }) {
  const { t, lang, cambiarIdioma } = useLanguage()
  const { tema, toggleTema } = useTema()
  const { verBienvenida, verTerminos, verPrivacidad, verContrato, bienvenidaLeida, avisoLeido, privacidadLeida, contratoLeido } = useAppActions()
  const [paso, setPaso] = useState(pasoInicial)
  // Versión instalada leída del celular, p. ej. "1.1.1 (87)": así se sabe qué tiene cada persona
  const [version, setVersion] = useState('1.1.1')
  useEffect(() => {
    window.Capacitor?.Plugins?.Permisos?.version?.()
      .then(v => { if (v?.nombre) setVersion(v.codigo ? `${v.nombre} (${v.codigo})` : v.nombre) })
      .catch(() => {})
  }, [])

  // Al salir: este celular deja de recibir alertas de la cuenta y deja de compartir su ubicación
  async function cerrarSesion() {
    const session = await obtenerSesion()
    const uid = session?.user?.id
    try { if (uid) localStorage.removeItem(`recActiva_${uid}`) } catch (_) {}
    if (uid) {
      try { await window.Capacitor?.Plugins?.GpsShare?.detener({ userId: uid }) } catch (_) {}
      await supabase.from('live_locations').update({ activo: false }).eq('user_id', uid).then(() => {}, () => {})
      sessionStorage.removeItem('ubi_sharing')
      await olvidarFCM(supabase, uid)
    }
    await supabase.auth.signOut()
  }
  const [form, setForm] = useState({ actual: '', nueva: '', confirmar: '' })
  const [verActual, setVerActual] = useState(false)
  // "¿No recuerdas tu contraseña actual?": cómo pedir ayuda (no hay correo automático)
  const [verAyudaClave, setVerAyudaClave] = useState(false)
  const [miCorreo, setMiCorreo] = useState('')
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [cargando, setCargando] = useState(false)
  const [verNueva, setVerNueva] = useState(false)
  const [verConfirmar, setVerConfirmar] = useState(false)
  const [perfil, setPerfil] = useState(null)
  const [uid, setUid] = useState(null)
  const [autoAlerta, setAutoAlerta] = useState(false)
  const [recPermitir, setRecPermitir] = useState(false)
  // Próxima alerta automática programada (si hay una cadena en curso)
  const [proximaAuto, setProximaAuto] = useState(null)
  // Ventana "Recuperar celular": credenciales del dueño (se usan en el celular de un familiar)
  const [rcForm, setRcForm] = useState({ clave: '', password: '' })
  const [rcMsg, setRcMsg] = useState(null)   // { tipo: 'ok'|'error', texto }
  const [rcCargando, setRcCargando] = useState(false)
  // Interruptor "Permitir recuperar mi celular": autorización al activarlo, contraseña al apagarlo
  const [recAcepto, setRecAcepto] = useState(false)
  const [recClave, setRecClave] = useState('')
  const [verRecClave, setVerRecClave] = useState(false)
  const [recError, setRecError] = useState('')
  const [recGuardando, setRecGuardando] = useState(false)
  // Eliminar cuenta: dos avisos y la contraseña
  const [elimClave, setElimClave] = useState('')
  const [verElimClave, setVerElimClave] = useState(false)
  const [elimError, setElimError] = useState('')
  const [elimCargando, setElimCargando] = useState(false)
  // Cerrar sesión con "Permitir recuperar mi celular" activo: pide la contraseña
  const [salirClave, setSalirClave] = useState('')
  const [verSalirClave, setVerSalirClave] = useState(false)
  const [salirError, setSalirError] = useState('')
  const [saliendo, setSaliendo] = useState(false)
  // Sonido de las alertas (lo escoge quien recibe)
  const [sonidoSel, setSonidoSel] = useState('normal')
  const [siempreSel, setSiempreSel] = useState(true)
  const [estadoSonido, setEstadoSonido] = useState({ canales: false, accesoNoMolestar: false })
  const [sonidoMsg, setSonidoMsg] = useState(null)   // { tipo: 'ok'|'error', texto }
  const [guardandoSonido, setGuardandoSonido] = useState(false)
  // Permiso de ubicación "Permitir todo el tiempo" (null = no se sabe, por ejemplo en la web)
  const [ubiFondo, setUbiFondo] = useState(null)
  const EN_APP = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

  useEffect(() => {
    obtenerSesion().then(session => {
      const user = session?.user
      if (!user) return
      setUid(user.id)
      setMiCorreo(user.email || '')
      supabase.from('users').select('full_name, username, auto_alert_enabled, recuperacion_activa, plan, is_premium, premium_hasta').eq('id', user.id).maybeSingle()
        .then(async ({ data, error }) => {
          // Si una columna nueva no se pudiera leer (permiso), se lee el perfil sin ella:
          // así el plan nunca se muestra como "Básico" por error
          if (error) {
            const r = await supabase.from('users').select('full_name, username, auto_alert_enabled, plan, is_premium, premium_hasta').eq('id', user.id).maybeSingle()
            data = r.data
          }
          if (data) {
            setPerfil(data)
            setAutoAlerta(!!data.auto_alert_enabled)
            setRecPermitir(!!data.recuperacion_activa)
            // Copia en el celular: sin señal también se sabe que cerrar sesión pide la contraseña
            if ('recuperacion_activa' in data) {
              try { localStorage.setItem(`recActiva_${user.id}`, data.recuperacion_activa ? '1' : '0') } catch (_) {}
            }
          }
        })
      cargarProximaAuto(user.id)
    })
  }, [])

  async function cargarProximaAuto(id) {
    const { data } = await supabase.from('scheduled_alerts').select('scheduled_at')
      .eq('user_id', id).eq('fired', false).order('scheduled_at').limit(1)
    setProximaAuto(data?.[0]?.scheduled_at || null)
  }

  // Apagarla detiene la cadena al instante (el servidor borra la que estaba programada)
  async function toggleAutoAlerta() {
    const nuevo = !autoAlerta
    setAutoAlerta(nuevo)
    if (!nuevo) setProximaAuto(null)
    if (uid) {
      const { error } = await supabase.from('users').update({ auto_alert_enabled: nuevo }).eq('id', uid)
      if (error) { setAutoAlerta(!nuevo); return }
      window.dispatchEvent(new Event('recargarPlan'))
      if (!nuevo) cargarProximaAuto(uid)
    }
  }

  /**
   * El dueño autoriza (o quita) que su propio celular se pueda recuperar. Activarlo pide la
   * autorización expresa (Ley 1581). Apagarlo pide la contraseña: quien tenga el celular
   * desbloqueado (por ejemplo, un ladrón) no puede apagarlo antes de que la familia lo busque.
   */
  function toggleRecuperar() {
    setRecError(''); setRecAcepto(false); setRecClave(''); setVerRecClave(false); setVerAyudaClave(false)
    if (!recPermitir) revisarUbiFondo()
    setPaso(recPermitir ? 'recApagar' : 'recAutorizar')
  }

  async function autorizarRecuperar() {
    if (!recAcepto || recGuardando) return
    setRecGuardando(true); setRecError('')
    const { error } = await supabase.rpc('set_recuperacion', { activa: true }).then(r => r, e => ({ error: e }))
    setRecGuardando(false)
    if (error) { setRecError(/SOLO_PREMIUM/.test(error.message || '') ? t('recSoloPremium') : t('errorConexion')); return }
    setRecPermitir(true)
    try { localStorage.setItem(`recActiva_${uid}`, '1') } catch (_) {}
    // Prueba de la autorización (fecha, versión e idioma), igual que la de los documentos legales
    supabase.from('aceptaciones_legales')
      .upsert({ user_id: uid, version: `recuperar-celular ${VERSION_LEGAL}`, idioma: lang }, { onConflict: 'user_id,version', ignoreDuplicates: true })
      .then(() => {}, () => {})
    setPaso('menu')
  }

  async function apagarRecuperar(e) {
    e.preventDefault()
    if (recGuardando) return
    if (!recClave) { setRecError(t('errorClaveActualFalta')); return }
    setRecGuardando(true); setRecError('')
    try {
      const session = await obtenerSesion()
      const email = session?.user?.email
      if (!email) { setRecError(t('errorConexion')); return }
      const { error: errClave } = await clienteVerificacion().auth.signInWithPassword({ email, password: recClave })
      if (errClave) { setRecError(/fetch|network|failed/i.test(errClave.message || '') ? t('errorConexion') : t('errorClaveActual')); return }
      // Si este celular está compartiendo por una recuperación, apagar la opción también la detiene
      const { data: enCurso } = await supabase.from('recuperacion_sesiones').select('id')
        .eq('owner_id', uid).eq('estado', 'activa').gt('vence_at', new Date().toISOString()).limit(1)
      const { error } = await supabase.rpc('set_recuperacion', { activa: false })
      if (error) { setRecError(t('errorConexion')); return }
      setRecPermitir(false)
      try { localStorage.setItem(`recActiva_${uid}`, '0') } catch (_) {}
      if (enCurso?.length) {
        try { await window.Capacitor?.Plugins?.GpsShare?.detener({ userId: uid }) } catch (_) {}
      }
      setRecClave('')
      setPaso('menu')
    } catch (_) {
      setRecError(t('errorConexion'))
    } finally {
      setRecGuardando(false)
    }
  }

  /**
   * Recuperar celular necesita la ubicación en "Permitir todo el tiempo": con la app cerrada, Android
   * no deja usar el GPS sin ese permiso y la recuperación fallaría sin avisar. Solo se exige para
   * esta opción, no para el resto de la app.
   */
  async function revisarUbiFondo() {
    try {
      const r = await window.Capacitor?.Plugins?.Permisos?.verificar?.()
      setUbiFondo(r && typeof r.ubicacionFondo === 'boolean' ? r.ubicacionFondo : null)
    } catch (_) { setUbiFondo(null) }
  }
  useEffect(() => {
    if (!EN_APP) return
    revisarUbiFondo()
    // Al volver de Ajustes se revisa otra vez
    const alVolver = () => { if (document.visibilityState === 'visible') revisarUbiFondo() }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])
  const abrirAjustesApp = () => { try { window.Capacitor?.Plugins?.Permisos?.abrirAjustes?.() } catch (_) {} }

  const sonidosPlugin = () => window.Capacitor?.Plugins?.Sonidos
  async function revisarEstadoSonido() {
    try {
      const e = await sonidosPlugin()?.estado?.()
      if (e) setEstadoSonido({ canales: !!e.canales, accesoNoMolestar: !!e.accesoNoMolestar })
    } catch (_) {}
  }
  function abrirSonido() {
    const p = leerPreferencia() || PREFERENCIA_INICIAL
    setSonidoSel(p.sonido); setSiempreSel(p.siempre); setSonidoMsg(null)
    revisarEstadoSonido()
    setPaso('sonido')
  }
  // Al volver de Ajustes (permiso de No molestar o tono del celular) se revisa otra vez
  useEffect(() => {
    if (paso !== 'sonido') return
    const alVolver = () => { if (document.visibilityState === 'visible') revisarEstadoSonido() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { document.removeEventListener('visibilitychange', alVolver); sonidosPlugin()?.detener?.().catch(() => {}) }
  }, [paso])

  function probarSonido(sonido) {
    sonidosPlugin()?.probar?.({ sonido, siempre: siempreSel }).catch(() => {})
  }

  async function guardarSonido() {
    if (guardandoSonido) return
    setGuardandoSonido(true); setSonidoMsg(null)
    try {
      const r = await aplicarSonido(supabase, uid, { sonido: sonidoSel, siempre: siempreSel })
      const nota = siempreSel && !r.suenaEnNoMolestar ? ` ${t('sonidoSinNoMolestar')}` : ''
      setSonidoMsg({ tipo: 'ok', texto: t('sonidoGuardado') + nota })
    } catch (_) {
      setSonidoMsg({ tipo: 'error', texto: t('errorConexion') })
    } finally {
      setGuardandoSonido(false)
    }
  }

  // "Más tonos del celular": primero se deja listo el canal elegido y se abren sus ajustes de Android
  async function masTonos() {
    try {
      await aplicarSonido(supabase, uid, { sonido: sonidoSel, siempre: siempreSel })
      await sonidosPlugin()?.abrirAjustesCanal?.({ canal: canalLocal() })
    } catch (_) {
      setSonidoMsg({ tipo: 'error', texto: t('errorConexion') })
    }
  }

  /**
   * Con "Permitir recuperar mi celular" activo, cerrar sesión pide la contraseña: si no, quien tenga
   * el celular (por ejemplo, un ladrón) apagaría la recuperación y ya no se podría volver a pedir.
   */
  async function pedirCerrarSesion() {
    let activa = recPermitir
    if (!perfil) {
      try { activa = localStorage.getItem(`recActiva_${uid}`) === '1' } catch (_) {}
      if (!activa && uid) {
        const { data } = await supabase.from('users').select('recuperacion_activa').eq('id', uid).maybeSingle()
          .then(r => r, () => ({ data: null }))
        activa = !!data?.recuperacion_activa
      }
    }
    if (!activa) { cerrarSesion(); return }
    setSalirClave(''); setVerSalirClave(false); setSalirError(''); setVerAyudaClave(false)
    setPaso('salir')
  }

  async function salirConClave(e) {
    e.preventDefault()
    if (saliendo) return
    if (!salirClave) { setSalirError(t('errorClaveActualFalta')); return }
    setSaliendo(true); setSalirError('')
    try {
      const session = await obtenerSesion()
      const email = session?.user?.email
      if (!email) { await cerrarSesion(); return }
      const { error } = await clienteVerificacion().auth.signInWithPassword({ email, password: salirClave })
      if (error) { setSalirError(/fetch|network|failed/i.test(error.message || '') ? t('errorConexion') : t('errorClaveActual')); return }
      await cerrarSesion()
    } catch (_) {
      setSalirError(t('errorConexion'))
    } finally {
      setSaliendo(false)
    }
  }

  function textoErrorRec(code, min) {
    switch (code) {
      case 'CREDENCIALES': return t('recErrCredenciales')
      case 'BLOQUEADO': return t('recErrBloqueado').replace('{min}', String(min || 30))
      case 'NO_VINCULADO': return t('recErrNoVinculado')
      case 'NO_AUTORIZADO_DUENIO': return t('recErrNoAutorizado')
      case 'NO_PREMIUM': return t('recErrNoPremium')
      case 'CELULAR_NO_DISPONIBLE': return t('recErrCelular')
      case 'ES_TU_CELULAR': return t('recErrTuCelular')
      case 'FALTAN_DATOS': return t('recErrFaltan')
      default: return t('recErrGenerico')
    }
  }

  async function recuperar(accion) {
    if (rcCargando) return
    if (!rcForm.clave.trim() || !rcForm.password) { setRcMsg({ tipo: 'error', texto: t('recErrFaltan') }); return }
    if (accion === 'detener' && !window.confirm(t('recConfirmaDetener'))) return
    setRcCargando(true); setRcMsg(null)
    try {
      const { data, error } = await supabase.functions.invoke('recuperar-celular', {
        body: { accion, correo_o_usuario: rcForm.clave.trim(), password: rcForm.password },
      })
      // functions.invoke marca error en HTTP != 2xx; el cuerpo trae el detalle
      const res = data || (error?.context ? await error.context.json().catch(() => null) : null)
      if (res?.ok) {
        setRcMsg({ tipo: 'ok', texto: accion === 'detener' ? t('recDetenido') : t('recOk') })
        setRcForm({ clave: '', password: '' })
      } else {
        setRcMsg({ tipo: 'error', texto: textoErrorRec(res?.error, res?.minutos) })
      }
    } catch (_) {
      setRcMsg({ tipo: 'error', texto: t('recErrGenerico') })
    } finally {
      setRcCargando(false)
    }
  }

  function abrirEliminar() {
    setElimClave(''); setVerElimClave(false); setElimError(''); setVerAyudaClave(false)
    setPaso('eliminar')
  }

  /**
   * Elimina la cuenta para siempre. El servidor comprueba la contraseña (así quien tenga el celular
   * desbloqueado no puede borrarla) y borra todos los datos y el usuario.
   */
  async function eliminarCuenta(e) {
    e.preventDefault()
    if (elimCargando) return
    if (!elimClave) { setElimError(t('errorClaveActualFalta')); return }
    setElimCargando(true); setElimError('')
    try {
      const { data, error } = await supabase.functions.invoke('eliminar-cuenta', { body: { password: elimClave } })
      // functions.invoke marca error en HTTP != 2xx; el cuerpo trae el detalle
      const res = data || (error?.context ? await error.context.json().catch(() => null) : null)
      if (!res?.ok) {
        if (res?.error === 'CREDENCIALES') setElimError(t('errorClaveActual'))
        else if (res?.error === 'BLOQUEADO') setElimError(t('recErrBloqueado').replace('{min}', String(res.minutos || 30)))
        else setElimError(t('elimErrGenerico').replace('{correo}', RESPONSABLE.correo))
        return
      }
      // Cuenta eliminada: este celular deja de compartir y se borra lo guardado de esa cuenta
      setPaso('eliminada')
      try { await window.Capacitor?.Plugins?.GpsShare?.detener({ userId: uid }) } catch (_) {}
      try {
        sessionStorage.removeItem('ubi_sharing')
        Object.keys(localStorage).filter(k => uid && k.includes(uid)).forEach(k => localStorage.removeItem(k))
      } catch (_) {}
      setTimeout(() => { supabase.auth.signOut({ scope: 'local' }).catch(() => {}) }, 4000)
    } catch (_) {
      setElimError(t('elimErrGenerico').replace('{correo}', RESPONSABLE.correo))
    } finally {
      setElimCargando(false)
    }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  /**
   * Cambiar la contraseña pide la ACTUAL: quien tenga el celular desbloqueado (por ejemplo, un ladrón)
   * no puede cambiarla y dejar sin efecto "Recuperar celular". Al cambiarla se cierran las sesiones
   * de los otros celulares.
   */
  async function cambiarContrasena(e) {
    e.preventDefault()
    setError('')
    if (!form.actual) { setError(t('errorClaveActualFalta')); return }
    const invalida = validarClave(form.nueva, form.confirmar, t)
    if (invalida) { setError(invalida); return }
    if (form.nueva === form.actual) { setError(t('errorClaveIgual')); return }
    setCargando(true)
    try {
      const session = await obtenerSesion()
      const email = session?.user?.email
      if (!email) { setError(t('errorConexion')); return }
      // 1. La contraseña actual se comprueba aparte, sin tocar la sesión de la app
      const verif = clienteVerificacion()
      const { error: errActual } = await verif.auth.signInWithPassword({ email, password: form.actual })
      if (errActual) { setError(/fetch|network|failed/i.test(errActual.message || '') ? t('errorConexion') : t('errorClaveActual')); return }
      // 2. Se cambia en la sesión de la app
      let { error } = await supabase.auth.updateUser({ password: form.nueva })
      if (error?.code === 'reauthentication_needed') {
        // Supabase pide un inicio de sesión reciente: se cambia con el que se acaba de comprobar
        // y la app vuelve a entrar con la contraseña nueva
        ;({ error } = await verif.auth.updateUser({ password: form.nueva }))
        if (!error) await supabase.auth.signInWithPassword({ email, password: form.nueva })
      }
      if (error) { setError(mensajeErrorClave(error, t)); return }
      setExito(recPermitir ? `${t('exitoCambio')} ${t('recAvisoClave')}` : t('exitoCambio'))
      setForm({ actual: '', nueva: '', confirmar: '' })
      setTimeout(() => { setExito(''); setPaso('menu') }, recPermitir ? 6000 : 2500)
    } catch (_) {
      setError(t('errorConexion'))
    } finally {
      setCargando(false)
    }
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
            {perfil && (
              <div className={styles.perfilCard}>
                <div className={styles.perfilInfo}>
                  <span className={styles.perfilNombre}>{perfil.full_name}</span>
                  <span className={styles.perfilUsername}>@{perfil.username}</span>
                </div>
              </div>
            )}
            <button className={styles.opcion} onClick={() => setPaso('plan')}>
              <span>{t('verPlanes')}</span>
              <span className={esPlanPago(perfil) ? styles.planBadgePremium : styles.planBadgeGratis}>
                {esPremium(perfil) ? t('planPremiumNombre') : esFamiliar(perfil) ? t('planFamiliarNombre') : t('planTrialNombre')}
              </span>
            </button>
            <button className={styles.opcion} onClick={() => setPaso('idioma')}>
              {t('cambiarIdioma')}
            </button>
            <button className={styles.opcion} onClick={() => setPaso('legal')}>
              <span>{t('infoDocLegales')}</span>
              <span className={styles.leido}>✅ {t('docsCardLeido')}</span>
            </button>
            <button className={styles.opcion} onClick={() => { setVerAyudaClave(false); setPaso('contrasena') }}>
              {t('cambiarContrasena')}
            </button>
            <button className={styles.opcion} onClick={() => setPaso('creador')}>
              {t('btnPerfilCreador')}
            </button>
            <button className={styles.opcion} onClick={() => setPaso('huellitas')}>
              {t('btnHuellitas')}
            </button>
            <div className={styles.opcionToggle}>
              <span>{t('modoPantalla')}</span>
              <button
                className={tema === 'oscuro' ? styles.toggleOn : styles.toggleOff}
                onClick={toggleTema}
                aria-pressed={tema === 'oscuro'}
                style={tema === 'oscuro' ? { background: '#1a1a2e' } : {}}
              >
                {tema === 'oscuro' ? t('modoOscuro') : t('modoClaro')}
              </button>
            </div>

            <div className={styles.opcionToggle}>
              <span>
                {t('autoAlertaLabel')}
                {!esPlanPago(perfil) && <span style={{ marginLeft: 6, fontSize: '0.75rem', color: '#e6a817', fontWeight: 700 }}>👑 {t('autoSoloPago')}</span>}
                <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text2)', fontWeight: 500, marginTop: 2, lineHeight: 1.35 }}>
                  {autoAlerta && proximaAuto
                    ? `⏱ ${t('autoProxima')} ${new Date(proximaAuto).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
                    : t('autoExplica')}
                </span>
              </span>
              {esPlanPago(perfil) ? (
                <button
                  className={autoAlerta ? styles.toggleOn : styles.toggleOff}
                  onClick={toggleAutoAlerta}
                  aria-pressed={autoAlerta}
                >
                  {autoAlerta ? t('autoAlertaActiva') : t('autoAlertaInactiva')}
                </button>
              ) : (
                <button
                  className={styles.toggleOff}
                  onClick={() => setPaso('plan')}
                  style={{ opacity: 0.6, cursor: 'pointer' }}
                >
                  {t('verPlanes')}
                </button>
              )}
            </div>
            <button className={styles.opcion} onClick={abrirSonido}>
              🔔 {t('sonidoMenu')}
            </button>
            {/* Recuperar celular: en la app y en la página web (desde la web un familiar también puede buscar el celular) */}
            <div className={styles.opcionToggle}>
              <span>
                {t('recPermitir')}
                {!esPremium(perfil) && <span style={{ marginLeft: 6, fontSize: '0.75rem', color: '#e6a817', fontWeight: 700 }}>👑 Premium</span>}
              </span>
              {esPremium(perfil) ? (
                <button
                  className={recPermitir ? styles.toggleOn : styles.toggleOff}
                  onClick={toggleRecuperar}
                  aria-pressed={recPermitir}
                >
                  {recPermitir ? t('autoAlertaActiva') : t('autoAlertaInactiva')}
                </button>
              ) : (
                <button className={styles.toggleOff} onClick={() => setPaso('plan')} style={{ opacity: 0.6, cursor: 'pointer' }}>
                  {t('verPlanes')}
                </button>
              )}
            </div>
            {recPermitir && ubiFondo === false && (
              <button type="button" className={styles.error} style={{ textAlign: 'left', cursor: 'pointer' }} onClick={abrirAjustesApp}>
                ⚠️ {t('recFaltaFondoCorto')}
              </button>
            )}
            <button className={styles.opcion} onClick={() => { setRcMsg(null); setRcForm({ clave: '', password: '' }); setPaso('recuperar') }}>
              🔒 {t('recMenu')}
            </button>
            <button className={styles.opcionEliminar} onClick={abrirEliminar}>
              🗑️ {t('elimMenu')}
            </button>
            <button className={styles.opcionRojo} onClick={pedirCerrarSesion}>
              {t('cerrarSesion')}
            </button>
            <div className={styles.version}>{t('appNombre')} · {t('versionApp')} {version}</div>
          </div>
        )}

        {paso === 'sonido' && (
          <div className={styles.form}>
            <h3 className={styles.recTitulo}>🔔 {t('sonidoTitulo')}</h3>
            <p className={styles.desc} style={{ margin: 0 }}>{t('sonidoDesc')}</p>
            {!hayPluginSonidos() && <div className={styles.recDatos}><span>{t('sonidoSoloApp')}</span></div>}
            <div role="radiogroup" aria-label={t('sonidoTitulo')} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SONIDOS.map(s => (
                <div key={s} className={sonidoSel === s ? styles.sonidoFilaActiva : styles.sonidoFila}>
                  <button type="button" role="radio" aria-checked={sonidoSel === s} className={styles.sonidoElegir} onClick={() => { setSonidoSel(s); setSonidoMsg(null) }}>
                    <span className={styles.sonidoPunto}>{sonidoSel === s ? '●' : '○'}</span>
                    {t('sonido_' + s)}
                  </button>
                  <button type="button" className={styles.sonidoProbar} onClick={() => probarSonido(s)} aria-label={`${t('sonidoProbar')} ${t('sonido_' + s)}`}>
                    ▶ {t('sonidoProbar')}
                  </button>
                </div>
              ))}
            </div>
            {estadoSonido.canales && (
              <>
                <div className={styles.opcionToggle}>
                  <span>
                    {t('sonidoSiempre')}
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text2)', fontWeight: 500, marginTop: 2, lineHeight: 1.35 }}>{t('sonidoSiempreDesc')}</span>
                  </span>
                  <button type="button" className={siempreSel ? styles.toggleOn : styles.toggleOff} aria-pressed={siempreSel}
                    onClick={() => { setSiempreSel(v => !v); setSonidoMsg(null) }}>
                    {siempreSel ? t('autoAlertaActiva') : t('autoAlertaInactiva')}
                  </button>
                </div>
                {siempreSel && !estadoSonido.accesoNoMolestar && (
                  <div className={styles.recDatos}>
                    <span>{t('sonidoPermisoFalta')}</span>
                    <button type="button" className={styles.btn} style={{ padding: 10, fontSize: '0.9rem' }}
                      onClick={() => sonidosPlugin()?.pedirAccesoNoMolestar?.().catch(() => {})}>
                      {t('sonidoPermisoBtn')}
                    </button>
                  </div>
                )}
              </>
            )}
            {sonidoMsg && (
              <div className={sonidoMsg.tipo === 'ok' ? styles.exito : styles.error}>{sonidoMsg.texto}</div>
            )}
            <button type="button" className={styles.btn} disabled={guardandoSonido || !hayPluginSonidos()} onClick={guardarSonido}>
              {guardandoSonido ? t('procesando') : t('sonidoGuardar')}
            </button>
            {estadoSonido.canales && (
              <button type="button" className={styles.volver} onClick={masTonos}>{t('sonidoMasTonos')}</button>
            )}
            <button type="button" className={styles.volver} onClick={() => setPaso('menu')}>{t('volver')}</button>
          </div>
        )}

        {paso === 'salir' && (
          <form onSubmit={salirConClave} className={styles.form}>
            <h3 className={styles.recTitulo}>🔒 {t('salirTitulo')}</h3>
            <p className={styles.desc} style={{ margin: 0 }}>{t('salirDesc')}</p>
            <div className={styles.passwordWrap}>
              <input type={verSalirClave ? 'text' : 'password'} placeholder={t('claveActualPh')} value={salirClave}
                onChange={e => setSalirClave(e.target.value)} autoComplete="current-password" />
              <button type="button" className={styles.eyeBtn} onClick={() => setVerSalirClave(v => !v)}>{verSalirClave ? '🙈' : '👁️'}</button>
            </div>
            {salirError && <div className={styles.error}>{salirError}</div>}
            <button type="submit" className={styles.btn} disabled={saliendo}>
              {saliendo ? t('procesando') : t('salirBtn')}
            </button>
            <button type="button" className={styles.volver} onClick={() => setVerAyudaClave(v => !v)} aria-expanded={verAyudaClave}>{t('claveOlvideActual')}</button>
            {verAyudaClave && <AyudaClave email={miCorreo} />}
            <button type="button" className={styles.volver} disabled={saliendo} onClick={() => setPaso('menu')}>{t('cancelar')}</button>
          </form>
        )}

        {paso === 'eliminar' && (
          <div className={styles.form}>
            <h3 className={styles.recTitulo}>🗑️ {t('elimTitulo')}</h3>
            <p className={styles.desc} style={{ margin: 0 }}>{t('elimIntro')}</p>
            <ul className={styles.recLista}>
              <li>{t('elim1')}</li>
              <li>{t('elim2')}</li>
              <li>{t('elim3')}</li>
              <li>{t('elim4')}</li>
            </ul>
            <div className={styles.error} style={{ fontWeight: 700, lineHeight: 1.45 }}>⚠️ {t('elimAviso')}</div>
            <div className={styles.recDatos}>
              <span>{t('elimSuscripcion')}</span>
              <a href={URL_SUSCRIPCIONES} target="_blank" rel="noopener noreferrer" className={styles.enlace}>{t('elimVerSuscripciones')}</a>
            </div>
            <a href={`${URL_ELIMINAR}?lang=${lang}#eliminar`} target="_blank" rel="noopener noreferrer" className={styles.enlace} style={{ textAlign: 'center' }}>
              {t('elimMasInfo')}
            </a>
            <button type="button" className={styles.btn} onClick={() => { setElimError(''); setPaso('eliminar2') }}>{t('elimContinuar')}</button>
            <button type="button" className={styles.volver} onClick={() => setPaso('menu')}>{t('cancelar')}</button>
          </div>
        )}

        {paso === 'eliminar2' && (
          <form onSubmit={eliminarCuenta} className={styles.form}>
            <h3 className={styles.recTitulo}>⚠️ {t('elimConfirmaTitulo')}</h3>
            <p className={styles.desc} style={{ margin: 0 }}>{t('elimConfirmaDesc')}</p>
            <div className={styles.passwordWrap}>
              <input type={verElimClave ? 'text' : 'password'} placeholder={t('claveActualPh')} value={elimClave}
                onChange={e => setElimClave(e.target.value)} autoComplete="current-password" />
              <button type="button" className={styles.eyeBtn} onClick={() => setVerElimClave(v => !v)}>{verElimClave ? '🙈' : '👁️'}</button>
            </div>
            {elimError && <div className={styles.error}>{elimError}</div>}
            <button type="button" className={styles.volver} onClick={() => setVerAyudaClave(v => !v)} aria-expanded={verAyudaClave}>{t('claveOlvideActual')}</button>
            {verAyudaClave && <AyudaClave email={miCorreo} />}
            <button type="submit" className={styles.btn} disabled={elimCargando}>
              {elimCargando ? t('procesando') : t('elimBtn')}
            </button>
            <button type="button" className={styles.volver} disabled={elimCargando} onClick={() => setPaso('menu')}>{t('cancelar')}</button>
          </form>
        )}

        {paso === 'eliminada' && (
          <div className={styles.form}>
            <div className={styles.exito} style={{ textAlign: 'center', lineHeight: 1.5 }}>✓ {t('elimHecho')}</div>
          </div>
        )}

        {paso === 'recAutorizar' && (
          <div className={styles.form}>
            <h3 className={styles.recTitulo}>🔒 {t('recAutTitulo')}</h3>
            <p className={styles.desc} style={{ margin: 0 }}>{t('recAutIntro')}</p>
            <ul className={styles.recLista}>
              <li>{t('recAut1')}</li>
              <li>{t('recAut2')}</li>
              <li>{t('recAut3')}</li>
              <li>{t('recAut4')}</li>
            </ul>
            <div className={styles.recDatos}>
              <strong>{t('recAutDatosTitulo')}</strong>
              <span>{t('recAutDatos')}</span>
            </div>
            <label className={styles.recCheck}>
              <input type="checkbox" checked={recAcepto} onChange={e => setRecAcepto(e.target.checked)} />
              <span>{t('recAutAcepto')}</span>
            </label>
            {ubiFondo === false && (
              <div className={styles.error} style={{ display: 'flex', flexDirection: 'column', gap: 8, lineHeight: 1.45 }}>
                <span>⚠️ {t('recFaltaFondo')}</span>
                <button type="button" className={styles.btn} style={{ padding: 10, fontSize: '0.9rem' }} onClick={abrirAjustesApp}>{t('recAbrirAjustes')}</button>
              </div>
            )}
            {recError && <div className={styles.error}>{recError}</div>}
            <button type="button" className={styles.btn} disabled={!recAcepto || recGuardando || ubiFondo === false} onClick={autorizarRecuperar}>
              {recGuardando ? t('procesando') : t('recAutBtn')}
            </button>
            <button type="button" className={styles.volver} onClick={() => setPaso('menu')}>{t('cancelar')}</button>
          </div>
        )}

        {paso === 'recApagar' && (
          <form onSubmit={apagarRecuperar} className={styles.form}>
            <h3 className={styles.recTitulo}>🔒 {t('recApagarTitulo')}</h3>
            <p className={styles.desc} style={{ margin: 0 }}>{t('recApagarDesc')}</p>
            <div className={styles.passwordWrap}>
              <input type={verRecClave ? 'text' : 'password'} placeholder={t('claveActualPh')} value={recClave}
                onChange={e => setRecClave(e.target.value)} autoComplete="current-password" />
              <button type="button" className={styles.eyeBtn} onClick={() => setVerRecClave(v => !v)}>{verRecClave ? '🙈' : '👁️'}</button>
            </div>
            {recError && <div className={styles.error}>{recError}</div>}
            <button type="submit" className={styles.btn} disabled={recGuardando}>
              {recGuardando ? t('procesando') : t('recApagarBtn')}
            </button>
            <button type="button" className={styles.volver} onClick={() => setVerAyudaClave(v => !v)} aria-expanded={verAyudaClave}>{t('claveOlvideActual')}</button>
            {verAyudaClave && <AyudaClave email={miCorreo} />}
            {error && <div className={styles.error}>{error}</div>}
            <button type="button" className={styles.volver} onClick={() => { setPaso('menu'); setError('') }}>{t('cancelar')}</button>
          </form>
        )}

        {paso === 'recuperar' && (
          <div className={styles.form}>
            <p className={styles.desc}>{t('recIntro')}</p>
            <input
              type="text" inputMode="email" autoCapitalize="none" autoCorrect="off"
              placeholder={t('recUsuarioPh')} value={rcForm.clave}
              onChange={e => setRcForm(f => ({ ...f, clave: e.target.value }))}
            />
            <input
              type="password" placeholder={t('recPassPh')} value={rcForm.password}
              onChange={e => setRcForm(f => ({ ...f, password: e.target.value }))}
            />
            {rcMsg && (
              <p style={{ margin: '4px 0', fontSize: '0.85rem', fontWeight: 600, color: rcMsg.tipo === 'ok' ? '#1E8449' : '#C0392B' }}>
                {rcMsg.tipo === 'ok' ? '✓ ' : '⚠️ '}{rcMsg.texto}
              </p>
            )}
            <button type="button" className={styles.btn} disabled={rcCargando} onClick={() => recuperar('solicitar')}>
              {rcCargando ? '…' : '📍 ' + t('recBtn')}
            </button>
            <button type="button" className={styles.volver} disabled={rcCargando} onClick={() => recuperar('detener')}>
              {t('recDetener')}
            </button>
            <button type="button" className={styles.volver} onClick={() => setPaso('menu')}>{t('volver')}</button>
          </div>
        )}

        {paso === 'plan' && (
          <div className={styles.form} style={{ padding: 0 }}>
            <ElegirPlan onElegido={() => { setPaso('menu'); window.dispatchEvent(new Event('recargarPlan')) }} />
            <button type="button" className={styles.volver} style={{ margin: '0 16px 16px' }} onClick={() => setPaso('menu')}>{t('volver')}</button>
          </div>
        )}

        {paso === 'legal' && (
          <div className={styles.form} style={{ padding: 0 }}>
            <Suspense fallback={<div style={{minHeight:200,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text2)'}}>{t('cargando')}</div>}>
              <AvisoLegal soloVer onAceptar={() => setPaso('menu')} />
            </Suspense>
            <button type="button" className={styles.volver} style={{ margin: '0 16px 16px' }} onClick={() => setPaso('menu')}>{t('volver')}</button>
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

        {paso === 'creador' && (
          <div className={styles.form}>
            <div className={styles.creadorHeader}>
              <img src="/perfil-creador.jpg" alt={t('creadorNombre')} className={styles.creadorFoto} />
              <div>
                <strong className={styles.creadorNombre}>{t('creadorNombre')}</strong>
                <span className={styles.creadorCargo}>{t('creadorCargo')}</span>
              </div>
            </div>
            <p className={styles.creadorBio}>{t('creadorBio')}</p>
            <button type="button" className={styles.volver} onClick={() => setPaso('menu')}>{t('volver')}</button>
          </div>
        )}

        {paso === 'huellitas' && (
          <div className={styles.form}>
            {/* Hero */}
            <div className={styles.huellitasHero}>
              <img src="/huellitas-mascota.webp" alt="Huellitas en Acción" className={styles.huellitasMascota} />
              <div className={styles.huellitasTituloAzul}>HUELLITAS</div>
              <div className={styles.huellitasTituloAmarillo}>EN ACCIÓN</div>
              <p className={styles.huellitasSlogan}>{t('huellitasSlogan')}</p>
              <p className={styles.huellitasDesc2}>{t('huellitasDesc')}</p>
            </div>

            {/* Caja motivadora */}
            <div className={styles.huellitasCaja}>
              <p className={styles.huellitasCajaTop}>{t('huellitasCajaTop')}</p>
              <p className={styles.huellitasCajaBottom}>{t('huellitasCajaBottom')}</p>
            </div>

            <p className={styles.huellitasGracias}>{t('huellitasGracias')}</p>

            {/* Nequi */}
            <div className={styles.nequiBox}>
              <div>
                <div className={styles.nequiLabel}>{t('donarPorNequi')}</div>
                <div className={styles.nequiNumero}>305 923 4214</div>
              </div>
              <button className={styles.copiarBtn} onClick={() => navigator.clipboard?.writeText('3059234214').catch(() => {})}>
                📋 {t('copiar')}
              </button>
            </div>
            <div className={styles.huellitasAviso}>⚠️ {t('huellitasImportante')}</div>

            {/* WhatsApp */}
            <a
              href="https://wa.me/573059234214?text=Hola%2C%20acabo%20de%20hacer%20una%20donaci%C3%B3n%20a%20Huellitas%20en%20Acci%C3%B3n%20%F0%9F%90%BE"
              target="_blank" rel="noopener noreferrer"
              className={styles.waBtn}
            >
              {t('enviarWa')}
            </a>

            <button type="button" className={styles.volver} onClick={() => setPaso('menu')}>{t('volver')}</button>
          </div>
        )}

        {paso === 'contrasena' && (
          <form onSubmit={cambiarContrasena} className={styles.form}>
            <p className={styles.desc}>{t('ingresarDesc')}</p>
            <div className={styles.field}>
              <label>{t('claveActual')}</label>
              <div className={styles.passwordWrap}>
                <input type={verActual ? 'text' : 'password'} placeholder={t('claveActualPh')} value={form.actual} onChange={set('actual')} autoComplete="current-password" />
                <button type="button" className={styles.eyeBtn} onClick={() => setVerActual(v => !v)}>{verActual ? '🙈' : '👁️'}</button>
              </div>
            </div>
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
            <button type="button" className={styles.volver} onClick={() => setVerAyudaClave(v => !v)} aria-expanded={verAyudaClave}>{t('claveOlvideActual')}</button>
            {verAyudaClave && <AyudaClave email={miCorreo} />}
            <button type="button" className={styles.volver} onClick={() => { setPaso('menu'); setError(''); setVerAyudaClave(false) }}>
              {t('volver')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
