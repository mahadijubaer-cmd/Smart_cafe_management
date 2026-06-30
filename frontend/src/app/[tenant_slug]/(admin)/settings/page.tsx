'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'

import apiClient from '@/lib/api'
import BrandColorPicker from '@/components/admin/BrandColorPicker'
import LogoUploader from '@/components/admin/LogoUploader'
import DomainRestrictionInput from '@/components/admin/DomainRestrictionInput'
import OperationsToggle from '@/components/admin/OperationsToggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useStore } from '@/store/useStore'
import type { Tenant } from '@/types'

type Tab = 'profile' | 'branding' | 'access' | 'operations'

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Organisation' },
  { id: 'branding', label: 'Branding' },
  { id: 'access', label: 'Access Control' },
  { id: 'operations', label: 'Operations' },
]

export default function AdminSettingsPage() {
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug
  const [tab, setTab] = useState<Tab>('profile')

  const tenantType = useStore((state) => state.tenantType)

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)

  // Local draft state — only sent on Save
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [brandColor, setBrandColor] = useState('#1A4D2E')
  const [allowedDomain, setAllowedDomain] = useState<string | null>(null)
  const [homemadeEnabled, setHomemadeEnabled] = useState(false)
  const [strictMode, setStrictMode] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiClient.get<Tenant>('/tenants/me')
      .then((res) => {
        const t = res.data
        setTenant(t)
        setName(t.name ?? '')
        setAddress(t.address ?? '')
        setCity(t.city ?? '')
        setPhone(t.phone ?? '')
        setContactEmail(t.contact_email ?? '')
        setBrandColor(t.brand_color ?? '#1A4D2E')
        setAllowedDomain(t.allowed_email_domain ?? null)
        setHomemadeEnabled(t.homemade_enabled ?? false)
        setStrictMode(t.inventory_strict_mode ?? false)
      })
      .catch(() => toast.error('Could not load settings.'))
      .finally(() => setLoading(false))
  }, [])

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true)
    try {
      const res = await apiClient.patch<Tenant>('/tenants/me/settings', patch)
      setTenant(res.data)
      // Update CSS var immediately
      if (patch.brand_color) {
        document.documentElement.style.setProperty('--color-primary', patch.brand_color as string)
      }
      toast.success('Settings saved.')
    } catch {
      toast.error('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Loading…</div>
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-black text-slate-900">Settings</h1>
      <p className="mb-8 text-sm text-slate-500">{slug}</p>

      {/* Tab bar */}
      <div className="mb-8 flex gap-1 rounded-2xl border border-black/8 bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              'flex-1 rounded-xl py-2 text-sm font-medium transition',
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Organisation Profile */}
      {tab === 'profile' && (
        <div className="space-y-5">
          <LogoUploader
            currentLogoUrl={tenant?.logo_url ?? null}
            tenantSlug={slug}
            onUploaded={(url) => setTenant((t) => t ? { ...t, logo_url: url } : t)}
          />

          <div className="space-y-2">
            <Label>Organisation name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Dhaka" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+880…" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Contact email</Label>
            <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>

          <Button
            className="bg-primary text-white hover:opacity-90"
            disabled={saving}
            onClick={() => save({ name, address, city, phone, contact_email: contactEmail })}
          >
            {saving ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      )}

      {/* Tab: Branding */}
      {tab === 'branding' && (
        <div className="space-y-6">
          <BrandColorPicker value={brandColor} onChange={setBrandColor} />
          <Button
            className="bg-primary text-white hover:opacity-90"
            disabled={saving}
            onClick={() => save({ brand_color: brandColor })}
          >
            {saving ? 'Saving…' : 'Save brand color'}
          </Button>
        </div>
      )}

      {/* Tab: Access Control */}
      {tab === 'access' && (
        <div className="space-y-6">
          <DomainRestrictionInput value={allowedDomain} onChange={setAllowedDomain} />
          <Button
            className="bg-primary text-white hover:opacity-90"
            disabled={saving}
            onClick={() => save({ allowed_email_domain: allowedDomain })}
          >
            {saving ? 'Saving…' : 'Save access settings'}
          </Button>
        </div>
      )}

      {/* Tab: Operations */}
      {tab === 'operations' && (
        <div className="space-y-4">
          {tenantType === 'academic' && (
            <OperationsToggle
              id="homemade"
              label="Homemade Marketplace"
              description="Allow students to list homemade food items for sale."
              consequence="Students can submit items for approval before they appear in the menu."
              checked={homemadeEnabled}
              onChange={setHomemadeEnabled}
            />
          )}
          <OperationsToggle
            id="strict-inventory"
            label="Strict Inventory Mode"
            description="Block orders for items whose stock is at zero."
            consequence="Orders for out-of-stock items will be rejected at checkout."
            checked={strictMode}
            onChange={setStrictMode}
          />
          <Button
            className="bg-primary text-white hover:opacity-90"
            disabled={saving}
            onClick={() => save({ homemade_enabled: homemadeEnabled, inventory_strict_mode: strictMode })}
          >
            {saving ? 'Saving…' : 'Save operations settings'}
          </Button>
        </div>
      )}
    </div>
  )
}
