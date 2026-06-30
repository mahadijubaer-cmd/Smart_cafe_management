'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

import { getRoleFromToken } from '@/lib/auth'
import { useStore } from '@/store/useStore'
import type { UserRole } from '@/types'

type ProtectedRouteProps = {
  children: ReactNode
  allowedRoles?: UserRole[]
}

const ADMIN_ROLES: UserRole[] = ['platform_admin', 'super_admin', 'outlet_admin', 'tenant_admin', 'food_court_admin', 'admin']

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const router = useRouter()
  const token = useStore((state) => state.token)
  const hasHydrated = useStore((state) => state.hasHydrated)
  const tenantSlug = useStore((state) => state.tenantSlug)

  useEffect(() => {
    if (!hasHydrated) return

    const loginPath = tenantSlug ? `/${tenantSlug}/login` : '/login'

    if (!token) {
      router.replace(loginPath)
      return
    }

    const role = getRoleFromToken(token)

    if (!allowedRoles || allowedRoles.length === 0) return

    // Expand legacy 'admin' role to cover all admin variants
    const expandedAllowed = allowedRoles.flatMap((r) =>
      r === 'admin' ? ADMIN_ROLES : [r]
    )

    if (!role || !expandedAllowed.includes(role)) {
      router.replace('/unauthorized')
    }
  }, [allowedRoles, hasHydrated, router, tenantSlug, token])

  if (!hasHydrated) return null

  return <>{children}</>
}
