/**
 * Edge Function: activar-premium
 * Verifica con Google Play que la suscripción sea real y vigente, y solo entonces
 * activa el plan del usuario que hace la llamada (no el que diga el body).
 * También sirve para sincronizar renovaciones/cancelaciones: la app la llama
 * al abrir con las compras que Google le reporta.
 *
 * Versión 95 (pagos que no pueden fallar):
 *  - Una suscripción que se renueva sola guardaba su vencimiento + 1 DÍA: si terminaba y la persona
 *    no abría la app, seguía como Premium hasta un día después. Ahora el margen es de 15 minutos.
 *  - Revisión automática ({ revisar: true }; la llama la base cada 5 minutos): le pregunta a Google por
 *    las suscripciones que vencen pronto o ya vencieron (renovación, fin), por todas las vigentes cada
 *    6 horas (reembolsos, cancelaciones) y reintenta las compras que no se pudieron confirmar al
 *    comprar. Así el plan se pone y se quita a tiempo aunque la persona no abra la app.
 *  - Una compra que Google aún no confirma (pago pendiente o error de Google) queda anotada en
 *    compras_pendientes: nunca se pierde.
 *
 * Versión 101 (cada compra para quien la hizo): Google da la compra a la CUENTA DE GOOGLE del
 * celular, no al usuario de la app, y la app reporta todas las compras de esa cuenta de Google al
 * abrirse. Si otro usuario de la app estaba abierto con la misma cuenta de Google (otro celular,
 * tablet o emulador), se quedaba con la compra (pasó el 15-10 con @caldon y michael1617).
 *  - Desde la app 101, al comprar se le pasa a Google la huella del usuario que compra
 *    (obfuscatedAccountId = SHA-256 de su id). Esa compra solo se activa para ese usuario; si quedó
 *    en otro, se le quita y pasa a su dueño.
 *  - Compras sin huella (apps de antes): la que ya está anotada como pendiente de un usuario no se
 *    la puede quedar otro, y la primera anotación no se cambia.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type SupabaseClient = ReturnType<typeof createClient>

const PAQUETE = 'com.ssthechofacil.botonemergencias'
// CANCELED = la persona canceló la renovación pero YA PAGÓ hasta la fecha de vencimiento: conserva
// el plan hasta ese día (antes se le quitaba apenas abría la app después de cancelar)
const ESTADOS_VIGENTES = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']
// Pago que Google todavía no confirma (por ejemplo, en efectivo o una tarjeta lenta)
const ESTADO_PENDIENTE = 'SUBSCRIPTION_STATE_PENDING'
// Suscripción que se renueva sola: margen corto para que la renovación alcance a llegar (la revisión
// automática pregunta cada 5 minutos). Antes era 1 día y el Premium seguía después de vencer.
const MARGEN_RENOVACION_MS = 15 * 60 * 1000
// Revisión automática
const ENTRE_REVISIONES_MS = 2 * 60 * 1000          // no corre dos veces seguidas aunque la llamen
const VENTANA_VENCE_MS = 20 * 60 * 1000            // las que vencen en los próximos 20 minutos
const VENCIDAS_HASTA_MS = 3 * 24 * 60 * 60 * 1000  // y las que vencieron hace menos de 3 días
const REVISAR_TODAS_CADA_MS = 6 * 60 * 60 * 1000   // todas las vigentes, cada 6 horas
const PENDIENTE_MAX_MS = 3 * 24 * 60 * 60 * 1000   // Google devuelve el dinero si nadie confirma en 3 días

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

// deno-lint-ignore no-explicit-any
type Suscripcion = any

/** Lo que Google dice de esa compra. */
async function consultarGoogle(acceso: string, token: string): Promise<{ ok: boolean, status: number, sub: Suscripcion }> {
  const r = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PAQUETE}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`,
    { headers: { Authorization: `Bearer ${acceso}` } },
  )
  const sub = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, sub }
}

/** Huella del usuario que se le pasa a Google al comprar (la misma que calcula la app). */
async function huellaUsuario(userId: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}
/** El usuario que hizo la compra, si la app le dejó su huella a Google (app 101 en adelante). */
const huellaDeCompra = (sub: Suscripcion): string | null =>
  sub?.externalAccountIdentifiers?.obfuscatedExternalAccountId || null

/**
 * Una compra que quedó en otro usuario (antes de la 101 podía pasar): se le quita. Si ese usuario
 * tiene Premium regalado vigente, lo conserva.
 */
async function soltarCompraDe(supabase: SupabaseClient, otroId: string, token: string) {
  const { data: u } = await supabase.from('users').select('premium_regalo_hasta').eq('id', otroId).maybeSingle()
  const regalo: string | null = u?.premium_regalo_hasta || null
  const conRegalo = !!regalo && new Date(regalo).getTime() > Date.now()
  await supabase.from('users').update(conRegalo
    ? { plan: 'premium', is_premium: true, premium_hasta: regalo, play_purchase_token: null }
    : { plan: 'basico', is_premium: false, play_purchase_token: null })
    .eq('id', otroId).eq('play_purchase_token', token)
}

/**
 * Anota (o borra) una compra que Google todavía no confirma. Si la tabla aún no existe, no pasa nada.
 * La primera anotación se respeta: la hace la pantalla de pago apenas se compra (versión 101: antes
 * otro usuario abierto con la misma cuenta de Google podía cambiarla a su nombre).
 */
async function anotarPendiente(supabase: SupabaseClient, token: string, userId: string, estado: string) {
  const { data: previa } = await supabase.from('compras_pendientes').select('intentos, user_id').eq('token', token).maybeSingle()
  if (previa && previa.user_id !== userId) return
  await supabase.from('compras_pendientes').upsert({
    token, user_id: userId, intentos: (previa?.intentos || 0) + 1, ultimo_estado: estado,
  }, { onConflict: 'token' })
}
async function quitarPendiente(supabase: SupabaseClient, token: string) {
  await supabase.from('compras_pendientes').delete().eq('token', token)
}
async function marcarRevisada(supabase: SupabaseClient, userId: string, estado: string) {
  await supabase.from('suscripciones_revision').upsert({ user_id: userId, revisado_at: new Date().toISOString(), estado }, { onConflict: 'user_id' })
}

/**
 * Aplica al usuario lo que Google dice de su suscripción (la misma lógica de siempre). Devuelve lo
 * que se le responde a la app: { ok: true, plan, vence } o { ok: false, estado, ... }.
 */
async function aplicarSuscripcion(supabase: SupabaseClient, acceso: string, userId: string, token: string, sub: Suscripcion) {
  const item = (sub.lineItems || [])[0]
  const productId: string = item?.productId || ''
  const venceGoogle: string | null = item?.expiryTime || null
  const vigente = ESTADOS_VIGENTES.includes(sub.subscriptionState) && !!venceGoogle && new Date(venceGoogle) > new Date()
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
  // reembolso lo quita. Todo lo demás refleja exactamente lo que dice Google.
  const { data: actual } = await supabase.from('users')
    .select('premium_regalo_hasta').eq('id', userId).maybeSingle()
  const regaloHasta: string | null = actual?.premium_regalo_hasta || null
  const regaloMs = regaloHasta ? new Date(regaloHasta).getTime() : 0
  const regaloVigente = regaloMs > Date.now()

  if (!vigente) {
    if (regaloVigente) {
      // Se acabó (o se reembolsó) la compra, pero el regalo sigue
      await supabase.from('users').update({ plan: 'premium', is_premium: true, premium_hasta: regaloHasta })
        .eq('id', userId).eq('play_purchase_token', token)
      return { ok: false, estado: sub.subscriptionState, conserva: 'premium' }
    }
    await supabase.from('users').update({ plan: 'basico', is_premium: false })
      .eq('id', userId).eq('play_purchase_token', token)
    return { ok: false, estado: sub.subscriptionState, pendiente: sub.subscriptionState === ESTADO_PENDIENTE }
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
  }).eq('id', userId)
  if (error) throw error

  return { ok: true, plan, vence: hasta }
}

/** Una compra desde la app (o la sincronización al abrirla): la persona de la sesión. */
async function activarDesdeApp(supabase: SupabaseClient, userId: string, token: string) {
  const [{ data: otro }, { data: anotada }] = await Promise.all([
    supabase.from('users').select('id').eq('play_purchase_token', token).neq('id', userId).maybeSingle(),
    supabase.from('compras_pendientes').select('user_id').eq('token', token).maybeSingle(),
  ])

  const acceso = await tokenGooglePlay()
  const g = await consultarGoogle(acceso, token)

  // ¿De quién es? Con la huella que la app 101 le deja a Google, se sabe con certeza
  const huella = g.ok ? huellaDeCompra(g.sub) : null
  if (huella) {
    if (huella !== await huellaUsuario(userId)) return json({ error: 'compra_de_otra_cuenta' }, 409)
    // Es de quien llama: si había quedado en otro usuario, se le quita
    if (otro) await soltarCompraDe(supabase, otro.id, token)
  } else {
    // Sin huella (compras de apps anteriores): un mismo pago no puede activar dos cuentas, y la que
    // ya está anotada como pendiente de un usuario no se la puede quedar otro
    if (otro) return json({ error: 'compra_de_otra_cuenta' }, 409)
    if (anotada && anotada.user_id !== userId) return json({ error: 'compra_de_otra_cuenta' }, 409)
  }

  if (!g.ok) {
    console.error('[activar-premium] Google respondió', g.status, JSON.stringify(g.sub))
    // Se anota: la revisión automática la vuelve a intentar cada 5 minutos (aunque cierre la app)
    await anotarPendiente(supabase, token, userId, `google_${g.status}`)
    return json({ error: 'google_no_confirma' }, 402)
  }

  const res = await aplicarSuscripcion(supabase, acceso, userId, token, g.sub)
  if (res.ok) await quitarPendiente(supabase, token)
  else if (res.pendiente) await anotarPendiente(supabase, token, userId, ESTADO_PENDIENTE)
  else await quitarPendiente(supabase, token)
  await marcarRevisada(supabase, userId, g.sub.subscriptionState || '')
  return json(res)
}

/** Revisión automática (cada 5 minutos, desde la base). */
async function revisarSuscripciones(supabase: SupabaseClient) {
  // Turno: si otra revisión corrió hace menos de 2 minutos, esta no hace nada
  const ahora = Date.now()
  const { data: turno, error: errTurno } = await supabase.from('app_config')
    .update({ valor: new Date(ahora).toISOString() })
    .eq('clave', 'revision_suscripciones')
    .lt('valor', new Date(ahora - ENTRE_REVISIONES_MS).toISOString())
    .select('clave')
  if (errTurno) throw errTurno
  if (!turno?.length) return { omitida: true }

  const acceso = await tokenGooglePlay()
  const resumen = { pendientes: 0, activadas: 0, revisadas: 0, quitadas: 0, errores: 0 }

  // 1) Compras que no se pudieron confirmar al comprar
  const { data: pendientes } = await supabase.from('compras_pendientes')
    .select('token, user_id, creada_at').order('creada_at').limit(50)
  for (const p of pendientes || []) {
    resumen.pendientes++
    const viejaMs = ahora - new Date(p.creada_at).getTime()
    try {
      const { data: otro } = await supabase.from('users').select('id')
        .eq('play_purchase_token', p.token).neq('id', p.user_id).maybeSingle()
      const g = await consultarGoogle(acceso, p.token)
      // Con huella (app 101): solo para su dueño; si quedó en otro usuario, pasa a su dueño
      const huella = g.ok ? huellaDeCompra(g.sub) : null
      if (huella && huella !== await huellaUsuario(p.user_id)) { await quitarPendiente(supabase, p.token); continue }
      if (otro) {
        if (!huella) { await quitarPendiente(supabase, p.token); continue }
        await soltarCompraDe(supabase, otro.id, p.token)
      }
      if (!g.ok) {
        if (viejaMs > PENDIENTE_MAX_MS) await quitarPendiente(supabase, p.token)
        else await anotarPendiente(supabase, p.token, p.user_id, `google_${g.status}`)
        continue
      }
      const res = await aplicarSuscripcion(supabase, acceso, p.user_id, p.token, g.sub)
      if (res.ok) { resumen.activadas++; await quitarPendiente(supabase, p.token) }
      else if (res.pendiente && viejaMs <= PENDIENTE_MAX_MS) await anotarPendiente(supabase, p.token, p.user_id, ESTADO_PENDIENTE)
      else await quitarPendiente(supabase, p.token)
      await marcarRevisada(supabase, p.user_id, g.sub.subscriptionState || '')
    } catch (e) {
      resumen.errores++
      console.error('[activar-premium] pendiente', e)
    }
  }

  // 2) Suscripciones que vencen en los próximos minutos o ya vencieron (hace menos de 3 días)
  const limite = new Date(ahora + VENTANA_VENCE_MS).toISOString()
  const { data: porVencer } = await supabase.from('users')
    .select('id, play_purchase_token')
    .not('play_purchase_token', 'is', null)
    // Solo quien todavía figura con plan pago (a quien ya se le quitó no se le pregunta más)
    .in('plan', ['premium', 'familiar'])
    .gt('premium_hasta', new Date(ahora - VENCIDAS_HASTA_MS).toISOString())
    .lt('premium_hasta', limite)
    .limit(100)
  // 3) Las vigentes que no se revisan hace 6 horas (reembolsos, cancelaciones, cambios de plan)
  const { data: vigentes } = await supabase.from('users')
    .select('id, play_purchase_token')
    .not('play_purchase_token', 'is', null)
    .in('plan', ['premium', 'familiar'])
    .gte('premium_hasta', limite)
    .limit(500)
  const { data: revisiones } = vigentes?.length
    ? await supabase.from('suscripciones_revision').select('user_id, revisado_at').in('user_id', vigentes.map(v => v.id))
    : { data: [] }
  const revisadoMs: Record<string, number> = Object.fromEntries((revisiones || []).map(r => [r.user_id, new Date(r.revisado_at).getTime()]))
  const tocaRevisar = (vigentes || []).filter(v => !revisadoMs[v.id] || ahora - revisadoMs[v.id] > REVISAR_TODAS_CADA_MS).slice(0, 50)

  const vistos = new Set<string>()
  const lista = [...(porVencer || []), ...tocaRevisar].filter(u => !vistos.has(u.id) && vistos.add(u.id))
  // De a 5 a la vez
  for (let i = 0; i < lista.length; i += 5) {
    await Promise.all(lista.slice(i, i + 5).map(async u => {
      resumen.revisadas++
      try {
        const g = await consultarGoogle(acceso, u.play_purchase_token)
        // Si Google no responde, no se cambia nada (se vuelve a preguntar en la próxima revisión)
        if (!g.ok) { resumen.errores++; console.warn('[activar-premium] revisión: Google respondió', g.status); return }
        const res = await aplicarSuscripcion(supabase, acceso, u.id, u.play_purchase_token, g.sub)
        if (!res.ok && !res.conserva) resumen.quitadas++
        await marcarRevisada(supabase, u.id, g.sub.subscriptionState || '')
      } catch (e) {
        resumen.errores++
        console.error('[activar-premium] revisión', e)
      }
    }))
  }
  return resumen
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json().catch(() => ({}))

    // Revisión automática: deja la base igual a lo que dice Google (nada se activa sin que Google lo confirme)
    if (body?.revisar === true) return json({ ok: true, ...(await revisarSuscripciones(supabase)) })

    // El usuario sale de su sesión, nunca del body
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(jwt)
    if (!user) return json({ error: 'no_autenticado' }, 401)

    const token = body?.token
    if (!token) return json({ error: 'token requerido' }, 400)
    return await activarDesdeApp(supabase, user.id, token)
  } catch (e) {
    console.error('[activar-premium]', e)
    return json({ error: String(e) }, 500)
  }
})
