import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { TOUR } from '../i18n/tourTextos'
import styles from './Tour.module.css'

/**
 * Tour de la app (versión 95): ilumina cada parte, la pone en el centro de la pantalla y explica
 * debajo para qué sirve. Sale solo la primera vez (App.jsx, TourInicial) y desde Opciones → Ver tour.
 * Sin librerías, imágenes ni internet: solo se carga cuando se abre.
 * Cada parte se marca en su pantalla con data-tour="…". ruta = pestaña donde está; opciones = va en
 * el menú de Opciones. El Mapa se explica desde su pestaña, sin abrirlo (no descarga mapas ni usa GPS).
 * Mientras está abierto, la app no se puede tocar (nadie envía una alerta sin querer); "Saltar" siempre
 * está a la vista. Si llega una notificación y la persona la toca, el tour se cierra para dejarla ver.
 */
const PASOS = [
  { id: 'inicio' },
  { id: 'alerta', ruta: '/', objetivo: 'tab-/' },
  { id: 'rojo', ruta: '/', objetivo: 'boton-red' },
  { id: 'naranja', ruta: '/', objetivo: 'boton-orange' },
  { id: 'verde', ruta: '/', objetivo: 'boton-green' },
  { id: 'destinos', ruta: '/', objetivo: 'destinos' },
  { id: 'historial', ruta: '/historial', objetivo: 'tab-/historial' },
  { id: 'familia', ruta: '/familia', objetivo: 'familia-agregar' },
  { id: 'mapa', ruta: '/familia', objetivo: 'tab-/ubicacion' },
  { id: 'opciones', ruta: '/familia', objetivo: 'opciones' },
  { id: 'planes', opciones: true, objetivo: 'op-planes' },
  { id: 'idioma', opciones: true, objetivo: 'op-idioma' },
  { id: 'legal', opciones: true, objetivo: 'op-legal' },
  { id: 'clave', opciones: true, objetivo: 'op-clave' },
  { id: 'creador', opciones: true, objetivo: 'op-creador' },
  { id: 'huellitas', opciones: true, objetivo: 'op-huellitas' },
  { id: 'tema', opciones: true, objetivo: 'op-tema' },
  { id: 'auto', opciones: true, objetivo: 'op-auto' },
  { id: 'sonido', opciones: true, objetivo: 'op-sonido' },
  { id: 'permitir', opciones: true, objetivo: 'op-permitir' },
  { id: 'recuperar', opciones: true, objetivo: 'op-recuperar' },
  { id: 'eliminar', opciones: true, objetivo: 'op-eliminar' },
  { id: 'salir', opciones: true, objetivo: 'op-salir' },
  { id: 'fin', opciones: true, objetivo: 'op-tour' },
]
const MARGEN = 7            // aire alrededor de lo iluminado
const ESPERA_MAX_MS = 3000  // si una parte no aparece (no aplica a esta cuenta), la explicación sale igual
const SEGUIR_MS = 1100      // tiempo en que la parte se mueve (desplazamiento, Opciones que sube)
const BORDE = 14            // distancia mínima de la tarjeta a los bordes de la pantalla
const SEPARACION = 14       // entre lo iluminado y la tarjeta
const MIN_TARJETA = 170     // menos que esto no se lee bien: entonces sí puede quedar encima
const ALTURA_PARTE = 0.2    // la parte iluminada queda arriba (a un 20 % del borde), con la explicación debajo

/**
 * Sube la parte hasta la zona de arriba de la pantalla (versión 96: en el centro, en Opciones quedaba
 * muy abajo). Mueve solo lo que se desplaza (la página o la ventana de Opciones); lo que está fijo
 * en la pantalla, como las pestañas de abajo, se queda donde está.
 */
function llevarArriba(el, reducido, altoTarjeta = 0) {
  let caja = el.parentElement
  while (caja && caja !== document.body) {
    const estilo = getComputedStyle(caja)
    if (estilo.position === 'fixed' && !/(auto|scroll)/.test(estilo.overflowY)) return
    if (/(auto|scroll)/.test(estilo.overflowY) && caja.scrollHeight > caja.clientHeight) break
    caja = caja.parentElement
  }
  if (!caja || caja === document.body) return
  const r = el.getBoundingClientRect()
  let arriba = Math.max(BORDE, window.innerHeight * ALTURA_PARTE)
  // Si la explicación es larga, la parte sube un poco más para que la explicación quepa completa debajo
  const cabe = window.innerHeight - BORDE - altoTarjeta - SEPARACION - r.height - MARGEN
  if (altoTarjeta && cabe < arriba) arriba = Math.max(BORDE + MARGEN, cabe)
  const delta = r.top - arriba
  // Las últimas partes de una lista no podían subir (la lista se acaba): mientras dura el tour se le
  // agrega espacio vacío al final, y al terminar vuelve a quedar como estaba
  const libre = caja.scrollHeight - caja.clientHeight - caja.scrollTop
  if (delta > libre) {
    if (!rellenos.has(caja)) rellenos.set(caja, caja.style.paddingBottom)
    const actual = parseFloat(getComputedStyle(caja).paddingBottom) || 0
    caja.style.paddingBottom = `${Math.ceil(actual + delta - libre)}px`
  }
  caja.scrollBy({ top: delta, behavior: reducido ? 'auto' : 'smooth' })
}
// Espacio agregado al final de las listas durante el tour: contenedor → como estaba antes
const rellenos = new Map()
function quitarRellenos() {
  rellenos.forEach((antes, caja) => { caja.style.paddingBottom = antes })
  rellenos.clear()
}

export default function Tour({ onTerminar, abrirOpciones, cerrarOpciones }) {
  const { lang } = useLanguage()
  const tx = TOUR[lang] || TOUR.es
  const [i, setI] = useState(0)
  // Qué paso ya buscó su parte y si la encontró (se borra al cambiar de paso, desde los botones)
  const [hallado, setHallado] = useState({ paso: -1, encontrado: false })
  const [caja, setCaja] = useState(null)      // lo iluminado, en la pantalla
  const [arriba, setArriba] = useState(null)  // dónde va la tarjeta
  const [maxAlto, setMaxAlto] = useState(null) // si no cabe completa, hasta dónde se acorta
  const [vista, setVista] = useState(0)        // cambia al girar el celular o cambiar el tamaño
  const tarjetaRef = useRef(null)
  const objetivoRef = useRef(null)
  const siguienteRef = useRef(null)
  // Las funciones de App cambian en cada dibujo: se usan las últimas sin volver a empezar el paso
  const fx = useRef({ onTerminar, abrirOpciones, cerrarOpciones })
  useLayoutEffect(() => { fx.current = { onTerminar, abrirOpciones, cerrarOpciones } })
  const [reducido] = useState(() => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const paso = PASOS[i]
  const ultimo = i === PASOS.length - 1
  const listo = !paso.objetivo || hallado.paso === i
  // Sin parte que iluminar (bienvenida, o una que no aplica a esta cuenta): pantalla oscura y tarjeta al centro
  const sinObjetivo = !paso.objetivo || (hallado.paso === i && !hallado.encontrado)

  /** Cambia de pestaña con el mismo camino que usan las notificaciones, marcado como del tour. */
  const irA = useCallback(ruta => {
    if (window.location.pathname === ruta) return
    window.__tourNavega = true
    window.__rutaPendiente = ruta
    window.dispatchEvent(new Event('irARuta'))
    window.__tourNavega = false
  }, [])

  const terminar = useCallback(() => {
    fx.current.cerrarOpciones()
    irA('/')
    fx.current.onTerminar(true)
  }, [irA])

  // Al cerrarse el tour, las listas vuelven a quedar como estaban
  useEffect(() => quitarRellenos, [])

  // La persona tocó una notificación (puede ser una emergencia): el tour se quita de en medio
  useEffect(() => {
    const alNavegar = () => { if (!window.__tourNavega) fx.current.onTerminar(false) }
    window.addEventListener('irARuta', alNavegar)
    return () => window.removeEventListener('irARuta', alNavegar)
  }, [])

  // Cada paso: lleva a su pantalla, busca la parte y la pone en el centro
  useEffect(() => {
    let vivo = true
    objetivoRef.current = null
    if (paso.opciones) fx.current.abrirOpciones()
    else {
      fx.current.cerrarOpciones()
      if (paso.ruta) irA(paso.ruta)
    }
    if (!paso.objetivo) return () => { vivo = false }
    const inicio = Date.now()
    let espera
    const buscar = () => {
      if (!vivo) return
      const el = document.querySelector(`[data-tour="${paso.objetivo}"]`)
      if (el && el.getClientRects().length) {
        objetivoRef.current = el
        llevarArriba(el, reducido, tarjetaRef.current?.offsetHeight || 0)
        setHallado({ paso: i, encontrado: true })
        return
      }
      if (Date.now() - inicio > ESPERA_MAX_MS) { setHallado({ paso: i, encontrado: false }); return }
      espera = setTimeout(buscar, 80)
    }
    espera = setTimeout(buscar, 0)
    return () => { vivo = false; clearTimeout(espera) }
  }, [i, paso, irA, reducido])

  /** Dónde está ahora lo iluminado (recortado a la pantalla). */
  const medir = useCallback(() => {
    const el = objetivoRef.current
    if (!el || !el.isConnected) return
    const r = el.getBoundingClientRect()
    const vh = window.innerHeight, vw = window.innerWidth
    const top = Math.max(4, r.top - MARGEN)
    const left = Math.max(4, r.left - MARGEN)
    const nueva = {
      top, left,
      width: Math.min(vw - 4, r.right + MARGEN) - left,
      height: Math.min(vh - 4, r.bottom + MARGEN) - top,
    }
    setCaja(c => c && Math.abs(c.top - nueva.top) < 0.5 && Math.abs(c.left - nueva.left) < 0.5
      && Math.abs(c.width - nueva.width) < 0.5 && Math.abs(c.height - nueva.height) < 0.5 ? c : nueva)
  }, [])

  // Sigue a la parte mientras se mueve (desplazamiento suave, Opciones que sube) y al girar la pantalla
  useEffect(() => {
    if (!listo || !objetivoRef.current) return
    const hasta = performance.now() + SEGUIR_MS
    let cuadro
    const seguir = () => { medir(); if (performance.now() < hasta) cuadro = requestAnimationFrame(seguir) }
    seguir()
    let pedido = false
    const alMover = () => {
      if (pedido) return
      pedido = true
      requestAnimationFrame(() => { pedido = false; medir() })
    }
    window.addEventListener('resize', alMover)
    window.addEventListener('scroll', alMover, true)
    return () => {
      cancelAnimationFrame(cuadro)
      window.removeEventListener('resize', alMover)
      window.removeEventListener('scroll', alMover, true)
    }
  }, [listo, i, medir])

  useEffect(() => {
    const alCambiar = () => setVista(v => v + 1)
    window.addEventListener('resize', alCambiar)
    return () => window.removeEventListener('resize', alCambiar)
  }, [])

  // La tarjeta va debajo de lo iluminado; si no cabe, encima. Si no cabe completa en ningún lado
  // (versión 99: textos largos o letra grande, como en algunos Samsung), va en el lado con más espacio
  // y se acorta: su contenido se desplaza adentro y nunca tapa lo iluminado
  useLayoutEffect(() => {
    const tarjeta = tarjetaRef.current
    if (!tarjeta || !listo) return
    // La altura completa, aunque en el paso anterior se haya acortado
    const alto = tarjeta.scrollHeight
    const vh = window.innerHeight
    let top, max = null
    if (!caja || sinObjetivo) top = Math.max(BORDE, (vh - alto) / 2)
    else {
      const abajo = vh - BORDE - (caja.top + caja.height + SEPARACION)
      const encima = caja.top - SEPARACION - BORDE
      if (alto <= abajo) top = caja.top + caja.height + SEPARACION
      else if (alto <= encima) top = caja.top - SEPARACION - alto
      else if (Math.max(abajo, encima) >= MIN_TARJETA) {
        max = Math.max(abajo, encima)
        top = abajo >= encima ? caja.top + caja.height + SEPARACION : BORDE
      } else top = Math.max(BORDE, vh - alto - BORDE)
    }
    setArriba(prev => (prev !== null && Math.abs(prev - top) < 1 ? prev : top))
    setMaxAlto(prev => (prev === max ? prev : max))
  }, [caja, listo, sinObjetivo, i, lang, vista])

  // El botón principal recibe el foco (teclado y lectores de pantalla)
  useEffect(() => { if (listo) siguienteRef.current?.focus({ preventScroll: true }) }, [listo, i])

  const siguiente = useCallback(() => {
    if (ultimo) { terminar(); return }
    setHallado({ paso: -1, encontrado: false })
    setI(n => n + 1)
  }, [ultimo, terminar])
  const atras = useCallback(() => {
    setHallado({ paso: -1, encontrado: false })
    setI(n => Math.max(0, n - 1))
  }, [])

  // Teclado: → siguiente, ← atrás, Esc salta
  useEffect(() => {
    const tecla = e => {
      if (e.key === 'Escape') terminar()
      else if (e.key === 'ArrowRight') siguiente()
      else if (e.key === 'ArrowLeft') atras()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [siguiente, atras, terminar])

  const [icono, titulo, texto] = tx[paso.id]
  // Al pasar de una parte a otra, la luz se desliza desde la anterior hasta la nueva
  const conFoco = caja && !sinObjetivo
  // 23 pasos y el mensaje final aparte (no cuenta como paso)
  const TOTAL = PASOS.length - 1
  const progreso = ultimo ? '100%' : `${Math.round(((i + 1) / TOTAL) * 100)}%`

  return createPortal(
    <div className={styles.capa}>
      {/* Nada de la app se toca mientras el tour está abierto */}
      <div className={styles.bloqueo} onClick={e => e.stopPropagation()} />
      {conFoco
        ? <div className={styles.foco} style={{ top: caja.top, left: caja.left, width: caja.width, height: caja.height }} />
        : <div className={styles.velo} />}
      <div
        key={i}
        ref={tarjetaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-titulo"
        aria-describedby="tour-texto"
        className={`${styles.tarjeta} ${paso.objetivo ? '' : styles.centrada}`}
        style={{ top: arriba ?? 0, maxHeight: maxAlto ?? undefined, visibility: listo && arriba !== null ? 'visible' : 'hidden' }}
      >
        <div className={styles.cabeza}>
          <span className={styles.paso}>{ultimo ? `✓ ${tx.ui.completo}` : tx.ui.paso.replace('{n}', String(i + 1)).replace('{total}', String(TOTAL))}</span>
          <button type="button" className={styles.cerrar} onClick={terminar} aria-label={tx.ui.cerrar}>✕</button>
        </div>
        <div className={styles.barra} aria-hidden="true"><div className={styles.barraLlena} style={{ width: progreso }} /></div>
        <h2 id="tour-titulo" className={styles.titulo}>
          <span className={styles.icono} aria-hidden="true">{icono}</span>
          <span>{titulo}</span>
        </h2>
        <div id="tour-texto" className={styles.texto}>
          {texto.split('\n').map((parrafo, k) => <p key={k}>{parrafo}</p>)}
        </div>
        {ultimo && tx.destacado && <p className={styles.destacado}>{tx.destacado}</p>}
        {ultimo && tx.permisos && <p className={styles.permisos}>🔐 {tx.permisos}</p>}
        <div className={styles.pie}>
          {!ultimo && <button type="button" className={styles.saltar} onClick={terminar}>{tx.ui.saltar}</button>}
          {i > 0 && <button type="button" className={styles.atras} onClick={atras}>{tx.ui.atras}</button>}
          <button type="button" ref={siguienteRef} className={styles.siguiente} onClick={siguiente}>
            {i === 0 ? tx.ui.empezar : ultimo ? tx.ui.terminar : `${tx.ui.siguiente} →`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
