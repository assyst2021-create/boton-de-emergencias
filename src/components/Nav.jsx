import { NavLink } from 'react-router-dom'
import styles from './Nav.module.css'

const tabs = [
  { to: '/', label: 'Alerta', icon: '🆘' },
  { to: '/historial', label: 'Historial', icon: '📋' },
  { to: '/familia', label: 'Familia', icon: '👨‍👩‍👧‍👦' },
]

export default function Nav() {
  return (
    <nav className={styles.nav}>
      {tabs.map(t => (
        <NavLink key={t.to} to={t.to} end className={({ isActive }) => isActive ? `${styles.tab} ${styles.active}` : styles.tab}>
          <span className={styles.icon}>{t.icon}</span>
          <span className={styles.label}>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
