import Link from 'next/link'
import type { TenantPublicResponse } from '@/types'

const TENANT_TYPE_LABELS: Record<string, string> = {
  academic: 'University',
  independent_restaurant: 'Restaurant',
  corporate: 'Corporate',
  food_court: 'Food Court',
  food_court_vendor: 'Vendor',
  franchise_brand: 'Franchise',
  franchise_outlet: 'Outlet',
}

interface TenantCardProps {
  tenant: TenantPublicResponse
}

export default function TenantCard({ tenant }: TenantCardProps) {
  const typeLabel = TENANT_TYPE_LABELS[tenant.tenant_type] ?? tenant.tenant_type

  return (
    <Link
      href={`/${tenant.slug}/login`}
      className="group flex flex-col gap-4 rounded-2xl border border-black/8 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
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
          <p className="font-semibold text-slate-800 group-hover:text-primary transition-colors">
            {tenant.name}
          </p>
          {tenant.city && <p className="text-xs text-slate-500">{tenant.city}</p>}
        </div>
      </div>
      <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
        {typeLabel}
      </span>
    </Link>
  )
}
