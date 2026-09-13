import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import styles from './Historial.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { useNavContext } from '../components/NavContext'

const ESTADO_COLOR = {
  red:    { emoji: '🔴', color: '#C0392B', key: 'estadoRojo' },
  orange: { emoji: '🟠', color: '#E67E22', key: 'estadoNaranja' },
  green:  { emoji: '🟢', color: '#1E8449', key: 'estadoVerde' },
}

export default function Historial() {
  const { t } = useLanguage()
  const { abrirOpciones } = useNavContext()
  const [alertas, setAlertas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [dismissedIds, setDismissedIds] = useState(new Set())
  // Cache para no volver a consultar en cada evento RT
  const familyIdsRef = useRef(new Set())
  const userIdRef = useRef(null)
  const nombresRef = useRef({})
  const telefonosRef = useRef({})

  useEffect(() => {
    let canal
    cargar().then(({ ids, nombres }) => {
      canal = supabase.channel('alertas-rt')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' },
          (payload) => {
            const a = payload.new
            if (!familyIdsRef.current.has(a.sender_id)) return
            const dismissed = JSON.parse(localStorage.getItem(`dismissed_${userIdRef.current}`) || '{}')
            if (dismissed[a.id]) return
            const enriquecida = { ...a, users: { full_name: nombresRef.current[a.sender_id] || 'Familiar', phone_number: telefonosRef.current[a.sender_id] } }
            setAlertas(prev => [enriquecida, ...prev])
          })
        .subscribe()
    })
    return () => { if (canal) supabase.removeChannel(canal) }
  }, [])

  async function cargar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return {}
    userIdRef.current = user.id

    // Cargar descartadas y limpiar las que ya superaron 24h
    const VEINTI_CUATRO_H = 24 * 60 * 60 * 1000
    const ahora = Date.now()
    const rawDismissed = JSON.parse(localStorage.getItem(`dismissed_${user.id}`) || '{}')
    const vigentes = Object.fromEntries(
      Object.entries(rawDismissed).filter(([, ts]) => ahora - ts < VEINTI_CUATRO_H)
    )
    localStorage.setItem(`dismissed_${user.id}`, JSON.stringify(vigentes))
    setDismissedIds(new Set(Object.keys(vigentes)))

    const { data: links } = await supabase
      .from('family_links')
      .select('linked_user_id, users!family_links_linked_user_id_fkey(full_name, phone_number)')
      .eq('user_id', user.id)
      .eq('status', 'accepted')

    const ids = (links || []).map(l => l.linked_user_id)
    const nombres = {}
    const telefonos = {}
    ;(links || []).forEach(l => {
      nombres[l.linked_user_id] = l.users?.full_name
      telefonos[l.linked_user_id] = l.users?.phone_number
    })
    familyIdsRef.current = new Set(ids)
    nombresRef.current = nombres
    telefonosRef.current = telefonos

    if (ids.length === 0) { setAlertas([]); setCargando(false); return { uid: user.id, ids, nombres } }

    const { data } = await supabase
      .from('alerts')
      .select('*, users!alerts_sender_id_fkey(full_name, phone_number)')
      .in('sender_id', ids)
      .gt('expires_at', new Date().toISOString())
      .order('sent_at', { ascending: false })

    setAlertas(data || [])
    setCargando(false)
    return { ids, nombres }
  }

  async function dismissAlert(id) {
    // Ocultar inmediatamente en pantalla
    setAlertas(prev => prev.filter(a => a.id !== id))
    // Guardar en localStorage con timestamp para que expire en 24h automáticamente
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      if (userIdRef.current) {
        const raw = JSON.parse(localStorage.getItem(`dismissed_${userIdRef.current}`) || '{}')
        raw[id] = Date.now()
        localStorage.setItem(`dismissed_${userIdRef.current}`, JSON.stringify(raw))
      }
      return next
    })
    // Intentar borrar de Supabase (funciona si el usuario es el sender; si no, RLS lo bloquea pero localStorage ya lo cubre)
    supabase.from('alerts').delete().eq('id', id)
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1>📋 {t('historialTitulo')}</h1>
        <button className={styles.gear} onClick={abrirOpciones} title="Opciones">⚙️</button>
      </header>

      {cargando && <div className={styles.vacio}>{t('cargando')}</div>}

      {!cargando && alertas.length === 0 && (
        <div className={styles.vacio}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📭</div>
          <p>{t('sinAlertas')}</p>
        </div>
      )}

      <div className={styles.lista}>
        {alertas.filter(a => !dismissedIds.has(a.id)).map(a => {
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
                  {a.is_auto && <span style={{ fontSize: '0.72rem', color: '#888', fontStyle: 'italic' }}>{t('alertaAutomatica')}</span>}
                </div>
                <div className={styles.alertaFecha}>
                  <span>{hora}</span>
                  <span>{dia}</span>
                </div>
                <button className={styles.btnDismiss} onClick={() => dismissAlert(a.id)} title="Eliminar">✕</button>
              </div>

              <div className={styles.alertaAcciones}>
                {a.latitude && a.longitude ? (
                  <a
                    href={`https://maps.google.com/?q=${a.latitude},${a.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.mapsBtn}
                  >
                    {t('verMapa')}
                  </a>
                ) : (
                  <span className={styles.sinUbicacion}>📍 Sin ubicación</span>
                )}
                {(a.users?.phone_number || telefonosRef.current[a.sender_id]) && (() => {
                  const tel = (a.users?.phone_number || telefonosRef.current[a.sender_id] || '').replace(/\s+/g, '')
                  return (
                    <>
                      <a href={`sms:${tel}`} className={styles.contactBtn} title="SMS">💬</a>
                      <a href={`https://wa.me/${tel.replace(/^\+/, '')}`} target="_blank" rel="noreferrer" className={styles.contactBtn} title="WhatsApp">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      </a>
                      <a href={`tel:${tel}`} className={styles.contactBtn} title="Llamar">📞</a>
                    </>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>

      <div className={styles.pb} />
    </div>
  )
}
