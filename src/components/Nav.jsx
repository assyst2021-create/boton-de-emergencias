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

  const mensajes = t('bandaMensajes')

  return (
    <div className={styles.barra}>
      <nav className={styles.nav}>
        {tabs.map(tab => (
          <NavLink key={tab.to} to={tab.to} end className={({ isActive }) => isActive ? `${styles.tab} ${styles.active}` : styles.tab}>
            <span className={styles.icon}>{tab.icon}</span>
            <span className={styles.label}>{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Va bajo el menu: ocupa la franja donde el telefono pone sus botones,
          asi el contenido de arriba sube y no queda tapado. */}
      <div className={styles.banda}>
        <div className={styles.bandaTexto}>{mensajes}{mensajes}</div>
      </div>
    </div>
  )
}
