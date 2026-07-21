import axios from 'axios'

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('scms-store')
      if (stored) {
        const parsed = JSON.parse(stored) as { state?: { token?: string } }
        const token = parsed?.state?.token
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
      }
    } catch {
      // ignore
    }
  }
  return config
})

// FastAPI returns `detail` as a plain string for most errors, but as an array of
// { msg, loc, ... } objects for 422 Pydantic validation errors — normalize both to a string
// so it's always safe to hand to toast.error (a raw array/object crashes React's renderer).
function extractErrorMessage(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (item && typeof item === 'object' && 'msg' in item ? String(item.msg) : String(item)))
      .join(', ')
  }
  return 'Something went wrong'
}

// Centralized error handler — shows toast for API errors (except 401 which is handled by auth flow)
apiClient.interceptors.response.use(
  (res) => res,
  (error: { response?: { status?: number; data?: { detail?: unknown } }; config?: { _suppressToast?: boolean } }) => {
    const status = error.response?.status
    const message = extractErrorMessage(error.response?.data?.detail)
    // Avoid showing toast for 401 (handled by login redirect) or if caller suppressed it
    if (status !== 401 && !error.config?._suppressToast) {
      if (typeof window !== 'undefined') {
        import('sonner').then(({ toast }) => {
          toast.error(message)
        }).catch(() => undefined)
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
