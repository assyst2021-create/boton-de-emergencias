/**
 * Edge Function: recuperar-celular (solo Android)
 * Antirrobo con consentimiento. La llama un familiar YA VINCULADO que tiene el correo/usuario
 * y la contraseña del dueño del celular perdido o robado.
 *
 * accion 'solicitar': verifica contraseña + vínculo + que el dueño haya activado la recuperación,
 *   crea una sesión de 24 h y una llave, y le manda al celular una orden (dato FCM) para que
 *   empiece a compartir su ubicación solo. Protección contra fuerza bruta: 5 intentos → 30 min.
 * accion 'detener': con la contraseña, cierra la sesión y manda la orden de parar.
 *
 * NO toca las alertas de emergencia. Verify JWT ON: quien llama está autenticado como él mismo.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(URL, SERVICE)

const MAX_INTENTOS = 5
const BLOQUEO_MIN = 30

// ---- Firebase (igual que enviar-notificacion-fcm) ----
function toBase64Url(b64: string): string { return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') }
const SA = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!)
let tokenCache: { valor: string, vence: number } | null = null
async function tokenFcm(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.vence) return tokenCache.valor
  const now = Math.floor(Date.now() / 1000)
  const header = toBase64Url(btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = toBase64Url(btoa(JSON.stringify({
    iss: SA.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })))
  const sigInput = `${header}.${payload}`
  const pemKey = SA.private_key || ''
  const entre = pemKey.match(/-----BEGIN[^-]*-----([\s\S]*?)-----END/)
  const pemBody = (entre ? entre[1] : pemKey).replace(/[^A-Za-z0-9+/=]/g, '')
  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryKey.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput))
  const sigArr = new Uint8Array(signature)
  let sigStr = ''
  for (let i = 0; i < sigArr.length; i++) sigStr += String.fromCharCode(sigArr[i])
  const jwt = `${sigInput}.${toBase64Url(btoa(sigStr))}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('No se pudo obtener token de Google')
  tokenCache = { valor: data.access_token, vence: Date.now() + 50 * 60 * 1000 }
  return data.access_token
}
async function enviarDato(fcmToken: string, datos: Record<string, string>) {
  const accessToken = await tokenFcm()
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token: fcmToken, data: datos, android: { priority: 'high' } } }),
  })
  if (res.status === 401) tokenCache = null
  return res.ok
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
async function sha256Hex(s: string) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))) }
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  try {
    // Quién llama (el familiar), ya autenticado como él mismo
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: { user: quienLlama } } = await createClient(URL, ANON).auth.getUser(token)
    if (!quienLlama) return json({ ok: false, error: 'SIN_SESION' }, 401)

    const body = await req.json().catch(() => ({}))
    const accion = body.accion === 'detener' ? 'detener' : 'solicitar'
    const clave = String(body.correo_o_usuario || '').trim().toLowerCase()
    const password = String(body.password || '')
    if (!clave || !password) return json({ ok: false, error: 'FALTAN_DATOS' })

    // Bloqueo por intentos (se guarda por correo/usuario, porque al fallar aún no sabemos el owner)
    const { data: bloqueo } = await admin.from('recuperacion_bloqueo').select('*').eq('clave', clave).maybeSingle()
    if (bloqueo?.bloqueado_hasta && new Date(bloqueo.bloqueado_hasta) > new Date()) {
      const min = Math.ceil((new Date(bloqueo.bloqueado_hasta).getTime() - Date.now()) / 60000)
      return json({ ok: false, error: 'BLOQUEADO', minutos: min })
    }

    // Resolver el correo del dueño (acepta correo o @usuario)
    let email = clave
    if (!clave.includes('@')) {
      const { data: u } = await admin.from('users').select('id').eq('username', clave).maybeSingle()
      if (u?.id) {
        const { data: info } = await admin.auth.admin.getUserById(u.id)
        email = info?.user?.email || ''
      } else {
        email = ''
      }
    }

    // Verificar la contraseña del dueño (en un cliente aparte: no toca la sesión del familiar)
    const verificado = email
      ? await createClient(URL, ANON).auth.signInWithPassword({ email, password })
      : { data: { user: null }, error: { message: 'no existe' } }
    const owner = (verificado as any).data?.user

    if (!owner) {
      // Fallo: sumar intento y, si pasa el tope, bloquear 30 min
      const intentos = (bloqueo?.intentos || 0) + 1
      const bloquear = intentos >= MAX_INTENTOS
      await admin.from('recuperacion_bloqueo').upsert({
        clave, intentos: bloquear ? 0 : intentos,
        bloqueado_hasta: bloquear ? new Date(Date.now() + BLOQUEO_MIN * 60000).toISOString() : null,
      }, { onConflict: 'clave' })
      return json({ ok: false, error: bloquear ? 'BLOQUEADO' : 'CREDENCIALES', minutos: bloquear ? BLOQUEO_MIN : undefined })
    }
    // Contraseña correcta: limpiar el contador
    if (bloqueo) await admin.from('recuperacion_bloqueo').delete().eq('clave', clave)

    if (owner.id === quienLlama.id) return json({ ok: false, error: 'ES_TU_CELULAR' })

    // El dueño tiene que haber activado la recuperación y estar vinculado con quien llama
    const [{ data: perfil }, { data: vinculo }, { data: ownerUser }] = await Promise.all([
      admin.from('users').select('recuperacion_activa, full_name, fcm_token').eq('id', owner.id).maybeSingle(),
      admin.from('family_links').select('id').eq('status', 'accepted')
        .or(`and(user_id.eq.${quienLlama.id},linked_user_id.eq.${owner.id}),and(user_id.eq.${owner.id},linked_user_id.eq.${quienLlama.id})`)
        .maybeSingle(),
      admin.from('users').select('fcm_token').eq('id', owner.id).maybeSingle(),
    ])
    if (!vinculo) return json({ ok: false, error: 'NO_VINCULADO' })
    if (!perfil?.recuperacion_activa) return json({ ok: false, error: 'NO_AUTORIZADO_DUENIO' })

    if (accion === 'detener') {
      await admin.rpc('cerrar_recuperacion', { p_owner: owner.id })
      if (ownerUser?.fcm_token) await enviarDato(ownerUser.fcm_token, { tipo: 'detener-recuperar' })
      return json({ ok: true, detenido: true })
    }

    // Solicitar: el celular tiene que poder recibir la orden
    if (!ownerUser?.fcm_token) return json({ ok: false, error: 'CELULAR_NO_DISPONIBLE' })

    const llave = hex(crypto.getRandomValues(new Uint8Array(32)).buffer)  // 64 hex
    const { data: vence } = await admin.rpc('abrir_recuperacion', {
      p_owner: owner.id, p_solicitante: quienLlama.id, p_llave_hash: await sha256Hex(llave), p_horas: 24,
    })
    const enviado = await enviarDato(ownerUser.fcm_token, { tipo: 'recuperar', llave, vence: String(vence) })

    return json({ ok: true, vence, nombre: perfil.full_name || '', enviado })
  } catch (e) {
    console.error('[recuperar-celular]', e)
    return json({ ok: false, error: 'ERROR_SERVIDOR' }, 500)
  }
})
