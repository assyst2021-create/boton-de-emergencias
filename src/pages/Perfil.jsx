import { useState, useEffect, lazy, Suspense } from 'react'
import { supabase } from '../supabase'
import styles from './Perfil.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { IDIOMAS } from '../i18n/translations'
import ElegirPlan from './ElegirPlan'
import { useTema } from '../ThemeContext'
import { useAppActions } from '../AppActionsContext'
import { esPremium, esFamiliar, esPlanPago } from '../plan'
import { olvidarFCM } from '../fcmRegistro'

export { AppActionsContext } from '../AppActionsContext'

const AvisoLegal = lazy(() => import('./AvisoLegal'))

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
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (uid) {
      try { await window.Capacitor?.Plugins?.GpsShare?.detener({ userId: uid }) } catch (_) {}
      await supabase.from('live_locations').update({ activo: false }).eq('user_id', uid).then(() => {}, () => {})
      sessionStorage.removeItem('ubi_sharing')
      await olvidarFCM(supabase, uid)
    }
    await supabase.auth.signOut()
  }
  const [form, setForm] = useState({ nueva: '', confirmar: '' })
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [cargando, setCargando] = useState(false)
  const [verNueva, setVerNueva] = useState(false)
  const [verConfirmar, setVerConfirmar] = useState(false)
  const [perfil, setPerfil] = useState(null)
  const [uid, setUid] = useState(null)
  const [autoAlerta, setAutoAlerta] = useState(false)
  const [recPermitir, setRecPermitir] = useState(false)
  // Ventana "Recuperar celular": credenciales del dueño (se usan en el celular de un familiar)
  const [rcForm, setRcForm] = useState({ clave: '', password: '' })
  const [rcMsg, setRcMsg] = useState(null)   // { tipo: 'ok'|'error', texto }
  const [rcCargando, setRcCargando] = useState(false)
  const EN_APP = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user
      if (!user) return
      setUid(user.id)
      supabase.from('users').select('full_name, username, auto_alert_enabled, recuperacion_activa, plan, is_premium, premium_hasta').eq('id', user.id).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setPerfil(data)
            setAutoAlerta(!!data.auto_alert_enabled)
            setRecPermitir(!!data.recuperacion_activa)
          }
        })
    })
  }, [])

  async function toggleAutoAlerta() {
    const nuevo = !autoAlerta
    setAutoAlerta(nuevo)
    if (uid) await supabase.from('users').update({ auto_alert_enabled: nuevo }).eq('id', uid)
  }

  // El dueño autoriza (o quita) que su propio celular se pueda recuperar con su contraseña
  async function toggleRecuperar() {
    const nuevo = !recPermitir
    setRecPermitir(nuevo)
    const { error } = await supabase.rpc('set_recuperacion', { activa: nuevo })
    if (error) setRecPermitir(!nuevo)   // si falla, se devuelve
  }

  function textoErrorRec(code, min) {
    switch (code) {
      case 'CREDENCIALES': return t('recErrCredenciales')
      case 'BLOQUEADO': return t('recErrBloqueado').replace('{min}', String(min || 30))
      case 'NO_VINCULADO': return t('recErrNoVinculado')
      case 'NO_AUTORIZADO_DUENIO': return t('recErrNoAutorizado')
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
            <button className={styles.opcion} onClick={() => setPaso('contrasena')}>
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
                {!esPlanPago(perfil) && <span style={{ marginLeft: 6, fontSize: '0.75rem', color: '#e6a817', fontWeight: 700 }}>👑 Premium</span>}
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
                  {t('activarPremiumBtn')}
                </button>
              )}
            </div>
            {EN_APP && (
              <>
                <div className={styles.opcionToggle}>
                  <span>
                    {t('recPermitir')}
                    <span style={{ marginLeft: 6, fontSize: '0.72rem', color: 'var(--text2)' }}>{t('recSoloAndroid')}</span>
                  </span>
                  <button
                    className={recPermitir ? styles.toggleOn : styles.toggleOff}
                    onClick={toggleRecuperar}
                    aria-pressed={recPermitir}
                  >
                    {recPermitir ? t('autoAlertaActiva') : t('autoAlertaInactiva')}
                  </button>
                </div>
                <button className={styles.opcion} onClick={() => { setRcMsg(null); setRcForm({ clave: '', password: '' }); setPaso('recuperar') }}>
                  🔒 {t('recMenu')}
                </button>
              </>
            )}
            <button className={styles.opcionRojo} onClick={cerrarSesion}>
              {t('cerrarSesion')}
            </button>
            <div className={styles.version}>Botón de Emergencias · {t('versionApp')} {version}</div>
          </div>
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
