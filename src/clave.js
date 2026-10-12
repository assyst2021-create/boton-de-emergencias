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

/**
 * Seguridad del código por correo (versión 95): después de pedir un código para cambiar la
 * contraseña, durante 24 h no se puede apagar "Recuperar celular", cerrar sesión con Recuperar
 * activo ni eliminar la cuenta. Así quien tenga el celular desbloqueado y el correo abierto en él
 * (por ejemplo, un ladrón) no puede dejar de ser buscado. El servidor también lo revisa
 * (set_recuperacion y eliminar-cuenta); aquí es para avisarlo antes de que la persona lo intente.
 */
export const HORAS_BLOQUEO_CODIGO = 24

/** Hasta cuándo dura el bloqueo (Date) según cuándo se pidió el último código, o null si ya pasó. */
export function finBloqueo(enviadoIso) {
  const enviado = enviadoIso ? new Date(enviadoIso) : null
  if (!enviado || isNaN(enviado.getTime())) return null
  const fin = new Date(enviado.getTime() + HORAS_BLOQUEO_CODIGO * 3600 * 1000)
  return fin > new Date() ? fin : null
}

/** Pregunta al servidor cuándo se pidió el último código. Sin internet no bloquea (el servidor sí). */
export async function bloqueoPorCodigo(supabase) {
  try {
    const { data, error } = await supabase.auth.getUser()
    return error ? null : finBloqueo(data?.user?.recovery_sent_at)
  } catch (_) {
    return null
  }
}

/** "lunes, 13 de oct, 3:52 p. m." en el idioma de la app. */
export function fechaBloqueo(fecha, lang) {
  const loc = { es: 'es-CO', en: 'en-US', pt: 'pt-BR' }[lang] || 'es-CO'
  return fecha.toLocaleString(loc, { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
