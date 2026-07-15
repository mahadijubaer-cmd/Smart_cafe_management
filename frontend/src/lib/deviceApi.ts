/**
 * Device terminal API client (RFC-010, Phase 25 — specs/modules/devices.md).
 *
 * Unlike lib/api.ts (user JWT from the Zustand store), this client authenticates
 * with the opaque device token issued at pairing (ADR-013), stored in
 * localStorage under `scms_device_token`. A 401 means the device was revoked or
 * re-paired elsewhere (DEV-3/DEV-4): the shell wipes the token and returns to
 * the pairing screen via the `scms:device-unpaired` window event.
 */
import axios from 'axios'

export const DEVICE_TOKEN_KEY = 'scms_device_token'
export const DEVICE_PROFILE_KEY = 'scms_device_profile'
export const DEVICE_UNPAIRED_EVENT = 'scms:device-unpaired'

export interface DeviceProfile {
  device_id: string
  device_type: 'kiosk' | 'signage'
  tenant_id: string
  tenant_slug: string
  tenant_name: string
  brand_color: string
  outlet_id: string | null
  settings: Record<string, unknown>
  kiosk_config: Record<string, unknown> | null
}

export function getDeviceToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(DEVICE_TOKEN_KEY)
}

export function getStoredDeviceProfile(): DeviceProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(DEVICE_PROFILE_KEY)
    return raw ? (JSON.parse(raw) as DeviceProfile) : null
  } catch {
    return null
  }
}

export function storeDevicePairing(token: string, profile: DeviceProfile) {
  localStorage.setItem(DEVICE_TOKEN_KEY, token)
  localStorage.setItem(DEVICE_PROFILE_KEY, JSON.stringify(profile))
}

export function clearDevicePairing() {
  localStorage.removeItem(DEVICE_TOKEN_KEY)
  localStorage.removeItem(DEVICE_PROFILE_KEY)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DEVICE_UNPAIRED_EVENT))
  }
}

const deviceApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

deviceApi.interceptors.request.use((config) => {
  const token = getDeviceToken()
  if (token) config.headers['X-Device-Token'] = token
  return config
})

deviceApi.interceptors.response.use(
  (res) => res,
  (error: { response?: { status?: number }; config?: { url?: string } }) => {
    // Pairing itself 401/404s legitimately; only treat authed-call 401s as revocation.
    const isPairCall = error.config?.url?.includes('/device/pair')
    if (error.response?.status === 401 && !isPairCall && getDeviceToken()) {
      clearDevicePairing()
    }
    return Promise.reject(error)
  }
)

/** Redeem a pairing code; stores the token + profile on success. */
export async function pairDevice(code: string): Promise<DeviceProfile> {
  const res = await deviceApi.post('/device/pair', { code })
  const { device_token, ...profile } = res.data as DeviceProfile & { device_token: string }
  storeDevicePairing(device_token, profile as DeviceProfile)
  return profile as DeviceProfile
}

/** Heartbeat + config refresh (kiosks call this on KIOSK_CONFIG_UPDATED). */
export async function refreshDeviceProfile(): Promise<DeviceProfile> {
  const res = await deviceApi.get('/device/me')
  const profile = res.data as DeviceProfile
  localStorage.setItem(DEVICE_PROFILE_KEY, JSON.stringify(profile))
  return profile
}

export default deviceApi
