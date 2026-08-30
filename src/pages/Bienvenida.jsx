import { useState, useEffect } from 'react'
import styles from './Bienvenida.module.css'
import { useLanguage } from '../i18n/LanguageContext'

export default function Bienvenida({ onContinuar }) {
  const { t } = useLanguage()
  const [paso, setPaso] = useState(0)
  const [gpsOk, setGpsOk] = useState(false)
  const [bloqueada, setBloqueada] = useState(false)
  const [pidiendo, setPidiendo] = useState(false)

  useEffect(() => {
    navigator.permissions.query({ name: 'geolocation' }).then(result => {
      if (result.state === 'granted') { setGpsOk(true); setPaso(1) }
      if (result.state === 'denied') { setBloqueada(true) }
    }).catch(() => {})
  }, [])

  async function pedirGPS() {
    setPidiendo(true)
    setBloqueada(false)
    try {
      await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      )
      setGpsOk(true)
      setTimeout(() => setPaso(1), 600)
    } catch (err) {
      if (err.code === 1) setBloqueada(true)
    }
    setPidiendo(false)
  }

  async function reVerificar() {
    const result = await navigator.permissions.query({ name: 'geolocation' })
    if (result.state === 'granted') { setGpsOk(true); setBloqueada(false); setPaso(1) }
    else { setBloqueada(true) }
  }

  return (
    <div className={styles.wrap}>
      {paso === 0 && (
        <div className={styles.card}>
          <img src="/logo-empresa.png" alt="" className={styles.logoEmpresa} />
          <div className={styles.icon}>📍</div>
          <h2>{t('permisoUbicacion')}</h2>
          <p>{t('permisoTexto')}</p>

          {!bloqueada && (
            <>
              <p className={styles.sub}>{t('gpsRequerido')}</p>
              {gpsOk && <div className={styles.ok}>{t('gpsOkMsg')}</div>}
              <button
                className={styles.btn}
                onClick={pedirGPS}
                disabled={pidiendo || gpsOk}
              >
                {pidiendo ? t('verificando') : gpsOk ? t('gpsListo') : t('activarGps')}
              </button>
            </>
          )}

          {bloqueada && (
            <div className={styles.bloqueadaBox}>
              <div className={styles.bloqueadaIcon}>🚫</div>
              <p className={styles.bloqueadaTexto}>{t('gpsBloqueadaTexto')}</p>
              <p className={styles.instruccion}>{t('gpsInstruccion')}</p>
              <button className={styles.btn} onClick={reVerificar}>
                {t('gpsYaActive')}
              </button>
            </div>
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
