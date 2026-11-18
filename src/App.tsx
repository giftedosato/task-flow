import { useState } from 'react'
import type { FormEvent } from 'react'
import { TaskDashboard } from './components/TaskDashboard'
import { useAuth } from './hooks/useAuth'
import { TaskFlowApiError } from './services/taskflowApi'
import './App.css'

function getErrorMessage(error: unknown): string {
  if (error instanceof TaskFlowApiError) return error.message
  return 'An unexpected error occurred. Please try again.'
}

function App() {
  const { session, sessionError, isLoading } = useAuth()

  if (isLoading) {
    return (
      <main className="auth-status" role="status">
        Restoring your TaskFlow session...
      </main>
    )
  }

  if (!session) return <AuthenticationPage sessionError={sessionError} />
  return <AuthenticatedPage />
}

function AuthenticationPage({ sessionError }: { sessionError: string | null }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [isCheckingAgain, setIsCheckingAgain] = useState(false)
  const { refreshSession } = useAuth()

  const checkSessionAgain = async () => {
    setIsCheckingAgain(true)
    await refreshSession()
    setIsCheckingAgain(false)
  }

  return (
    <main className="auth-layout">
      <section className="auth-card" aria-labelledby="auth-heading">
        <p className="auth-brand">TaskFlow</p>
        <h1 id="auth-heading">{mode === 'login' ? 'Welcome back' : 'Create an account'}</h1>
        {sessionError && (
          <div className="session-error">
            <p className="form-error" role="alert">{sessionError}</p>
            <button type="button" className="text-button" onClick={() => void checkSessionAgain()} disabled={isCheckingAgain}>
              {isCheckingAgain ? 'Checking...' : 'Retry session check'}
            </button>
          </div>
        )}
        {mode === 'login' ? <LoginForm /> : <RegistrationForm />}
        <button
          type="button"
          className="text-button"
          onClick={() => setMode((current) => (current === 'login' ? 'register' : 'login'))}
        >
          {mode === 'login'
            ? 'New to TaskFlow? Create an account'
            : 'Already registered? Sign in'}
        </button>
      </section>
    </main>
  )
}

function LoginForm() {
  const { login } = useAuth()
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '')
    const password = String(data.get('password') ?? '')

    setError('')
    setIsSubmitting(true)
    try {
      await login(email, password)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label>
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}

function RegistrationForm() {
  const { register } = useAuth()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '')
    const email = String(data.get('email') ?? '')
    const password = String(data.get('password') ?? '')
    const confirmPassword = String(data.get('confirmPassword') ?? '')
    const form = event.currentTarget

    setError('')
    setSuccess('')
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      await register({ name, email, password, confirmPassword })
      setSuccess('Registration successful. You can now sign in.')
      form.reset()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label>
        Name
        <input
          name="name"
          minLength={2}
          maxLength={100}
          autoComplete="name"
          required
        />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      <label>
        Confirm password
        <input
          name="confirmPassword"
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account...' : 'Create account'}
      </button>
    </form>
  )
}

function AuthenticatedPage() {
  const { logout } = useAuth()
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleLogout = async () => {
    if (isSubmitting) return
    setError('')
    setIsSubmitting(true)
    try {
      await logout()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <strong>TaskFlow</strong>
        <button type="button" onClick={handleLogout} disabled={isSubmitting}>
          {isSubmitting ? 'Signing out...' : 'Sign out'}
        </button>
      </header>
      <TaskDashboard />
      {error && <p className="form-error dashboard-error" role="alert">{error}</p>}
    </main>
  )
}

export default App
