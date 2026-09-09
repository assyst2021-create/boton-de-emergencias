import { useState } from 'react'
import { supabase } from '../supabase'
import styles from './ElegirPlan.module.css'

const WOMPI_LINK = import.meta.env.VITE_WOMPI_LINK || '#'

export default function ElegirPlan({ onElegido }) {
  const [cargando, setCargando] = useState(false)

  async function elegirTrial() {
    setCargando(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('users').update({ plan: 'trial' }).eq('id', user.id)
    setCargando(false)
    onElegido()
  }

  function elegirPremium() {
    onElegido()
    window.open(WOMPI_LINK, '_blank')
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div className={styles.icono}>🆘</div>
        <h1 className={styles.titulo}>Elige tu plan</h1>
        <p className={styles.sub}>Protege a tu familia desde hoy</p>
      </div>

      <div className={styles.planes}>
        <div className={styles.cardTrial}>
          <span className={styles.badgeTrial}>Gratis</span>
          <h2 className={styles.planNombre}>Plan de Prueba</h2>
          <ul className={styles.lista}>
            <li>1 familiar vinculado</li>
            <li>2 envíos de alerta</li>
            <li>2 sesiones de ubicación en vivo</li>
            <li>Historial 24 h + borrado manual</li>
          </ul>
          <button className={styles.btnTrial} onClick={elegirTrial} disabled={cargando}>
            {cargando ? 'Guardando...' : 'Empezar gratis'}
          </button>
        </div>

        <div className={styles.cardPremium}>
          <span className={styles.badgePremium}>$49.000 COP · Pago único</span>
          <h2 className={styles.planNombre}>Plan Premium ⭐</h2>
          <p className={styles.permanente}>Para siempre · Sin mensualidades</p>
          <ul className={styles.lista}>
            <li>10 familiares vinculados</li>
            <li>Alertas ilimitadas</li>
            <li>Ubicación en vivo ilimitada</li>
            <li>Historial 24 h + borrado manual</li>
          </ul>
          <button className={styles.btnPremium} onClick={elegirPremium}>
            Activar Premium
          </button>
        </div>
      </div>
    </div>
  )
}
