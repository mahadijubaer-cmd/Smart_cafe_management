'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import PageHeader from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { GatewayConfigMasked, GatewayType } from '@/types'

type GatewayFormState = {
  is_enabled: boolean
  is_sandbox: boolean
  // Secret fields — always start blank. A blank field on save keeps whatever secret
  // is already stored server-side (see backend GatewayConfigUpsert docs); this page
  // never receives or displays a real decrypted secret.
  store_id: string
  store_password: string
  app_key: string
  app_secret: string
  username: string
  password: string
}

const emptyForm = (): GatewayFormState => ({
  is_enabled: false,
  is_sandbox: true,
  store_id: '',
  store_password: '',
  app_key: '',
  app_secret: '',
  username: '',
  password: '',
})

export default function PaymentSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [configs, setConfigs] = useState<Record<GatewayType, GatewayConfigMasked | undefined>>({
    sslcommerz: undefined,
    bkash: undefined,
  })
  const [forms, setForms] = useState<Record<GatewayType, GatewayFormState>>({
    sslcommerz: emptyForm(),
    bkash: emptyForm(),
  })
  const [saving, setSaving] = useState<GatewayType | null>(null)

  const load = async () => {
    try {
      const res = await apiClient.get<GatewayConfigMasked[]>('/payment-gateways/me')
      const byType: Record<GatewayType, GatewayConfigMasked | undefined> = { sslcommerz: undefined, bkash: undefined }
      const nextForms: Record<GatewayType, GatewayFormState> = { sslcommerz: emptyForm(), bkash: emptyForm() }

      for (const config of res.data) {
        byType[config.gateway_type] = config
        nextForms[config.gateway_type] = {
          ...emptyForm(),
          is_enabled: config.is_enabled,
          is_sandbox: config.is_sandbox,
          ...(config.gateway_type === 'sslcommerz'
            ? { store_id: config.public_identifier ?? '' }
            : {}),
        }
      }

      setConfigs(byType)
      setForms(nextForms)
    } catch {
      toast.error('Could not load payment gateway settings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const updateForm = (gatewayType: GatewayType, patch: Partial<GatewayFormState>) => {
    setForms((current) => ({ ...current, [gatewayType]: { ...current[gatewayType], ...patch } }))
  }

  const save = async (gatewayType: GatewayType) => {
    const form = forms[gatewayType]
    setSaving(gatewayType)
    try {
      const body: Record<string, unknown> = {
        is_enabled: form.is_enabled,
        is_sandbox: form.is_sandbox,
      }

      if (gatewayType === 'sslcommerz') {
        if (form.store_id.trim()) body.store_id = form.store_id.trim()
        if (form.store_password.trim()) body.store_password = form.store_password.trim()
      } else {
        if (form.username.trim()) body.username = form.username.trim()
        if (form.app_key.trim()) body.app_key = form.app_key.trim()
        if (form.app_secret.trim()) body.app_secret = form.app_secret.trim()
        if (form.password.trim()) body.password = form.password.trim()
      }

      const res = await apiClient.put<GatewayConfigMasked>(`/payment-gateways/me/${gatewayType}`, body)
      setConfigs((current) => ({ ...current, [gatewayType]: res.data }))
      // Clear the secret inputs after a successful save — they never reflect a real
      // stored value, so leaving stale text in them the next render would be misleading.
      updateForm(gatewayType, { store_password: '', app_secret: '', password: '' })
      toast.success('Saved.')
    } catch {
      // apiClient interceptor shows the error toast
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="h-24 w-full animate-pulse rounded-2xl bg-muted" />
        <div className="h-64 w-full animate-pulse rounded-2xl bg-muted" />
        <div className="h-64 w-full animate-pulse rounded-2xl bg-muted" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Payment Settings"
        description="Connect your own SSLCommerz and/or bKash merchant account so customers can pay online. Wallet and simulation payments always stay available regardless of what's configured here."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            <span>SSLCommerz</span>
            <Switch
              checked={forms.sslcommerz.is_enabled}
              onCheckedChange={(value) => updateForm('sslcommerz', { is_enabled: value })}
              disabled={saving === 'sslcommerz'}
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Covers cards, bKash, Nagad, Rocket, Upay, and net banking through one hosted checkout page.
          </p>

          <div className="flex items-center justify-between rounded-2xl border border-border bg-muted p-3">
            <span className="text-sm font-medium text-foreground">Sandbox mode</span>
            <Switch
              checked={forms.sslcommerz.is_sandbox}
              onCheckedChange={(value) => updateForm('sslcommerz', { is_sandbox: value })}
              disabled={saving === 'sslcommerz'}
            />
          </div>

          <Field>
            <FieldLabel htmlFor="ssl_store_id">Store ID</FieldLabel>
            <Input
              id="ssl_store_id"
              value={forms.sslcommerz.store_id}
              onChange={(e) => updateForm('sslcommerz', { store_id: e.target.value })}
              placeholder="testbox"
            />
            <FieldDescription>Use the public sandbox (store_id: testbox) to test before your own merchant account is approved.</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="ssl_store_password">Store Password</FieldLabel>
            <Input
              id="ssl_store_password"
              type="password"
              value={forms.sslcommerz.store_password}
              onChange={(e) => updateForm('sslcommerz', { store_password: e.target.value })}
              placeholder={configs.sslcommerz?.has_credentials ? '•••••••• (leave blank to keep current)' : 'qwerty'}
            />
            <FieldDescription>
              {configs.sslcommerz?.has_credentials
                ? 'A password is already saved. Leave blank to keep it, or enter a new one to replace it.'
                : 'Never shown again after saving.'}
            </FieldDescription>
          </Field>

          <Button disabled={saving === 'sslcommerz'} onClick={() => save('sslcommerz')}>
            Save SSLCommerz settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            <span>bKash</span>
            <Switch
              checked={forms.bkash.is_enabled}
              onCheckedChange={(value) => updateForm('bkash', { is_enabled: value })}
              disabled={saving === 'bkash'}
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your own bKash merchant account's Tokenized Checkout — a bKash-branded checkout page, separate from SSLCommerz.
          </p>

          <div className="flex items-center justify-between rounded-2xl border border-border bg-muted p-3">
            <span className="text-sm font-medium text-foreground">Sandbox mode</span>
            <Switch
              checked={forms.bkash.is_sandbox}
              onCheckedChange={(value) => updateForm('bkash', { is_sandbox: value })}
              disabled={saving === 'bkash'}
            />
          </div>

          <Field>
            <FieldLabel htmlFor="bkash_username">Username</FieldLabel>
            <Input
              id="bkash_username"
              value={forms.bkash.username}
              onChange={(e) => updateForm('bkash', { username: e.target.value })}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="bkash_app_key">App Key</FieldLabel>
            <Input
              id="bkash_app_key"
              value={forms.bkash.app_key}
              onChange={(e) => updateForm('bkash', { app_key: e.target.value })}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="bkash_app_secret">App Secret</FieldLabel>
            <Input
              id="bkash_app_secret"
              type="password"
              value={forms.bkash.app_secret}
              onChange={(e) => updateForm('bkash', { app_secret: e.target.value })}
              placeholder={configs.bkash?.has_credentials ? '•••••••• (leave blank to keep current)' : undefined}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="bkash_password">Password</FieldLabel>
            <Input
              id="bkash_password"
              type="password"
              value={forms.bkash.password}
              onChange={(e) => updateForm('bkash', { password: e.target.value })}
              placeholder={configs.bkash?.has_credentials ? '•••••••• (leave blank to keep current)' : undefined}
            />
            <FieldDescription>
              {configs.bkash?.has_credentials
                ? 'Credentials are already saved. Leave a field blank to keep its current value.'
                : 'Never shown again after saving.'}
            </FieldDescription>
          </Field>

          <Button disabled={saving === 'bkash'} onClick={() => save('bkash')}>
            Save bKash settings
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
