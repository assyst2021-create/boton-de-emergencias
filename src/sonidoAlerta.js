/**
 * Sonido de las alertas de emergencia en ESTE celular (lo escoge quien recibe). Desde la versión 94
 * solo se usan los sonidos del propio celular (los que trae y los que la persona descargue): el tono
 * elegido queda en un canal de notificaciones de Android y el servidor manda cada alerta a ese canal
 * (users.canal_alerta = "alertas_tono_…"), así Android mismo lo hace sonar aunque la app esté cerrada.
 * Sin elegir nada: el tono normal, que suena también con el celular en silencio.
 */
// "normal" = el tono normal del celular; "tono" = uno escogido de la lista de tonos del celular
const VALIDOS = ['normal', 'tono']
const CLAVE = 'sonidoAlerta'
// El canal que quedó listo en este celular (lo usan también las alertas que llegan con la app abierta)
const CLAVE_CANAL = 'sonidoCanal'
export const CANAL_NORMAL = 'alertas_v3'
// Lo que tiene cada persona mientras no escoja otra cosa: es una emergencia, así que las alertas
// suenan aunque el celular esté en silencio (decisión de Michael, 04-10)
export const PREFERENCIA_INICIAL = { sonido: 'normal', siempre: true }

const plugin = () => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.Sonidos : null)
export const hayPluginSonidos = () => !!plugin()?.configurar

// Los sonidos que hizo la app (versiones 89 a 93) ya no existen: quien los tenía pasa al tono normal
const comoValido = s => (s === 'tono' ? 'tono' : 'normal')

export function leerPreferencia() {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) || 'null')
    if (p && typeof p.sonido === 'string') return { sonido: comoValido(p.sonido), siempre: !!p.siempre }
  } catch (_) {}
  return null
}

/** Lo guardado en el servidor → { sonido, siempre } (para recuperarlo al reinstalar). */
export function desdeCanal(canal) {
  const c = canal || ''
  const tono = /^alertas_tono_(normal|t[0-9a-f]+)(_s)?(_d)?$/.exec(c)
  if (tono) return { sonido: tono[1] === 'normal' ? 'normal' : 'tono', siempre: !!tono[2] }
  // Versión 93
  const v93 = /^alertas_sonar_([a-z]+?)(_s)?$/.exec(c)
  if (v93) return { sonido: comoValido(v93[1]), siempre: !!v93[2] }
  // Versiones 89 a 92
  if (c === CANAL_NORMAL) return { sonido: 'normal', siempre: false }
  const viejo = /^alertas_(s_)?(sirena|alarma|campana|normal)_\d+$/.exec(c)
  return viejo ? { sonido: 'normal', siempre: !!viejo[1] } : null
}

function guardarLocal(pref, canal) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(pref))
    if (canal) localStorage.setItem(CLAVE_CANAL, canal)
  } catch (_) {}
}

/** El canal con el sonido elegido en este celular (para las alertas que llegan con la app abierta). */
export function canalElegido() {
  try { return localStorage.getItem(CLAVE_CANAL) || CANAL_NORMAL } catch (_) { return CANAL_NORMAL }
}

// Ya con el canal nuevo guardado en el servidor, los anteriores se quitan de Ajustes. Mientras el
// servidor no lo tenga (sin internet), el anterior sigue sirviendo: las alertas no se quedan sin sonido.
const limpiar = canal => plugin()?.limpiarCanales?.({ mantener: canal }).catch(() => {})

/** Deja el sonido listo en el celular y lo avisa al servidor. Devuelve { canal, suenaEnNoMolestar }. */
export async function aplicarSonido(supabase, uid, pref) {
  const r = await plugin().configurar(pref)
  // Lo que de verdad quedó (por ejemplo, "tono" sin tono escogido queda en el normal)
  guardarLocal(desdeCanal(r.canal) || pref, r.canal)
  if (uid) {
    const { error } = await supabase.from('users').update({ canal_alerta: r.canal }).eq('id', uid)
    if (error) throw error
    limpiar(r.canal)
  }
  return r
}

/**
 * Al abrir la app: el sonido elegido queda listo en este celular (también después de reinstalar,
 * cuando se recupera lo que estaba guardado en el servidor) y el servidor manda las alertas a su canal.
 * Se compara siempre con el servidor: si la misma cuenta se abrió en otro celular, este lo corrige.
 */
export async function sincronizarSonido(supabase, uid) {
  if (!hayPluginSonidos() || !uid) return
  const { data, error } = await supabase.from('users').select('canal_alerta').eq('id', uid).maybeSingle()
    .then(r => r, e => ({ data: null, error: e }))
  const canalServidor = error ? undefined : (data?.canal_alerta || null)
  // Nunca escogió (o reinstaló sin haber escogido): queda sonando siempre, también en silencio
  const pref = leerPreferencia() || desdeCanal(canalServidor) || PREFERENCIA_INICIAL
  const r = await plugin().configurar(pref).catch(() => null)
  if (!r) return
  guardarLocal(desdeCanal(r.canal) || pref, r.canal)
  // Sin internet no se sabe qué tiene el servidor: no se toca nada (se revisa la próxima vez)
  if (canalServidor === undefined) return
  if (r.canal === canalServidor) { limpiar(r.canal); return }
  const { error: errorGuardar } = await supabase.from('users').update({ canal_alerta: r.canal }).eq('id', uid)
    .then(x => x, e => ({ error: e }))
  if (!errorGuardar) limpiar(r.canal)
}
