import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'SCMS Signage',
}

// Unattended display terminal: fixed viewport, no pinch zoom, no text
// selection — this surface is never touched by a person.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function SignageLayout({ children }: { children: ReactNode }) {
  // Top-level route: tenant identity comes from the device pairing profile,
  // not the URL (RFC-010 §2.5). No app chrome, no nav — full-bleed surface.
  return <div className="min-h-screen select-none bg-background">{children}</div>
}
