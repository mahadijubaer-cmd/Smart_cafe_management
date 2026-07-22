import { useEffect, useState } from 'react'
import apiClient from '@/lib/api'
import type { PublicTenantInfoResponse } from '@/types'

interface UsePublicTenantInfoResult {
  tenant: PublicTenantInfoResponse | null
  loading: boolean
}

/** Same purpose as `useTenantInfo`, but for the guest/QR ordering surface
 * (`/m/[public_slug]/...`), whose `public_slug` is a distinct field from a tenant's own
 * internal `slug` and has no auth — resolved via `GET /public/{public_slug}/info` rather
 * than `GET /tenants/public/{slug}`. */
export function usePublicTenantInfo(publicSlug: string): UsePublicTenantInfoResult {
  const [tenant, setTenant] = useState<PublicTenantInfoResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!publicSlug) {
      setTenant(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    apiClient
      .get<PublicTenantInfoResponse>(`/public/${publicSlug}/info`)
      .then((res) => {
        if (!cancelled) setTenant(res.data)
      })
      .catch(() => {
        if (!cancelled) setTenant(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [publicSlug])

  return { tenant, loading }
}
