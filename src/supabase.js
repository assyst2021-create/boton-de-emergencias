import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// El enlace del correo "¿Olvidaste tu contraseña?" abre la app con type=recovery. Se anota antes de
// que Supabase lo procese y lo borre de la dirección, para pedir enseguida la contraseña nueva.
export const ENTRO_POR_RECUPERACION = typeof window !== 'undefined'
  && /type=recovery/.test(`${window.location.hash}${window.location.search}`)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Cliente aparte que no guarda sesión: solo para comprobar una contraseña (la actual, al cambiarla)
 * sin tocar la sesión abierta en la app.
 */
export const clienteVerificacion = () => createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
