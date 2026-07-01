'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import apiClient from '@/lib/api'

type Tier = 'free' | 'starter' | 'professional' | 'enterprise'
type TenantStatus = { active: boolean }

interface TenantRow {
  tenant_id: string
  name: string
  tenant_type: string
  subscription_tier: Tier
  is_active: boolean
  slug: string
}

const TIERS: Tier[] = ['free', 'starter', 'professional', 'enterprise']

const TIER_COLORS: Record<Tier, string> = {
  free: 'bg-slate-100 text-slate-600',
  starter: 'bg-blue-100 text-blue-700',
  professional: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
}

export default function SubscriptionsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.get('/tenants?skip=0&limit=100')
        setTenants(res.data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleTierChange = async (tenantId: string, newTier: Tier) => {
    setUpdating(tenantId)
    try {
      await apiClient.patch(`/tenants/${tenantId}`, { subscription_tier: newTier })
      setTenants((prev) =>
        prev.map((t) =>
          t.tenant_id === tenantId ? { ...t, subscription_tier: newTier } : t
        )
      )
      toast.success('Subscription tier updated.')
    } catch {
      toast.error('Failed to update tier.')
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-6 w-40 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-black text-slate-900">Subscriptions</h1>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Tenant</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Current Tier</th>
              <th className="px-5 py-3">Change Tier</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.tenant_id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3">
                  <p className="font-semibold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.slug}</p>
                </td>
                <td className="px-5 py-3 capitalize text-slate-600">
                  {t.tenant_type.replace(/_/g, ' ')}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={[
                      'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      t.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600',
                    ].join(' ')}
                  >
                    {t.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${TIER_COLORS[t.subscription_tier] ?? 'bg-slate-100 text-slate-600'}`}
                  >
                    {t.subscription_tier}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <select
                    value={t.subscription_tier}
                    disabled={updating === t.tenant_id}
                    onChange={(e) =>
                      handleTierChange(t.tenant_id, e.target.value as Tier)
                    }
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  >
                    {TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
