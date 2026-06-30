'use client'

import { useEffect, type ReactNode } from 'react'
import { useParams } from 'next/navigation'

import { useStore } from '@/store/useStore'
import { getClaimsFromToken } from '@/lib/auth'

export default function TenantLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug

  const setTenantSlug = useStore((state) => state.setTenantSlug)
  const setTenantContext = useStore((state) => state.setTenantContext)
  const token = useStore((state) => state.token)
  const brandColor = useStore((state) => state.brandColor)

  useEffect(() => {
    if (slug) setTenantSlug(slug)
  }, [slug, setTenantSlug])

  // Hydrate tenant context from the persisted JWT on mount
  useEffect(() => {
    if (!token) return
    const claims = getClaimsFromToken(token)
    if (!claims) return
    setTenantContext({
      tenant_id: claims.tenant_id,
      tenant_type: claims.tenant_type,
      tenant_slug: claims.tenant_slug ?? slug,
      outlet_id: claims.outlet_id,
      brand_color: claims.brand_color,
    })
  }, [token, slug, setTenantContext])

  // Apply tenant brand color as CSS var on :root so all Tailwind `text-primary`,
  // `bg-primary`, `border-primary` classes resolve to the tenant's color.
  useEffect(() => {
    if (brandColor) {
      document.documentElement.style.setProperty('--color-primary', brandColor)
    }
    return () => {
      document.documentElement.style.setProperty('--color-primary', '#1A4D2E')
    }
  }, [brandColor])

  return <>{children}</>
}
