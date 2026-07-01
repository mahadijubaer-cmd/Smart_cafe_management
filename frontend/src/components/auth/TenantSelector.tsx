'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import apiClient from '@/lib/api'
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
      .get<TenantPublicListResponse>('/tenants/public')
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
    <div className="space-y-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your cafeteria, restaurant, or food court…"
          className="w-full rounded-2xl border border-black/10 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>

      <div className="max-h-[19rem] space-y-2 overflow-y-auto pr-1">
        {loading && <p className="py-6 text-center text-sm text-slate-500">Loading organisations…</p>}

        {error && (
          <p className="py-6 text-center text-sm text-red-500">
            Could not load organisations. Please try again.
          </p>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
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
                    : 'border-black/10 bg-white hover:border-primary/40 hover:shadow-sm'
                }`}
              >
                {tenant.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tenant.logo_url}
                    alt={`${tenant.name} logo`}
                    className="mt-0.5 h-10 w-10 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
                    style={{ backgroundColor: tenant.brand_color }}
                  >
                    {tenant.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-slate-800">{tenant.name}</p>
                    {tenant.city && (
                      <span className="shrink-0 text-xs text-slate-400">· {tenant.city}</span>
                    )}
                  </div>
                  <span className="mt-1 inline-flex w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {meta.label}
                  </span>
                  <p className="mt-1 text-xs leading-snug text-slate-500">{meta.description}</p>
                </div>

                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
                    isSelected ? 'border-primary bg-primary text-white' : 'border-slate-300 text-transparent'
                  }`}
                >
                  <Check className="h-4 w-4" />
                </span>
              </button>
            )
          })}
      </div>
    </div>
  )
}
