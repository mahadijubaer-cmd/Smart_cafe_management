'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Store } from 'lucide-react'
import toast from 'react-hot-toast'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useStore } from '@/store/useStore'
import type { OutletCreate, Tenant, TenantListResponse } from '@/types'

const EMPTY_FORM: OutletCreate = { name: '', slug: '', city: '' }

function OutletCard({ outlet }: { outlet: Tenant }) {
  return (
    <Link
      href={`/${outlet.slug}/dashboard`}
      className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{outlet.name}</p>
          <p className="mt-1 text-xs font-mono text-slate-500">/{outlet.slug}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
            outlet.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {outlet.is_active ? 'Active' : 'Suspended'}
        </span>
      </div>
      {outlet.city ? (
        <p className="mt-2 text-xs text-slate-500">{outlet.city}</p>
      ) : null}
    </Link>
  )
}

export default function OutletsPage() {
  const tenantId = useStore((state) => state.tenantId)
  const tenantType = useStore((state) => state.tenantType)

  const [outlets, setOutlets] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<OutletCreate>(EMPTY_FORM)

  const setField = <K extends keyof OutletCreate>(key: K, value: OutletCreate[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const loadOutlets = async () => {
    if (!tenantId) return
    try {
      const res = await apiClient.get<TenantListResponse>(`/tenants/${tenantId}/outlets`)
      setOutlets(res.data.items)
    } catch {
      toast.error('Failed to load outlets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOutlets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.slug) {
      toast.error('Name and slug are required')
      return
    }
    setSubmitting(true)
    try {
      await apiClient.post(`/tenants/${tenantId}/outlets`, form)
      toast.success('Outlet created')
      setShowForm(false)
      setForm(EMPTY_FORM)
      void loadOutlets()
    } catch {
      // apiClient interceptor shows the error toast
    } finally {
      setSubmitting(false)
    }
  }

  if (tenantType && tenantType !== 'franchise_brand') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Outlets are only available to franchise brands.</p>
      </div>
    )
  }

  return (
    <ProtectedRoute allowedRoles={['super_admin', 'tenant_admin', 'platform_admin']}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#1A4D2E]">
              Franchise Brand
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Outlets</h1>
            <p className="mt-2 text-sm text-slate-600">
              Provision new branches for your brand. Each outlet is its own workspace with its own
              menu, tables, and QR link.
            </p>
          </div>
          <Button
            type="button"
            className="gap-2 bg-[#1A4D2E] text-white hover:bg-[#163f25]"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus className="h-4 w-4" />
            {showForm ? 'Hide Form' : 'Add Outlet'}
          </Button>
        </div>

        {showForm ? (
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>New Outlet</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="o-name">Name *</Label>
                    <Input
                      id="o-name"
                      value={form.name}
                      onChange={(e) => setField('name', e.target.value)}
                      placeholder="Downtown Branch"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="o-slug">Slug * (URL-safe)</Label>
                    <Input
                      id="o-slug"
                      value={form.slug}
                      onChange={(e) =>
                        setField('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))
                      }
                      placeholder="downtown-branch"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="o-city">City</Label>
                    <Input
                      id="o-city"
                      value={form.city ?? ''}
                      onChange={(e) => setField('city', e.target.value || null)}
                      placeholder="Dhaka"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="o-email">Contact Email</Label>
                    <Input
                      id="o-email"
                      value={form.contact_email ?? ''}
                      onChange={(e) => setField('contact_email', e.target.value || null)}
                      placeholder="outlet@example.com"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button
                    type="submit"
                    className="bg-[#1A4D2E] text-white hover:bg-[#163f25]"
                    disabled={submitting}
                  >
                    {submitting ? 'Creating...' : 'Create Outlet'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5 text-[#1A4D2E]" />
              Outlets ({outlets.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="animate-pulse space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : outlets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-10 text-center">
                <p className="text-sm text-slate-500">No outlets yet. Add your first branch above.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {outlets.map((outlet) => (
                  <OutletCard key={outlet.tenant_id} outlet={outlet} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  )
}
