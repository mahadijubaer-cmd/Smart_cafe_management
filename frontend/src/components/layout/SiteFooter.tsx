'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { useTenantInfo } from '@/hooks/useTenantInfo'

const PLATFORM_ACCENT = '#1A4D2E'

export default function SiteFooter() {
  const params = useParams<{ tenant_slug?: string }>()
  const slug = params?.tenant_slug ?? ''
  const { tenant } = useTenantInfo(slug)
  const [pillVisible, setPillVisible] = useState(false)

  useEffect(() => {
    if (tenant) {
      const id = window.setTimeout(() => setPillVisible(true), 20)
      return () => window.clearTimeout(id)
    }
    setPillVisible(false)
    return undefined
  }, [tenant])

  const accentColor = tenant?.brand_color ?? PLATFORM_ACCENT

  return (
    <footer className="bg-[hsl(var(--header-surface))]">
      <div
        className="h-[3px] w-full"
        style={{ background: `linear-gradient(90deg, ${accentColor}99, ${accentColor})` }}
      />

      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 sm:flex-row sm:px-6 lg:px-8">
        <Link
          href="/discover"
          className="group flex items-center gap-2.5 rounded-full py-1 pr-3 transition-colors hover:bg-white/5"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary/20 text-sm transition-transform group-hover:scale-105" aria-hidden="true">
            🍽
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-extrabold tracking-tight text-white">SCMS</span>
            <span className="hidden text-[11px] font-medium text-white/45 sm:inline">
              Smart Cafe Management System · &copy; {new Date().getFullYear()}
            </span>
          </span>
        </Link>

        {tenant && (
          <div
            className={`flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1.5 pr-3.5 transition-all duration-300 ease-out hover:bg-white/10 ${
              pillVisible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
            }`}
          >
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logo_url} alt={`${tenant.name} logo`} className="size-5 rounded-full object-cover" />
            ) : (
              <span
                className="flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: tenant.brand_color }}
              >
                {tenant.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="text-xs font-semibold text-white/80">{tenant.name}</span>
          </div>
        )}
      </div>
    </footer>
  )
}
