'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import apiClient from '@/lib/api'
import TenantCard from '@/components/auth/TenantCard'
import { type Segment } from '@/lib/segments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import type { TenantPublicListResponse, TenantPublicResponse } from '@/types'

const PAGE_SIZE = 12

function DiscoverContent() {
  const searchParams = useSearchParams()
  const segmentFilter = searchParams.get('segment') as Segment | null

  const [tenants, setTenants] = useState<TenantPublicResponse[]>([])
  const [total, setTotal] = useState(0)
  const [skip, setSkip] = useState(0)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Any filter change restarts from page 1 — a stale offset could point past the new result set.
  useEffect(() => {
    setSkip(0)
  }, [query, segmentFilter])

  // Server-side pagination + segment filter (modules/tenants.md, reworked 2026-07-16) —
  // replaces the RFC-007 MVP shortcut that fetched everything and filtered segment client-side.
  useEffect(() => {
    setLoading(true)
    setError(false)
    apiClient
      .get<TenantPublicListResponse>('/tenants/public', {
        params: {
          skip,
          limit: PAGE_SIZE,
          ...(query ? { q: query } : {}),
          ...(segmentFilter ? { segment: segmentFilter } : {}),
        },
      })
      .then((res) => {
        setTenants(res.data.items)
        setTotal(res.data.total)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [query, segmentFilter, skip])


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

        {!loading && !error && tenants.length === 0 && (
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

        {!loading && !error && tenants.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tenants.map((t, i) => (
                <div
                  key={t.slug}
                  className="motion-safe:animate-fade-up"
                  style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                >
                  <TenantCard tenant={t} />
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {skip + 1}–{skip + tenants.length} of {total}
              </p>
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      aria-disabled={skip === 0}
                      className={skip === 0 ? 'pointer-events-none opacity-50' : undefined}
                      onClick={(event) => {
                        event.preventDefault()
                        setSkip(Math.max(0, skip - PAGE_SIZE))
                      }}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      aria-disabled={skip + PAGE_SIZE >= total}
                      className={skip + PAGE_SIZE >= total ? 'pointer-events-none opacity-50' : undefined}
                      onClick={(event) => {
                        event.preventDefault()
                        setSkip(skip + PAGE_SIZE)
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

// Statically-prerendered page reading useSearchParams() — must render inside <Suspense> or
// `next build` fails (specs/frontend/overview.md, fixed 2026-07-16).
export default function DiscoverPage() {
  return (
    <Suspense fallback={null}>
      <DiscoverContent />
    </Suspense>
  )
}
