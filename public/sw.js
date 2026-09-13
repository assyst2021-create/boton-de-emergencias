/*
 * Service worker del Botón de Emergencias.
 *
 * Estrategia: red primero, caché como respaldo.
 */

const CACHE = 'boton-emergencias-v2'

const BASICOS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/alerta.mp3',
]

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE)
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
          if (peticion.mode === 'navigate') return caches.match('/index.html')
          return Response.error()
        }),
      ),
  )
})

// ── PUSH NOTIFICATIONS ──────────────────────────────────────────────────────

self.addEventListener('push', evento => {
  let datos = {}
  try { datos = evento.data?.json() || {} } catch (_) {}

  const tipo = datos.tipo || 'red'
  const emoji = tipo === 'red' ? '🔴' : tipo === 'orange' ? '🟠' : '🟢'
  const titulo = datos.titulo || `${emoji} ¡Alerta de emergencia!`
  const cuerpo = datos.cuerpo || 'Un familiar necesita tu ayuda ahora.'

  const opciones = {
    body: cuerpo,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    image: datos.imagen || undefined,
    vibrate: [300, 100, 300, 100, 300, 100, 600],
    requireInteraction: true,
    silent: false,
    tag: `alerta-${datos.alertaId || Date.now()}`,
    renotify: true,
    data: { url: datos.url || '/?tab=historial', alertaId: datos.alertaId },
    actions: [
      { action: 'ver', title: '📍 Ver ubicación' },
      { action: 'ok',  title: '✓ Entendido' },
    ],
  }

  evento.waitUntil(
    self.registration.showNotification(titulo, opciones)
  )
})

self.addEventListener('notificationclick', evento => {
  evento.notification.close()
  const url = evento.notification.data?.url || '/'

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientes => {
        const existente = clientes.find(c => c.url.includes(self.location.origin))
        if (existente) return existente.focus().then(c => c.navigate(url))
        return self.clients.openWindow(url)
      })
  )
})
