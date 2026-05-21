'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

import { getRoleFromToken } from '@/lib/auth'
import { useStore } from '@/store/useStore'
import type { User } from '@/types'

type ProtectedRouteProps = {
  children: ReactNode
  allowedRoles?: User['role'][]
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const router = useRouter()
  const token = useStore((state) => state.token)
  const hasHydrated = useStore((state) => state.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) {
      return
    }

    if (!token) {
      router.replace('/login')
      return
    }

    const role = getRoleFromToken(token)
    if (allowedRoles && allowedRoles.length > 0 && (!role || !allowedRoles.includes(role))) {
      router.replace('/unauthorized')
    }
  }, [allowedRoles, hasHydrated, router, token])

  if (!hasHydrated) {
    return null
  }

  return <>{children}</>
}