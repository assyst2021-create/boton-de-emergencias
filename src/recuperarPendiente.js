/**
 * Recuperar celular con el celular apagado, sin señal o en modo avión (versión 99).
 * La orden queda guardada en el servidor y normalmente le llega sola al celular apenas se conecta.
 * Si aun así no le llegó (por ejemplo, en ese momento el celular no podía recibir avisos), la app de
 * este celular, al abrirse o al volver la señal, la pide de nuevo. Solo hace algo si hay una
 * recuperación activa de esta cuenta que todavía no ha empezado; si no, no cambia nada.
 */
import { supabase } from './supabase'

const EN_CAPACITOR = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

// Como mucho una vez cada 2 minutos (es una consulta pequeña, pero no hace falta más)
const CADA_MS = 120000
let ultimaRevision = 0

export async function revisarRecuperacionPendiente(uid) {
  if (!EN_CAPACITOR || !uid) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  if (Date.now() - ultimaRevision < CADA_MS) return
  ultimaRevision = Date.now()
  try {
    const { data, error } = await supabase.from('recuperacion_sesiones').select('id')
      .eq('owner_id', uid).eq('estado', 'activa')
      .gt('vence_at', new Date().toISOString())
      .limit(1)
    if (error || !data?.length) return
    // El servidor revisa que siga activa y que este celular todavía no haya mandado su ubicación
    await supabase.functions.invoke('recuperar-celular', { body: { accion: 'pendiente' } })
  } catch (_) { /* sin señal: se intenta la próxima vez */ }
}
