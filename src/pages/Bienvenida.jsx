import { useState, useEffect } from 'react'
import styles from './Bienvenida.module.css'
import { useLanguage } from '../i18n/LanguageContext'

export default function Bienvenida({ onContinuar }) {
  const { t } = useLanguage()
  const [paso, setPaso] = useState(0)
  const [gpsOk, setGpsOk] = useState(false)
  const [gpsError, setGpsError] = useState('')
  const [pidiendo, setPidiendo] = useState(false)

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      () => { setGpsOk(true); setPaso(1) },
      () => {},
      { timeout: 3000, maximumAge: 10000 }
    )
  }, [])

  async function pedirGPS() {
    setPidiendo(true)
    setGpsError('')
    try {
      await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      )
      setGpsOk(true)
      setTimeout(() => setPaso(1), 800)
    } catch {
      setGpsError(t('gpsErrorMsg'))
    }
    setPidiendo(false)
  }

  return (
    <div className={styles.wrap}>
      {paso === 0 && (
        <div className={styles.card}>
          <img src="/logo-empresa.png" alt="" className={styles.logoEmpresa} />
          <div className={styles.icon}>📍</div>
          <h2>{t('permisoUbicacion')}</h2>
          <p>{t('permisoTexto')}</p>
          <p className={styles.sub}>{t('sinGpsAviso')}</p>

          {gpsOk && <div className={styles.ok}>{t('gpsOkMsg')}</div>}
          {gpsError && <div className={styles.errorBox}>{gpsError}</div>}

          <button
            className={styles.btn}
            onClick={pedirGPS}
            disabled={pidiendo || gpsOk}
          >
            {pidiendo ? t('verificando') : gpsOk ? t('gpsListo') : t('activarGps')}
          </button>

          {!gpsOk && (
            <button className={styles.skip} onClick={() => setPaso(1)}>
              {t('sinGps')}
            </button>
          )}
        </div>
      )}

      {paso === 1 && (
        <div className={styles.card}>
          <img src="/logo-empresa.png" alt="" className={styles.logoEmpresa} />
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
      )}
    </div>
  )
}
