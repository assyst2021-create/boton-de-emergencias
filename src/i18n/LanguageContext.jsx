import { createContext, useContext, useState, useEffect } from 'react'
import { translations } from './translations'

const LanguageContext = createContext()

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('app_lang') || 'es')

  useEffect(() => {
    const stored = localStorage.getItem('app_lang')
    if (stored) setLang(stored)
  }, [])

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
