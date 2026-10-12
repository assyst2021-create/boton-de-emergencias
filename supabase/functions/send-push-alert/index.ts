/**
 * Edge Function: send-push-alert — notificaciones de la PÁGINA WEB (Web Push, en el navegador del
 * computador o del celular). La llama la base de datos cuando se crea una alerta. Las de la app las
 * manda enviar-notificacion-fcm.
 *
 * Versión 95: antes le avisaba a TODOS los que tienen al emisor como familiar, sin mirar a quién
 * escogió con 👥 (la app sí lo respetaba, pero el navegador no). Ahora, igual que la de la app:
 *  - La alerta se confirma en la base: lo que diga la petición no se cree (nadie puede inventar una
 *    alerta llamando esta función directamente).
 *  - Solo a los familiares escogidos (null = todo el grupo) y solo a quien está en la lista del emisor.
 *  - En el idioma de cada familiar.
 */
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

/**
 * Cada aviso sale una sola vez (versión 95). Con la llave pública cualquiera puede llamar esta
 * función; lo que pide se confirma en la base, pero repetir la llamada volvía a mandar el mismo aviso
 * (alguien podía inundar a una familia). Ahora cada aviso real se anota en avisos_enviados y uno
 * repetido no sale. Si la tabla aún no existe o algo falla, el aviso sale igual: en una emergencia,
 * que llegue va primero.
 */
async function primeraVez(clave: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('avisos_enviados').insert({ clave })
    return error?.code !== '23505'
  } catch (_) {
    return true
  }
}

const EMOJI: Record<string, string> = { red: '🔴', orange: '🟠', green: '🟢' }
// En el idioma de quien la recibe (las mismas palabras de las notificaciones de la app)
const TEXTOS: Record<string, Record<string, string>> = {
  es: {
    red: 'EN PELIGRO', orange: 'HERIDO / NECESITO AYUDA', green: 'ESTOY BIEN / A SALVO',
    conUbi: 'Toca para ver su ubicación en el mapa.', sinUbi: 'Abre el Historial de alertas para contactarle.',
    unFamiliar: 'Un familiar', ver: '📍 Ver ubicación', ok: '✓ Entendido',
  },
  en: {
    red: 'IN DANGER', orange: 'INJURED / NEED HELP', green: 'I AM SAFE',
    conUbi: 'Tap to see their location on the map.', sinUbi: 'Open the Alert history to contact them.',
    unFamiliar: 'A family member', ver: '📍 See location', ok: '✓ Got it',
  },
  pt: {
    red: 'EM PERIGO', orange: 'FERIDO / PRECISO DE AJUDA', green: 'ESTOU BEM',
    conUbi: 'Toque para ver a localização no mapa.', sinUbi: 'Abra o Histórico de alertas para entrar em contato.',
    unFamiliar: 'Um familiar', ver: '📍 Ver localização', ok: '✓ Entendi',
  },
}

const responder = (texto: string, status = 200) => new Response(texto, { status })

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const pedida = body?.record || {}
    if (!pedida.id) return responder('sin datos')

    // La alerta como está en la base (no la que diga la petición)
    const { data: alerta } = await supabase
      .from('alerts')
      .select('id, sender_id, status_type, latitude, longitude, expires_at, destinatarios')
      .eq('id', pedida.id)
      .maybeSingle()
    const vigente = !!alerta && (!alerta.expires_at || new Date(alerta.expires_at) > new Date())
    if (!vigente || (pedida.sender_id && pedida.sender_id !== alerta.sender_id)) return responder('no confirmada')
    const emisorId = alerta.sender_id
    // Cada alerta avisa una sola vez en la página web
    if (!(await primeraVez(`web:${emisorId}:${alerta.id}`))) return responder('repetido')

    const [{ data: emisor }, { data: links }, { data: listaEmisor, error: errLista }] = await Promise.all([
      supabase.from('users').select('full_name').eq('id', emisorId).maybeSingle(),
      // Quienes tienen al emisor como familiar
      supabase.from('family_links').select('user_id').eq('linked_user_id', emisorId).eq('status', 'accepted'),
      // La lista del emisor (la que ve en su app): solo ellos reciben sus alertas
      supabase.from('family_links').select('linked_user_id').eq('user_id', emisorId).eq('status', 'accepted'),
    ])
    let ids = (links || []).map(l => l.user_id as string)
    // Si justo esa consulta fallara, la alerta igual sale (en una emergencia, que llegue va primero)
    if (!errLista && listaEmisor) {
      const enLista = new Set(listaEmisor.map(l => l.linked_user_id as string))
      ids = ids.filter(id => enLista.has(id))
    }
    // Solo a los familiares escogidos con 👥 (vacío o null = todo el grupo familiar)
    const elegidos: string[] | null = Array.isArray(alerta.destinatarios) && alerta.destinatarios.length ? alerta.destinatarios : null
    if (elegidos) ids = ids.filter(id => elegidos.includes(id))
    if (ids.length === 0) return responder('sin destinatarios')

    const [{ data: subs }, { data: perfiles }] = await Promise.all([
      supabase.from('push_subscriptions').select('user_id, endpoint, p256dh, auth').in('user_id', ids),
      supabase.from('users').select('id, idioma').in('id', ids),
    ])
    if (!subs || subs.length === 0) return responder('sin suscripciones')

    const idiomaDe: Record<string, string> = Object.fromEntries((perfiles || []).map(p => [p.id, TEXTOS[p.idioma] ? p.idioma : 'es']))
    const conUbicacion = alerta.latitude != null && alerta.longitude != null

    const envios = subs.map(sub => {
      const tx = TEXTOS[idiomaDe[sub.user_id] || 'es']
      const payload = JSON.stringify({
        titulo: `${EMOJI[alerta.status_type] || '🔴'} ${emisor?.full_name || tx.unFamiliar} — ${tx[alerta.status_type] || tx.red}`,
        cuerpo: conUbicacion ? tx.conUbi : tx.sinUbi,
        tipo: alerta.status_type,
        alertaId: alerta.id,
        url: '/historial',
        ver: tx.ver,
        ok: tx.ok,
      })
      return webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { urgency: 'high', TTL: 86400 },
      ).catch(async (err: { statusCode?: number }) => {
        // Suscripción vencida (410) o que ya no existe (404): se borra
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      })
    })

    await Promise.allSettled(envios)
    return responder('ok')
  } catch (e) {
    console.error('[send-push-alert]', e)
    return responder('error', 500)
  }
})
