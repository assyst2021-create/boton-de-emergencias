/**
 * Sonido de las alertas de emergencia en ESTE celular (lo escoge quien recibe). Desde la versión 93
 * la app misma lo reproduce cuando le llega una alerta (SonidosPlugin.sonarAlerta, señal "sonar" del
 * servidor), con el volumen de alarma si así se eligió: ya no depende de los canales de Android.
 * En el servidor se guarda "alertas_sonar_<sonido>[_s]" solo para que sepa que este celular suena
 * por su cuenta. Sin elegir nada: el tono normal, que suena también con el celular en silencio.
 */
export const SONIDOS = ['sirena', 'alarma', 'campana', 'normal']
// "tono" = un tono escogido de la lista del celular
const VALIDOS = [...SONIDOS, 'tono']
const CLAVE = 'sonidoAlerta'
export const CANAL_NORMAL = 'alertas_v3'
// Lo que tiene cada persona mientras no escoja otra cosa: es una emergencia, así que las alertas
// suenan aunque el celular esté en silencio (decisión de Michael, 04-10)
export const PREFERENCIA_INICIAL = { sonido: 'normal', siempre: true }

const plugin = () => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.Sonidos : null)
export const hayPluginSonidos = () => !!plugin()?.configurar

export function leerPreferencia() {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) || 'null')
    if (p && VALIDOS.includes(p.sonido)) return { sonido: p.sonido, siempre: !!p.siempre }
  } catch (_) {}
  return null
}

/** Lo guardado en el servidor → { sonido, siempre } (para recuperarlo al reinstalar). */
export function desdeCanal(canal) {
  const nuevo = /^alertas_sonar_(sirena|alarma|campana|normal|tono)(_s)?$/.exec(canal || '')
  if (nuevo) return { sonido: nuevo[1], siempre: !!nuevo[2] }
  // Versiones 89 a 92 (canales de Android)
  if (canal === CANAL_NORMAL) return { sonido: 'normal', siempre: false }
  const viejo = /^alertas_(s_)?(sirena|alarma|campana|normal)_\d+$/.exec(canal || '')
  return viejo ? { sonido: viejo[2], siempre: !!viejo[1] } : null
}

function guardarLocal(pref) {
  try { localStorage.setItem(CLAVE, JSON.stringify(pref)) } catch (_) {}
}

/** Deja el sonido listo en el celular y lo avisa al servidor. Devuelve { canal, suenaEnNoMolestar }. */
export async function aplicarSonido(supabase, uid, pref) {
  const r = await plugin().configurar(pref)
  // Lo que de verdad quedó (por ejemplo, "tono" sin tono escogido queda en el normal)
  guardarLocal(desdeCanal(r.canal) || pref)
  if (uid) {
    const { error } = await supabase.from('users').update({ canal_alerta: r.canal }).eq('id', uid)
    if (error) throw error
  }
  return r
}

/**
 * Al abrir la app: el sonido elegido queda listo en este celular (también después de reinstalar,
 * cuando se recupera lo que estaba guardado en el servidor) y el servidor sabe que suena por su cuenta.
 */
export async function sincronizarSonido(supabase, uid) {
  if (!hayPluginSonidos() || !uid) return
  let pref = leerPreferencia()
  let canalServidor = null
  if (!pref) {
    const { data } = await supabase.from('users').select('canal_alerta').eq('id', uid).maybeSingle()
      .then(r => r, () => ({ data: null }))
    canalServidor = data?.canal_alerta || null
    // Nunca escogió (o reinstaló sin haber escogido): queda sonando siempre, también en silencio
    pref = desdeCanal(canalServidor) || PREFERENCIA_INICIAL
  }
  const r = await plugin().configurar(pref).catch(() => null)
  if (!r) return
  guardarLocal(desdeCanal(r.canal) || pref)
  if (r.canal !== canalServidor) {
    await supabase.from('users').update({ canal_alerta: r.canal }).eq('id', uid).then(() => {}, () => {})
  }
}
