import styles from './Disclaimer.module.css'
import cStyles from './ContratoServicio.module.css'
import { useLanguage } from '../i18n/LanguageContext'

export default function ContratoServicio({ onAceptar, soloVer = false }) {
  const { t } = useLanguage()

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll}>
        <img src="/logo-empresa.png" alt="" className={styles.logoEmpresa} />
        <div className={styles.emoji}>📄</div>
        <h1 className={styles.titulo}>{t('contratoTitulo')}</h1>
        <p className={styles.subtitulo}>{t('contratoSubtitulo')}</p>

        <div className={styles.caja}>
          {/* Intro */}
          <p className={styles.parrafo}>
            <strong>{t('contratoProveedor')}</strong><br />
            <strong>{t('contratoServicioLabel')}</strong>
          </p>
          <hr className={styles.divider} />

          {/* Plan básico */}
          <div className={cStyles.planBloque}>
            <p className={cStyles.planNombre}>🎁 {t('contratoBasicoNombre')}</p>
            <p className={styles.parrafo}>🔹 {t('contratoBasicoF1')}</p>
            <p className={styles.parrafo}>🔹 {t('contratoBasicoF2')}</p>
            <p className={styles.parrafo}>🔹 {t('contratoBasicoF3')}</p>
            <p className={styles.parrafo}>🔹 {t('contratoBasicoF4')}</p>
          </div>
          <hr className={styles.divider} />

          {/* Plan premium */}
          <div className={cStyles.planBloque}>
            <p className={cStyles.planNombrePremium}>👑 {t('contratoPremiumNombre')}</p>
            <p className={styles.parrafo}>🔹 {t('contratoPremiumF1')}</p>
            <p className={styles.parrafo}>🔹 {t('contratoPremiumF2')}</p>
            <p className={styles.parrafo}>🔹 {t('contratoPremiumF3')}</p>
            <p className={styles.parrafo}>🔹 {t('contratoPremiumF4')}</p>
            <p className={styles.parrafo}>🔹 {t('contratoPremiumF5')}</p>
          </div>
          <hr className={styles.divider} />

          {/* Cláusulas */}
          <p className={styles.parrafo}>{t('contratoC1')}</p>
          <p className={styles.parrafo}>{t('contratoC2')}</p>
          <p className={styles.parrafo}>{t('contratoC3')}</p>
          <hr className={styles.divider} />
          <p className={styles.aclaracion}>{t('contratoAclaracion')}</p>
        </div>

        {!soloVer && (
          <button className={styles.btn} onClick={onAceptar}>
            {t('contratoLeido')}
          </button>
        )}
      </div>
    </div>
  )
}
