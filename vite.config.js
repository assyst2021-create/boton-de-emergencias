import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    // Celulares con el navegador interno de 2018 en adelante (Android 7+ e iPhone con iOS 13+):
    // las instrucciones nuevas se traducen a unas que esos celulares entienden. Sin esto, un
    // celular que no ha actualizado su navegador interno podía quedar con la pantalla en blanco.
    target: ['es2019', 'chrome69', 'safari13'],
    cssTarget: ['chrome69', 'safari13'],
  },
})
