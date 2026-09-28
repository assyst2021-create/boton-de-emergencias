import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import styles from './Nav.module.css'
import { useLanguage } from '../i18n/LanguageContext'

export default function Nav() {
  const { t } = useLanguage()
  const barraRef = useRef(null)

  // Publica la altura real de la barra inferior para que las páginas dejen justo ese espacio
  useEffect(() => {
    const el = barraRef.current
    if (!el) return
    const publicar = () => document.documentElement.style.setProperty('--barra-alto', `${el.offsetHeight}px`)
    publicar()
    const ro = new ResizeObserver(publicar)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const tabs = [
    { to: '/', label: t('navAlerta'), icon: '🆘' },
    { to: '/historial', label: t('navHistorial'), icon: '📋' },
    { to: '/familia', label: t('navFamilia'), icon: '👨‍👩‍👧‍👦' },
    { to: '/ubicacion', label: t('navUbicacion'), icon: '📍' },
  ]

  const mensajes = t('bandaMensajes')

  return (
    <>
      <div className={styles.topBanda}>
        <div className={styles.topBandaTexto}>{mensajes}{mensajes}</div>
      </div>
      <div className={styles.barra} ref={barraRef}>
        <nav className={styles.nav}>
          {tabs.map(tab => (
            <NavLink key={tab.to} to={tab.to} end className={({ isActive }) => isActive ? `${styles.tab} ${styles.active}` : styles.tab}>
              <span className={styles.icon}>{tab.icon}</span>
              <span className={styles.label}>{tab.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.banda}>
          <div className={styles.bandaTexto}>{mensajes}{mensajes}</div>
        </div>
      </div>
    </>
  )
}
