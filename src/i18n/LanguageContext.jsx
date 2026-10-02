import { createContext, useContext, useState, useEffect } from 'react'
import { translations } from './translations'

const LanguageContext = createContext()

export function LanguageProvider({ children }) {
  // Primera vez: el idioma del celular, si la app lo tiene (un brasileño la ve en portugués
  // desde el registro); si no, español. Después, el que la persona elija.
  const [lang, setLang] = useState(() => {
    const guardado = localStorage.getItem('app_lang')
    if (guardado && translations[guardado]) return guardado
    const delCelular = (navigator.language || '').slice(0, 2).toLowerCase()
    return translations[delCelular] ? delCelular : 'es'
  })

  // Para lectores de pantalla y el traductor del sistema
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  function cambiarIdioma(code) {
    setLang(code)
    localStorage.setItem('app_lang', code)
  }

  function t(key) {
    return translations[lang]?.[key] ?? translations['es'][key] ?? key
  }

  return (
    <LanguageContext.Provider value={{ lang, cambiarIdioma, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
