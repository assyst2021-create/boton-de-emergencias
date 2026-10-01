import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker: sin el registrado, el navegador no ofrece instalar la app
// y la pantalla no abre cuando no hay señal. Va despues del render para no
// competir con la carga inicial.
// En la app de Android los archivos ya están en el celular: ahí el service worker solo
// frenaba el arranque y guardaba copias repetidas. Se quita el que dejaron versiones viejas.
const EN_APP = !!window.Capacitor?.isNativePlatform?.()
if ('serviceWorker' in navigator && EN_APP) {
  navigator.serviceWorker.getRegistrations()
    .then(registros => registros.forEach(r => r.unregister()))
    .catch(() => {})
  if (window.caches) {
    caches.keys()
      .then(claves => claves.filter(k => k.startsWith('boton-emergencias')).forEach(k => caches.delete(k)))
      .catch(() => {})
  }
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[pwa] no se pudo registrar el service worker:', err?.message || err)
    })
  })
}
