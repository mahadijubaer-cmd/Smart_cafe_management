'use client'

import { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { LayoutDashboard, ShoppingBag, UtensilsCrossed } from 'lucide-react'

import { useStore } from '@/store/useStore'

export default function StaffLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug
  const token = useStore((state) => state.token)
  const clearAuth = useStore((state) => state.clearAuth)

  useEffect(() => {
    if (!token) router.replace(`/${slug}/login`)
  }, [router, slug, token])

  const handleLogout = () => {
    clearAuth()
    router.push(`/${slug}/login`)
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <nav className="bg-[#1A4D2E] text-white px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-6">
          <Link href={`/${slug}/orders`} className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <ShoppingBag className="h-5 w-5" />
            Staff — Kitchen Queue
          </Link>
          <Link href={`/${slug}/dashboard`} className="flex items-center gap-2 text-sm text-white/80 hover:text-white transition">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link href={`/${slug}/menu`} className="flex items-center gap-2 text-sm text-white/80 hover:text-white transition">
            <UtensilsCrossed className="h-4 w-4" />
            Menu
          </Link>
        </div>
        <button type="button" onClick={handleLogout} className="text-sm text-white/70 hover:text-white transition">
          Logout
        </button>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
