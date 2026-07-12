'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import BrandColorPicker from '@/components/admin/BrandColorPicker'
import LogoUploader from '@/components/admin/LogoUploader'
import DomainRestrictionInput from '@/components/admin/DomainRestrictionInput'
import OperationsToggle from '@/components/admin/OperationsToggle'
import PageHeader from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-8">
        <PageHeader title="Settings" description={slug} />
      </div>

      {/* Tab bar */}
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="mb-8">
        <TabsList className="grid w-full grid-cols-4">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Tab: Organisation Profile */}
      {tab === 'profile' && (
        <div className="flex flex-col gap-5">
          <LogoUploader
            currentLogoUrl={tenant?.logo_url ?? null}
            tenantSlug={slug}
            onUploaded={(url) => setTenant((t) => t ? { ...t, logo_url: url } : t)}
          />

          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel>Organisation name</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>City</FieldLabel>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Dhaka" />
              </Field>
              <Field>
                <FieldLabel>Phone</FieldLabel>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+880…" />
              </Field>
            </div>
            <Field>
              <FieldLabel>Address</FieldLabel>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Contact email</FieldLabel>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </Field>
          </FieldGroup>

          <Button
            disabled={saving}
            onClick={() => save({ name, address, city, phone, contact_email: contactEmail })}
          >
            {saving ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      )}

      {/* Tab: Branding */}
      {tab === 'branding' && (
        <div className="flex flex-col gap-6">
          <BrandColorPicker value={brandColor} onChange={setBrandColor} />
          <Button disabled={saving} onClick={() => save({ brand_color: brandColor })}>
            {saving ? 'Saving…' : 'Save brand color'}
          </Button>
        </div>
      )}

      {/* Tab: Access Control */}
      {tab === 'access' && (
        <div className="flex flex-col gap-6">
          <DomainRestrictionInput value={allowedDomain} onChange={setAllowedDomain} />
          <Button disabled={saving} onClick={() => save({ allowed_email_domain: allowedDomain })}>
            {saving ? 'Saving…' : 'Save access settings'}
          </Button>
        </div>
      )}

      {/* Tab: Operations */}
      {tab === 'operations' && (
        <div className="flex flex-col gap-4">
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
