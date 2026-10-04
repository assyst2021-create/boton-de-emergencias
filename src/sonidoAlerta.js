/**
 * Sonido de las alertas de emergencia en ESTE celular (lo escoge quien recibe). La parte de Android
 * (SonidosPlugin) crea el "canal" con ese sonido y la app guarda en el servidor el nombre del canal:
 * así cada familiar recibe la alerta con el sonido que él eligió. Sin elegir nada: el tono normal,
 * que suena también con el celular en silencio.
 */
export const SONIDOS = ['sirena', 'alarma', 'campana', 'normal']
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
    if (p && SONIDOS.includes(p.sonido)) return { sonido: p.sonido, siempre: !!p.siempre }
  } catch (_) {}
  return null
}

/** Canal donde se muestran las alertas cuando la app está abierta (el mismo que usa el servidor). */
export function canalLocal() {
  try { return localStorage.getItem('canalAlerta') || CANAL_NORMAL } catch (_) { return CANAL_NORMAL }
}

/** "alertas_s_sirena_2" → { sonido: 'sirena', siempre: true } (para recuperarlo al reinstalar) */
export function desdeCanal(canal) {
  // Escogió a propósito el tono normal sin sonar en silencio: se respeta
  if (canal === CANAL_NORMAL) return { sonido: 'normal', siempre: false }
  const m = /^alertas_(s_)?(sirena|alarma|campana|normal)_\d+$/.exec(canal || '')
  return m ? { sonido: m[2], siempre: !!m[1] } : null
}

function guardarLocal(pref, canal) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(pref))
    localStorage.setItem('canalAlerta', canal)
  } catch (_) {}
}

/** Deja el sonido listo en el celular y lo guarda en el servidor. Devuelve { canal, suenaEnNoMolestar }. */
export async function aplicarSonido(supabase, uid, pref) {
  const r = await plugin().configurar(pref)
  guardarLocal(pref, r.canal)
  if (uid) {
    const { error } = await supabase.from('users').update({ canal_alerta: r.canal }).eq('id', uid)
    if (error) throw error
  }
  return r
}

/**
 * Al abrir la app: el canal elegido existe en este celular (también después de reinstalar, cuando
 * se recupera lo que estaba guardado en el servidor) y el servidor tiene el nombre correcto.
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
  guardarLocal(pref, r.canal)
  if (r.canal !== canalServidor) {
    await supabase.from('users').update({ canal_alerta: r.canal }).eq('id', uid).then(() => {}, () => {})
  }
}
