'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import apiClient from '@/lib/api'
import TenantCard from '@/components/auth/TenantCard'
import { getSegment, type Segment } from '@/lib/segments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
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
      <div className="bg-primary px-6 py-16 text-center text-white">
        <h1 className="motion-safe:animate-fade-up text-4xl font-black tracking-tight">
          {segmentFilter === 'cafeteria' && 'Find your cafeteria'}
          {segmentFilter === 'restaurant' && 'Find your restaurant'}
          {!segmentFilter && 'Find your organisation'}
        </h1>
        <p
          className="motion-safe:animate-fade-up mt-3 text-white/70"
          style={{ animationDelay: '80ms' }}
        >
          Search cafeterias, restaurants, and food courts on the platform.
        </p>

        <div
          className="motion-safe:animate-fade-up mx-auto mt-8 flex max-w-md items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-lg transition-shadow focus-within:shadow-xl"
          style={{ animationDelay: '160ms' }}
        >
          <Search className="h-5 w-5 text-slate-400 shrink-0" />
          <Input
            type="text"
            placeholder="Search by name or city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-auto flex-1 border-0 bg-transparent p-0 text-slate-800 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        {segmentFilter && (
          <div
            className="motion-safe:animate-fade-up mx-auto mt-5 max-w-md"
            style={{ animationDelay: '240ms' }}
          >
            <Button asChild variant="outline" className="w-full gap-2 border-white/30 bg-white/10 text-white transition-transform hover:-translate-y-0.5 hover:bg-white/20 hover:text-white">
              <Link href={`/register-organization?segment=${segmentFilter}`}>
                <Plus className="h-4 w-4" />
                {segmentFilter === 'cafeteria' ? 'Register your cafeteria' : 'Register your restaurant'}
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="mx-auto max-w-5xl px-6 py-10">
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-center text-sm text-destructive">
            Could not load organisations. Please try again.
          </p>
        )}

        {!loading && !error && visibleTenants.length === 0 && (
          <Empty>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>No organisations found</EmptyTitle>
            <EmptyDescription>
              {query ? `No results for "${query}".` : 'No organisations available yet.'}
            </EmptyDescription>
          </Empty>
        )}

        {!loading && !error && visibleTenants.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleTenants.map((t, i) => (
              <div
                key={t.slug}
                className="motion-safe:animate-fade-up"
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              >
                <TenantCard tenant={t} />
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
