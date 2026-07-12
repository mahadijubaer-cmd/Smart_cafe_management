'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Building2, LogIn, Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import { getClaimsFromToken } from '@/lib/auth'
import { IMPERSONATION_BACKUP_KEY } from '@/components/platform/ImpersonationBanner'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/layout/PageHeader'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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

function TenantCard({
  tenant,
  onImpersonate,
  onExport,
  onDelete,
}: {
  tenant: Tenant
  onImpersonate: (tenant: Tenant) => void
  onExport: (tenant: Tenant) => void
  onDelete: (tenant: Tenant) => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-full shrink-0"
              style={{ backgroundColor: tenant.brand_color || '#1A4D2E' }}
            />
            <p className="font-semibold text-foreground truncate">{tenant.name}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground font-mono">/{tenant.slug}</p>
        </div>
        <Badge variant={tenant.is_active ? 'default' : 'destructive'} className="shrink-0">
          {tenant.is_active ? 'Active' : 'Suspended'}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="secondary">
          {typeLabels[tenant.tenant_type] ?? tenant.tenant_type}
        </Badge>
        <Badge variant="secondary" className="capitalize">
          {tenant.subscription_tier}
        </Badge>
        {tenant.city ? <Badge variant="secondary">{tenant.city}</Badge> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => onImpersonate(tenant)}>
          <LogIn data-icon="inline-start" /> Impersonate
        </Button>
        <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => onExport(tenant)}>
          <Download data-icon="inline-start" /> Export
        </Button>
        <AlertDialog>
          <AlertDialogTrigger>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs text-destructive hover:bg-destructive/10"
              disabled={tenant.is_active}
              title={tenant.is_active ? 'Suspend the tenant before deleting it' : undefined}
            >
              <Trash2 data-icon="inline-start" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &quot;{tenant.name}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the tenant and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => onDelete(tenant)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

export default function TenantsPage() {
  const router = useRouter()
  const setToken = useStore((state) => state.setToken)
  const setTenantContext = useStore((state) => state.setTenantContext)
  const currentToken = useStore((state) => state.token)

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
      setTenants((res.data.items ?? res.data) as Tenant[])
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

  const handleImpersonate = async (tenant: Tenant) => {
    try {
      const res = await apiClient.post(`/platform/tenants/${tenant.tenant_id}/impersonate`)
      const { access_token: impersonationToken, tenant_slug: targetSlug } = res.data
      if (currentToken) sessionStorage.setItem(IMPERSONATION_BACKUP_KEY, currentToken)
      setToken(impersonationToken)
      const claims = getClaimsFromToken(impersonationToken)
      if (claims) {
        setTenantContext({
          tenant_id: claims.tenant_id,
          tenant_type: claims.tenant_type,
          tenant_slug: claims.tenant_slug,
          outlet_id: claims.outlet_id,
          brand_color: claims.brand_color,
        })
      }
      toast.success(`Viewing as ${targetSlug}`)
      router.push(`/${targetSlug}/dashboard`)
    } catch {
      toast.error('Failed to start impersonation session')
    }
  }

  const handleExport = async (tenant: Tenant) => {
    try {
      const res = await apiClient.get(`/tenants/${tenant.tenant_id}/export`)
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${tenant.slug}-export.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to export tenant data')
    }
  }

  const handleDelete = async (tenant: Tenant) => {
    try {
      await apiClient.delete(`/tenants/${tenant.tenant_id}`)
      toast.success('Tenant deleted')
      void loadTenants()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Failed to delete tenant')
    }
  }

  return (
    <ProtectedRoute allowedRoles={['platform_admin']}>
      <div className="min-h-screen bg-background px-4 py-6 md:px-6 lg:px-8">
        <div className="flex flex-col mx-auto max-w-7xl gap-6">
          <PageHeader
            eyebrow="Platform Admin"
            title="Tenant Management"
            description="All tenants on the SCMS platform."
            breadcrumbs={[{ label: 'Platform' }, { label: 'Tenants' }]}
            action={
              <Button type="button" className="gap-2" onClick={() => setShowForm((v) => !v)}>
                <Plus className="h-4 w-4" />
                {showForm ? 'Hide Form' : 'Add Tenant'}
              </Button>
            }
          />

          {showForm ? (
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Create Tenant</CardTitle>
              </CardHeader>
              <CardContent>
                <form method="post" onSubmit={handleCreate} className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="t-name">Name *</Label>
                      <Input id="t-name" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="BRAC University Cafe" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="t-slug">Slug * (URL-safe)</Label>
                      <Input id="t-slug" value={form.slug} onChange={(e) => setField('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="bracu" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="t-type">Tenant Type *</Label>
                      <Select
                        value={form.tenant_type}
                        onValueChange={(value) => setField('tenant_type', value as TenantType)}
                      >
                        <SelectTrigger id="t-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TENANT_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{typeLabels[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="t-email">Allowed Email Domain</Label>
                      <Input id="t-email" value={form.allowed_email_domain ?? ''} onChange={(e) => setField('allowed_email_domain', e.target.value || null)} placeholder="@bracuniversity.ac.bd" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="t-city">City</Label>
                      <Input id="t-city" value={form.city ?? ''} onChange={(e) => setField('city', e.target.value || null)} placeholder="Dhaka" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="t-phone">Phone</Label>
                      <Input id="t-phone" value={form.phone ?? ''} onChange={(e) => setField('phone', e.target.value || null)} />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'Creating...' : 'Create Tenant'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="text-primary" />
                All Tenants ({tenants.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
                </div>
              ) : tenants.length === 0 ? (
                <Empty className="border border-dashed border-border bg-muted">
                  <EmptyMedia variant="icon">
                    <Building2 />
                  </EmptyMedia>
                  <EmptyTitle>No tenants yet</EmptyTitle>
                  <EmptyDescription>Add a tenant to get started.</EmptyDescription>
                </Empty>
              ) : (
                <div className="motion-safe:animate-fade-up grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {tenants.map((tenant) => (
                    <TenantCard
                      key={tenant.tenant_id}
                      tenant={tenant}
                      onImpersonate={handleImpersonate}
                      onExport={handleExport}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  )
}
