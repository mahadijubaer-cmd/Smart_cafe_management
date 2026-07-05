'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

import apiClient from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    return <p className="p-6 text-sm text-slate-500">Loading…</p>
  }

  const restaurantSegment = Boolean(tenantType && isRestaurantSegment(tenantType))
  const publicUrl = tenant?.public_slug ? `${APP_ORIGIN}/m/${tenant.public_slug}` : null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">
          {restaurantSegment ? 'Public Guest Ordering' : 'Public Menu'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {restaurantSegment
            ? 'Let walk-in guests scan a table QR, browse your menu, and order without an account (pay at the counter).'
            : 'Publish a read-only menu page for people to browse without logging in. Cafeteria tenants order through the regular app — this link is browsing only, not guest checkout.'}
        </p>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <p className="font-semibold text-slate-900">Enable public menu</p>
          <p className="text-sm text-slate-500">
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
      </div>

      {restaurantSegment ? (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <p className="font-semibold text-slate-900">Guest checkout mode</p>
            <p className="text-sm text-slate-500">
              {tenant?.guest_checkout_mode === 'online'
                ? 'Guests can pay online or at the counter. Online payment is a simulated gateway for now (no real card processing) — see roadmap for real payment integration.'
                : 'Guests always pay at the counter after staff confirms the order.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${tenant?.guest_checkout_mode !== 'online' ? 'text-slate-900' : 'text-slate-400'}`}>
              Counter
            </span>
            <Switch
              checked={tenant?.guest_checkout_mode === 'online'}
              onCheckedChange={(value) => save({ guest_checkout_mode: value ? 'online' : 'counter' })}
              disabled={saving}
            />
            <span className={`text-xs font-semibold ${tenant?.guest_checkout_mode === 'online' ? 'text-slate-900' : 'text-slate-400'}`}>
              Online
            </span>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <Label htmlFor="public_slug">Public link (slug)</Label>
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
          <p className="text-sm text-slate-500">
            {restaurantSegment ? 'Guest menu URL' : 'Public menu URL'}:{' '}
            <span className="font-mono text-slate-800">{publicUrl}</span>
          </p>
        ) : (
          <p className="text-sm text-slate-400">Set a slug to get your public menu link.</p>
        )}
      </div>

      {publicUrl && restaurantSegment ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="font-semibold text-slate-900">Table QR codes</p>
          <p className="mt-1 text-sm text-slate-500">
            Each table&apos;s QR points to{' '}
            <span className="font-mono text-slate-800">{publicUrl}?t=&#123;table_number&#125;</span>.
            Download a printable PDF sheet — one page per table.
          </p>
          <Button
            className="mt-3 bg-[#1A4D2E] text-white hover:bg-[#163f25]"
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
        </div>
      ) : null}
    </div>
  )
}
