/**
 * Edge Function: recuperar-celular
 * Antirrobo con consentimiento. La llama un familiar YA VINCULADO que tiene el correo/usuario
 * y la contraseña del dueño del celular perdido o robado, desde la app o desde la página web.
 *
 * accion 'solicitar': verifica contraseña + vínculo + que el dueño haya activado la recuperación,
 *   crea una sesión de 24 h y una llave, y le manda al celular una orden (dato FCM) para que
 *   empiece a compartir su ubicación solo. Protección contra fuerza bruta: 5 intentos → 30 min.
 * accion 'familiares' (versión 95): hace las mismas revisiones que 'solicitar' y, si todo está bien,
 *   devuelve los familiares del dueño (su propia lista) para escoger quién ve la ubicación del
 *   celular. No empieza nada. Quien pide (en cuyo celular se va a mirar el mapa) va primero y siempre
 *   queda incluido.
 * accion 'solicitar' con compartir_con (versión 95): solo esos familiares (y quien pide) ven la
 *   ubicación. La base lo guarda en la sesión y lo aplica a cada punto que sube el celular. Sin
 *   compartir_con (versiones anteriores de la app): todo el grupo, como siempre.
 * accion 'detener': con la contraseña, cierra la sesión y manda la orden de parar.
 * Celular apagado, sin señal o en modo avión (versión 99): la orden queda guardada 24 h y Google se la
 *   entrega apenas se conecte. Ya no se responde "no disponible": se abre la sesión igual y se avisa
 *   que quedó pendiente. accion 'pendiente': la manda la app del propio celular al abrirse con señal;
 *   si su orden nunca salió (no tenía cómo recibir avisos, o Google no la recibió), se le manda ahora
 *   con una llave nueva. Si la orden sí salió, no se repite: Google la guarda y la entrega sola.
 * Recuperar celular es del plan Premium: solo se puede pedir si el Premium del dueño está vigente
 * (detener siempre se puede).
 *
 * NO toca las alertas de emergencia. Verify JWT ON: quien llama está autenticado como él mismo.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(URL, SERVICE)
// Cliente aparte, sin guardar sesión ni renovarla: solo para comprobar quién llama y la contraseña
const clienteAuth = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

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
// ttl: si el celular está apagado o sin señal, Google guarda la orden y se la entrega apenas se
// conecte (hasta que se acabe la recuperación). Si Google falla un momento, se intenta otra vez.
async function enviarDato(fcmToken: string, datos: Record<string, string>, ttlSeg = 86400) {
  for (let intento = 0; intento < 2; intento++) {
    try {
      const accessToken = await tokenFcm()
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token: fcmToken, data: datos, android: { priority: 'high', ttl: `${ttlSeg}s` } } }),
      })
      if (res.ok) return true
      if (res.status === 401) tokenCache = null
      console.error('[recuperar-celular] Google respondió', res.status, (await res.text().catch(() => '')).slice(0, 300))
      // Token del celular que ya no sirve (se borró la app o sus datos): no tiene caso repetir
      if (res.status === 400 || res.status === 404) return false
    } catch (e) {
      console.error('[recuperar-celular] no se pudo hablar con Google:', e)
    }
    await new Promise(r => setTimeout(r, 1200))
  }
  return false
}
// Segundos que le quedan a la recuperación (para que Google guarde la orden ese tiempo)
const segundosHasta = (fin: string) => Math.max(60, Math.min(86400, Math.floor((new Date(fin).getTime() - Date.now()) / 1000)))

// Igual que set_recuperacion: Premium (Familiar no cuenta) y sin vencer
// deno-lint-ignore no-explicit-any
const premiumVigente = (u: any) => !!u && u.plan !== 'familiar' && (u.plan === 'premium' || u.is_premium === true)
  && (!u.premium_hasta || new Date(u.premium_hasta).getTime() > Date.now())

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
async function sha256Hex(s: string) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))) }
// La app (por dentro es un navegador) y la página web llaman desde otro dominio: sin estos permisos
// (CORS) el navegador bloquea la llamada antes de que llegue aquí
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    // Quién llama (el familiar), ya autenticado como él mismo
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: { user: quienLlama } } = await clienteAuth().auth.getUser(token)
    if (!quienLlama) return json({ ok: false, error: 'SIN_SESION' }, 401)

    const body = await req.json().catch(() => ({}))

    // La app del celular perdido, al abrirse con señal: si su orden de recuperación no llegó, se manda
    // de nuevo (solo si la recuperación sigue activa y el celular todavía no ha mandado su ubicación)
    if (body.accion === 'pendiente') {
      const llaveNueva = hex(crypto.getRandomValues(new Uint8Array(32)).buffer)
      const { data: venceRe, error: errRe } = await admin.rpc('reenviar_recuperacion', {
        p_owner: quienLlama.id, p_llave_hash: await sha256Hex(llaveNueva),
      })
      if (errRe) {
        console.error('[recuperar-celular] reenviar_recuperacion:', errRe.message)
        return json({ ok: false, error: 'ERROR_SERVIDOR' })
      }
      if (!venceRe) return json({ ok: true, reenviado: false })
      const { data: yo } = await admin.from('users').select('fcm_token').eq('id', quienLlama.id).maybeSingle()
      if (!yo?.fcm_token) return json({ ok: false, error: 'SIN_TOKEN' })
      const reenviado = await enviarDato(yo.fcm_token, { tipo: 'recuperar', llave: llaveNueva, vence: String(venceRe) }, segundosHasta(String(venceRe)))
      if (reenviado) {
        await admin.from('recuperacion_sesiones').update({ orden_enviada: true })
          .eq('owner_id', quienLlama.id).eq('estado', 'activa')
      }
      return json({ ok: reenviado, reenviado })
    }

    const accion = body.accion === 'detener' ? 'detener' : body.accion === 'familiares' ? 'familiares' : 'solicitar'
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
      ? await clienteAuth().auth.signInWithPassword({ email, password })
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

    // Tienen que estar vinculados. El vínculo son DOS filas (una por cada sentido): se piden hasta
    // 2 y basta con que exista alguna. (Con maybeSingle, al haber dos filas daba error y respondía
    // "no vinculado" aunque sí lo estuvieran.)
    const [{ data: perfil }, { data: vinculos }] = await Promise.all([
      admin.from('users').select('recuperacion_activa, full_name, fcm_token, plan, is_premium, premium_hasta').eq('id', owner.id).maybeSingle(),
      admin.from('family_links').select('id').eq('status', 'accepted')
        .or(`and(user_id.eq.${quienLlama.id},linked_user_id.eq.${owner.id}),and(user_id.eq.${owner.id},linked_user_id.eq.${quienLlama.id})`)
        .limit(2),
    ])
    if (!vinculos?.length) return json({ ok: false, error: 'NO_VINCULADO' })

    if (accion === 'detener') {
      // Detener no exige el interruptor: si el dueño lo apagó en medio, igual se puede parar
      await admin.rpc('cerrar_recuperacion', { p_owner: owner.id })
      if (perfil?.fcm_token) await enviarDato(perfil.fcm_token, { tipo: 'detener-recuperar' })
      return json({ ok: true, detenido: true })
    }

    // Solicitar: Premium vigente y el dueño tiene que haber activado la recuperación. Si el celular no
    // puede recibir la orden ahora (apagado, sin señal), igual se sigue: queda pendiente (versión 99)
    if (!premiumVigente(perfil)) return json({ ok: false, error: 'NO_PREMIUM' })
    if (!perfil?.recuperacion_activa) return json({ ok: false, error: 'NO_AUTORIZADO_DUENIO' })

    // La lista del dueño: sus familiares aceptados
    const { data: lista, error: errLista } = await admin.from('family_links')
      .select('linked_user_id, users!family_links_linked_user_id_fkey(full_name, username)')
      .eq('user_id', owner.id).eq('status', 'accepted')
    if (errLista) return json({ ok: false, error: 'ERROR_SERVIDOR' })
    const suyos = (lista || []).map(l => l.linked_user_id as string)

    if (accion === 'familiares') {
      // deno-lint-ignore no-explicit-any
      const familiares = (lista || []).map((l: any) => ({
        id: l.linked_user_id, nombre: l.users?.full_name || l.users?.username || '—', este: l.linked_user_id === quienLlama.id,
      }))
      if (!familiares.some(f => f.este)) {
        const { data: yo } = await admin.from('users').select('full_name, username').eq('id', quienLlama.id).maybeSingle()
        familiares.push({ id: quienLlama.id, nombre: yo?.full_name || yo?.username || '—', este: true })
      }
      familiares.sort((a, b) => Number(b.este) - Number(a.este))
      return json({ ok: true, familiares })
    }

    // Con quién se comparte: solo familiares del dueño, y siempre quien pide. Todos marcados = todo
    // el grupo (null), igual que al compartir desde el Mapa
    let con: string[] | null = null
    if (Array.isArray(body.compartir_con)) {
      const elegidos = new Set<string>(body.compartir_con.filter((x: unknown) => typeof x === 'string' && suyos.includes(x as string)))
      elegidos.add(quienLlama.id)
      con = suyos.every(id => elegidos.has(id)) ? null : [...elegidos]
    }

    const llave = hex(crypto.getRandomValues(new Uint8Array(32)).buffer)  // 64 hex
    // p_con solo cuando se escogió a alguien: así funciona también si el SQL de la 95 aún no se corrió.
    // Si se escogió y la base todavía no lo conoce, NO se empieza (no se comparte con quien se quitó)
    const { data: vence, error: errAbrir } = await admin.rpc('abrir_recuperacion', {
      p_owner: owner.id, p_solicitante: quienLlama.id, p_llave_hash: await sha256Hex(llave), p_horas: 24,
      ...(con ? { p_con: con } : {}),
    })
    if (errAbrir || !vence) {
      if (errAbrir) console.error('[recuperar-celular] abrir_recuperacion:', errAbrir.message)
      return json({ ok: false, error: 'ERROR_SERVIDOR' })
    }
    // Apagado, sin señal o en modo avión: Google guarda la orden y la entrega al conectarse. Si ni eso
    // se pudo, la sesión queda abierta igual: la app del celular la pide sola al abrirse con señal
    const enviado = perfil?.fcm_token
      ? await enviarDato(perfil.fcm_token, { tipo: 'recuperar', llave, vence: String(vence) }, segundosHasta(String(vence)))
      : false
    if (!enviado) {
      console.warn('[recuperar-celular] orden pendiente: se manda cuando el celular abra la app con señal')
      // Marca para que la app del celular la pida (si la base aún no tiene la columna, no pasa nada)
      const { error: errMarca } = await admin.from('recuperacion_sesiones').update({ orden_enviada: false })
        .eq('owner_id', owner.id).eq('estado', 'activa')
      if (errMarca) console.error('[recuperar-celular] orden_enviada:', errMarca.message)
    }

    return json({ ok: true, vence, nombre: perfil?.full_name || '', pendiente: !enviado })
  } catch (e) {
    console.error('[recuperar-celular]', e)
    return json({ ok: false, error: 'ERROR_SERVIDOR' }, 500)
  }
})
