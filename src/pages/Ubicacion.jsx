import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import styles from './Ubicacion.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { esPremium } from '../plan'

/** Cada cuanto se envia la posicion mientras se comparte. */
const INTERVALO_MS = 5000
/** La sesion se apaga sola pasado este tiempo. */
const DURACION_MIN = 120

export default function Ubicacion() {
  const { t } = useLanguage()
  const [perfil, setPerfil] = useState(null)
  const [compartiendo, setCompartiendo] = useState(false)
  const [miPos, setMiPos] = useState(null)
  const [familiares, setFamiliares] = useState([])
  const [error, setError] = useState('')

  const vigilanteRef = useRef(null)
  const envioRef = useRef(null)
  const ultimaRef = useRef(null)

  useEffect(() => {
    init()
    return () => detener(false)
  }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: p } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle()
    setPerfil(p)
    await cargarFamiliares(user.id)
    escuchar(user.id)
  }

  /** Familiares que me eligieron: son los que pueden verme y a quienes veo. */
  async function cargarFamiliares(uid) {
    const { data: links } = await supabase
      .from('family_links')
      .select('user_id, users!family_links_user_id_fkey(id, full_name, username)')
      .eq('linked_user_id', uid)
      .eq('status', 'accepted')

    const ids = (links || []).map(l => l.user_id)
    if (ids.length === 0) { setFamiliares([]); return }

    const { data: ubis } = await supabase
      .from('live_locations')
      .select('*')
      .in('user_id', ids)
      .eq('activo', true)

    const porId = Object.fromEntries((ubis || []).map(u => [u.user_id, u]))
    setFamiliares((links || []).map(l => ({
      id: l.user_id,
      nombre: l.users?.full_name || l.users?.username || '—',
      ubicacion: porId[l.user_id] || null,
    })))
  }

  /** Realtime: repinta el mapa cada vez que alguien mueve su punto. */
  function escuchar(uid) {
    const canal = supabase.channel('ubicaciones-vivo')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'live_locations' },
        () => cargarFamiliares(uid))
      .subscribe()
    return () => supabase.removeChannel(canal)
  }

  async function empezar() {
    setError('')
    if (!navigator.geolocation) { setError(t('ubiSinSoporte')); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    vigilanteRef.current = navigator.geolocation.watchPosition(
      p => {
        const pos = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          precision: p.coords.accuracy,
        }
        ultimaRef.current = pos
        setMiPos(pos)
      },
      () => setError(t('ubiPermisoDenegado')),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    )

    // Se envia cada 5 s en vez de en cada lectura: el GPS dispara muchas
    // seguidas y no hace falta castigar la base con todas.
    envioRef.current = setInterval(() => enviarPosicion(user.id), INTERVALO_MS)
    setCompartiendo(true)
    enviarPosicion(user.id)
  }

  async function enviarPosicion(uid) {
    const p = ultimaRef.current
    if (!p) return
    const vence = new Date(Date.now() + DURACION_MIN * 60 * 1000)
    await supabase.from('live_locations').upsert({
      user_id: uid,
      latitude: p.lat,
      longitude: p.lng,
      precision_m: p.precision,
      activo: true,
      updated_at: new Date().toISOString(),
      expires_at: vence.toISOString(),
    })
  }

  async function detener(avisar = true) {
    if (vigilanteRef.current != null) {
      navigator.geolocation.clearWatch(vigilanteRef.current)
      vigilanteRef.current = null
    }
    if (envioRef.current) { clearInterval(envioRef.current); envioRef.current = null }
    if (avisar) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('live_locations').update({ activo: false }).eq('user_id', user.id)
    }
    setCompartiendo(false)
  }

  const premium = esPremium(perfil)
  const enVivo = familiares.filter(f => f.ubicacion)

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1>📍 {t('ubiTitulo')}</h1>
        <p className={styles.sub}>{t('ubiSubtitulo')}</p>
      </header>

      {!premium && (
        <div className={styles.premiumBox}>
          <strong>⭐ {t('ubiPremiumTitulo')}</strong>
          <p>{t('ubiPremiumTexto')}</p>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.acciones}>
        {compartiendo ? (
          <button className={styles.btnDetener} onClick={() => detener(true)}>
            ⏹ {t('ubiDetener')}
          </button>
        ) : (
          <button className={styles.btnCompartir} onClick={empezar} disabled={!premium}>
            🛰 {t('ubiCompartir')}
          </button>
        )}
      </div>

      {compartiendo && (
        <div className={styles.enVivoAviso}>
          <span className={styles.punto} />
          {t('ubiCompartiendo')}
          {miPos && (
            <span className={styles.coords}>
              {miPos.lat.toFixed(5)}, {miPos.lng.toFixed(5)}
            </span>
          )}
        </div>
      )}

      <Mapa yo={compartiendo ? miPos : null} familiares={enVivo} t={t} />

      <section className={styles.lista}>
        <h2>{t('ubiFamiliaresEnVivo')} ({enVivo.length})</h2>
        {enVivo.length === 0 ? (
          <p className={styles.gris}>{t('ubiNadieEnVivo')}</p>
        ) : enVivo.map(f => (
          <div key={f.id} className={styles.fila}>
            <span className={styles.punto} />
            <div className={styles.filaInfo}>
              <strong>{f.nombre}</strong>
              <span className={styles.hace}>{haceCuanto(f.ubicacion.updated_at, t)}</span>
            </div>
            <a
              className={styles.verMapa}
              href={`https://maps.google.com/?q=${f.ubicacion.latitude},${f.ubicacion.longitude}`}
              target="_blank" rel="noreferrer"
            >
              {t('ubiAbrirMapa')}
            </a>
          </div>
        ))}
      </section>

      <div className={styles.pb} />
    </div>
  )
}

function haceCuanto(iso, t) {
  const seg = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seg < 10) return t('ubiAhora')
  if (seg < 60) return `${t('ubiHace')} ${seg} s`
  return `${t('ubiHace')} ${Math.floor(seg / 60)} min`
}

/**
 * Mapa con OpenStreetMap. Se dibuja con un iframe para no cargar ninguna
 * libreria de mapas ni depender de una llave de Google.
 */
function Mapa({ yo, familiares, t }) {
  const puntos = []
  if (yo) puntos.push({ lat: yo.lat, lng: yo.lng })
  familiares.forEach(f => puntos.push({ lat: f.ubicacion.latitude, lng: f.ubicacion.longitude }))

  if (puntos.length === 0) {
    return <div className={styles.mapaVacio}>🗺️<span>{t('ubiMapaVacio')}</span></div>
  }

  const lat = puntos.reduce((s, p) => s + p.lat, 0) / puntos.length
  const lng = puntos.reduce((s, p) => s + p.lng, 0) / puntos.length
  const d = 0.01
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`
  const marcadores = puntos.map(p => `${p.lat},${p.lng}`).join('&marker=')

  return (
    <div className={styles.mapa}>
      <iframe
        title="mapa"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marcadores}`}
        loading="lazy"
      />
    </div>
  )
}
