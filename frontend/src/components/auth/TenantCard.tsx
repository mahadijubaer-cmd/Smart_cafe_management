import Link from 'next/link'
import { getTenantTypeMeta } from '@/lib/tenantTypes'
import type { TenantPublicResponse } from '@/types'

interface TenantCardProps {
  tenant: TenantPublicResponse
}

export default function TenantCard({ tenant }: TenantCardProps) {
  const meta = getTenantTypeMeta(tenant.tenant_type)
  const typeLabel = meta.label

  return (
    <Link
      href={`/${tenant.slug}/login`}
      className="group flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <div className="flex items-center gap-3">
        {tenant.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logo_url}
            alt={`${tenant.name} logo`}
            className="h-11 w-11 rounded-xl object-cover"
          />
        ) : (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ backgroundColor: tenant.brand_color }}
          >
            {tenant.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-semibold transition-colors group-hover:text-primary">
            {tenant.name}
          </p>
          {tenant.city && <p className="text-xs text-muted-foreground">{tenant.city}</p>}
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <span className="inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {typeLabel}
        </span>
        <p className="text-xs leading-snug text-muted-foreground">{meta.description}</p>
      </div>
    </Link>
  )
}
