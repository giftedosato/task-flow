export type ApiErrorDetail = {
  path?: string
  message: string
}

export class TaskFlowApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly details: ApiErrorDetail[]

  constructor(status: number, message: string, code?: string, details: ApiErrorDetail[] = []) {
    super(message)
    this.name = 'TaskFlowApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export type Session = {
  user?: {
    id?: string
    name?: string
    email?: string
  }
  expires?: string
}

export type RegistrationInput = {
  name: string
  email: string
  password: string
  confirmPassword: string
}

export type TaskPriority = 'Low' | 'Medium' | 'High'
export type TaskStatus = 'Pending' | 'In Progress' | 'Completed'

export type Task = {
  id: string
  title: string
  description?: string | null
  assignee?: string | null
  category?: string | null
  priority: TaskPriority
  status: TaskStatus
  dueDate?: string | null
  createdAt?: string
  updatedAt?: string
}

export type TaskInput = {
  title: string
  description?: string
  assignee?: string
  category?: string
  priority: TaskPriority
  status: TaskStatus
  dueDate?: string
}

export type TaskFilters = {
  page?: number
  limit?: number
  search?: string
  status?: TaskStatus
  priority?: TaskPriority
  assignee?: string
  dueBefore?: string
  dueAfter?: string
  category?: string
  sortBy?: 'title' | 'category' | 'priority' | 'status' | 'dueDate' | 'createdAt' | 'updatedAt'
  order?: 'asc' | 'desc'
}

export type TaskPage = {
  tasks: Task[]
  page: number
  limit: number
  total: number
  totalPages: number
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '/api'

function messageForStatus(status: number, message?: string, code?: string): string {
  switch (status) {
    case 400:
    case 422:
      return message ?? 'Please check the task details and try again.'
    case 401:
      return 'Your session has expired. Sign in again to continue.'
    case 403:
      return code === 'INVALID_ORIGIN'
        ? 'TaskFlow does not trust this frontend origin. Ask the backend administrator to authorize the local development origin; refreshing will not fix this.'
        : 'This request is not allowed. Contact the backend administrator if the problem continues.'
    case 404:
      return 'The requested task could not be found.'
    case 429:
      return 'Too many requests. Please wait a moment and try again.'
    case 500:
    default:
      return status >= 500
        ? 'TaskFlow is temporarily unavailable. Please try again later.'
        : message ?? `Request failed (${status}).`
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  parseResponse = true,
): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.headers ?? {}),
        ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new TaskFlowApiError(0, 'Unable to connect to TaskFlow. Check your network connection.')
  }

  if (!response.ok) {
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    const errorPayload =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? (payload as {
            error?: {
              code?: string
              message?: string
              details?: ApiErrorDetail[]
            }
          }).error
        : undefined

    throw new TaskFlowApiError(
      response.status,
      messageForStatus(response.status, errorPayload?.message, errorPayload?.code),
      errorPayload?.code,
      errorPayload?.details ?? [],
    )
  }

  if (!parseResponse || response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function getSession(): Promise<Session | null> {
  const session = await request<Session>('/auth/session')
  return session?.user ? session : null
}

export async function getCsrfToken(): Promise<string> {
  const result = await request<{ csrfToken: string }>('/auth/csrf')
  return result.csrfToken
}

export async function register(input: RegistrationInput): Promise<void> {
  await request('/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function login(email: string, password: string): Promise<void> {
  const csrfToken = await getCsrfToken()
  const body = new URLSearchParams({
    csrfToken,
    callbackUrl: '/',
    email,
    password,
  })

  await request('/auth/callback/credentials', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Auth-Return-Redirect': '1',
    },
    body,
  })
}

export async function logout(): Promise<void> {
  const csrfToken = await getCsrfToken()
  const body = new URLSearchParams({
    csrfToken,
    callbackUrl: '/',
  })

  await request('/auth/signout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
}

export async function getHealth(): Promise<{ status: 'ok' }> {
  return request<{ status: 'ok' }>('/health')
}

export async function getTasks(
  filters: TaskFilters = {},
  signal?: AbortSignal,
): Promise<Task[] | TaskPage> {
  const searchParams = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') searchParams.set(key, String(value))
  })
  const query = searchParams.toString()
  return request<Task[] | TaskPage>(`/tasks${query ? `?${query}` : ''}`, { signal })
}

export async function getTaskById(id: string, signal?: AbortSignal): Promise<Task> {
  return request<Task>(`/tasks/${encodeURIComponent(id)}`, { signal })
}

export async function createTask(data: TaskInput): Promise<Task> {
  return request<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateTask(id: string, data: Partial<TaskInput>): Promise<Task> {
  return request<Task>(`/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteTask(id: string): Promise<void> {
  await request(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }, false)
}
