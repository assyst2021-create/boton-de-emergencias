import { createContext, useContext } from 'react'

export const NavContext = createContext({ abrirOpciones: () => {}, abrirPlanes: () => {} })
export const useNavContext = () => useContext(NavContext)
