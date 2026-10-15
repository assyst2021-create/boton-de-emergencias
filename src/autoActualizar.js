// Versión 99: las pantallas se actualizan solas, sin tocar 🔄 (el botón sigue, de respaldo).
// Lo primero sigue siendo el tiempo real; esto lo respalda para cuando el celular corta la conexión
// en vivo sin avisar (pantalla apagada, cambio de wifi a datos, señal débil): se vuelve a pedir
// cada cierto tiempo mientras la pantalla se está viendo y apenas vuelve la señal.
import { useEffect, useRef } from 'react'

// Con señal débil una consulta puede quedarse colgada: a este tiempo se suelta y la siguiente vuelve a intentar
const ESPERA_MAXIMA_MS = 20000

export function useAutoActualizar(actualizar, cadaMs) {
  const fnRef = useRef(actualizar)
  useEffect(() => { fnRef.current = actualizar })

  useEffect(() => {
    let ocupado = false
    const correr = async () => {
      // Con la app en segundo plano no se gasta batería ni datos: al volver se actualiza igual
      if (ocupado || document.visibilityState !== 'visible') return
      ocupado = true
      try {
        await Promise.race([
          Promise.resolve().then(() => fnRef.current()),
          new Promise(r => setTimeout(r, ESPERA_MAXIMA_MS)),
        ])
      } catch { /* sin señal: se intenta en la próxima vuelta */ }
      ocupado = false
    }
    const reloj = setInterval(correr, cadaMs)
    window.addEventListener('online', correr)
    return () => {
      clearInterval(reloj)
      window.removeEventListener('online', correr)
    }
  }, [cadaMs])
}

/** El canal en vivo se cayó o se cerró solo (no está conectado ni conectándose). */
export function canalCaido(canal) {
  return !canal || canal.state === 'closed' || canal.state === 'errored'
}
