/**
 * Reglas y mensajes de contraseña, iguales en todas partes: registro, cambiar contraseña y
 * "¿Olvidaste tu contraseña?". El servidor (Supabase) puede pedir más que el mínimo de la app:
 * cuando la rechaza, se dice exactamente por qué en vez de un error genérico.
 */
export const CLAVE_MINIMA = 6

/** Revisión antes de enviar. Devuelve el texto del error o '' si está bien. */
export function validarClave(nueva, confirmar, t) {
  if (!nueva || nueva.length < CLAVE_MINIMA) return t('errorMin')
  if (confirmar !== undefined && nueva !== confirmar) return t('errorNoCoinciden')
  return ''
}

/** Traduce lo que responde el servidor a un mensaje claro y corregible. */
export function mensajeErrorClave(error, t, generico = 'errorCambio') {
  const codigo = error?.code || ''
  const texto = `${codigo} ${error?.message || ''}`
  if (codigo === 'weak_password' || /weak.?password|password should/i.test(texto)) {
    const razones = error?.reasons || error?.weak_password?.reasons || []
    if (razones.includes('pwned')) return t('errorClaveFiltrada')
    if (razones.includes('characters') || /character|lower|upper|digit|symbol/i.test(texto)) return t('errorClaveCaracteres')
    return t('errorMin')
  }
  if (codigo === 'same_password' || /different from the old|same.?password/i.test(texto)) return t('errorClaveIgual')
  if (codigo === 'over_email_send_rate_limit' || codigo === 'over_request_rate_limit' || /rate limit|only request this after|too many/i.test(texto)) return t('errorEsperaCorreo')
  if (/fetch|network|failed to|timeout/i.test(texto)) return t('errorConexion')
  return t(generico)
}
