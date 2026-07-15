import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'SCMS Kiosk',
}

// Venue terminal: fixed viewport, no pinch zoom drift between customers —
// the built-in accessibility toggle (large text / high contrast) is the
// supported enlargement path (EN 301 549 §8.3 closed functionality).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function KioskLayout({ children }: { children: ReactNode }) {
  // Top-level route: tenant identity comes from the device pairing profile,
  // not the URL (RFC-010 §2.5). No app chrome, no nav — full-bleed surface.
  return <div className="min-h-screen select-none bg-background">{children}</div>
}
