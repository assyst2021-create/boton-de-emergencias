/**
 * Edge Function: activar-premium
 * Verifica con Google Play que la suscripción sea real y vigente, y solo entonces
 * activa el plan del usuario que hace la llamada (no el que diga el body).
 * También sirve para sincronizar renovaciones/cancelaciones: la app la llama
 * al abrir con las compras que Google le reporta.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PAQUETE = 'com.ssthechofacil.botonemergencias'
// CANCELED = la persona canceló la renovación pero YA PAGÓ hasta la fecha de vencimiento: conserva
// el plan hasta ese día (antes se le quitaba apenas abría la app después de cancelar)
const ESTADOS_VIGENTES = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']
// Si Google renueva la suscripción y la persona no abre la app ese día, el plan no se le cae
// mientras tanto: 1 día de margen solo para suscripciones que se renuevan solas
const MARGEN_RENOVACION_MS = 24 * 60 * 60 * 1000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

function toBase64Url(b64: string) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/** Token OAuth2 de la cuenta de servicio con acceso a la API de Google Play. */
async function tokenGooglePlay(): Promise<string> {
  const sa = JSON.parse(Deno.env.get('PLAY_SERVICE_ACCOUNT') || Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!)
  const now = Math.floor(Date.now() / 1000)
  const header = toBase64Url(btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = toBase64Url(btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })))
  const sigInput = `${header}.${payload}`
  const entre = (sa.private_key || '').match(/-----BEGIN[^-]*-----([\s\S]*?)-----END/)
  const pemBody = (entre ? entre[1] : sa.private_key).replace(/[^A-Za-z0-9+/=]/g, '')
  const key = await crypto.subtle.importKey(
    'pkcs8', Uint8Array.from(atob(pemBody), c => c.charCodeAt(0)).buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(sigInput)))
  let s = ''
  for (let i = 0; i < sig.length; i++) s += String.fromCharCode(sig[i])
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${sigInput}.${toBase64Url(btoa(s))}`,
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('OAuth Google Play falló: ' + JSON.stringify(data))
  return data.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // El usuario sale de su sesión, nunca del body
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(jwt)
    if (!user) return json({ error: 'no_autenticado' }, 401)

    const { token } = await req.json()
    if (!token) return json({ error: 'token requerido' }, 400)

    // Un mismo pago no puede activar dos cuentas
    const { data: otro } = await supabase.from('users').select('id')
      .eq('play_purchase_token', token).neq('id', user.id).maybeSingle()
    if (otro) return json({ error: 'compra_de_otra_cuenta' }, 409)

    const acceso = await tokenGooglePlay()
    const r = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PAQUETE}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`,
      { headers: { Authorization: `Bearer ${acceso}` } },
    )
    const sub = await r.json()
    if (!r.ok) {
      console.error('[activar-premium] Google respondió', r.status, JSON.stringify(sub))
      return json({ error: 'google_no_confirma' }, 402)
    }

    const item = (sub.lineItems || [])[0]
    const productId: string = item?.productId || ''
    const venceGoogle: string | null = item?.expiryTime || null
    const vigente = ESTADOS_VIGENTES.includes(sub.subscriptionState) && venceGoogle && new Date(venceGoogle) > new Date()
    const seRenueva = sub.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE' && item?.autoRenewingPlan?.autoRenewEnabled === true
    const vence: string | null = venceGoogle && seRenueva
      ? new Date(new Date(venceGoogle).getTime() + MARGEN_RENOVACION_MS).toISOString()
      : venceGoogle

    // Respaldo: si la app no alcanzó a confirmar el pago a Google (se cerró, sin señal), se confirma
    // aquí. Google devuelve el dinero de las compras que nadie confirma en 3 días.
    if (vigente && productId && sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
      await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PAQUETE}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`,
        { method: 'POST', headers: { Authorization: `Bearer ${acceso}`, 'Content-Type': 'application/json' }, body: '{}' },
      ).then(r => { if (!r.ok) console.warn('[activar-premium] no se pudo confirmar', r.status) }, () => {})
    }

    // El Premium REGALADO se guarda aparte (premium_regalo_hasta): ninguna compra, cancelación ni
    // reembolso lo quita. Todo lo demás refleja exactamente lo que dice Google (antes, la fecha que
    // guardaba la propia compra se confundía con un regalo: un reembolso podía dejar el plan puesto).
    const { data: actual } = await supabase.from('users')
      .select('premium_regalo_hasta').eq('id', user.id).maybeSingle()
    const regaloHasta: string | null = actual?.premium_regalo_hasta || null
    const regaloMs = regaloHasta ? new Date(regaloHasta).getTime() : 0
    const regaloVigente = regaloMs > Date.now()

    if (!vigente) {
      if (regaloVigente) {
        // Se acabó (o se reembolsó) la compra, pero el regalo sigue
        await supabase.from('users').update({ plan: 'premium', is_premium: true, premium_hasta: regaloHasta })
          .eq('id', user.id).eq('play_purchase_token', token)
        return json({ ok: false, estado: sub.subscriptionState, conserva: 'premium' })
      }
      await supabase.from('users').update({ plan: 'basico', is_premium: false })
        .eq('id', user.id).eq('play_purchase_token', token)
      return json({ ok: false, estado: sub.subscriptionState })
    }

    const planCompra = productId.includes('familiar') ? 'familiar' : 'premium'
    const venceMs = vence ? new Date(vence).getTime() : 0
    // Con regalo vigente: Premium hasta lo que dure más (el regalo o la compra Premium)
    const plan = regaloVigente ? 'premium' : planCompra
    const hasta = regaloVigente
      ? (planCompra === 'premium' && venceMs > regaloMs ? vence : regaloHasta)
      : vence
    const { error } = await supabase.from('users').update({
      plan,
      is_premium: plan === 'premium',
      premium_hasta: hasta,
      play_purchase_token: token,
    }).eq('id', user.id)
    if (error) throw error

    return json({ ok: true, plan, vence: hasta })
  } catch (e) {
    console.error('[activar-premium]', e)
    return json({ error: String(e) }, 500)
  }
})
