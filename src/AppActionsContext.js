import { createContext, useContext } from 'react'
export const AppActionsContext = createContext({})
export const useAppActions = () => useContext(AppActionsContext)
