import { useState, useRef, useEffect } from 'react'
import { supabase } from './supabase'

// 3 a 20 caracteres: minúsculas, números, punto y guion bajo (evita usuarios "parecidos")
export const USUARIO_VALIDO = /^[a-z0-9._]{3,20}$/
export const normalizarUsuario = (u) => (u || '').toLowerCase().trim().replace(/^@/, '')

// Mientras se escribe: quita tildes (á→a, ñ→n), pasa a minúsculas y descarta lo que no
// se permite, así la persona ve de una vez cómo queda su @usuario y no le sale un error
export const limpiarUsuario = (v) => (v || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20)

// Aviso "sin tildes, sin espacios y sin @" durante unos segundos cada vez que la app
// tuvo que corregir lo que la persona escribió, para que sepa por qué cambió
export function useAvisoUsuario() {
  const [aviso, setAviso] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const revisar = (valor) => {
    if (limpiarUsuario(valor) === (valor || '').toLowerCase()) return
    setAviso(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setAviso(false), 6000)
  }
  return [aviso, revisar]
}

// true = libre, false = ocupado, null = no se pudo verificar. Sin sesión la tabla
// users no es legible, por eso se pregunta a una función que solo responde sí/no.
export async function usuarioDisponible(u) {
  const { data, error } = await supabase.rpc('usuario_disponible', { nombre: u })
  if (error || typeof data !== 'boolean') return null
  return data
}

// Datos del formulario de registro guardados mientras se crea la cuenta: si el perfil
// no alcanza a guardarse, "Completa tu registro" los muestra ya llenos.
const DATOS_KEY = 'registroDatos'
export function guardarDatosRegistro(datos) {
  try { sessionStorage.setItem(DATOS_KEY, JSON.stringify(datos)) } catch (_) {}
}
export function leerDatosRegistro() {
  try { return JSON.parse(sessionStorage.getItem(DATOS_KEY)) || {} } catch (_) { return {} }
}
export function borrarDatosRegistro() {
  try { sessionStorage.removeItem(DATOS_KEY) } catch (_) {}
}

// Entre crear la sesión y guardar el perfil pasan unos instantes. Mientras tanto la
// app no debe concluir que al usuario le falta el perfil.
const EN_CURSO_KEY = 'registroEnCurso'
export const EVENTO_PERFIL = 'perfilGuardado'
export function marcarRegistroEnCurso(activo) {
  try {
    if (activo) sessionStorage.setItem(EN_CURSO_KEY, '1')
    else sessionStorage.removeItem(EN_CURSO_KEY)
  } catch (_) {}
  if (!activo) window.dispatchEvent(new Event(EVENTO_PERFIL))
}
function registroEnCurso() {
  try { return !!sessionStorage.getItem(EN_CURSO_KEY) } catch (_) { return false }
}

/**
 * Lee el plan del usuario y dice si le falta el perfil.
 * falta = true solo cuando la base respondió y no hay fila; sin internet es false,
 * para no bloquear a nadie que ya tenía su cuenta completa.
 */
export async function revisarPerfil(uid) {
  if (registroEnCurso()) {
    await new Promise(res => {
      const listo = () => { window.removeEventListener(EVENTO_PERFIL, listo); res() }
      window.addEventListener(EVENTO_PERFIL, listo)
      setTimeout(listo, 10000)
    })
  }
  try {
    const { data, error } = await supabase.from('users')
      .select('plan, is_premium, premium_hasta').eq('id', uid).maybeSingle()
    return { perfil: data, falta: !error && !data }
  } catch (_) {
    return { perfil: null, falta: false }
  }
}

// Código ISO de cada país, para mostrar su nombre en el idioma de la app
const ISO_PAIS = {
  'Colombia': 'CO', 'EE.UU. / Canadá': ['US', 'CA'], 'México': 'MX', 'Argentina': 'AR', 'Brasil': 'BR',
  'Chile': 'CL', 'Venezuela': 'VE', 'Perú': 'PE', 'Ecuador': 'EC', 'Bolivia': 'BO', 'Paraguay': 'PY',
  'Uruguay': 'UY', 'Panamá': 'PA', 'Costa Rica': 'CR', 'Guatemala': 'GT', 'Honduras': 'HN',
  'El Salvador': 'SV', 'Nicaragua': 'NI', 'Rep. Dominicana': 'DO', 'Cuba': 'CU', 'España': 'ES',
  'Portugal': 'PT', 'Alemania': 'DE', 'Francia': 'FR', 'Italia': 'IT', 'Reino Unido': 'GB',
}
/** Nombre del país en el idioma de la app ("Germany", "Alemanha"…); si el celular no sabe, en español. */
export function nombrePais(p, idioma) {
  try {
    const iso = ISO_PAIS[p.nombre]
    if (!iso || typeof Intl.DisplayNames !== 'function') return p.nombre
    const nombres = new Intl.DisplayNames([idioma], { type: 'region' })
    return Array.isArray(iso) ? iso.map(c => nombres.of(c)).join(' / ') : nombres.of(iso)
  } catch (_) {
    return p.nombre
  }
}

export const PAISES = [
  { bandera: '🇨🇴', nombre: 'Colombia', codigo: '+57' },
  { bandera: '🇺🇸', nombre: 'EE.UU. / Canadá', codigo: '+1' },
  { bandera: '🇲🇽', nombre: 'México', codigo: '+52' },
  { bandera: '🇦🇷', nombre: 'Argentina', codigo: '+54' },
  { bandera: '🇧🇷', nombre: 'Brasil', codigo: '+55' },
  { bandera: '🇨🇱', nombre: 'Chile', codigo: '+56' },
  { bandera: '🇻🇪', nombre: 'Venezuela', codigo: '+58' },
  { bandera: '🇵🇪', nombre: 'Perú', codigo: '+51' },
  { bandera: '🇪🇨', nombre: 'Ecuador', codigo: '+593' },
  { bandera: '🇧🇴', nombre: 'Bolivia', codigo: '+591' },
  { bandera: '🇵🇾', nombre: 'Paraguay', codigo: '+595' },
  { bandera: '🇺🇾', nombre: 'Uruguay', codigo: '+598' },
  { bandera: '🇵🇦', nombre: 'Panamá', codigo: '+507' },
  { bandera: '🇨🇷', nombre: 'Costa Rica', codigo: '+506' },
  { bandera: '🇬🇹', nombre: 'Guatemala', codigo: '+502' },
  { bandera: '🇭🇳', nombre: 'Honduras', codigo: '+504' },
  { bandera: '🇸🇻', nombre: 'El Salvador', codigo: '+503' },
  { bandera: '🇳🇮', nombre: 'Nicaragua', codigo: '+505' },
  { bandera: '🇩🇴', nombre: 'Rep. Dominicana', codigo: '+1809' },
  { bandera: '🇨🇺', nombre: 'Cuba', codigo: '+53' },
  { bandera: '🇪🇸', nombre: 'España', codigo: '+34' },
  { bandera: '🇵🇹', nombre: 'Portugal', codigo: '+351' },
  { bandera: '🇩🇪', nombre: 'Alemania', codigo: '+49' },
  { bandera: '🇫🇷', nombre: 'Francia', codigo: '+33' },
  { bandera: '🇮🇹', nombre: 'Italia', codigo: '+39' },
  { bandera: '🇬🇧', nombre: 'Reino Unido', codigo: '+44' },
]
