export const FAMILIARES_GRATIS   = 1
export const FAMILIARES_FAMILIAR = 5
export const FAMILIARES_PREMIUM  = 10
export const ALERTAS_GRATIS_MES  = 6

// Alias de compatibilidad
export const FAMILIARES_TRIAL = FAMILIARES_GRATIS
export const ALERTAS_TRIAL    = ALERTAS_GRATIS_MES
export const ALERTAS_GRATIS   = ALERTAS_GRATIS_MES

// Sin fecha = sin vencimiento (cuentas activadas a mano)
function vigente(perfil) {
  return !perfil?.premium_hasta || new Date(perfil.premium_hasta) > new Date()
}

export function esPremium(perfil) {
  if (!perfil || perfil.plan === 'familiar') return false
  return (perfil.plan === 'premium' || !!perfil.is_premium) && vigente(perfil)
}

export function esFamiliar(perfil) {
  return perfil?.plan === 'familiar' && vigente(perfil)
}

export function esPlanPago(perfil) {
  return esPremium(perfil) || esFamiliar(perfil)
}

export function limiteFamiliares(perfil) {
  if (esPremium(perfil))  return FAMILIARES_PREMIUM
  if (esFamiliar(perfil)) return FAMILIARES_FAMILIAR
  return FAMILIARES_GRATIS
}

// Gratis: 6 alertas por mes. Familiar y Premium: ilimitadas.
export function puedeEnviarAlerta(perfil, alertasMes = 0) {
  if (esPlanPago(perfil)) return true
  return alertasMes < ALERTAS_GRATIS_MES
}

export function alertasRestantes(perfil, alertasMes = 0) {
  if (esPlanPago(perfil)) return Infinity
  return Math.max(0, ALERTAS_GRATIS_MES - alertasMes)
}

// Mapa en vivo: Familiar y Premium
export function puedeUbicacionEnVivo(perfil) {
  return esPlanPago(perfil)
}

// Segunda alerta automática: Familiar y Premium
export function puedeSegundaAlerta(perfil) {
  return esPlanPago(perfil)
}
