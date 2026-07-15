'use client'

/**
 * Kiosk customization (RFC-010, Phase 25.5 — specs/modules/kiosk.md KSK-8).
 * Edits are held as unsaved draft state and fed straight into the real
 * `KioskExperience` component in the preview pane, so admins see the exact
 * kiosk render before saving (SGN-6 sibling contract for kiosk).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Maximize2 } from 'lucide-react'
import { toast } from 'sonner'

import PageHeader from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { KioskExperience, type KioskConfigShape, type KioskMenu } from '@/components/kiosk/KioskApp'
import apiClient from '@/lib/api'
import { useTenantInfo } from '@/hooks/useTenantInfo'

/** WCAG 1.4.3 — same formula as the backend's KSK-7 check, mirrored client-side
 * so the admin sees the failure before submitting instead of after a 422. */
function contrastAgainstWhite(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return 0
  const lum = [0, 2, 4]
    .map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2]
  return 1.05 / (L + 0.05)
}

const DEFAULTS: Required<KioskConfigShape> = {
  welcome_text_en: 'Welcome — order here',
  welcome_text_bn: 'স্বাগতম — এখানে অর্ডার করুন',
  attract_image_urls: [],
  featured_item_ids: [],
  accent_color: null,
  idle_timeout_seconds: 60,
  allow_guest_name: true,
  show_dietary_tags: true,
}

export default function KioskSettingsPage() {
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug
  const { tenant } = useTenantInfo(slug)

  const [config, setConfig] = useState<KioskConfigShape>(DEFAULTS)
  const [attractText, setAttractText] = useState('')
  const [menu, setMenu] = useState<KioskMenu | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [configRes, menuRes] = await Promise.all([
        apiClient.get('/kiosk-config'),
        apiClient.get('/kiosk-config/preview/menu'),
      ])
      const resolved = { ...DEFAULTS, ...(configRes.data.config as KioskConfigShape) }
      setConfig(resolved)
      setAttractText((resolved.attract_image_urls ?? []).join('\n'))
      setMenu(menuRes.data as KioskMenu)
    } catch {
      /* toast handled by interceptor */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const accentRatio = config.accent_color ? contrastAgainstWhite(config.accent_color) : null
  const accentFails = accentRatio !== null && accentRatio < 4.5

  const handleSave = async () => {
    if (accentFails) {
      toast.error('Accent color fails WCAG contrast — pick a darker shade')
      return
    }
    setSaving(true)
    try {
      const attractUrls = attractText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      await apiClient.put('/kiosk-config', { ...config, attract_image_urls: attractUrls })
      toast.success('Kiosk settings saved — paired kiosks refresh automatically')
      await load()
    } catch {
      /* toast handled by interceptor */
    } finally {
      setSaving(false)
    }
  }

  const toggleFeatured = (itemId: string) => {
    setConfig((c) => {
      const set = new Set(c.featured_item_ids ?? [])
      if (set.has(itemId)) set.delete(itemId)
      else set.add(itemId)
      return { ...c, featured_item_ids: [...set] }
    })
  }

  const previewConfig = useMemo<KioskConfigShape>(
    () => ({ ...config, attract_image_urls: attractText.split('\n').map((s) => s.trim()).filter(Boolean) }),
    [config, attractText],
  )

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Kiosk Settings"
        description="Customize the self-service ordering terminal — welcome text, accent color, featured items"
        action={
          <Button asChild variant="outline">
            <Link href={`/${slug}/kiosk-preview`} target="_blank">
              <Maximize2 data-icon="inline-start" /> Full-screen preview
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Welcome message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="welcome-en">Welcome text (English)</Label>
                <Input
                  id="welcome-en"
                  maxLength={120}
                  value={config.welcome_text_en ?? ''}
                  onChange={(e) => setConfig((c) => ({ ...c, welcome_text_en: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="welcome-bn">Welcome text (বাংলা)</Label>
                <Input
                  id="welcome-bn"
                  maxLength={120}
                  value={config.welcome_text_bn ?? ''}
                  onChange={(e) => setConfig((c) => ({ ...c, welcome_text_bn: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="attract-images">Attract-screen images (one URL per line)</Label>
                <Textarea
                  id="attract-images"
                  rows={3}
                  value={attractText}
                  onChange={(e) => setAttractText(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Appearance &amp; behavior</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accent">Accent color</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="accent"
                    type="color"
                    className="h-10 w-14 cursor-pointer rounded border"
                    value={config.accent_color ?? tenant?.brand_color ?? '#1A4D2E'}
                    onChange={(e) => setConfig((c) => ({ ...c, accent_color: e.target.value }))}
                  />
                  <Input
                    className="w-32 font-mono"
                    value={config.accent_color ?? ''}
                    placeholder={tenant?.brand_color ?? '#1A4D2E'}
                    onChange={(e) => setConfig((c) => ({ ...c, accent_color: e.target.value || null }))}
                  />
                  {accentRatio !== null ? (
                    <span className={`text-sm ${accentFails ? 'text-destructive' : 'text-emerald-600'}`}>
                      {accentRatio.toFixed(2)}:1 {accentFails ? '— fails 4.5:1 (WCAG 1.4.3)' : '— passes'}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Blank uses the tenant brand color</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="idle-timeout">Idle timeout (seconds before the reset warning)</Label>
                <Input
                  id="idle-timeout"
                  type="number"
                  min={30}
                  max={600}
                  value={config.idle_timeout_seconds ?? 60}
                  onChange={(e) => setConfig((c) => ({ ...c, idle_timeout_seconds: Number(e.target.value) }))}
                  className="w-32"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Ask for guest name</p>
                  <p className="text-xs text-muted-foreground">Shown at checkout, used to call out the order</p>
                </div>
                <Switch
                  checked={config.allow_guest_name ?? true}
                  onCheckedChange={(v) => setConfig((c) => ({ ...c, allow_guest_name: v }))}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Show dietary tags</p>
                  <p className="text-xs text-muted-foreground">Vegetarian/vegan/halal/spicy badges on item cards</p>
                </div>
                <Switch
                  checked={config.show_dietary_tags ?? true}
                  onCheckedChange={(v) => setConfig((c) => ({ ...c, show_dietary_tags: v }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Featured items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
                {(menu?.items ?? []).map((item) => (
                  <label
                    key={item.item_id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(config.featured_item_ids ?? []).includes(item.item_id)}
                        onChange={() => toggleFeatured(item.item_id)}
                      />
                      {item.name}
                    </span>
                    <span className="text-xs text-muted-foreground">৳{item.price}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          <Button onClick={() => void handleSave()} disabled={saving || accentFails}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm">Live preview</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Real component, live-bound to the unsaved form state (KSK-8) — a fixed-height
                  scrolling frame rather than a scaled mockup, so every screen stays interactive. */}
              <div className="h-[640px] overflow-y-auto border-t bg-background">
                <KioskExperience tenantName={tenant?.name ?? slug} menu={menu} config={previewConfig} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
