import { useState, useEffect, useRef } from 'react'
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
  const [compartiendo, setCompartiendo] = useState(false)
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

/**
 * Mapa con OpenStreetMap. Se dibuja con un iframe para no cargar ninguna
 * libreria de mapas ni depender de una llave de Google.
 */
function Mapa({ yo, familiares, enfocado, t }) {
  const puntos = []
  if (yo) puntos.push({ lat: yo.lat, lng: yo.lng })
  familiares.forEach(f => puntos.push({ lat: f.ubicacion.latitude, lng: f.ubicacion.longitude }))

  if (puntos.length === 0) {
    return <div className={styles.mapaVacio}>🗺️<span>{t('ubiMapaVacio')}</span></div>
  }

  // Con alguien enfocado se centra en el y se acerca; si no, se abarca a todos.
  let lat, lng, d
  if (enfocado) {
    lat = enfocado.ubicacion.latitude
    lng = enfocado.ubicacion.longitude
    d = 0.004
  } else {
    lat = puntos.reduce((s, p) => s + p.lat, 0) / puntos.length
    lng = puntos.reduce((s, p) => s + p.lng, 0) / puntos.length
    d = 0.01
  }

  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`
  const marcadores = puntos.map(p => `${p.lat},${p.lng}`).join('&marker=')

  return (
    <div className={styles.mapa}>
      {enfocado && (
        <div className={styles.mapaEtiqueta}>📍 {enfocado.nombre}</div>
      )}
      <iframe
        title="mapa"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marcadores}`}
        loading="lazy"
      />
    </div>
  )
}
