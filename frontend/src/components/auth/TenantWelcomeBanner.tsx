import { getTenantTypeMeta } from '@/lib/tenantTypes'
import type { TenantPublicDetailResponse } from '@/types'

interface TenantWelcomeBannerProps {
  tenant: TenantPublicDetailResponse
}

export default function TenantWelcomeBanner({ tenant }: TenantWelcomeBannerProps) {
  const typeLabel = getTenantTypeMeta(tenant.tenant_type).label

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/20 bg-white/10 px-5 py-4 backdrop-blur-sm">
      {tenant.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tenant.logo_url}
          alt={`${tenant.name} logo`}
          className="h-12 w-12 rounded-xl object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-xl font-bold text-white">
          {tenant.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-primary-foreground/60">{typeLabel}</p>
        <h2 className="text-lg font-bold text-primary-foreground">{tenant.name}</h2>
        {tenant.city && <p className="text-sm text-primary-foreground/70">{tenant.city}</p>}
      </div>
    </div>
  )
}
