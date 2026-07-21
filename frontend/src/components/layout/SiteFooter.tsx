'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { useTenantInfo } from '@/hooks/useTenantInfo'
import { useStore } from '@/store/useStore'
import Logo from '@/components/layout/Logo'

const PLATFORM_ACCENT = '#1A4D2E'

export default function SiteFooter({ inset = false }: { inset?: boolean }) {
  const params = useParams<{ tenant_slug?: string }>()
  const slug = params?.tenant_slug ?? ''
  const { tenant } = useTenantInfo(slug)
  const [pillVisible, setPillVisible] = useState(false)
  // Fixed-sidebar layouts suppress the root layout's full-width instance and render their own
  // <SiteFooter inset /> inside the content column, so the sidebar never covers the footer
  // (specs/frontend/overview.md "Footer on fixed-sidebar pages").
  const globalFooterSuppressed = useStore((state) => state.globalFooterSuppressed)

  useEffect(() => {
    if (tenant) {
      const id = window.setTimeout(() => setPillVisible(true), 20)
      return () => window.clearTimeout(id)
    }
    setPillVisible(false)
    return undefined
  }, [tenant])

  const accentColor = tenant?.brand_color ?? PLATFORM_ACCENT

  if (!inset && globalFooterSuppressed) return null

  return (
    <footer className="bg-[hsl(var(--header-surface))]">
      <div
        className="h-[3px] w-full"
        style={{ background: `linear-gradient(90deg, ${accentColor}99, ${accentColor})` }}
      />

      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 sm:flex-row sm:px-6 lg:px-8">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-full py-1 pr-3 transition-colors hover:bg-white/5"
        >
          <Logo theme="dark" className="size-7 transition-transform group-hover:scale-105" />
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

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-1 px-4 py-4 text-center sm:px-6 lg:px-8">
          <span className="text-xs font-medium text-white/60">
            Developed by <span className="font-semibold text-white/80">Mahadi Jubaer</span>
          </span>
          <span className="text-[11px] text-white/40">
            <a href="mailto:mahadi.jubaer@g.bracu.ac.bd" className="transition-colors hover:text-white/70">
              mahadi.jubaer@g.bracu.ac.bd
            </a>
            <span className="mx-1.5">·</span>
            <a href="mailto:mahadi.jubaer@alora.cloud" className="transition-colors hover:text-white/70">
              mahadi.jubaer@alora.cloud
            </a>
          </span>
        </div>
      </div>
    </footer>
  )
}
