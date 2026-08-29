import { useState } from 'react'
import styles from './Bienvenida.module.css'

export default function Bienvenida({ onContinuar }) {
  const [paso, setPaso] = useState(0)
  const [gpsOk, setGpsOk] = useState(false)
  const [gpsError, setGpsError] = useState('')
  const [pidiendo, setPidiendo] = useState(false)

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
      setGpsError('No se pudo obtener la ubicación. Activa el GPS en tu celular y vuelve a intentarlo.')
    }
    setPidiendo(false)
  }

  return (
    <div className={styles.wrap}>
      {paso === 0 && (
        <div className={styles.card}>
          <div className={styles.icon}>📍</div>
          <h2>Activa tu ubicación GPS</h2>
          <p>
            Esta app necesita tu ubicación GPS para enviar tu posición exacta a tu familia en caso de emergencia.
          </p>
          <p className={styles.sub}>
            Sin GPS activado, tus familiares no podrán encontrarte.
          </p>

          {gpsOk && (
            <div className={styles.ok}>✅ Ubicación activada correctamente</div>
          )}
          {gpsError && (
            <div className={styles.errorBox}>{gpsError}</div>
          )}

          <button
            className={styles.btn}
            onClick={pedirGPS}
            disabled={pidiendo || gpsOk}
          >
            {pidiendo ? 'Verificando...' : gpsOk ? 'Listo' : 'Activar ubicación'}
          </button>

          {!gpsOk && (
            <button className={styles.skip} onClick={() => setPaso(1)}>
              Continuar sin GPS (no recomendado)
            </button>
          )}
        </div>
      )}

      {paso === 1 && (
        <div className={styles.card}>
          <div className={styles.icon}>🆘</div>
          <h2>¿Cómo funciona?</h2>
          <div className={styles.pasos}>
            <div className={styles.paso}>
              <span className={styles.num}>1</span>
              <p>Presiona el botón según tu situación: <strong>Atrapado</strong>, <strong>Herido</strong> o <strong>Estoy bien</strong>.</p>
            </div>
            <div className={styles.paso}>
              <span className={styles.num}>2</span>
              <p>La app envía tu <strong>ubicación GPS</strong> y estado a tus familiares vinculados.</p>
            </div>
            <div className={styles.paso}>
              <span className={styles.num}>3</span>
              <p>Si no hay internet, también abre tu app de <strong>mensajes SMS</strong> para enviar la alerta.</p>
            </div>
          </div>
          <button className={styles.btn} onClick={onContinuar}>
            Entendido, ingresar
          </button>
        </div>
      )}
    </div>
  )
}
