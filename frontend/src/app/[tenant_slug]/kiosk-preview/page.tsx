'use client'

/**
 * Full-screen kiosk preview (RFC-010, Phase 25.5 — specs/modules/kiosk.md KSK-8).
 * Same admin-JWT preview endpoints as the side-by-side pane, rendered full-bleed
 * with no admin chrome — order submission is disabled (KioskExperience's own
 * preview-mode banner, triggered by omitting `placeOrder`).
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { X } from 'lucide-react'

import { KioskExperience, type KioskConfigShape, type KioskMenu } from '@/components/kiosk/KioskApp'
import apiClient from '@/lib/api'
import { useStore } from '@/store/useStore'
import { useTenantInfo } from '@/hooks/useTenantInfo'

export default function KioskPreviewPage() {
  const params = useParams<{ tenant_slug: string }>()
  const router = useRouter()
  const slug = params.tenant_slug
  const token = useStore((state) => state.token)
  const { tenant } = useTenantInfo(slug)

  const [config, setConfig] = useState<KioskConfigShape | null>(null)
  const [menu, setMenu] = useState<KioskMenu | null>(null)

  useEffect(() => {
    if (!token) router.replace(`/${slug}/login`)
  }, [router, slug, token])

  useEffect(() => {
    if (!token) return
    Promise.all([apiClient.get('/kiosk-config'), apiClient.get('/kiosk-config/preview/menu')])
      .then(([configRes, menuRes]) => {
        setConfig(configRes.data.config as KioskConfigShape)
        setMenu(menuRes.data as KioskMenu)
      })
      .catch(() => undefined)
  }, [token])

  if (!config) return null

  return (
    <div className="relative min-h-screen">
      <Link
        href={`/${slug}/kiosk-settings`}
        className="fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white shadow-lg"
        aria-label="Exit preview"
      >
        <X className="h-5 w-5" />
      </Link>
      <KioskExperience tenantName={tenant?.name ?? slug} menu={menu} config={config} />
    </div>
  )
}
