/**
 * Edge Function: enviar-notificacion-fcm
 * Se llama desde un Database Webhook cuando se inserta una nueva alerta.
 * Busca los familiares vinculados y les envía una notificación FCM push.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// JWT requiere base64URL (-, _, sin =), no base64 estándar (+, /, =)
function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// La cuenta de servicio se lee una sola vez por instancia
const SA = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!)

// El token de Google dura 1 hora: se reutiliza mientras la instancia siga viva. Pedirlo en
// cada alerta sumaba casi medio segundo antes de que saliera la notificación.
let tokenCache: { valor: string, vence: number } | null = null
async function tokenFcm(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.vence) return tokenCache.valor
  const valor = await getFcmAccessToken()
  tokenCache = { valor, vence: Date.now() + 50 * 60 * 1000 }
  return valor
}

// Genera un token OAuth2 para la API FCM v1 usando la service account
async function getFcmAccessToken(): Promise<string> {
  const sa = SA

  const now = Math.floor(Date.now() / 1000)
  const header = toBase64Url(btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = toBase64Url(btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })))

  const sigInput = `${header}.${payload}`

  // Importar la clave privada RSA
  // La clave puede venir con saltos reales, literales \\n, o sin ninguno.
  const pemKey  = sa.private_key || ''
  const entre   = pemKey.match(/-----BEGIN[^-]*-----([\s\S]*?)-----END/)
  const pemBody = (entre ? entre[1] : pemKey).replace(/[^A-Za-z0-9+/=]/g, '')
  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(sigInput)
  )

  // Convertir signature a base64URL de forma segura (sin spread para arrays grandes)
  const sigArray = new Uint8Array(signature)
  let sigStr = ''
  for (let i = 0; i < sigArray.length; i++) sigStr += String.fromCharCode(sigArray[i])
  const jwt = `${sigInput}.${toBase64Url(btoa(sigStr))}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    console.error('[fcm] OAuth2 falló:', JSON.stringify(tokenData))
    throw new Error('No se pudo obtener access_token de Google')
  }
  return tokenData.access_token
}

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    // El webhook de Supabase envía { type, table, record, ... }
    const alerta = body.record || body
    // Para ubicación en vivo el registro trae user_id en vez de sender_id
    if (body.tipo === 'ubicacion' && alerta?.user_id) alerta.sender_id = alerta.user_id

    if (!alerta?.sender_id) {
      return new Response(JSON.stringify({ ok: false, msg: 'sin sender_id' }), { status: 200 })
    }

    // Familiares que reciben la notificación, datos del emisor y token de Google, todo a la vez
    const [{ data: links }, { data: emisor }, accessToken] = await Promise.all([
      supabase
        .from('family_links')
        .select('user_id, users!family_links_user_id_fkey(full_name, fcm_token)')
        .eq('linked_user_id', alerta.sender_id)
        .eq('status', 'accepted'),
      supabase
        .from('users')
        .select('full_name')
        .eq('id', alerta.sender_id)
        .maybeSingle(),
      tokenFcm(),
    ])

    // Solo a los familiares elegidos: destinatarios (alerta) o compartir_con (ubicación).
    // Vacío o null = todo el grupo familiar, como siempre.
    const elegidos: string[] | null = body.tipo === 'ubicacion' ? alerta.compartir_con : alerta.destinatarios
    const destino = Array.isArray(elegidos) && elegidos.length
      ? (links || []).filter(l => elegidos.includes(l.user_id))
      : (links || [])

    if (destino.length === 0) {
      return new Response(JSON.stringify({ ok: true, enviadas: 0 }), { status: 200 })
    }

    const nombre = emisor?.full_name || 'Un familiar'
    let titulo: string, cuerpo: string
    if (body.tipo === 'ubicacion') {
      titulo = '📍 Ubicación en vivo'
      cuerpo = `${nombre} está compartiendo su ubicación contigo`
    } else {
      const tipo = alerta.status_type
      const emoji = tipo === 'red' ? '🔴' : tipo === 'orange' ? '🟠' : '🟢'
      titulo = tipo === 'red' ? '¡EMERGENCIA!' : tipo === 'orange' ? '¡Necesita ayuda!' : 'Está a salvo'
      cuerpo = `${emoji} ${nombre} ${tipo === 'red' ? 'está en peligro' : tipo === 'orange' ? 'está herido y necesita ayuda médica' : 'está bien y a salvo'}`
    }

    const projectId = SA.project_id

    const tokens = destino.map(l => (l.users as any)?.fcm_token).filter(Boolean)
    const resultados = await Promise.all(tokens.map(async (fcmToken: string) => {
      const fcmRes = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: fcmToken,
              notification: { title: titulo, body: cuerpo },
              android: {
                priority: 'high',
                notification: {
                  channel_id: 'alertas_v3',
                  sound: 'default',
                  default_vibrate_timings: true,
                  notification_priority: 'PRIORITY_MAX',
                  visibility: 'PUBLIC',
                },
              },
            },
          }),
        }
      )
      // Si Google rechaza el token guardado, la próxima alerta pide uno nuevo
      if (fcmRes.status === 401) tokenCache = null
      if (!fcmRes.ok) console.warn('[fcm] error:', JSON.stringify(await fcmRes.json()))
      return fcmRes.ok
    }))
    const enviadas = resultados.filter(Boolean).length

    return new Response(JSON.stringify({ ok: true, enviadas }), { status: 200 })
  } catch (e) {
    console.error('[fcm]', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
