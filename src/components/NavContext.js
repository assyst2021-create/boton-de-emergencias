import { createContext, useContext } from 'react'

export const NavContext = createContext({ abrirOpciones: () => {} })
export const useNavContext = () => useContext(NavContext)
