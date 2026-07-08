'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useStore } from '@/store/useStore'
import { isRestaurantSegment } from '@/lib/segments'
import type { Tenant } from '@/types'

const APP_ORIGIN =
  typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? '')

export default function PublicLinkPage() {
  const tenantType = useStore((state) => state.tenantType)

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [publicSlug, setPublicSlug] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiClient
      .get<Tenant>('/tenants/me')
      .then((res) => {
        setTenant(res.data)
        setEnabled(res.data.public_menu_enabled)
        setPublicSlug(res.data.public_slug ?? '')
      })
      .catch(() => toast.error('Could not load public-link settings.'))
      .finally(() => setLoading(false))
  }, [])

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true)
    try {
      const res = await apiClient.patch<Tenant>('/tenants/me/settings', patch)
      setTenant(res.data)
      setEnabled(res.data.public_menu_enabled)
      setPublicSlug(res.data.public_slug ?? '')
      toast.success('Saved.')
    } catch {
      // apiClient interceptor shows the error toast
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    )
  }

  const restaurantSegment = Boolean(tenantType && isRestaurantSegment(tenantType))
  const publicUrl = tenant?.public_slug ? `${APP_ORIGIN}/m/${tenant.public_slug}` : null

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-black text-foreground">
          {restaurantSegment ? 'Public Guest Ordering' : 'Public Menu'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {restaurantSegment
            ? 'Let walk-in guests scan a table QR, browse your menu, and order without an account (pay at the counter).'
            : 'Publish a read-only menu page for people to browse without logging in. Cafeteria tenants order through the regular app — this link is browsing only, not guest checkout.'}
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="font-semibold text-card-foreground">Enable public menu</p>
            <p className="text-sm text-muted-foreground">
              Turns on the /m/{'{slug}'} page {restaurantSegment ? '(guest ordering)' : '(read-only browsing)'}.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(value) => {
              if (value && !publicSlug.trim()) {
                toast.error('Set a public link (slug) before enabling.')
                return
              }
              save({ public_menu_enabled: value })
            }}
            disabled={saving}
          />
        </CardContent>
      </Card>

      {restaurantSegment ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="font-semibold text-card-foreground">Guest checkout mode</p>
              <p className="text-sm text-muted-foreground">
                {tenant?.guest_checkout_mode === 'online'
                  ? 'Guests can pay online or at the counter. Online payment is a simulated gateway for now (no real card processing) — see roadmap for real payment integration.'
                  : 'Guests always pay at the counter after staff confirms the order.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={tenant?.guest_checkout_mode !== 'online' ? 'text-xs font-semibold text-foreground' : 'text-xs font-semibold text-muted-foreground'}>
                Counter
              </span>
              <Switch
                checked={tenant?.guest_checkout_mode === 'online'}
                onCheckedChange={(value) => save({ guest_checkout_mode: value ? 'online' : 'counter' })}
                disabled={saving}
              />
              <span className={tenant?.guest_checkout_mode === 'online' ? 'text-xs font-semibold text-foreground' : 'text-xs font-semibold text-muted-foreground'}>
                Online
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <Field>
            <FieldLabel htmlFor="public_slug">Public link (slug)</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="public_slug"
                value={publicSlug}
                onChange={(e) => setPublicSlug(e.target.value.toLowerCase())}
                placeholder="e.g. green-fork"
              />
              <Button disabled={saving} onClick={() => save({ public_slug: publicSlug.trim() })}>
                Save
              </Button>
            </div>
            {publicUrl ? (
              <FieldDescription>
                {restaurantSegment ? 'Guest menu URL' : 'Public menu URL'}:{' '}
                <span className="font-mono text-card-foreground">{publicUrl}</span>
              </FieldDescription>
            ) : (
              <FieldDescription>Set a slug to get your public menu link.</FieldDescription>
            )}
          </Field>
        </CardContent>
      </Card>

      {publicUrl && restaurantSegment ? (
        <Card>
          <CardContent className="flex flex-col gap-1 p-5">
            <p className="font-semibold text-card-foreground">Table QR codes</p>
            <p className="text-sm text-muted-foreground">
              Each table&apos;s QR points to{' '}
              <span className="font-mono text-card-foreground">{publicUrl}?t=&#123;table_number&#125;</span>.
              Download a printable PDF sheet — one page per table.
            </p>
            <Button
              className="mt-3 w-fit"
              onClick={async () => {
                try {
                  const res = await apiClient.get('/qr/table-sheet/pdf', { responseType: 'blob' })
                  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
                  const link = document.createElement('a')
                  link.href = url
                  link.download = 'table-qr-sheet.pdf'
                  link.click()
                  window.URL.revokeObjectURL(url)
                } catch {
                  toast.error('Could not generate the QR sheet. Add tables first.')
                }
              }}
            >
              Download table QR sheet (PDF)
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
