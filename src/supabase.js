import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// El enlace del correo "¿Olvidaste tu contraseña?" abre la app con type=recovery. Se anota antes de
// que Supabase lo procese y lo borre de la dirección, para pedir enseguida la contraseña nueva.
export const ENTRO_POR_RECUPERACION = typeof window !== 'undefined'
  && /type=recovery/.test(`${window.location.hash}${window.location.search}`)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Donde Supabase guarda la sesión en el celular (su nombre por defecto)
const CLAVE_SESION = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`

/**
 * La sesión guardada en el celular. Sin internet y con el permiso de 1 hora vencido, Supabase no
 * puede renovarlo y getSession() responde "sin sesión", aunque la sesión sigue guardada (solo se
 * borra al cerrar sesión o si el servidor la rechaza). En una app de emergencia eso no puede sacar
 * a la persona: se usa la guardada, y al volver la señal Supabase la renueva sola.
 */
export function sesionGuardada() {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null')
    return s?.user?.id && s.refresh_token ? s : null
  } catch (_) {
    return null
  }
}

// Sin internet, getSession() se queda hasta ~30 s reintentando renovar el permiso: no se espera más
export const ESPERA_SESION_MS = 1500

/** Quién es la persona: la sesión vigente o, sin internet, la guardada en el celular (al instante). */
export async function obtenerSesion() {
  const guardada = sesionGuardada()
  if (guardada && typeof navigator !== 'undefined' && navigator.onLine === false) return guardada
  try {
    return await Promise.race([
      supabase.auth.getSession().then(({ data: { session } }) => session || sesionGuardada()),
      new Promise(listo => setTimeout(() => listo(guardada), ESPERA_SESION_MS)),
    ])
  } catch (_) {
    return sesionGuardada()
  }
}

/**
 * Cliente aparte que no guarda sesión: solo para comprobar una contraseña (la actual, al cambiarla)
 * sin tocar la sesión abierta en la app.
 */
export const clienteVerificacion = () => createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
