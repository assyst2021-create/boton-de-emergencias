/**
 * Ubicación rápida con el servicio de ubicación del celular (GpsShare, versión 93). La del navegador
 * interno de Android es lenta al abrir la app: no aprovecha la última ubicación que el celular ya
 * conoce y el GPS "en frío" puede tardar. Sin la app (página web) o si falla, devuelve null y se
 * sigue con la del navegador, como antes.
 */
const plugin = () => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.GpsShare : null)

const comoPunto = r => (r?.ok && Number.isFinite(r.lat) && Number.isFinite(r.lng)
  ? { lat: r.lat, lng: r.lng, precision: r.precision, edadMs: r.edadMs || 0 }
  : null)

/** La última ubicación que el celular ya conoce (al instante; puede ser de hace unos minutos). */
export async function ultimaUbicacionNativa() {
  try { return comoPunto(await plugin()?.ultimaUbicacion?.()) } catch (_) { return null }
}

/** Una ubicación de ahora, precisa; responde a más tardar en esperaMs. */
export async function ubicacionActualNativa(esperaMs = 8000) {
  try { return comoPunto(await plugin()?.ubicacionActual?.({ esperaMs })) } catch (_) { return null }
}
