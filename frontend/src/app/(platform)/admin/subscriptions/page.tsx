'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import apiClient from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
      <div className="flex flex-col p-6 gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-black text-slate-900">Subscriptions</h1>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Current Tier</TableHead>
              <TableHead>Change Tier</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.tenant_id}>
                <TableCell>
                  <p className="font-semibold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.slug}</p>
                </TableCell>
                <TableCell className="capitalize text-slate-600">
                  {t.tenant_type.replace(/_/g, ' ')}
                </TableCell>
                <TableCell>
                  <Badge variant={t.is_active ? 'default' : 'destructive'}>
                    {t.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('capitalize border-transparent', TIER_COLORS[t.subscription_tier] ?? 'bg-slate-100 text-slate-600')}>
                    {t.subscription_tier}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Select
                    value={t.subscription_tier}
                    disabled={updating === t.tenant_id}
                    onValueChange={(value) => handleTierChange(t.tenant_id, value as Tier)}
                  >
                    <SelectTrigger className="h-9 w-40 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIERS.map((tier) => (
                        <SelectItem key={tier} value={tier} className="capitalize">
                          {tier}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
