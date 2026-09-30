/**
 * Edge Function: disparar-alertas-auto
 *
 * Se ejecuta cada 5 minutos via cron de Supabase.
 * Busca alertas programadas (scheduled_alerts) cuyo scheduled_at ya pasó,
 * las inserta en la tabla alerts y las marca como fired=true.
 * Esto funciona aunque el teléfono del usuario esté apagado o sin app abierta.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (_req) => {
  try {
    const ahora = new Date().toISOString()

    // Buscar todas las alertas programadas que ya vencieron y no se han disparado
    const { data: pendientes, error } = await supabase
      .from('scheduled_alerts')
      .select('*')
      .eq('fired', false)
      .lte('scheduled_at', ahora)

    if (error) throw error
    if (!pendientes || pendientes.length === 0) {
      return new Response(JSON.stringify({ disparadas: 0 }), { status: 200 })
    }

    let disparadas = 0
    for (const item of pendientes) {
      // Primero se "toma" (fired=true solo si seguía en false). Si la app ya la tomó, se salta:
      // así nunca salen dos alertas iguales ni se reenvía en bucle.
      const { data: tomada } = await supabase.from('scheduled_alerts')
        .update({ fired: true }).eq('id', item.id).eq('fired', false).select('id')
      if (!tomada?.length) continue

      const sentAt = new Date()
      const expiresAt = new Date(sentAt.getTime() + 24 * 60 * 60 * 1000)
      const { error: insErr } = await supabase.from('alerts').insert({
        sender_id: item.user_id,
        status_type: item.status_type,
        latitude: item.latitude,
        longitude: item.longitude,
        sent_at: sentAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        is_auto: true,
        // La segunda alerta va a las mismas personas que la primera (null = todos)
        ...(item.destinatarios?.length ? { destinatarios: item.destinatarios } : {}),
      })
      if (insErr) {
        // No se pudo enviar: se devuelve a pendiente para el próximo ciclo
        await supabase.from('scheduled_alerts').update({ fired: false }).eq('id', item.id)
        console.error('[disparar-alertas-auto] insert', insErr)
        continue
      }
      disparadas++
    }

    return new Response(JSON.stringify({ disparadas }), { status: 200 })
  } catch (e) {
    console.error('[disparar-alertas-auto]', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
