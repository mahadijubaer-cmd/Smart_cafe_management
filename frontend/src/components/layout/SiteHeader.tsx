'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

import { useTenantInfo } from '@/hooks/useTenantInfo'
import Logo from '@/components/layout/Logo'

const PLATFORM_ACCENT = '#1A4D2E'

export default function SiteHeader() {
  const params = useParams<{ tenant_slug?: string }>()
  const slug = params?.tenant_slug ?? ''
  const { tenant } = useTenantInfo(slug)
  const [pillVisible, setPillVisible] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (tenant) {
      const id = window.setTimeout(() => setPillVisible(true), 20)
      return () => window.clearTimeout(id)
    }
    setPillVisible(false)
    return undefined
  }, [tenant])

  useEffect(() => {
    setMounted(true)
  }, [])

  const accentColor = tenant?.brand_color ?? PLATFORM_ACCENT

  return (
    <div className="sticky top-0 z-50 bg-[hsl(var(--header-surface)/0.92)] shadow-sm backdrop-blur">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/discover"
          className="group flex items-center gap-2.5 rounded-full py-1 pr-3 transition-colors hover:bg-white/5"
        >
          <Logo theme="dark" className="size-8 transition-transform group-hover:scale-105" />
          <span className="flex flex-col leading-none">
            <span className="text-base font-extrabold tracking-tight text-white">SCMS</span>
            <span className="hidden text-[11px] font-medium text-white/45 sm:inline">
              Smart Cafe Management System
            </span>
          </span>
        </Link>

        {tenant && (
          <div
            className={`flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1.5 pr-3.5 transition-all duration-300 ease-out hover:bg-white/10 ${
              pillVisible ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'
            }`}
          >
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logo_url} alt={`${tenant.name} logo`} className="size-6 rounded-full object-cover" />
            ) : (
              <span
                className="flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: tenant.brand_color }}
              >
                {tenant.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="text-sm font-semibold text-white/90">{tenant.name}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Toggle dark mode"
        >
          {mounted && resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>

      <div
        className="h-[3px] w-full transition-colors duration-500"
        style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}99)` }}
      />
    </div>
  )
}
