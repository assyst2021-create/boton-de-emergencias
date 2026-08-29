import { NavLink } from 'react-router-dom'
import styles from './Nav.module.css'
import { useLanguage } from '../i18n/LanguageContext'

export default function Nav() {
  const { t } = useLanguage()

  const tabs = [
    { to: '/', label: t('navAlerta'), icon: '🆘' },
    { to: '/historial', label: t('navHistorial'), icon: '📋' },
    { to: '/familia', label: t('navFamilia'), icon: '👨‍👩‍👧‍👦' },
  ]

  return (
    <nav className={styles.nav}>
      {tabs.map(tab => (
        <NavLink key={tab.to} to={tab.to} end className={({ isActive }) => isActive ? `${styles.tab} ${styles.active}` : styles.tab}>
          <span className={styles.icon}>{tab.icon}</span>
          <span className={styles.label}>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
