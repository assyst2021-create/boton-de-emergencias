export const FAMILIARES_TRIAL = 1
export const FAMILIARES_PREMIUM = 10
export const ALERTAS_TRIAL = 2     // se mantiene por compatibilidad con imports
export const UBICACIONES_TRIAL = 2 // se mantiene por compatibilidad con imports

// Alias para compatibilidad con imports existentes
export const FAMILIARES_GRATIS = FAMILIARES_TRIAL
export const ALERTAS_GRATIS = ALERTAS_TRIAL

export function esPremium(perfil) {
  if (perfil?.plan === 'premium') return true
  // Compatibilidad con usuarios anteriores que usaban is_premium
  if (!perfil?.is_premium) return false
  if (perfil.premium_hasta && new Date(perfil.premium_hasta) < new Date()) return false
  return true
}

export function limiteFamiliares(perfil) {
  return esPremium(perfil) ? FAMILIARES_PREMIUM : FAMILIARES_TRIAL
}

// Plan Básico: alertas ilimitadas — sin restricción de cantidad
export function puedeEnviarAlerta(_perfil) {
  return true
}

export function alertasRestantes(_perfil) {
  return Infinity
}

// Ubicación en vivo: exclusivo de Plan Premium
export function puedeUbicacionEnVivo(perfil) {
  return esPremium(perfil)
}
