/**
 * Edge Function: eliminar-cuenta
 * La persona elimina su propia cuenta desde Opciones → Eliminar cuenta (lo exige Google Play).
 *
 * 1. Quien llama está autenticado (Verify JWT ON) y escribe SU contraseña: así quien tenga el
 *    celular desbloqueado (por ejemplo, un ladrón) no puede borrar la cuenta ni "Recuperar celular".
 *    5 intentos fallidos → 30 minutos de espera.
 * 2. Borra todos sus datos en una sola operación (eliminar_datos_cuenta: si algo falla, no se borra nada).
 * 3. Borra el usuario de inicio de sesión (correo y contraseña).
 * La suscripción de Google Play NO se cancela aquí: la app se lo advierte antes.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const URL = Deno.env.get('SUPABASE_URL')!
const admin = createClient(URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
// Cliente aparte, sin guardar sesión: solo para comprobar quién llama y su contraseña
const clienteAuth = () => createClient(URL, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })

const MAX_INTENTOS = 5
const BLOQUEO_MIN = 30
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: { user } } = await clienteAuth().auth.getUser(token)
    if (!user?.email) return json({ ok: false, error: 'SIN_SESION' }, 401)

    const body = await req.json().catch(() => ({}))
    const password = String(body.password || '')
    if (!password) return json({ ok: false, error: 'FALTAN_DATOS' })

    // Bloqueo por intentos fallidos (misma tabla que Recuperar celular, con su propia clave)
    const clave = `eliminar:${user.id}`
    const { data: bloqueo } = await admin.from('recuperacion_bloqueo').select('*').eq('clave', clave).maybeSingle()
    if (bloqueo?.bloqueado_hasta && new Date(bloqueo.bloqueado_hasta) > new Date()) {
      const min = Math.ceil((new Date(bloqueo.bloqueado_hasta).getTime() - Date.now()) / 60000)
      return json({ ok: false, error: 'BLOQUEADO', minutos: min })
    }

    const { data: verif } = await clienteAuth().auth.signInWithPassword({ email: user.email, password })
    if (verif?.user?.id !== user.id) {
      const intentos = (bloqueo?.intentos || 0) + 1
      const bloquear = intentos >= MAX_INTENTOS
      await admin.from('recuperacion_bloqueo').upsert({
        clave, intentos: bloquear ? 0 : intentos,
        bloqueado_hasta: bloquear ? new Date(Date.now() + BLOQUEO_MIN * 60000).toISOString() : null,
      }, { onConflict: 'clave' })
      return json({ ok: false, error: bloquear ? 'BLOQUEADO' : 'CREDENCIALES', minutos: bloquear ? BLOQUEO_MIN : undefined })
    }

    // Todos los datos de la app, en una sola operación
    const { error: errDatos } = await admin.rpc('eliminar_datos_cuenta', { p_uid: user.id })
    if (errDatos) {
      console.error('[eliminar-cuenta] datos', errDatos)
      return json({ ok: false, error: 'ERROR_SERVIDOR' }, 500)
    }

    // El usuario de inicio de sesión (con un reintento por si falla la red)
    let { error: errUsuario } = await admin.auth.admin.deleteUser(user.id)
    if (errUsuario) ({ error: errUsuario } = await admin.auth.admin.deleteUser(user.id))
    if (errUsuario) {
      console.error('[eliminar-cuenta] usuario', errUsuario)
      return json({ ok: false, error: 'ERROR_SERVIDOR' }, 500)
    }

    return json({ ok: true })
  } catch (e) {
    console.error('[eliminar-cuenta]', e)
    return json({ ok: false, error: 'ERROR_SERVIDOR' }, 500)
  }
})
