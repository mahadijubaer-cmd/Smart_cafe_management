'use client'

import { useEffect, useState } from 'react'
import { Plus, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Tenant, TenantCreate, TenantType } from '@/types'

const TENANT_TYPES: TenantType[] = [
  'franchise_brand',
  'franchise_outlet',
  'corporate',
  'academic',
  'independent_restaurant',
  'food_court',
  'food_court_vendor',
]

const typeLabels: Record<TenantType, string> = {
  franchise_brand: 'Franchise Brand',
  franchise_outlet: 'Franchise Outlet',
  corporate: 'Corporate',
  academic: 'Academic',
  independent_restaurant: 'Independent Restaurant',
  food_court: 'Food Court',
  food_court_vendor: 'Food Court Vendor',
}

function TenantCard({ tenant }: { tenant: Tenant }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-full shrink-0"
              style={{ backgroundColor: tenant.brand_color || '#1A4D2E' }}
            />
            <p className="font-semibold text-slate-900 truncate">{tenant.name}</p>
          </div>
          <p className="mt-1 text-xs text-slate-500 font-mono">/{tenant.slug}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tenant.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
          {tenant.is_active ? 'Active' : 'Suspended'}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {typeLabels[tenant.tenant_type] ?? tenant.tenant_type}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 capitalize">
          {tenant.subscription_tier}
        </span>
        {tenant.city ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{tenant.city}</span> : null}
      </div>
    </div>
  )
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<TenantCreate>({
    tenant_type: 'academic',
    name: '',
    slug: '',
  })

  const setField = <K extends keyof TenantCreate>(key: K, value: TenantCreate[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const loadTenants = async () => {
    try {
      const res = await apiClient.get('/tenants')
      setTenants(res.data as Tenant[])
    } catch {
      toast.error('Failed to load tenants')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadTenants() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.slug) { toast.error('Name and slug are required'); return }
    setSubmitting(true)
    try {
      await apiClient.post('/tenants', form)
      toast.success('Tenant created')
      setShowForm(false)
      setForm({ tenant_type: 'academic', name: '', slug: '' })
      void loadTenants()
    } catch {
      toast.error('Failed to create tenant')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ProtectedRoute allowedRoles={['platform_admin']}>
      <div className="min-h-screen bg-[linear-gradient(180deg,#f2eee7_0%,#ffffff_34%,#edf5ef_100%)] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 inline-flex rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#1A4D2E]">
                Platform Admin
              </p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Tenant Management</h1>
              <p className="mt-2 text-sm text-slate-600">All tenants on the SCMS platform.</p>
            </div>
            <Button
              type="button"
              className="gap-2 bg-[#1A4D2E] text-white hover:bg-[#163f25]"
              onClick={() => setShowForm((v) => !v)}
            >
              <Plus className="h-4 w-4" />
              {showForm ? 'Hide Form' : 'Add Tenant'}
            </Button>
          </div>

          {showForm ? (
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Create Tenant</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="t-name">Name *</Label>
                      <Input id="t-name" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="BRAC University Cafe" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="t-slug">Slug * (URL-safe)</Label>
                      <Input id="t-slug" value={form.slug} onChange={(e) => setField('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="bracu" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="t-type">Tenant Type *</Label>
                      <select
                        id="t-type"
                        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary"
                        value={form.tenant_type}
                        onChange={(e) => setField('tenant_type', e.target.value as TenantType)}
                      >
                        {TENANT_TYPES.map((t) => (
                          <option key={t} value={t}>{typeLabels[t]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="t-email">Allowed Email Domain</Label>
                      <Input id="t-email" value={form.allowed_email_domain ?? ''} onChange={(e) => setField('allowed_email_domain', e.target.value || null)} placeholder="@bracuniversity.ac.bd" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="t-city">City</Label>
                      <Input id="t-city" value={form.city ?? ''} onChange={(e) => setField('city', e.target.value || null)} placeholder="Dhaka" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="t-phone">Phone</Label>
                      <Input id="t-phone" value={form.phone ?? ''} onChange={(e) => setField('phone', e.target.value || null)} />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button type="submit" className="bg-[#1A4D2E] text-white hover:bg-[#163f25]" disabled={submitting}>
                      {submitting ? 'Creating...' : 'Create Tenant'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#1A4D2E]" />
                All Tenants ({tenants.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="animate-pulse space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-slate-100" />)}
                </div>
              ) : tenants.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-10 text-center">
                  <p className="text-sm text-slate-500">No tenants yet.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {tenants.map((tenant) => <TenantCard key={tenant.tenant_id} tenant={tenant} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  )
}
