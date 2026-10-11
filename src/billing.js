import { registerPlugin } from '@capacitor/core'

export const Billing = registerPlugin('Billing')
export const EN_ANDROID = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

export const PRODUCTOS = {
  familiar: { mensual: 'plan_familiar_mensual', anual: 'plan_familiar_anual' },
  premium:  { mensual: 'plan_premium_mensual',  anual: 'plan_premium_anual' },
}
const TODOS = Object.values(PRODUCTOS).flatMap(p => Object.values(p))

/** Precios reales de Google Play: { productId: '$ 20.000' }. */
export async function obtenerPrecios() {
  if (!EN_ANDROID) return {}
  const r = await Billing.obtenerPrecios({ productIds: TODOS }).catch(() => null)
  return r?.precios || {}
}

/**
 * Suscripción que esta cuenta de Google ya tiene en otro plan o ciclo (para reemplazarla al
 * cambiar de plan, en vez de cobrar dos). null si no tiene ninguna.
 */
export async function tokenSuscripcionActual(productIdNuevo) {
  if (!EN_ANDROID) return null
  const r = await Billing.restaurarCompras().catch(() => null)
  const otra = (r?.compras || []).find(c => !c.pendiente && c.token && c.productId && c.productId !== productIdNuevo)
  return otra?.token || null
}

/** El servidor verifica el pago con Google y activa el plan del usuario de la sesión. */
export async function activarCompra(supabase, token) {
  const { data, error } = await supabase.functions.invoke('activar-premium', { body: { token } })
  if (error) {
    // El motivo real viene en el cuerpo de la respuesta (por ejemplo, compra_de_otra_cuenta)
    const cuerpo = error.context ? await error.context.json().catch(() => null) : null
    throw new Error(cuerpo?.error || error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/**
 * Manda al servidor las suscripciones que Google tiene para esta cuenta.
 * Recupera compras perdidas y actualiza renovaciones y cancelaciones.
 * Devuelve lo que respondió el servidor por cada una: { ok, ... } o { error } (versión 95: antes los
 * errores se perdían y "Restaurar compras" siempre decía que no había compras).
 */
export async function sincronizarCompras(supabase) {
  if (!EN_ANDROID) return []
  const r = await Billing.restaurarCompras().catch(() => null)
  // Premium al final: si por un momento hubiera dos suscripciones, gana la mejor
  const rango = c => (c.productId || '').includes('premium') ? 2 : 1
  // También las pendientes: el servidor las anota y las activa solo cuando Google las apruebe
  const compras = (r?.compras || []).filter(c => c.token).sort((a, b) => rango(a) - rango(b))
  const resultados = []
  for (const c of compras) {
    try { resultados.push(await activarCompra(supabase, c.token)) }
    catch (e) { resultados.push({ ok: false, error: e?.message || 'error', pendiente: !!c.pendiente }) }
  }
  return resultados
}

/** Que el servidor haya cambiado algo (activó, renovó o quitó un plan): hay que recargar el plan. */
export const cambioElPlan = resultados => resultados.some(r => r && !r.error)

let escuchando = false
/** Compras que terminan cuando la pantalla de pago ya no estaba esperando. */
export function escucharCompras(supabase, alActivar) {
  if (!EN_ANDROID || escuchando) return
  escuchando = true
  Billing.addListener('compra', async c => {
    if (c?.pendiente || !c?.token) return
    try { const res = await activarCompra(supabase, c.token); alActivar?.(res) } catch (_) {}
  })
}
