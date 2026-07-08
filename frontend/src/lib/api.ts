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

// Centralized error handler — shows toast for API errors (except 401 which is handled by auth flow)
apiClient.interceptors.response.use(
  (res) => res,
  (error: { response?: { status?: number; data?: { detail?: string } }; config?: { _suppressToast?: boolean } }) => {
    const status = error.response?.status
    const message = error.response?.data?.detail ?? 'Something went wrong'
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
