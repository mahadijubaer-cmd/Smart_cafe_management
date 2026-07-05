'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import apiClient from '@/lib/api'
import TenantCard from '@/components/auth/TenantCard'
import { getSegment, type Segment } from '@/lib/segments'
import type { TenantPublicListResponse, TenantPublicResponse } from '@/types'

export default function DiscoverPage() {
  const searchParams = useSearchParams()
  const segmentFilter = searchParams.get('segment') as Segment | null

  const [tenants, setTenants] = useState<TenantPublicResponse[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    const params = query ? { q: query } : undefined
    apiClient
      .get<TenantPublicListResponse>('/tenants/public', { params })
      .then((res) => setTenants(res.data.items))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [query])

  // RFC-007: segment is derived client-side too — no backend filter param needed for the MVP.
  const visibleTenants = useMemo(
    () =>
      segmentFilter
        ? tenants.filter((t) => getSegment(t.tenant_type) === segmentFilter)
        : tenants,
    [tenants, segmentFilter]
  )

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-[#1A4D2E] px-6 py-16 text-center text-white">
        <h1 className="text-4xl font-black tracking-tight">
          {segmentFilter === 'cafeteria' && 'Find your cafeteria'}
          {segmentFilter === 'restaurant' && 'Find your restaurant'}
          {!segmentFilter && 'Find your organisation'}
        </h1>
        <p className="mt-3 text-white/70">Search cafeterias, restaurants, and food courts on the platform.</p>

        <div className="mx-auto mt-8 flex max-w-md items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-lg">
          <Search className="h-5 w-5 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by name or city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Results */}
      <div className="mx-auto max-w-5xl px-6 py-10">
        {loading && (
          <p className="text-center text-sm text-slate-500">Loading…</p>
        )}

        {error && (
          <p className="text-center text-sm text-red-500">
            Could not load organisations. Please try again.
          </p>
        )}

        {!loading && !error && visibleTenants.length === 0 && (
          <p className="text-center text-sm text-slate-500">
            {query ? `No results for "${query}".` : 'No organisations available yet.'}
          </p>
        )}

        {!loading && !error && visibleTenants.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleTenants.map((t) => (
              <TenantCard key={t.slug} tenant={t} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
