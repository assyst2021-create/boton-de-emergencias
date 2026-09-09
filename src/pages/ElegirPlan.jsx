import { useState } from 'react'
import { supabase } from '../supabase'
import styles from './ElegirPlan.module.css'
import { useLanguage } from '../i18n/LanguageContext'

const WOMPI_LINK = import.meta.env.VITE_WOMPI_LINK || '#'

export default function ElegirPlan({ onElegido }) {
  const { t } = useLanguage()
  const [cargando, setCargando] = useState(false)
  const [mostrarContrato, setMostrarContrato] = useState(false)

  async function elegirTrial() {
    setCargando(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('users').update({ plan: 'trial' }).eq('id', user.id)
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
        <div className={styles.icono}>🆘</div>
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
          </ul>
          <button className={styles.btnTrial} onClick={elegirTrial} disabled={cargando}>
            {cargando ? t('planGuardando') : t('planEmpezarGratis')}
          </button>
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
          </ul>
          <button className={styles.btnPremium} onClick={elegirPremium}>
            {t('planActivarPremium')}
          </button>
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
