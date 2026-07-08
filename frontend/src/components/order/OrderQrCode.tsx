'use client'

import { useEffect, useState } from 'react'
import { QrCode } from 'lucide-react'
import apiClient from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'

interface OrderQrCodeProps {
  orderId: string
}

export default function OrderQrCode({ orderId }: OrderQrCodeProps) {
  const [base64, setBase64] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const res = await apiClient.get<{ base64: string } | string>(
          `/qr/order/${orderId}/base64`,
        )
        if (!mounted) return
        // Backend may return {base64: "..."} or the raw base64 string
        const raw = typeof res.data === 'string' ? res.data : (res.data as { base64: string }).base64
        setBase64(raw)
      } catch {
        if (mounted) setError(true)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void load()
    return () => { mounted = false }
  }, [orderId])

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-2">
        <Skeleton className="size-36 rounded-2xl" />
        <p className="text-xs text-muted-foreground">Loading QR code…</p>
      </div>
    )
  }

  if (error || !base64) {
    return (
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <QrCode className="size-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">QR code unavailable</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="rounded-2xl border bg-card p-3 shadow-sm">
        <img
          src={`data:image/png;base64,${base64}`}
          alt={`QR code for order ${orderId}`}
          className="size-36 rounded-xl object-contain"
        />
      </div>
      <p className="text-xs text-muted-foreground">Show this at the counter to collect your order.</p>
    </div>
  )
}
