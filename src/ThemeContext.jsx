import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({ tema: 'claro', toggleTema: () => {} })
export const useTema = () => useContext(ThemeContext)

export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(() => localStorage.getItem('app_tema') || 'claro')

  useEffect(() => {
    if (tema === 'oscuro') {
      document.documentElement.setAttribute('data-tema', 'oscuro')
    } else {
      document.documentElement.removeAttribute('data-tema')
    }
    localStorage.setItem('app_tema', tema)
  }, [tema])

  function toggleTema() {
    setTema(t => t === 'oscuro' ? 'claro' : 'oscuro')
  }

  return (
    <ThemeContext.Provider value={{ tema, toggleTema }}>
      {children}
    </ThemeContext.Provider>
  )
}
