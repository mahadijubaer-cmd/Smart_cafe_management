import { jwtDecode } from 'jwt-decode'
import type { UserRole, TenantType } from '@/types'

type JwtPayload = {
  sub: string
  role: string
  tenant_id: string
  tenant_type: TenantType
  tenant_slug: string
  outlet_id?: string | null
  brand_color?: string
  jti?: string
  exp: number
  impersonation?: boolean
}

export function getRoleFromToken(token: string | null): UserRole | null {
  if (!token) return null
  try {
    const decoded = jwtDecode<JwtPayload>(token)
    return decoded.role as UserRole
  } catch {
    return null
  }
}

export function getClaimsFromToken(token: string | null): JwtPayload | null {
  if (!token) return null
  try {
    return jwtDecode<JwtPayload>(token)
  } catch {
    return null
  }
}

export function isTokenExpired(token: string | null): boolean {
  if (!token) return true
  try {
    const decoded = jwtDecode<JwtPayload>(token)
    return decoded.exp * 1000 < Date.now()
  } catch {
    return true
  }
}
