// Versión 107 (21-11-2026): solo dos planes, Gratis y Premium.
// - Gratis: 5 familiares, alertas ilimitadas, ubicación en vivo hasta 8 horas.
// - Premium: 10 familiares, ubicación en vivo hasta 48 horas, alerta automática y Recuperar celular.
// El plan Familiar ya no se vende: quien lo pagó recibe Premium hasta que termine su suscripción.
export const FAMILIARES_GRATIS   = 5
export const FAMILIARES_PREMIUM  = 10
export const FAMILIARES_FAMILIAR = FAMILIARES_PREMIUM
export const HORAS_UBICACION_GRATIS  = 8
export const HORAS_UBICACION_PREMIUM = 48

// Alias de compatibilidad (ya no hay límite de alertas)
export const FAMILIARES_TRIAL   = FAMILIARES_GRATIS
export const ALERTAS_GRATIS_MES = Infinity
export const ALERTAS_TRIAL      = ALERTAS_GRATIS_MES
export const ALERTAS_GRATIS     = ALERTAS_GRATIS_MES

// Sin fecha = sin vencimiento (cuentas activadas a mano)
function vigente(perfil) {
  return !perfil?.premium_hasta || new Date(perfil.premium_hasta) > new Date()
}

// Premium vigente (incluye a quien pagó el antiguo plan Familiar)
export function esPremium(perfil) {
  if (!perfil) return false
  return (perfil.plan === 'premium' || perfil.plan === 'familiar' || !!perfil.is_premium) && vigente(perfil)
}

// El plan Familiar ya no existe como plan aparte
export function esFamiliar() {
  return false
}

export function esPlanPago(perfil) {
  return esPremium(perfil)
}

export function limiteFamiliares(perfil) {
  return esPremium(perfil) ? FAMILIARES_PREMIUM : FAMILIARES_GRATIS
}

// Alertas ilimitadas en todos los planes
export function puedeEnviarAlerta() {
  return true
}

export function alertasRestantes() {
  return Infinity
}

// Compartir la ubicación en vivo: todos (Gratis hasta 8 horas, Premium hasta 48)
export function puedeUbicacionEnVivo() {
  return true
}

export function horasMaxUbicacion(perfil) {
  return esPremium(perfil) ? HORAS_UBICACION_PREMIUM : HORAS_UBICACION_GRATIS
}

// Alerta automática (cada 2 horas): solo Premium
export function puedeSegundaAlerta(perfil) {
  return esPremium(perfil)
}
