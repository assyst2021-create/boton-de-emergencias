/*
 * Service worker del Botón de Emergencias.
 *
 * Estrategia: red primero, caché como respaldo.
 * En una app de emergencias servir contenido viejo es peligroso, así que
 * siempre se intenta la red y solo se recurre al caché cuando no hay señal.
 * Eso permite que la app abra aunque no haya internet, en vez de mostrar la
 * pantalla de error del navegador.
 */

const CACHE = 'boton-emergencias-v1'

// Lo mínimo para que la app arranque sin señal.
const BASICOS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
]

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE)
      // Si algún archivo falla no se cae la instalación entera.
      .then(c => Promise.allSettled(BASICOS.map(u => c.add(u))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(claves => Promise.all(
        claves.filter(k => k !== CACHE).map(k => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', evento => {
  const peticion = evento.request
  const url = new URL(peticion.url)

  // Nunca tocar Supabase ni ningún servicio externo: una alerta o una
  // ubicación servidas desde caché mandarían a la familia al lugar
  // equivocado. Esos datos siempre tienen que venir frescos.
  if (url.origin !== self.location.origin) return
  if (peticion.method !== 'GET') return

  evento.respondWith(
    fetch(peticion)
      .then(respuesta => {
        if (respuesta && respuesta.status === 200 && respuesta.type === 'basic') {
          const copia = respuesta.clone()
          caches.open(CACHE).then(c => c.put(peticion, copia)).catch(() => {})
        }
        return respuesta
      })
      .catch(() =>
        caches.match(peticion).then(guardada => {
          if (guardada) return guardada
          // Rutas internas: la app es de una sola página, así que
          // cualquier ruta se resuelve con el index.
          if (peticion.mode === 'navigate') return caches.match('/index.html')
          return Response.error()
        }),
      ),
  )
})
