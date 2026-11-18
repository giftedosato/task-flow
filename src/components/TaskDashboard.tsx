import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import {
  createTask,
  deleteTask,
  getTasks,
  TaskFlowApiError,
  updateTask,
} from '../services/taskflowApi'
import type { Task, TaskFilters, TaskInput, TaskPage } from '../services/taskflowApi'

const pageLimit = 10

const emptyTask: TaskInput = {
  title: '',
  priority: 'Medium',
  status: 'Pending',
  dueDate: '',
}

function isTaskPriority(value: string): value is TaskInput['priority'] {
  return value === 'Low' || value === 'Medium' || value === 'High'
}

function isTaskStatus(value: string): value is TaskInput['status'] {
  return value === 'Pending' || value === 'In Progress' || value === 'Completed'
}

function taskErrorMessage(error: TaskFlowApiError): string {
  if (error.details.length === 0) return error.message
  const details = error.details.map((detail) => detail.message).join(' ')
  return `${error.message} ${details}`
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function emptyFilters(): Pick<TaskFilters, 'status' | 'priority' | 'assignee' | 'dueAfter' | 'dueBefore'> {
  return { status: undefined, priority: undefined, assignee: '', dueAfter: '', dueBefore: '' }
}

export function TaskDashboard() {
  const { refreshSession } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [pageData, setPageData] = useState<TaskPage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [page, setPage] = useState(1)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [filterDraft, setFilterDraft] = useState(emptyFilters)
  const [filters, setFilters] = useState(emptyFilters)

  useEffect(() => {
    const controller = new AbortController()
    let isRedirectingPage = false
    const query: TaskFilters = {
      page,
      limit: pageLimit,
      ...(search ? { search } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.assignee ? { assignee: filters.assignee } : {}),
      ...(filters.dueAfter ? { dueAfter: filters.dueAfter } : {}),
      ...(filters.dueBefore ? { dueBefore: filters.dueBefore } : {}),
    }

    getTasks(query, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (Array.isArray(result)) {
          setTasks(result)
          setPageData(null)
        } else {
          const lastPage = Math.max(1, result.totalPages)
          if (page > lastPage) {
            isRedirectingPage = true
            setPage(lastPage)
            return
          }
          setTasks(result.tasks)
          setPageData(result)
        }
        setError('')
      })
      .catch(async (requestError: unknown) => {
        if (controller.signal.aborted || isAbortError(requestError)) return
        if (requestError instanceof TaskFlowApiError && requestError.status === 401) {
          await refreshSession()
          return
        }
        setError(
          requestError instanceof TaskFlowApiError
            ? taskErrorMessage(requestError)
            : 'Unable to load tasks. Please try again.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted && !isRedirectingPage) setIsLoading(false)
      })
    return () => controller.abort()
  }, [filters, page, refreshKey, refreshSession, search])

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)
    setPage(1)
    setSearch(searchDraft.trim())
    setFilters({
      status: filterDraft.status,
      priority: filterDraft.priority,
      assignee: filterDraft.assignee?.trim() ?? '',
      dueAfter: filterDraft.dueAfter,
      dueBefore: filterDraft.dueBefore,
    })
  }

  const clearFilters = () => {
    setSearchDraft('')
    setSearch('')
    setFilterDraft(emptyFilters())
    setFilters(emptyFilters())
    setPage(1)
    setIsLoading(true)
  }

  const goToPage = (nextPage: number) => {
    setPage(nextPage)
    setIsLoading(true)
  }

  const handleSave = async (data: TaskInput) => {
    setError('')
    setNotice('')
    try {
      if (editingTask) await updateTask(editingTask.id, data)
      else await createTask(data)
      setNotice(editingTask ? 'Task updated successfully.' : 'Task created successfully.')
      setFormOpen(false)
      setEditingTask(null)
      setIsLoading(true)
      setRefreshKey((key) => key + 1)
    } catch (requestError) {
      if (requestError instanceof TaskFlowApiError && requestError.status === 401) {
        await refreshSession()
      } else {
        setError(
          requestError instanceof TaskFlowApiError
            ? taskErrorMessage(requestError)
            : 'Unable to save the task. Please try again.',
        )
      }
      throw requestError
    }
  }

  const handleDelete = async (task: Task) => {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return
    setError('')
    setNotice('')
    try {
      await deleteTask(task.id)
      setNotice('Task deleted successfully.')
      setIsLoading(true)
      setRefreshKey((key) => key + 1)
    } catch (requestError) {
      if (requestError instanceof TaskFlowApiError && requestError.status === 401) {
        await refreshSession()
      } else {
        setError(
          requestError instanceof TaskFlowApiError
            ? taskErrorMessage(requestError)
            : 'Unable to delete the task. Please try again.',
        )
      }
    }
  }

  const startCreate = () => {
    setEditingTask(null)
    setError('')
    setFormOpen(true)
  }

  const startEdit = (task: Task) => {
    setEditingTask(task)
    setError('')
    setFormOpen(true)
  }

  return (
    <section className="dashboard-content" aria-labelledby="dashboard-heading">
      <div className="task-title-row">
        <div>
          <p className="auth-brand">Workspace</p>
          <h1 id="dashboard-heading">My tasks</h1>
          <p>Manage your tasks in TaskFlow.</p>
        </div>
        <button type="button" className="task-primary" onClick={startCreate}>Add task</button>
      </div>

      {error && (
        <div className="task-load-error">
          <p className="form-error" role="alert">{error}</p>
          <button
            type="button"
            className="task-secondary"
            onClick={() => {
              setIsLoading(true)
              setRefreshKey((key) => key + 1)
            }}
          >
            Try again
          </button>
        </div>
      )}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {!isLoading && pageData && (
        <p className="task-result-count">
          {pageData.total} {pageData.total === 1 ? 'task' : 'tasks'} found
        </p>
      )}

      <form className="task-filter-form" onSubmit={applyFilters}>
        <label className="task-search-field">
          Search tasks
          <input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search title or description"
          />
        </label>
        <label>
          Status
          <select
            value={filterDraft.status ?? ''}
            onChange={(event) => setFilterDraft((current) => ({
              ...current,
              status: isTaskStatus(event.target.value) ? event.target.value : undefined,
            }))}
          >
            <option value="">All statuses</option>
            <option>Pending</option><option>In Progress</option><option>Completed</option>
          </select>
        </label>
        <label>
          Priority
          <select
            value={filterDraft.priority ?? ''}
            onChange={(event) => setFilterDraft((current) => ({
              ...current,
              priority: isTaskPriority(event.target.value) ? event.target.value : undefined,
            }))}
          >
            <option value="">All priorities</option>
            <option>Low</option><option>Medium</option><option>High</option>
          </select>
        </label>
        <label>
          Assignee
          <input
            value={filterDraft.assignee ?? ''}
            onChange={(event) => setFilterDraft((current) => ({ ...current, assignee: event.target.value }))}
            placeholder="Filter by assignee"
          />
        </label>
        <label>
          Due after
          <input
            type="date"
            value={filterDraft.dueAfter ?? ''}
            onChange={(event) => setFilterDraft((current) => ({ ...current, dueAfter: event.target.value }))}
          />
        </label>
        <label>
          Due before
          <input
            type="date"
            value={filterDraft.dueBefore ?? ''}
            onChange={(event) => setFilterDraft((current) => ({ ...current, dueBefore: event.target.value }))}
          />
        </label>
        <div className="task-filter-actions">
          <button type="submit" className="task-primary">Apply filters</button>
          <button type="button" className="task-secondary" onClick={clearFilters}>Clear filters</button>
        </div>
      </form>

      {isLoading ? (
        <p className="task-status" role="status">Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <div className="task-empty">
          <h2>{search || filters.status || filters.priority || filters.assignee || filters.dueAfter || filters.dueBefore
            ? 'No matching tasks'
            : 'No tasks yet'}</h2>
          <p>{search || filters.status || filters.priority || filters.assignee || filters.dueAfter || filters.dueBefore
            ? 'Try adjusting your search or filters.'
            : 'Create a task to get started.'}</p>
          {search || filters.status || filters.priority || filters.assignee || filters.dueAfter || filters.dueBefore
            ? <button type="button" className="task-secondary" onClick={clearFilters}>Clear filters</button>
            : <button type="button" className="task-primary" onClick={startCreate}>Add your first task</button>}
        </div>
      ) : (
        <div className="task-list" aria-live="polite">
          {tasks.map((task) => (
            <article className="task-card" key={task.id}>
              <div className="task-card-heading">
                <h2>{task.title}</h2>
                <span className={`task-badge task-priority-${task.priority.toLowerCase()}`}>
                  {task.priority}
                </span>
              </div>
              {task.description && <p className="task-description">{task.description}</p>}
              <dl className="task-metadata">
                <div><dt>Status</dt><dd>{task.status}</dd></div>
                {task.assignee && <div><dt>Assignee</dt><dd>{task.assignee}</dd></div>}
                {task.category && <div><dt>Category</dt><dd>{task.category}</dd></div>}
                {task.dueDate && <div><dt>Due date</dt><dd>{task.dueDate.slice(0, 10)}</dd></div>}
              </dl>
              <div className="task-actions">
                <button type="button" className="task-secondary" onClick={() => startEdit(task)}>Edit</button>
                <button type="button" className="task-danger" onClick={() => void handleDelete(task)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {!isLoading && pageData && pageData.totalPages > 0 && (
        <nav className="task-pagination" aria-label="Task pagination">
          <div className="task-page-controls">
            <button
              type="button"
              className="task-secondary"
              disabled={pageData.page <= 1}
              onClick={() => goToPage(pageData.page - 1)}
            >
              Previous
            </button>
            <span>Page {pageData.page} of {pageData.totalPages}</span>
            <button
              type="button"
              className="task-secondary"
              disabled={pageData.page >= pageData.totalPages}
              onClick={() => goToPage(pageData.page + 1)}
            >
              Next
            </button>
          </div>
        </nav>
      )}

      {formOpen && (
        <TaskForm
          initialTask={editingTask}
          onCancel={() => {
            setFormOpen(false)
            setEditingTask(null)
          }}
          onSave={handleSave}
        />
      )}
    </section>
  )
}

function TaskForm({
  initialTask,
  onCancel,
  onSave,
}: {
  initialTask: Task | null
  onCancel: () => void
  onSave: (data: TaskInput) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const title = String(formData.get('title') ?? '').trim()
    if (!title) {
      setError('Enter a task title.')
      return
    }

    const description = String(formData.get('description') ?? '').trim()
    const assignee = String(formData.get('assignee') ?? '').trim()
    const category = String(formData.get('category') ?? '').trim()
    const dueDate = String(formData.get('dueDate') ?? '')
    const priority = String(formData.get('priority') ?? '')
    const status = String(formData.get('status') ?? '')
    if (!isTaskPriority(priority) || !isTaskStatus(status)) {
      setError('Choose a valid priority and status.')
      return
    }

    const data: TaskInput = {
      title,
      priority,
      status,
      dueDate,
      ...(description ? { description } : {}),
      ...(assignee ? { assignee } : {}),
      ...(category ? { category } : {}),
    }

    setError('')
    setIsSubmitting(true)
    try {
      await onSave(data)
    } catch (requestError) {
      setError(
        requestError instanceof TaskFlowApiError
          ? taskErrorMessage(requestError)
          : 'Unable to save the task. Please review the fields and try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="task-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSubmitting) onCancel()
    }}>
      <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-form-heading">
        <h2 id="task-form-heading">{initialTask ? 'Edit task' : 'Add task'}</h2>
        <form className="task-form" onSubmit={handleSubmit}>
          <label>
            Title
            <input name="title" defaultValue={initialTask?.title ?? emptyTask.title} maxLength={200} required />
          </label>
          <label>
            Description
            <textarea name="description" defaultValue={initialTask?.description ?? ''} maxLength={5000} />
          </label>
          <div className="task-form-grid">
            <label>
              Assignee
              <input name="assignee" defaultValue={initialTask?.assignee ?? ''} maxLength={120} />
            </label>
            <label>
              Category
              <input name="category" defaultValue={initialTask?.category ?? ''} maxLength={100} />
            </label>
            <label>
              Priority
              <select name="priority" defaultValue={initialTask?.priority ?? emptyTask.priority}>
                <option>Low</option><option>Medium</option><option>High</option>
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue={initialTask?.status ?? emptyTask.status}>
                <option>Pending</option><option>In Progress</option><option>Completed</option>
              </select>
            </label>
            <label>
              Due date
              <input name="dueDate" type="date" defaultValue={initialTask?.dueDate?.slice(0, 10) ?? ''} />
            </label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="task-form-actions">
            <button type="button" className="task-secondary" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
            <button type="submit" className="task-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : initialTask ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
