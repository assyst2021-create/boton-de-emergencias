import { useLanguage } from '../i18n/LanguageContext'
import styles from './Disclaimer.module.css'

export default function Disclaimer({ onAceptar }) {
  const { t } = useLanguage()

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll}>
        <img src="/logo-empresa.png" alt="" className={styles.logoEmpresa} />
        <div className={styles.emoji}>⚠️</div>
        <h1 className={styles.titulo}>{t('avisoTitulo')}</h1>
        <p className={styles.subtitulo}>{t('avisoSubtitulo')}</p>

        <div className={styles.caja}>
          <p className={styles.parrafo}>
            <strong>Botón de Emergencias</strong>{t('avisoP1')}
          </p>
          <hr className={styles.divider} />
          <p className={styles.parrafo}>🔹 {t('avisoP2')}</p>
          <p className={styles.parrafo}>🔹 {t('avisoP3')}</p>
          <p className={styles.parrafo}>🔹 {t('avisoP4')}</p>
          <p className={styles.parrafo}>🔹 {t('avisoP5')}</p>
          <hr className={styles.divider} />
          <p className={styles.aclaracion}>{t('avisoAclaracion')}</p>
        </div>

        <button className={styles.btn} onClick={onAceptar}>
          {t('estoyDeAcuerdo')}
        </button>
      </div>
    </div>
  )
}
