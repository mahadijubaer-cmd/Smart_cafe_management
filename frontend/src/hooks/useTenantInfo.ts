import { useEffect, useState } from 'react'
import apiClient from '@/lib/api'
import type { TenantPublicDetailResponse } from '@/types'

interface UseTenantInfoResult {
  tenant: TenantPublicDetailResponse | null
  loading: boolean
  error: string | null
}

export function useTenantInfo(slug: string): UseTenantInfoResult {
  const [tenant, setTenant] = useState<TenantPublicDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setTenant(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    apiClient
      .get<TenantPublicDetailResponse>(`/tenants/public/${slug}`)
      .then((res) => {
        if (!cancelled) setTenant(res.data)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load organisation info.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  return { tenant, loading, error }
}
