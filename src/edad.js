/**
 * Verificación de edad para Brasil (versión 104, ley ECA Digital). Solo en el celular y solo si la
 * SIM es de Brasil: se le pregunta una vez a la tienda de aplicaciones si la persona es menor de edad.
 * La tienda solo responde un rango de edad; nada se guarda en el servidor (solo una marca en este
 * celular de que ya se preguntó). En el resto del mundo no pasa nada.
 *
 * Devuelve true si hay que mostrar el aviso de la autorización de los padres: menor de 18 años y sin
 * supervisión de sus padres (si los padres supervisan la cuenta, ellos ya manejan su edad).
 */
import { registerPlugin } from '@capacitor/core'

const Edad = registerPlugin('Edad')
const EN_CAPACITOR = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

const claveRevisada = uid => `edadRevisada_${uid}`

export async function revisarEdadBrasil(uid) {
  if (!EN_CAPACITOR || !uid) return false
  try { if (localStorage.getItem(claveRevisada(uid))) return false } catch (_) { return false }
  const { pais } = await Edad.pais().catch(() => ({}))
  if (pais !== 'br') return false
  const r = await Edad.consultar().catch(() => null)
  // Sin conexión con la tienda o error: se vuelve a intentar la próxima vez que se abra la app
  if (!r || r.estado === 'error') return false
  try { localStorage.setItem(claveRevisada(uid), '1') } catch (_) {}
  return r.estado === 'compartido' && r.hasta != null && r.hasta < 18 && !r.supervisado
}
