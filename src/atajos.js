/**
 * Botones rápidos de Android (versión 105): el panel rápido (deslizando desde arriba), el widget de la
 * pantalla de inicio y los atajos que salen al dejar presionado el ícono. Todos abren la app con un
 * atajo: 'red' | 'orange' | 'green' (la alerta, con 5 segundos para cancelarla) o 'ubicacion24'.
 * La app hace lo mismo que su botón; aquí solo se recibe el atajo. En la web y en iPhone no hay nada.
 */
import { registerPlugin } from '@capacitor/core'

const Atajos = registerPlugin('Atajos')

export const HAY_ATAJOS = typeof window !== 'undefined'
  && !!window.Capacitor?.isNativePlatform?.()
  && window.Capacitor?.getPlatform?.() === 'android'

const VALIDOS = ['red', 'orange', 'green', 'ubicacion24']

/** Escucha los atajos: el que abrió la app y los que lleguen con la app abierta. Devuelve cómo dejar de escuchar. */
export function escucharAtajos(alLlegar) {
  if (!HAY_ATAJOS) return () => {}
  let vivo = true
  let suscripcion = null
  const entregar = accion => { if (vivo && VALIDOS.includes(accion)) alLlegar(accion) }
  Atajos.addListener('atajo', e => entregar(e?.accion))
    .then(s => { if (vivo) suscripcion = s; else s.remove() }, () => {})
  Atajos.pendiente().then(r => entregar(r?.accion), () => {})
  return () => { vivo = false; if (suscripcion) suscripcion.remove() }
}

/** Qué se puede agregar desde la app: { panel, widget } (Android decide según la versión del celular). */
export async function estadoAtajos() {
  if (!HAY_ATAJOS) return { panel: false, widget: false }
  try { return await Atajos.estado() } catch (_) { return { panel: false, widget: false } }
}

/** Pide agregar un botón al panel rápido: 'agregado' | 'ya' | 'no' | 'error'. */
export async function agregarAlPanel(cual) {
  try { return (await Atajos.agregarPanel({ cual }))?.resultado || 'error' } catch (_) { return 'error' }
}

/** Pide poner el widget en la pantalla de inicio (Android muestra cómo queda y la persona confirma). */
export async function agregarWidget() {
  try { return !!(await Atajos.agregarWidget())?.ok } catch (_) { return false }
}
