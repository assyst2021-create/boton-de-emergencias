import { createContext, useContext } from 'react'

export const NavContext = createContext({ abrirOpciones: () => {}, abrirPlanes: () => {}, verTour: () => {} })
export const useNavContext = () => useContext(NavContext)
