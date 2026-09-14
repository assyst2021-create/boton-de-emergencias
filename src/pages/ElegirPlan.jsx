import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import styles from './ElegirPlan.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { esPremium } from '../plan'

const WOMPI_LINK = import.meta.env.VITE_WOMPI_LINK || '#'

export default function ElegirPlan({ onElegido }) {
  const { t } = useLanguage()
  const [cargando, setCargando] = useState(false)
  const [mostrarContrato, setMostrarContrato] = useState(false)
  const [planActual, setPlanActual] = useState(null) // 'basico' | 'premium' | null

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user
      if (!user) return
      supabase.from('users').select('plan, is_premium, premium_hasta').eq('id', user.id).maybeSingle()
        .then(({ data }) => {
          if (!data) return
          if (esPremium(data)) setPlanActual('premium')
          else setPlanActual('basico')
        })
    })
  }, [])

  async function elegirBasico() {
    setCargando(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (user) await supabase.from('users').update({ plan: 'basico' }).eq('id', user.id)
    setCargando(false)
    onElegido()
  }

  function elegirPremium() {
    setMostrarContrato(true)
  }

  function aceptarContrato() {
    setMostrarContrato(false)
    onElegido()
    window.open(WOMPI_LINK, '_blank')
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <img src="/logo.png" alt="Botón de Emergencias" className={styles.logoImg} />
        <h1 className={styles.titulo}>{t('planTitulo')}</h1>
        <p className={styles.sub}>{t('planSub')}</p>
      </div>

      <div className={styles.planes}>
        <div className={styles.cardTrial}>
          <span className={styles.badgeTrial}>{t('planTrialGratis')}</span>
          <h2 className={styles.planNombre}>{t('planTrialNombre')}</h2>
          <ul className={styles.lista}>
            <li>{t('planTrialF1')}</li>
            <li>{t('planTrialF2')}</li>
            <li>{t('planTrialF3')}</li>
            <li>{t('planTrialF4')}</li>
            <li>{t('planTrialF5')}</li>
          </ul>
          {(planActual === 'basico' || planActual === 'premium') ? (
            <div className={styles.planActualLabel}>✓ {t('planActivo')}</div>
          ) : (
            <button className={styles.btnTrial} onClick={elegirBasico} disabled={cargando}>
              {cargando ? t('planGuardando') : t('planActivar')}
            </button>
          )}
        </div>

        <div className={styles.cardPremium}>
          <span className={styles.badgePremium}>{t('planPremiumBadge')}</span>
          <h2 className={styles.planNombre}>{t('planPremiumNombre')}</h2>
          <p className={styles.permanente}>{t('planPermanente')}</p>
          <ul className={styles.lista}>
            <li>{t('planPremiumF1')}</li>
            <li>{t('planPremiumF2')}</li>
            <li>{t('planPremiumF3')}</li>
            <li>{t('planPremiumF4')}</li>
            <li>{t('planPremiumF5')}</li>
            <li>{t('planPremiumF6')}</li>
            <li>{t('planPremiumF7')}</li>
          </ul>
          {planActual === 'premium' ? (
            <div className={styles.planActualLabel}>✓ {t('planActivo')}</div>
          ) : (
            <button className={styles.btnPremium} onClick={elegirPremium}>
              {t('planActivar')}
            </button>
          )}
        </div>
      </div>

      {mostrarContrato && (
        <div className={styles.contratoOverlay} onClick={() => setMostrarContrato(false)}>
          <div className={styles.contratoCard} onClick={e => e.stopPropagation()}>
            <h3 className={styles.contratoTitulo}>{t('contratoTitulo')}</h3>
            <p className={styles.contratoMeta}>
              <strong>{t('contratoProveedor')}</strong><br />
              <strong>{t('contratoServicioLabel')}</strong>
            </p>
            <p className={styles.contratoTexto}>{t('contratoS1')}</p>
            <p className={styles.contratoTexto}>{t('contratoS2')}</p>
            <p className={styles.contratoTexto}>{t('contratoS3')}</p>
            <p className={styles.contratoTexto}>{t('contratoS4')}</p>
            <p className={styles.contratoFirma}>{t('contratoS5')}</p>
            <button className={styles.btnAceptar} onClick={aceptarContrato}>
              {t('contratoAceptar')}
            </button>
            <button className={styles.btnCancelar} onClick={() => setMostrarContrato(false)}>
              {t('cancelar')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
