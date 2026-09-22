'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import apiClient from '@/lib/api'
import { Input } from '@/components/ui/input'
import { getTenantTypeMeta } from '@/lib/tenantTypes'
import type { TenantPublicListResponse, TenantPublicResponse } from '@/types'

interface TenantSelectorProps {
  selectedSlug: string | null
  onSelect: (tenant: TenantPublicResponse) => void
}

export default function TenantSelector({ selectedSlug, onSelect }: TenantSelectorProps) {
  const [tenants, setTenants] = useState<TenantPublicResponse[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    apiClient
      // BR-SEG-1 (RFC-007): restaurant-segment tenants have no consumer self-registration,
      // so this join-an-existing-org picker only ever offers cafeteria-segment tenants
      // (corporate, academic) — otherwise selecting one just bounces the user right back out.
      .get<TenantPublicListResponse>('/tenants/public', { params: { segment: 'cafeteria' } })
      .then((res) => {
        if (!cancelled) setTenants(res.data.items)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tenants
    return tenants.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.city ?? '').toLowerCase().includes(q)
    )
  }, [tenants, query])

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your cafeteria…"
          className="rounded-2xl pl-11"
        />
      </label>

      <div className="flex max-h-[19rem] flex-col gap-2 overflow-y-auto pr-1">
        {loading && <p className="py-6 text-center text-sm text-muted-foreground">Loading organisations…</p>}

        {error && (
          <p className="py-6 text-center text-sm text-destructive">
            Could not load organisations. Please try again.
          </p>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {query ? `No results for “${query}”.` : 'No organisations available yet.'}
          </p>
        )}

        {!loading &&
          !error &&
          filtered.map((tenant) => {
            const isSelected = tenant.slug === selectedSlug
            const meta = getTenantTypeMeta(tenant.tenant_type)
            return (
              <button
                key={tenant.slug}
                type="button"
                onClick={() => onSelect(tenant)}
                className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'bg-card hover:border-primary/40 hover:shadow-sm'
                }`}
              >
                {tenant.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tenant.logo_url}
                    alt={`${meta.label} logo`}
                    className="mt-0.5 size-10 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div
                    className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
                    style={{ backgroundColor: tenant.brand_color }}
                  >
                    {meta.label.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{meta.label}</p>
                    {tenant.city && (
                      <span className="shrink-0 text-xs text-muted-foreground">· {tenant.city}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{meta.description}</p>
                </div>

                <span
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border transition ${
                    isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 text-transparent'
                  }`}
                >
                  <Check className="size-4" />
                </span>
              </button>
            )
          })}
      </div>
    </div>
  )
}
