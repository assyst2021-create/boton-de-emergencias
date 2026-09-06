// Reglas del plan gratuito y del premium, en un solo lugar para que la web
// y la app no se contradigan.

export const FAMILIARES_GRATIS = 1
export const FAMILIARES_PREMIUM = 10
export const ALERTAS_GRATIS = 3

/** Premium vigente: la marca puede existir pero estar vencida. */
export function esPremium(perfil) {
  if (!perfil?.is_premium) return false
  if (perfil.premium_hasta && new Date(perfil.premium_hasta) < new Date()) return false
  return true
}

export function limiteFamiliares(perfil) {
  return esPremium(perfil) ? FAMILIARES_PREMIUM : FAMILIARES_GRATIS
}

/** Alertas que le quedan. Infinity en premium. */
export function alertasRestantes(perfil) {
  if (esPremium(perfil)) return Infinity
  return Math.max(0, ALERTAS_GRATIS - (perfil?.alertas_usadas ?? 0))
}

export function puedeEnviarAlerta(perfil) {
  return alertasRestantes(perfil) > 0
}

/** La ubicacion en tiempo real es exclusiva del plan pago. */
export function puedeUbicacionEnVivo(perfil) {
  return esPremium(perfil)
}
