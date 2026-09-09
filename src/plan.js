export const FAMILIARES_TRIAL = 1
export const FAMILIARES_PREMIUM = 10
export const ALERTAS_TRIAL = 2
export const UBICACIONES_TRIAL = 2

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

export function puedeEnviarAlerta(perfil) {
  if (esPremium(perfil)) return true
  return (perfil?.alertas_enviadas ?? 0) < ALERTAS_TRIAL
}

export function alertasRestantes(perfil) {
  if (esPremium(perfil)) return Infinity
  return Math.max(0, ALERTAS_TRIAL - (perfil?.alertas_enviadas ?? 0))
}

export function puedeUbicacionEnVivo(perfil) {
  if (esPremium(perfil)) return true
  return (perfil?.ubicaciones_usadas ?? 0) < UBICACIONES_TRIAL
}
