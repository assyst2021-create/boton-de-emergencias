import { useState, useContext, createContext, useEffect } from 'react'
import { supabase } from '../supabase'
import styles from './Perfil.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { IDIOMAS } from '../i18n/translations'
import ElegirPlan from './ElegirPlan'
import { useTema } from '../ThemeContext'

export const AppActionsContext = createContext({})
export const useAppActions = () => useContext(AppActionsContext)

export default function Perfil({ onCerrar }) {
  const { t, lang, cambiarIdioma } = useLanguage()
  const { tema, toggleTema } = useTema()
  const { verBienvenida, verTerminos, verPrivacidad, verContrato, bienvenidaLeida, avisoLeido, privacidadLeida, contratoLeido } = useAppActions()
  const [paso, setPaso] = useState('menu')
  const [form, setForm] = useState({ nueva: '', confirmar: '' })
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [cargando, setCargando] = useState(false)
  const [verNueva, setVerNueva] = useState(false)
  const [verConfirmar, setVerConfirmar] = useState(false)
  const [perfil, setPerfil] = useState(null)
  const [uid, setUid] = useState(null)
  const [autoAlerta, setAutoAlerta] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUid(user.id)
      supabase.from('users').select('full_name, username, auto_alert_enabled, is_premium, premium_hasta').eq('id', user.id).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setPerfil(data)
            setAutoAlerta(!!data.auto_alert_enabled)
          }
        })
    })
  }, [])

  async function toggleAutoAlerta() {
    const nuevo = !autoAlerta
    setAutoAlerta(nuevo)
    if (uid) await supabase.from('users').update({ auto_alert_enabled: nuevo }).eq('id', uid)
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
              <button className={styles.perfilCard} onClick={() => setPaso('plan')}>
                <div className={styles.perfilInfo}>
                  <span className={styles.perfilNombre}>{perfil.full_name}</span>
                  <span className={styles.perfilUsername}>@{perfil.username}</span>
                </div>
                <span className={perfil.is_premium ? styles.planBadgePremium : styles.planBadgeGratis}>
                  {perfil.is_premium ? '👑 Premium' : '🎁 Gratis'}
                </span>
              </button>
            )}
            <button className={styles.opcion} onClick={() => setPaso('plan')}>
              <span>{t('verPlanes')}</span>
              <span className={perfil?.is_premium ? styles.planBadgePremium : styles.planBadgeGratis}>
                {perfil?.is_premium ? '👑 Premium' : '🎁 Básico'}
              </span>
            </button>
            <button className={styles.opcion} onClick={() => setPaso('idioma')}>
              {t('cambiarIdioma')}
            </button>
            <button className={styles.opcion} onClick={() => { onCerrar(); verBienvenida?.() }}>
              <span>📄 Información y documentos legales</span>
              <span className={styles.leido}>✅ Leído</span>
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
              <span>Modo de pantalla</span>
              <button
                className={tema === 'oscuro' ? styles.toggleOn : styles.toggleOff}
                onClick={toggleTema}
                aria-pressed={tema === 'oscuro'}
                style={tema === 'oscuro' ? { background: '#1a1a2e' } : {}}
              >
                {tema === 'oscuro' ? '🌙 Oscuro' : '☀️ Claro'}
              </button>
            </div>

            <div className={styles.opcionToggle}>
              <span>
                {t('autoAlertaLabel')}
                {!perfil?.is_premium && <span style={{ marginLeft: 6, fontSize: '0.75rem', color: '#e6a817', fontWeight: 700 }}>👑 Premium</span>}
              </span>
              {perfil?.is_premium ? (
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
                  🔒 Activar
                </button>
              )}
            </div>
            <button className={styles.opcionRojo} onClick={() => supabase.auth.signOut()}>
              {t('cerrarSesion')}
            </button>
            <div className={styles.version}>Botón de Emergencias · v1.1.1</div>
          </div>
        )}

        {paso === 'plan' && (
          <div className={styles.form} style={{ padding: 0 }}>
            <ElegirPlan onElegido={() => setPaso('menu')} />
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
              <img src="/huellitas-mascota.png" alt="Huellitas en Acción" className={styles.huellitasMascota} />
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
