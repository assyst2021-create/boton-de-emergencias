/**
 * Identificador único (UUID v4). crypto.randomUUID solo existe desde Chrome 92 (2021): en celulares
 * con el navegador interno más viejo la alerta no llegaba a guardarse. getRandomValues existe en
 * todos los celulares compatibles y da el mismo resultado.
 */
export function nuevoUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
