import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const VAPID_PUBLIC  = 'BCI3dnwVQ3MoJAGxg3VcDHGkXQsB-3-RAVXOG8YRaFbSfpgrJ3QsiC6MzPnGW6ARqp86MobCsvjWw2mku6dL3LE'
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_EMAIL   = 'mailto:assyst2021@ssthechofacil.com'

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const EMOJI: Record<string, string> = { red: '🔴', orange: '🟠', green: '🟢' }
const ESTADO: Record<string, string> = {
  red: 'EN PELIGRO',
  orange: 'HERIDO / NECESITO AYUDA',
  green: 'ESTOY BIEN / A SALVO',
}

Deno.serve(async (req) => {
  try {
    const { record } = await req.json()
    const alerta = record

    // Nombre del remitente
    const { data: sender } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', alerta.sender_id)
      .maybeSingle()

    const nombre = sender?.full_name || 'Un familiar'
    const emoji  = EMOJI[alerta.status_type] || '🔴'
    const estado = ESTADO[alerta.status_type] || 'EN PELIGRO'

    // Buscar todos los usuarios que tienen al remitente como familiar
    const { data: links } = await supabase
      .from('family_links')
      .select('user_id')
      .eq('linked_user_id', alerta.sender_id)
      .eq('status', 'accepted')

    if (!links || links.length === 0) {
      return new Response('sin destinatarios', { status: 200 })
    }

    const destinatarios = links.map(l => l.user_id)

    // Obtener suscripciones push de esos usuarios
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('user_id', destinatarios)

    if (!subs || subs.length === 0) {
      return new Response('sin suscripciones', { status: 200 })
    }

    const payload = JSON.stringify({
      titulo: `${emoji} ${nombre} — ${estado}`,
      cuerpo: alerta.latitude && alerta.longitude
        ? `Toca para ver su ubicación en el mapa.`
        : `Activa ahora el historial para contactarle.`,
      tipo: alerta.status_type,
      alertaId: alerta.id,
      url: '/?tab=historial',
    })

    const envios = subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { urgency: 'high', TTL: 86400 },
      ).catch(err => {
        // Si la suscripción expiró (410) la borramos
        if (err.statusCode === 410) {
          supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      })
    )

    await Promise.allSettled(envios)
    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error('[send-push-alert]', e)
    return new Response('error', { status: 500 })
  }
})
