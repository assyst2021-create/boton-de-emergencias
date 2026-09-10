import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../supabase'
import styles from './Ubicacion.module.css'
import { useLanguage } from '../i18n/LanguageContext'
import { esPremium, puedeUbicacionEnVivo, UBICACIONES_TRIAL } from '../plan'

/** Cada cuanto se envia la posicion mientras se comparte. */
const INTERVALO_MS = 5000

/**
 * Margen de vida de la sesion. No es un limite duro: cada envio lo empuja
 * hacia adelante, asi que mientras se este compartiendo nunca vence. Solo
 * sirve para que una sesion abandonada no quede activa para siempre.
 */
const DURACION_MIN = 720

export default function Ubicacion() {
  const { t } = useLanguage()
  const [perfil, setPerfil] = useState(null)
  // Persiste en sessionStorage para que al volver de otra pestaña el botón
  // muestre "Deja de compartir" de inmediato, sin parpadear a "Compartir"
  // mientras init() comprueba la DB en segundo plano.
  const [compartiendo, setCompartiendoRaw] = useState(() => sessionStorage.getItem('ubi_sharing') === '1')
  const setCompartiendo = (v) => { sessionStorage.setItem('ubi_sharing', v ? '1' : '0'); setCompartiendoRaw(v) }
  const [miPos, setMiPos] = useState(null)
  const [familiares, setFamiliares] = useState([])
  const [error, setError] = useState('')
  const [enfocado, setEnfocado] = useState(null)
  const [mostrarUpgrade, setMostrarUpgrade] = useState(false)

  const vigilanteRef = useRef(null)
  const envioRef = useRef(null)
  const ultimaRef = useRef(null)
  const canalRef = useRef(null)

  useEffect(() => {
    init()
    return () => {
      // Al desmontar solo se sueltan los temporizadores: NO se marca como
      // inactiva. Cambiar de pestana o recargar no debe cortar el
      // seguimiento; solo lo corta el boton de detener.
      soltarTemporizadores()
      // El canal si hay que cerrarlo, o se acumula uno por cada visita.
      if (canalRef.current) {
        supabase.removeChannel(canalRef.current)
        canalRef.current = null
      }
    }
  }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: p } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle()
    setPerfil(p)
    await cargarFamiliares(user.id)
    escuchar(user.id)

    // Al recargar la pagina se pierde el temporizador, pero la fila sigue
    // marcada como activa. Si no se reanuda, la familia veria un punto
    // congelado creyendo que es tu posicion actual.
    const { data: mia } = await supabase
      .from('live_locations').select('activo, expires_at')
      .eq('user_id', user.id).maybeSingle()

    if (mia?.activo && new Date(mia.expires_at) > new Date()) {
      empezar(false)
    } else {
      // La sesión no estaba activa: aseguramos que el estado local lo refleje
      setCompartiendo(false)
    }
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
    if (canalRef.current) return
    canalRef.current = supabase.channel('ubicaciones-vivo')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'live_locations' },
        () => cargarFamiliares(uid))
      .subscribe()
  }

  async function empezar(manual = true) {
    setError('')
    if (!navigator.geolocation) { setError(t('ubiSinSoporte')); return }
    // Sin esta guarda, reanudar al entrar y pulsar el boton dejaria dos
    // vigilantes y dos temporizadores corriendo a la vez, y el primero
    // quedaria imposible de detener.
    if (vigilanteRef.current != null || envioRef.current) return

    if (manual && !puedeUbicacionEnVivo(perfil)) { setMostrarUpgrade(true); return }

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

    if (manual && !esPremium(perfil)) {
      try {
        const nuevas = (perfil?.ubicaciones_usadas ?? 0) + 1
        await supabase.from('users').update({ ubicaciones_usadas: nuevas }).eq('id', user.id)
        setPerfil(p => p ? { ...p, ubicaciones_usadas: nuevas } : p)
      } catch (e) {
        console.warn('[ubicacion] no se pudo contar:', e?.message || e)
      }
    }
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

  function soltarTemporizadores() {
    if (vigilanteRef.current != null) {
      navigator.geolocation.clearWatch(vigilanteRef.current)
      vigilanteRef.current = null
    }
    if (envioRef.current) { clearInterval(envioRef.current); envioRef.current = null }
  }

  /** Corta el seguimiento de verdad. Solo lo llama el boton de detener. */
  async function detener() {
    soltarTemporizadores()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('live_locations').update({ activo: false }).eq('user_id', user.id)
    setCompartiendo(false)
  }

  const premium = esPremium(perfil)
  const ubicUsadas = perfil?.ubicaciones_usadas ?? 0
  const enVivo = familiares.filter(f => f.ubicacion)

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1>📍 {t('ubiTitulo')}</h1>
        <p className={styles.sub}>{t('ubiSubtitulo')}</p>
      </header>

      {!premium && (
        <div className={styles.premiumBox}>
          <strong>🛰 Sesiones de prueba: {ubicUsadas} / {UBICACIONES_TRIAL}</strong>
          {ubicUsadas >= UBICACIONES_TRIAL && (
            <p style={{ marginTop: 4 }}>Has agotado tus sesiones de prueba.</p>
          )}
        </div>
      )}

      {mostrarUpgrade && (
        <div className={styles.upgradeOverlay} onClick={() => setMostrarUpgrade(false)}>
          <div className={styles.upgradeCard} onClick={e => e.stopPropagation()}>
            <div className={styles.upgradeIcono}>⭐</div>
            <h3>Periodo de prueba agotado</h3>
            <p>Activa el Plan Premium por $49.000 COP y protege a tu familia para siempre.</p>
            <a
              className={styles.upgradeBtn}
              href={import.meta.env.VITE_WOMPI_LINK || '#'}
              target="_blank" rel="noreferrer"
            >
              Activar Premium
            </a>
            <button className={styles.upgradeCerrar} onClick={() => setMostrarUpgrade(false)}>
              {t('cerrar')}
            </button>
          </div>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.acciones}>
        {compartiendo ? (
          <button className={styles.btnDetener} onClick={() => detener()}>
            ⏹ {t('ubiDetener')}
          </button>
        ) : (
          <button className={styles.btnCompartir} onClick={() => empezar(true)}>
            🛰 {t('ubiCompartir')}
          </button>
        )}
      </div>


      <Mapa
        yo={compartiendo ? miPos : null}
        familiares={enVivo}
        enfocado={enVivo.find(f => f.id === enfocado) || null}
        t={t}
      />

      <section className={styles.lista}>
        <h2>{t('ubiFamiliaresEnVivo')} ({enVivo.length})</h2>
        {enVivo.length === 0 ? (
          <p className={styles.gris}>{t('ubiNadieEnVivo')}</p>
        ) : enVivo.map(f => {
          // Mas de un minuto sin moverse: puede que ya no este transmitiendo.
          const viejo = Date.now() - new Date(f.ubicacion.updated_at).getTime() > 60000
          return (
          <div key={f.id} className={styles.fila}>
            <span className={viejo ? styles.puntoViejo : styles.punto} />
            <div className={styles.filaInfo}>
              <strong>{f.nombre}</strong>
              <span className={viejo ? styles.haceViejo : styles.hace}>
                {viejo ? `⚠️ ${t('ubiDesactualizado')} · ` : ''}{haceCuanto(f.ubicacion.updated_at, t)}
              </span>
            </div>
            <div className={styles.filaAcciones}>
              {/* Centra el mapa de arriba en vez de sacarte de la app */}
              <button
                className={enfocado === f.id ? styles.verMapaActivo : styles.verMapa}
                onClick={() => setEnfocado(enfocado === f.id ? null : f.id)}
              >
                {enfocado === f.id ? `✓ ${t('ubiEnMapa')}` : t('ubiAbrirMapa')}
              </button>
              {/* Solo para quien necesite la ruta para llegar */}
              <a
                className={styles.comoLlegar}
                href={`https://maps.google.com/?q=${f.ubicacion.latitude},${f.ubicacion.longitude}`}
                target="_blank" rel="noreferrer"
                title={t('ubiComoLlegar')}
              >
                ↗
              </a>
            </div>
          </div>
          )
        })}
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

function Mapa({ yo, familiares, enfocado, t }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const yoMarkerRef = useRef(null)
  const famMarkersRef = useRef({})
  const fittedRef = useRef(false)

  const hayPuntos = yo || familiares.some(f => f.ubicacion)

  // CSS personalizado de marcadores (una sola vez)
  useEffect(() => {
    if (document.getElementById('lf-mapa-styles')) return
    const s = document.createElement('style')
    s.id = 'lf-mapa-styles'
    s.textContent = `
      @keyframes lfpulse{0%{box-shadow:0 0 0 0 rgba(30,132,73,.55)}70%{box-shadow:0 0 0 14px rgba(30,132,73,0)}100%{box-shadow:0 0 0 0 rgba(30,132,73,0)}}
      .lf-yo{width:18px;height:18px;border-radius:50%;background:#1E8449;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);animation:lfpulse 2s ease-out infinite}
      .lf-fam{width:38px;height:38px;border-radius:50%;background:#E67E22;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;color:#fff;font-family:system-ui,sans-serif}
    `
    document.head.appendChild(s)
  }, [])

  // Inicializar mapa — usa callback ref para que funcione aunque el div
  // empiece oculto (cuando aún no hay puntos) y se revele después.
  const initMap = useRef(false)
  const setContainer = (node) => {
    containerRef.current = node
    if (!node || initMap.current) return
    initMap.current = true
    const map = L.map(node, { zoomControl: false, attributionControl: false })
      .setView([4.711, -74.072], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: 'abc', maxZoom: 19,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map
    // Invalidar tamaño tras primer render para que los tiles llenen el contenedor
    setTimeout(() => map.invalidateSize(), 100)
  }

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; initMap.current = false; fittedRef.current = false }
    }
  }, [])

  // Cuando el div pasa de oculto a visible, invalidar tamaño
  useEffect(() => {
    if (hayPuntos && mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 50)
    }
  }, [hayPuntos])

  // Marcador "Yo"
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (yo) {
      const icon = L.divIcon({ className: '', html: '<div class="lf-yo"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })
      if (yoMarkerRef.current) {
        yoMarkerRef.current.setLatLng([yo.lat, yo.lng])
      } else {
        yoMarkerRef.current = L.marker([yo.lat, yo.lng], { icon, zIndexOffset: 1000 })
          .bindPopup('📍 Yo').addTo(map)
        if (!fittedRef.current) { map.setView([yo.lat, yo.lng], 16); fittedRef.current = true }
      }
    } else {
      if (yoMarkerRef.current) { map.removeLayer(yoMarkerRef.current); yoMarkerRef.current = null }
    }
  }, [yo])

  // Marcadores familia
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const activeIds = new Set(familiares.filter(f => f.ubicacion).map(f => f.id))
    Object.keys(famMarkersRef.current).forEach(id => {
      if (!activeIds.has(id)) { map.removeLayer(famMarkersRef.current[id]); delete famMarkersRef.current[id] }
    })
    familiares.forEach(f => {
      if (!f.ubicacion) return
      const inicial = (f.nombre || '?')[0].toUpperCase()
      const icon = L.divIcon({ className: '', html: `<div class="lf-fam">${inicial}</div>`, iconSize: [38, 38], iconAnchor: [19, 19] })
      const pos = [f.ubicacion.latitude, f.ubicacion.longitude]
      if (famMarkersRef.current[f.id]) {
        famMarkersRef.current[f.id].setLatLng(pos)
      } else {
        famMarkersRef.current[f.id] = L.marker(pos, { icon }).bindPopup(`👤 ${f.nombre}`).addTo(map)
        if (!fittedRef.current) { map.setView(pos, 15); fittedRef.current = true }
      }
    })
    if (!enfocado) {
      const all = [...(yoMarkerRef.current ? [yoMarkerRef.current] : []), ...Object.values(famMarkersRef.current)]
      if (all.length > 1) { try { map.fitBounds(L.featureGroup(all).getBounds().pad(0.25), { maxZoom: 17 }) } catch (_) {} }
    }
  }, [familiares])

  // Pan a familiar enfocado
  useEffect(() => {
    const map = mapRef.current
    if (!map || !enfocado) return
    const m = famMarkersRef.current[enfocado.id]
    if (m) { map.setView(m.getLatLng(), 17, { animate: true }); m.openPopup() }
  }, [enfocado])

  return (
    <div className={styles.mapa} style={{ position: 'relative' }}>
      {enfocado && <div className={styles.mapaEtiqueta}>📍 {enfocado.nombre}</div>}
      {/* El div siempre está en el DOM para que Leaflet pueda inicializarse */}
      <div ref={setContainer} style={{ height: '100%', width: '100%' }} />
      {/* Estado vacío como overlay, no early-return */}
      {!hayPuntos && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
          fontSize: '2.5rem', color: 'var(--text2)',
          background: 'var(--bg2)', zIndex: 10, borderRadius: 'inherit',
          pointerEvents: 'none',
        }}>
          🗺️
          <span style={{ fontSize: '0.82rem', textAlign: 'center', padding: '0 24px' }}>{t('ubiMapaVacio')}</span>
        </div>
      )}
    </div>
  )
}
