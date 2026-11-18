import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext } from './AuthContext'
import {
  getSession,
  login as loginApi,
  logout as logoutApi,
  register as registerApi,
  TaskFlowApiError,
  type RegistrationInput,
  type Session,
} from '../services/taskflowApi'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshSession = useCallback(async () => {
    try {
      const currentSession = await getSession()
      setSession(currentSession)
      setSessionError(null)
      return currentSession
    } catch (error) {
      if (error instanceof TaskFlowApiError && error.status === 401) {
        setSession(null)
        setSessionError(null)
        return null
      }
      setSession(null)
      setSessionError(
        error instanceof TaskFlowApiError
          ? error.message
          : 'Unable to verify your TaskFlow session. Check your connection and try again.',
      )
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    getSession()
      .then((currentSession) => {
        if (!cancelled) setSession(currentSession)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSession(null)
          setSessionError(
            error instanceof TaskFlowApiError && error.status !== 401
              ? error.message
              : error instanceof TaskFlowApiError
                ? null
                : 'Unable to verify your TaskFlow session. Check your connection and try again.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    await loginApi(email, password)
    const currentSession = await refreshSession()
    if (!currentSession) {
      throw new TaskFlowApiError(401, 'Sign-in was not confirmed. Check your credentials and try again.')
    }
  }, [refreshSession])

  const register = useCallback(async (input: RegistrationInput) => {
    await registerApi(input)
  }, [])

  const logout = useCallback(async () => {
    await logoutApi()
    setSession(null)
    setSessionError(null)
  }, [])

  const value = useMemo(
    () => ({ session, sessionError, isLoading, login, register, logout, refreshSession }),
    [session, sessionError, isLoading, login, register, logout, refreshSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
