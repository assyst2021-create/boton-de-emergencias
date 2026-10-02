import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import styles from './ElegirPlan.module.css'
import { esPremium, esFamiliar } from '../plan'
import { useLanguage } from '../i18n/LanguageContext'
import { Billing, PRODUCTOS, EN_ANDROID, obtenerPrecios, activarCompra, sincronizarCompras, tokenSuscripcionActual } from '../billing'

// En la página web no hay pagos: los planes se compran en la app instalada desde Google Play
const URL_PLAY = 'https://play.google.com/store/apps/details?id=com.ssthechofacil.botonemergencias'
// Donde la persona ve, cambia o cancela su suscripción (Google Play)
const URL_SUSCRIPCIONES = 'https://play.google.com/store/account/subscriptions?package=com.ssthechofacil.botonemergencias'

export default function ElegirPlan({ onElegido }) {
  const { t } = useLanguage()
  const [ciclo, setCiclo] = useState('anual')
  const [precios, setPrecios] = useState({})
  const [preciosListos, setPreciosListos] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [restaurando, setRestaurando] = useState(false)
  const precio = (id) => precios[id] || null

  const PLANES = {
    gratis: {
      id: 'gratis',
      nombre: t('planGratisCorto'),
      emoji: '🆓',
      color: '#4CAF50',
      precio: { mensual: null, anual: null },
      productId: { mensual: null, anual: null },
      features: [
        { icono: '👨‍👩‍👧', texto: t('elegirGratisF1') },
        { icono: '🚨', texto: t('elegirGratisF2') },
        { icono: '🔔', texto: t('elegirGratisF3') },
        { icono: '📋', texto: t('elegirGratisF4') },
        { icono: '📍', texto: t('elegirGratisF6') },
        { icono: '📡', texto: t('elegirGratisF5') },
      ],
    },
    familiar: {
      id: 'familiar',
      nombre: t('planFamiliarCorto'),
      emoji: '👨‍👩‍👧‍👦',
      color: '#1E8449',
      precio: { mensual: precio(PRODUCTOS.familiar.mensual), anual: precio(PRODUCTOS.familiar.anual) },
      productId: PRODUCTOS.familiar,
      planTipo: 'familiar',
      features: [
        { icono: '👨‍👩‍👧‍👦', texto: t('elegirFamiliarF1') },
        { icono: '🚨', texto: t('elegirFamiliarF2') },
        { icono: '🔔', texto: t('elegirFamiliarF3') },
        { icono: '📋', texto: t('elegirFamiliarF4') },
        { icono: '📍', texto: t('elegirFamiliarF5') },
        { icono: '⚡', texto: t('elegirFamiliarF6') },
        { icono: '📡', texto: t('elegirFamiliarF7') },
      ],
    },
    premium: {
      id: 'premium',
      nombre: t('planPremiumCorto'),
      emoji: '⭐',
      color: '#e6a817',
      precio: { mensual: precio(PRODUCTOS.premium.mensual), anual: precio(PRODUCTOS.premium.anual) },
      productId: PRODUCTOS.premium,
      planTipo: 'premium',
      features: [
        { icono: '👨‍👩‍👧‍👦', texto: t('elegirPremiumF1') },
        { icono: '🚨', texto: t('elegirPremiumF2') },
        { icono: '🔔', texto: t('elegirPremiumF3') },
        { icono: '📋', texto: t('elegirPremiumF4') },
        { icono: '📍', texto: t('elegirPremiumF5') },
        { icono: '⚡', texto: t('elegirPremiumF6') },
        { icono: '📡', texto: t('elegirPremiumF7') },
        { icono: '🔒', texto: t('elegirPremiumF8') },
      ],
    },
  }
  const [seleccionado, setSeleccionado] = useState('familiar')
  const [planActual, setPlanActual] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [errorPago, setErrorPago] = useState(null)
  const [mostrarContrato, setMostrarContrato] = useState(false)

  function cargarPlanActual() {
    return supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user
      if (!user) return
      return supabase.from('users').select('plan, is_premium, premium_hasta').eq('id', user.id).maybeSingle()
        .then(({ data }) => {
          if (!data) return
          if (esPremium(data)) { setPlanActual('premium'); setSeleccionado('premium') }
          else if (esFamiliar(data)) { setPlanActual('familiar'); setSeleccionado('familiar') }
          else setPlanActual('gratis')
        })
    })
  }

  useEffect(() => {
    cargarPlanActual()
    obtenerPrecios().then(p => { setPrecios(p); setPreciosListos(true) })
  }, [])

  async function restaurar() {
    setRestaurando(true)
    setErrorPago(null)
    setAviso(null)
    const res = await sincronizarCompras(supabase)
    await cargarPlanActual()
    setAviso(res.some(r => r?.ok) ? t('billingRestaurado') : t('billingSinCompras'))
    setRestaurando(false)
  }

  async function elegirGratis() {
    // Un plan pago no se baja desde aquí: se cancela en Google Play y vence en su fecha
    if (planActual === 'premium' || planActual === 'familiar') { onElegido(); return }
    setCargando(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (user) await supabase.from('users').update({ plan: 'basico' }).eq('id', user.id)
    setCargando(false)
    onElegido()
  }

  async function iniciarPago() {
    setMostrarContrato(false)
    setCargando(true)
    setErrorPago(null)
    setAviso(null)
    const plan = PLANES[seleccionado]
    const productId = plan.productId[ciclo]
    try {
      // Si ya paga otro plan o ciclo, el nuevo lo reemplaza (Google abona lo que no usó)
      const tokenAnterior = await tokenSuscripcionActual(productId)
      const resultado = await Billing.iniciarSuscripcion({ productId, ...(tokenAnterior ? { tokenAnterior } : {}) })
      if (resultado.error === 'cancelado') return
      // Ya pagó antes con esta cuenta de Google: se reactiva sin cobrar de nuevo
      if (resultado.error === 'ya_tiene') { await restaurar(); return }
      if (resultado.error) throw new Error(resultado.error)
      // Pago en efectivo o pendiente: Google avisa cuando se confirme
      if (resultado.pendiente) { setAviso(t('billingPendiente')); return }

      // El pago ya está hecho: si la activación falla se reintenta, y nunca se dice que el pago falló
      let activado = false
      for (let intento = 0; intento < 4 && !activado; intento++) {
        if (intento) await new Promise(r => setTimeout(r, 3000 * intento))
        try { await activarCompra(supabase, resultado.token); activado = true } catch (_) {}
      }
      if (!activado) { setAviso(t('billingPagoRecibido')); return }
      setPlanActual(seleccionado)
      onElegido()
    } catch (_) {
      setErrorPago(t('billingError'))
    } finally {
      setCargando(false)
    }
  }

  const planActivo = PLANES[seleccionado]
  const esGratisSeleccionado = seleccionado === 'gratis'
  const yaActivo = planActual === seleccionado || (seleccionado === 'gratis' && planActual === 'basico')

  return (
    <div className={styles.wrap}>

      {/* Header */}
      <div className={styles.top}>
        <h1 className={styles.titulo}>{t('elegirTitulo')}</h1>
        <p className={styles.sub}>{t('elegirSub')}</p>
      </div>

      {/* Toggle mensual / anual */}
      <div className={styles.toggleWrap}>
        <button
          className={ciclo === 'mensual' ? styles.toggleActivo : styles.toggleOpcio}
          onClick={() => setCiclo('mensual')}
        >{t('elegirMensual')}</button>
        <button
          className={ciclo === 'anual' ? styles.toggleActivo : styles.toggleOpcio}
          onClick={() => setCiclo('anual')}
        >
          {t('elegirAnual')}
          <span className={styles.ahorroChip}>{t('elegirAhorra')}</span>
        </button>
      </div>

      {/* 3 tarjetas */}
      <div className={styles.cardsRow}>
        {Object.values(PLANES).map(plan => {
          const activo = plan.id === seleccionado
          const esMiPlan = planActual === plan.id || (plan.id === 'gratis' && planActual === 'basico')
          return (
            <button
              key={plan.id}
              className={`${styles.planCard} ${activo ? styles.planCardActivo : ''}`}
              style={activo ? { borderColor: plan.color, boxShadow: `0 0 0 2px ${plan.color}33` } : {}}
              onClick={() => setSeleccionado(plan.id)}
            >
              <span className={styles.planEmoji}>{plan.emoji}</span>
              <span className={styles.planCardNombre} style={activo ? { color: plan.color } : {}}>
                {plan.nombre}
              </span>
              {plan.id === 'gratis' ? (
                <span className={styles.planCardGratis}>{t('elegirGratisLabel')}</span>
              ) : (
                <span className={styles.planCardPrecio}>{plan.precio[ciclo] || (preciosListos ? t('elegirPrecioEnPlay') : '…')}</span>
              )}
              {esMiPlan && <span className={styles.miPlanDot} style={{ background: plan.color }} />}
            </button>
          )
        })}
      </div>

      {/* Panel de features del plan seleccionado */}
      <div className={styles.featuresPanel} style={{ borderColor: `${planActivo.color}55` }}>
        <div className={styles.featuresPanelHeader}>
          <span className={styles.featuresPlanNombre} style={{ color: planActivo.color }}>
            {planActivo.emoji} {planActivo.nombre}
          </span>
          {planActivo.precio[ciclo] && (
            <span className={styles.featuresPrecio}>{planActivo.precio[ciclo]}/{ciclo === 'mensual' ? t('elegirMes') : t('elegirAnio')}</span>
          )}
        </div>
        <ul className={styles.featuresList}>
          {planActivo.features.map((f, i) => (
            <li key={i} className={styles.featuresItem}>
              <span className={styles.featuresIcono}>{f.icono}</span>
              <span>{f.texto}</span>
            </li>
          ))}
        </ul>
      </div>

      {errorPago && <p className={styles.error}>{errorPago}</p>}
      {aviso && <p className={styles.ctaSub} style={{ color: 'var(--text)', fontWeight: 600 }}>{aviso}</p>}
      {aviso && !EN_ANDROID && (
        <a href={URL_PLAY} target="_blank" rel="noopener noreferrer" className={styles.ctaSub}
          style={{ display: 'block', textAlign: 'center', color: '#1E8449', fontWeight: 800, textDecoration: 'underline' }}>
          {t('billingIrPlay')}
        </a>
      )}

      {/* CTA */}
      <div className={styles.ctaWrap}>
        {esGratisSeleccionado ? (
          yaActivo ? (
            <button className={styles.ctaBtnGratis} onClick={onElegido}>
              {t('elegirActivoGratis')}
            </button>
          ) : (
            <button className={styles.ctaBtnGratis} onClick={elegirGratis} disabled={cargando}>
              {cargando ? t('planGuardando') : t('elegirContinuarGratis')}
            </button>
          )
        ) : yaActivo ? (
          <button className={styles.ctaBtnActivo} onClick={onElegido}>
            {t('elegirYaActivoPre')} {planActivo.nombre} {t('elegirYaActivoSuf')}
          </button>
        ) : (
          <button className={styles.ctaBtn} onClick={() => EN_ANDROID ? setMostrarContrato(true) : setAviso(t('billingSoloApp'))} disabled={cargando}
            style={{ background: `linear-gradient(135deg, ${planActivo.color}, ${planActivo.color}cc)` }}>
            {cargando ? t('procesando') : `${t('elegirActivarPlan')} ${planActivo.nombre} ${ciclo === 'mensual' ? t('elegirMensual') : t('elegirAnual')}`}
          </button>
        )}
        <p className={styles.ctaSub}>{t('elegirSinCompromisos')}</p>
        {EN_ANDROID && (planActual === 'premium' || planActual === 'familiar') && (
          <a href={URL_SUSCRIPCIONES} target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', textAlign: 'center', color: 'var(--text2)', textDecoration: 'underline', fontSize: '0.82rem', padding: 8 }}>
            {t('billingGestionar')}
          </a>
        )}
        {EN_ANDROID && (
          <button
            onClick={restaurar}
            disabled={restaurando || cargando}
            style={{ background: 'none', border: 'none', color: 'var(--text2)', textDecoration: 'underline', fontSize: '0.82rem', padding: 8, cursor: 'pointer' }}
          >
            {restaurando ? t('procesando') : t('billingRestaurar')}
          </button>
        )}
      </div>

      {/* Modal contrato */}
      {mostrarContrato && (
        <div className={styles.overlay} onClick={() => setMostrarContrato(false)}>
          <div className={styles.contratoCard} onClick={e => e.stopPropagation()}>
            <h3 className={styles.contratoTitulo}>{t('elegirContratoTitulo')}</h3>
            <p className={styles.contratoMeta}>
              <strong>{t('elegirProveedor')}</strong> {t('elegirContratoProveedor')}<br />
              <strong>{t('elegirContratoPlan')}</strong> {planActivo.nombre}{planActivo.precio[ciclo] ? ` — ${planActivo.precio[ciclo]}/${ciclo === 'mensual' ? t('elegirMes') : t('elegirAnio')}` : ''}
            </p>
            <p className={styles.contratoTexto}>{ciclo === 'mensual' ? t('elegirContratoRenuevaM') : t('elegirContratoRenuevaA')}</p>
            {(planActual === 'premium' || planActual === 'familiar') && (
              <p className={styles.contratoTexto}>{t('elegirCambioPlan')}</p>
            )}
            <p className={styles.contratoTexto}>{t('elegirContratoCancela')}</p>
            <p className={styles.contratoFirma}>{t('elegirContratoFirma')}</p>
            <button className={styles.btnAceptar} style={{ background: planActivo.color }} onClick={iniciarPago}>
              {t('elegirContratoAceptar')}
            </button>
            <button className={styles.btnCancelar} onClick={() => setMostrarContrato(false)}>{t('cancelar')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
