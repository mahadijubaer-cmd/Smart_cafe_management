'use client'

/**
 * Signage terminal shell (RFC-010, Phase 25 — specs/modules/signage.md).
 * pairing → playlist renderer. Tenant identity + brand colour come from the
 * device pairing profile, not the URL.
 */
import { useCallback, useEffect, useState } from 'react'

import PairingScreen from '@/components/device/PairingScreen'
import SignageApp from '@/components/signage/SignageApp'
import {
  DEVICE_UNPAIRED_EVENT,
  getDeviceToken,
  getStoredDeviceProfile,
  refreshDeviceProfile,
  type DeviceProfile,
} from '@/lib/deviceApi'

export default function SignagePage() {
  const [profile, setProfile] = useState<DeviceProfile | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // Boot: use the stored profile immediately, then refresh it in the background.
  useEffect(() => {
    const stored = getStoredDeviceProfile()
    if (getDeviceToken() && stored) {
      setProfile(stored)
      refreshDeviceProfile()
        .then(setProfile)
        .catch(() => undefined) // 401 → interceptor clears pairing → event below
    }
    setHydrated(true)
  }, [])

  // DEVICE_REVOKED / 401 anywhere → back to pairing (DEV-3).
  useEffect(() => {
    const onUnpaired = () => setProfile(null)
    window.addEventListener(DEVICE_UNPAIRED_EVENT, onUnpaired)
    return () => window.removeEventListener(DEVICE_UNPAIRED_EVENT, onUnpaired)
  }, [])

  // Per-tenant brand colour, same CSS var mechanism as the tenant layout.
  useEffect(() => {
    if (profile?.brand_color) {
      document.documentElement.style.setProperty('--color-primary', profile.brand_color)
    }
  }, [profile?.brand_color])

  const handlePaired = useCallback((p: DeviceProfile) => {
    setProfile(p)
  }, [])

  if (!hydrated) return null

  if (!profile) {
    return <PairingScreen onPaired={handlePaired} />
  }

  if (profile.device_type !== 'signage') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-2xl font-bold">This device is paired as a kiosk</h1>
        <p className="text-lg text-muted-foreground">
          Open <span className="font-mono">/kiosk</span> on this device instead.
        </p>
      </div>
    )
  }

  return <SignageApp profile={profile} />
}
