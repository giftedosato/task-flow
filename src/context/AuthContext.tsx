import { createContext } from 'react'
import type { RegistrationInput, Session } from '../services/taskflowApi'

export type AuthContextValue = {
  session: Session | null
  sessionError: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: RegistrationInput) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<Session | null>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
