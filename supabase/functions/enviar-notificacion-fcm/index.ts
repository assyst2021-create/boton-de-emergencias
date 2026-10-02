/**
 * Edge Function: enviar-notificacion-fcm
 * Se llama desde un Database Webhook cuando se inserta una nueva alerta.
 * Busca los familiares vinculados y les envía una notificación FCM push,
 * en el idioma y con la hora de cada familiar (versión 89).
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

// Textos de la notificación en el idioma de QUIEN LA RECIBE (las mismas palabras del Historial)
const TEXTOS: Record<string, Record<string, string>> = {
  es: {
    red: 'EN PELIGRO', orange: 'HERIDO / NECESITO AYUDA', green: 'ESTOY BIEN / A SALVO',
    auto: 'Alerta automática', conUbi: '📍 Toca para ver su ubicación', sinUbi: '📍 Sin ubicación por ahora',
    ubiDe: '📍 Ubicación de', verMapa: 'Toca para verla en el mapa',
    vivoTitulo: '📍 Ubicación en vivo', vivo: 'está compartiendo su ubicación contigo',
    mov: 'Se está moviendo · Míralo en En vivo', unFamiliar: 'Un familiar',
  },
  en: {
    red: 'IN DANGER', orange: 'INJURED / NEED HELP', green: 'I AM SAFE',
    auto: 'Automatic alert', conUbi: '📍 Tap to see their location', sinUbi: '📍 No location yet',
    ubiDe: '📍 Location of', verMapa: 'Tap to see it on the map',
    vivoTitulo: '📍 Live location', vivo: 'is sharing their location with you',
    mov: 'Is on the move · See it in Live', unFamiliar: 'A family member',
  },
  pt: {
    red: 'EM PERIGO', orange: 'FERIDO / PRECISO DE AJUDA', green: 'ESTOU BEM',
    auto: 'Alerta automático', conUbi: '📍 Toque para ver a localização', sinUbi: '📍 Sem localização por enquanto',
    ubiDe: '📍 Localização de', verMapa: 'Toque para ver no mapa',
    vivoTitulo: '📍 Localização ao vivo', vivo: 'está compartilhando a localização com você',
    mov: 'Está em movimento · Veja em Ao vivo', unFamiliar: 'Um familiar',
  },
}
const LOCALES: Record<string, string> = { es: 'es-CO', en: 'en-US', pt: 'pt-BR' }

/** Zona horaria guardada por el celular del familiar; si no sirve, la de Colombia. */
function zonaValida(zona?: string | null): string {
  try { if (zona) { new Intl.DateTimeFormat('en-US', { timeZone: zona }); return zona } } catch (_) { /* inválida */ }
  return 'America/Bogota'
}
/** "15:42 · 2 oct" en el idioma y la hora del familiar. */
function horaYFecha(iso: string | null | undefined, idioma: string, zona?: string | null): string {
  let d = iso ? new Date(iso) : new Date()
  // Un celular con la hora mal puesta no debe mostrar una alerta "del futuro"
  if (isNaN(d.getTime()) || d.getTime() > Date.now() + 5 * 60 * 1000) d = new Date()
  const loc = LOCALES[idioma] || 'es-CO'
  const timeZone = zonaValida(zona)
  const hora = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', timeZone })
  const dia = d.toLocaleDateString(loc, { day: 'numeric', month: 'short', timeZone })
  return `${hora} · ${dia}`
}

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    // El webhook de Supabase envía { type, table, record, ... }
    const pedida = body.record || body
    // Ubicación en vivo (empezó a compartir / se está moviendo): el registro trae user_id
    const esUbicacion = body.tipo === 'ubicacion' || body.tipo === 'movimiento'
    // Una alerta que salió sin GPS y ya tiene la ubicación: segundo aviso con el mapa
    const esUbicacionAlerta = body.tipo === 'ubicacion_alerta'
    const emisorId: string | undefined = esUbicacion ? pedida?.user_id : pedida?.sender_id

    if (!emisorId || (!esUbicacion && !pedida?.id)) {
      return new Response(JSON.stringify({ ok: false, msg: 'sin datos' }), { status: 200 })
    }

    // Lo que dice la petición se confirma en la base y se usan los datos de la base: así nadie
    // puede inventar una alerta o un aviso de ubicación llamando esta función directamente.
    // Va en paralelo con lo demás, no demora la notificación.
    const confirmar = esUbicacion
      ? supabase.from('live_locations').select('*').eq('user_id', emisorId).maybeSingle()
      : supabase.from('alerts').select('*').eq('id', pedida.id).maybeSingle()

    // Familiares con su idioma y zona horaria. Si esas columnas aún no existen en la base
    // (falta el SQL), se piden sin ellas: la notificación nunca deja de salir por eso.
    const pedirFamilia = async () => {
      const completo = await supabase.from('family_links')
        .select('user_id, users!family_links_user_id_fkey(full_name, fcm_token, idioma, zona_horaria)')
        .eq('linked_user_id', emisorId).eq('status', 'accepted')
      if (!completo.error) return completo
      return await supabase.from('family_links')
        .select('user_id, users!family_links_user_id_fkey(full_name, fcm_token)')
        .eq('linked_user_id', emisorId).eq('status', 'accepted')
    }

    // Familiares que reciben la notificación, datos del emisor y token de Google, todo a la vez
    const [{ data: alerta }, { data: links }, { data: emisor }, accessToken] = await Promise.all([
      confirmar,
      pedirFamilia(),
      supabase
        .from('users')
        .select('full_name')
        .eq('id', emisorId)
        .maybeSingle(),
      tokenFcm(),
    ])

    // Alerta que no existe, de otra persona o ya vencida; ubicación que no se está compartiendo
    const confirmada = esUbicacion
      ? !!alerta?.activo
      : !!alerta && alerta.sender_id === emisorId && (!alerta.expires_at || new Date(alerta.expires_at) > new Date())
        && (!esUbicacionAlerta || (alerta.latitude != null && alerta.longitude != null))
    if (!confirmada) {
      return new Response(JSON.stringify({ ok: false, msg: 'no confirmada en la base' }), { status: 200 })
    }

    // Solo a los familiares elegidos: destinatarios (alerta) o compartir_con (ubicación).
    // Vacío o null = todo el grupo familiar, como siempre.
    const elegidos: string[] | null = esUbicacion ? alerta.compartir_con : alerta.destinatarios
    const destino = Array.isArray(elegidos) && elegidos.length
      ? (links || []).filter(l => elegidos.includes(l.user_id))
      : (links || [])

    if (destino.length === 0) {
      return new Response(JSON.stringify({ ok: true, enviadas: 0 }), { status: 200 })
    }

    // Cada familiar recibe el texto en su idioma y con su hora
    const armar = (idiomaGuardado?: string | null, zona?: string | null) => {
      const idioma = TEXTOS[idiomaGuardado || ''] ? idiomaGuardado as string : 'es'
      const tx = TEXTOS[idioma]
      const nombre = emisor?.full_name || tx.unFamiliar
      if (body.tipo === 'ubicacion') {
        return { titulo: tx.vivoTitulo, cuerpo: `${nombre} ${tx.vivo}`, ruta: 'ubicacion' }
      }
      if (body.tipo === 'movimiento') {
        return { titulo: `🚶 ${nombre}`, cuerpo: tx.mov, ruta: 'ubicacion' }
      }
      const tipo = alerta.status_type
      const emoji = tipo === 'red' ? '🔴' : tipo === 'orange' ? '🟠' : '🟢'
      const estado = tipo === 'red' ? tx.red : tipo === 'orange' ? tx.orange : tx.green
      const cuando = horaYFecha(alerta.sent_at, idioma, zona)
      if (esUbicacionAlerta) {
        return { titulo: `${tx.ubiDe} ${nombre}`, cuerpo: `${emoji} ${estado} · ${cuando}\n${tx.verMapa}`, ruta: 'historial' }
      }
      // Igual que en el Historial: el nombre arriba y el estado debajo, con las mismas palabras
      const conUbicacion = alerta.latitude != null && alerta.longitude != null
      return {
        titulo: `${emoji} ${nombre}`,
        cuerpo: `${estado}${alerta.is_auto ? ` · ${tx.auto}` : ''} · ${cuando}\n${conUbicacion ? tx.conUbi : tx.sinUbi}`,
        ruta: 'historial',
      }
    }

    const projectId = SA.project_id

    const envios = destino
      .map(l => ({ fcmToken: (l.users as any)?.fcm_token, ...armar((l.users as any)?.idioma, (l.users as any)?.zona_horaria) }))
      .filter(e => e.fcmToken)
    const resultados = await Promise.all(envios.map(async ({ fcmToken, titulo, cuerpo, ruta }) => {
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
              // Al tocarla, la app abre la pestaña donde está la información
              data: { ruta },
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
