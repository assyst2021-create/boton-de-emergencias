import styles from './Bienvenida.module.css'
import { useLanguage } from '../i18n/LanguageContext'

export default function Bienvenida({ onContinuar }) {
  const { t } = useLanguage()

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <img src="/logo-empresa.webp" alt="" className={styles.logoEmpresa} />
        <img src="/logo.png" alt="Botón de Emergencias" className={styles.logoImg} />
        <h2>{t('comofunciona')}</h2>
        <div className={styles.pasos}>
          <div className={styles.paso}>
            <span className={styles.num}>1</span>
            <p>{t('paso1')}</p>
          </div>
          <div className={styles.paso}>
            <span className={styles.num}>2</span>
            <p>{t('paso2')}</p>
          </div>
          <div className={styles.paso}>
            <span className={styles.num}>3</span>
            <p>{t('paso3')}</p>
          </div>
        </div>
        <button className={styles.btn} onClick={onContinuar}>
          {t('comenzar')}
        </button>
      </div>
    </div>
  )
}
