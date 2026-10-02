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
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}

/**
 * Manda al servidor las suscripciones que Google tiene para esta cuenta.
 * Recupera compras perdidas y actualiza renovaciones y cancelaciones.
 */
export async function sincronizarCompras(supabase) {
  if (!EN_ANDROID) return []
  const r = await Billing.restaurarCompras().catch(() => null)
  // Premium al final: si por un momento hubiera dos suscripciones, gana la mejor
  const rango = c => (c.productId || '').includes('premium') ? 2 : 1
  const compras = (r?.compras || []).filter(c => !c.pendiente && c.token).sort((a, b) => rango(a) - rango(b))
  const resultados = []
  for (const c of compras) {
    try { resultados.push(await activarCompra(supabase, c.token)) } catch (_) {}
  }
  return resultados
}

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
