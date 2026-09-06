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
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[pwa] no se pudo registrar el service worker:', err?.message || err)
    })
  })
}
