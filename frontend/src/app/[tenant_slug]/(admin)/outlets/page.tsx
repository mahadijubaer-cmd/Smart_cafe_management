'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Store } from 'lucide-react'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useStore } from '@/store/useStore'
import type { OutletCreate, Tenant, TenantListResponse } from '@/types'

const EMPTY_FORM: OutletCreate = { name: '', slug: '', city: '' }

function OutletCard({ outlet }: { outlet: Tenant }) {
  return (
    <Link
      href={`/${outlet.slug}/dashboard`}
      className="block rounded-2xl border bg-card p-4 text-card-foreground shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-card-foreground">{outlet.name}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">/{outlet.slug}</p>
        </div>
        <Badge variant={outlet.is_active ? 'default' : 'destructive'} className="shrink-0">
          {outlet.is_active ? 'Active' : 'Suspended'}
        </Badge>
      </div>
      {outlet.city ? (
        <p className="mt-2 text-xs text-muted-foreground">{outlet.city}</p>
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
    // Outlets are franchise-brand only — the backend rejects this call with 403 for every
    // other tenant type, so skip it rather than firing a request that always fails and
    // surfaces a spurious "Failed to load outlets" toast to non-franchise admins.
    if (tenantType && tenantType !== 'franchise_brand') {
      setLoading(false)
      return
    }
    void loadOutlets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, tenantType])

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
        <p className="text-muted-foreground">Outlets are only available to franchise brands.</p>
      </div>
    )
  }

  return (
    <ProtectedRoute allowedRoles={['super_admin', 'tenant_admin', 'platform_admin']}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader
          eyebrow="Franchise Brand"
          title="Outlets"
          description="Provision new branches for your brand. Each outlet is its own workspace with its own menu, tables, and QR link."
          action={
            <Button type="button" onClick={() => setShowForm((v) => !v)}>
              <Plus data-icon="inline-start" />
              {showForm ? 'Hide Form' : 'Add Outlet'}
            </Button>
          }
        />

        {showForm ? (
          <Card>
            <CardHeader>
              <CardTitle>New Outlet</CardTitle>
            </CardHeader>
            <CardContent>
              <form method="post" onSubmit={handleCreate} className="flex flex-col gap-4">
                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="o-name">Name *</FieldLabel>
                    <Input
                      id="o-name"
                      value={form.name}
                      onChange={(e) => setField('name', e.target.value)}
                      placeholder="Downtown Branch"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="o-slug">Slug * (URL-safe)</FieldLabel>
                    <Input
                      id="o-slug"
                      value={form.slug}
                      onChange={(e) =>
                        setField('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))
                      }
                      placeholder="downtown-branch"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="o-city">City</FieldLabel>
                    <Input
                      id="o-city"
                      value={form.city ?? ''}
                      onChange={(e) => setField('city', e.target.value || null)}
                      placeholder="Dhaka"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="o-email">Contact Email</FieldLabel>
                    <Input
                      id="o-email"
                      value={form.contact_email ?? ''}
                      onChange={(e) => setField('contact_email', e.target.value || null)}
                      placeholder="outlet@example.com"
                    />
                  </Field>
                </FieldGroup>
                <div className="flex gap-3 pt-2">
                  <Button type="submit" disabled={submitting}>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="size-5 text-primary" />
              Outlets ({outlets.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-2xl" />
                ))}
              </div>
            ) : outlets.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Store />
                  </EmptyMedia>
                  <EmptyTitle>No outlets yet</EmptyTitle>
                  <EmptyDescription>Add your first branch above.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="motion-safe:animate-fade-up grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
