import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import styles from './Historial.module.css'

const ESTADO = {
  red:    { emoji: '🔴', label: 'ATRAPADO / BAJO TIERRA', color: '#C0392B' },
  orange: { emoji: '🟠', label: 'HERIDO / NECESITO AYUDA', color: '#E67E22' },
  green:  { emoji: '🟢', label: 'ESTOY BIEN / A SALVO',   color: '#1E8449' },
}

export default function Historial() {
  const [alertas, setAlertas] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargar()
    // Actualizar en tiempo real
    const canal = supabase.channel('alertas-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, cargar)
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [])

  async function cargar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Familiares aceptados
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
        <h1>📋 Historial</h1>
        <p>Alertas de tus familiares — últimas 24 horas</p>
      </header>

      {cargando && <div className={styles.vacio}>Cargando...</div>}

      {!cargando && alertas.length === 0 && (
        <div className={styles.vacio}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📭</div>
          <p>No hay alertas recientes de tus familiares.</p>
          <p style={{ marginTop: '6px', fontSize: '0.8rem' }}>Las alertas se borran automáticamente a las 24 horas.</p>
        </div>
      )}

      <div className={styles.lista}>
        {alertas.map(a => {
          const est = ESTADO[a.status_type] || ESTADO.green
          const fecha = new Date(a.sent_at)
          const hora = fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
          const dia = fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })

          return (
            <div key={a.id} className={styles.alerta} style={{ borderLeftColor: est.color }}>
              <div className={styles.alertaTop}>
                <span style={{ fontSize: '1.5rem' }}>{est.emoji}</span>
                <div className={styles.alertaInfo}>
                  <strong>{a.users?.full_name || 'Familiar'}</strong>
                  <span style={{ color: est.color, fontWeight: 700, fontSize: '0.8rem' }}>{est.label}</span>
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
                  📍 Ver ubicación en Google Maps
                </a>
              )}
              {!a.latitude && (
                <p className={styles.sinGps}>Sin datos de ubicación GPS</p>
              )}
            </div>
          )
        })}
      </div>

      <div className={styles.pb} />
    </div>
  )
}
