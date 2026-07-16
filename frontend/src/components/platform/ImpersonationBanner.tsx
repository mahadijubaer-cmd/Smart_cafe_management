'use client'

import { useRouter } from 'next/navigation'

import { getClaimsFromToken } from '@/lib/auth'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'

const IMPERSONATION_BACKUP_KEY = 'scms_preimpersonation_token'

export default function ImpersonationBanner() {
  const router = useRouter()
  const token = useStore((state) => state.token)
  const setToken = useStore((state) => state.setToken)
  const setTenantContext = useStore((state) => state.setTenantContext)

  const claims = getClaimsFromToken(token)
  if (!claims?.impersonation) return null

  const handleExit = () => {
    const backup = typeof window !== 'undefined' ? sessionStorage.getItem(IMPERSONATION_BACKUP_KEY) : null
    if (!backup) {
      router.replace('/admin/tenants')
      return
    }
    sessionStorage.removeItem(IMPERSONATION_BACKUP_KEY)
    setToken(backup)
    const backupClaims = getClaimsFromToken(backup)
    if (backupClaims) {
      setTenantContext({
        tenant_id: backupClaims.tenant_id,
        tenant_type: backupClaims.tenant_type,
        tenant_slug: backupClaims.tenant_slug,
        outlet_id: backupClaims.outlet_id,
        brand_color: backupClaims.brand_color,
      })
    }
    // Hard navigation, not router.replace: the browser is still sitting on the impersonated
    // tenant's [tenant_slug]/(admin)/layout.tsx, whose own guard reacts to the token swap above
    // and races router.replace's soft navigation — a client-side transition can lose that race
    // and land on /unauthorized. A full document load tears the old page down first.
    window.location.href = '/admin/tenants'
  }

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950">
      <span>
        Viewing as <strong>{claims.tenant_slug}</strong> — impersonation session
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-auto rounded-full bg-amber-950/10 px-3 py-1 text-xs font-bold text-amber-950 hover:bg-amber-950/20 hover:text-amber-950"
        onClick={handleExit}
      >
        Exit impersonation
      </Button>
    </div>
  )
}

export { IMPERSONATION_BACKUP_KEY }
