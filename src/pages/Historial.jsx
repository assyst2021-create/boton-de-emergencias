import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import styles from './Historial.module.css'
import { useLanguage } from '../i18n/LanguageContext'

const ESTADO_COLOR = {
  red:    { emoji: '🔴', color: '#C0392B', key: 'estadoRojo' },
  orange: { emoji: '🟠', color: '#E67E22', key: 'estadoNaranja' },
  green:  { emoji: '🟢', color: '#1E8449', key: 'estadoVerde' },
}

export default function Historial() {
  const { t } = useLanguage()
  const [alertas, setAlertas] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargar()
    const canal = supabase.channel('alertas-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, cargar)
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [])

  async function cargar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: links } = await supabase
      .from('family_links')
      .select('linked_user_id')
      .eq('user_id', user.id)
      .eq('status', 'accepted')

    const ids = (links || []).map(l => l.linked_user_id)
    if (ids.length === 0) { setAlertas([]); setCargando(false); return }

    const { data } = await supabase
      .from('alerts')
      .select('*, users!alerts_sender_id_fkey(full_name)')
      .in('sender_id', ids)
      .gt('expires_at', new Date().toISOString())
      .order('sent_at', { ascending: false })

    setAlertas(data || [])
    setCargando(false)
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1>📋 {t('historialTitulo')}</h1>
      </header>

      {cargando && <div className={styles.vacio}>{t('cargando')}</div>}

      {!cargando && alertas.length === 0 && (
        <div className={styles.vacio}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📭</div>
          <p>{t('sinAlertas')}</p>
        </div>
      )}

      <div className={styles.lista}>
        {alertas.map(a => {
          const est = ESTADO_COLOR[a.status_type] || ESTADO_COLOR.green
          const fecha = new Date(a.sent_at)
          const hora = fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
          const dia = fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })

          return (
            <div key={a.id} className={styles.alerta} style={{ borderLeftColor: est.color }}>
              <div className={styles.alertaTop}>
                <span style={{ fontSize: '1.5rem' }}>{est.emoji}</span>
                <div className={styles.alertaInfo}>
                  <strong>{a.users?.full_name || 'Familiar'}</strong>
                  <span style={{ color: est.color, fontWeight: 700, fontSize: '0.8rem' }}>{t(est.key)}</span>
                </div>
                <div className={styles.alertaFecha}>
                  <span>{hora}</span>
                  <span>{dia}</span>
                </div>
              </div>

              {a.latitude && a.longitude && (
                <a
                  href={`https://maps.google.com/?q=${a.latitude},${a.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.mapsBtn}
                >
                  {t('verMapa')}
                </a>
              )}
            </div>
          )
        })}
      </div>

      <div className={styles.pb} />
    </div>
  )
}
