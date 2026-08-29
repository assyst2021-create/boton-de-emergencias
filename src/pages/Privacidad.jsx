import styles from './Disclaimer.module.css'
import pStyles from './Privacidad.module.css'
import { useLanguage } from '../i18n/LanguageContext'

export default function Privacidad({ onAceptar, soloVer = false }) {
  const { t } = useLanguage()

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll}>
        <img src="/logo-empresa.png" alt="" className={styles.logoEmpresa} />
        <div className={styles.emoji}>🔒</div>
        <h1 className={styles.titulo}>{t('privTitulo')}</h1>
        <p className={styles.subtitulo}>{t('privSubtitulo')}</p>

        <div className={styles.caja}>
          <div className={pStyles.seccion}>
            <p className={pStyles.titulo2}>{t('privS1Titulo')}</p>
            <p className={styles.parrafo}>{t('privS1Texto')}</p>
          </div>
          <hr className={styles.divider} />
          <div className={pStyles.seccion}>
            <p className={pStyles.titulo2}>{t('privS2Titulo')}</p>
            <p className={styles.parrafo}>
              🔹 {t('privS2P1')}<br />
              🔹 {t('privS2P2')}<br />
              🔹 {t('privS2P3')}
            </p>
          </div>
          <hr className={styles.divider} />
          <div className={pStyles.seccion}>
            <p className={pStyles.titulo2}>{t('privS3Titulo')}</p>
            <p className={styles.parrafo}>{t('privS3Texto')}</p>
          </div>
          <hr className={styles.divider} />
          <div className={pStyles.seccion}>
            <p className={pStyles.titulo2}>{t('privS4Titulo')}</p>
            <p className={styles.parrafo}>{t('privS4Texto')}</p>
          </div>
          <hr className={styles.divider} />
          <div className={pStyles.seccion}>
            <p className={pStyles.titulo2}>{t('privS5Titulo')}</p>
            <p className={styles.parrafo}>{t('privS5Texto')}</p>
          </div>
          <hr className={styles.divider} />
          <div className={pStyles.seccion}>
            <p className={pStyles.titulo2}>{t('privS6Titulo')}</p>
            <p className={styles.parrafo}>{t('privS6Texto')}</p>
          </div>
        </div>

        {soloVer ? null : (
          <button className={styles.btn} onClick={onAceptar}>
            {t('privAceptar')}
          </button>
        )}
      </div>
    </div>
  )
}
