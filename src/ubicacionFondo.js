/**
 * "Permitir todo el tiempo" en la ubicación (versión 95, punto 9b). Sin eso, Android puede cortar la
 * ubicación compartida con la pantalla apagada o la app cerrada, y Recuperar celular no funciona.
 * Se pide al instalar (ronda 2 de PermisosPlugin.pedirTodos). Si la persona no lo dio, la app lo
 * explica y lo vuelve a pedir (App.jsx, PantallaFondo) y lo recuerda en el Mapa.
 */
const plugin = () => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.Permisos : null)

/**
 * true = ya está; false = falta; null = no aplica o no se sabe (página web, sin la ubicación normal,
 * celular que no informa el dato). Solo con false se muestra algo.
 */
export async function tieneUbicacionFondo() {
  try {
    const p = await plugin()?.verificar?.()
    if (!p || !p.ubicacion || typeof p.ubicacionFondo !== 'boolean') return null
    return p.ubicacionFondo
  } catch (_) {
    return null
  }
}

/** Vuelve a pedirlo (Android lleva a la pantalla de la ubicación de la app) y dice cómo quedó. */
export async function pedirUbicacionFondo() {
  try { await plugin()?.pedirTodos?.() } catch (_) { /* se revisa abajo */ }
  return tieneUbicacionFondo()
}

/** Si Android ya no vuelve a preguntar, solo queda abrir los ajustes de la app. */
export function abrirAjustesApp() {
  try { plugin()?.abrirAjustes?.() } catch (_) { /* nada que hacer */ }
}
