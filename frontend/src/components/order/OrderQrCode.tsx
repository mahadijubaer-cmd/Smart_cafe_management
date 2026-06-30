'use client'

import { useEffect, useState } from 'react'
import { QrCode } from 'lucide-react'
import apiClient from '@/lib/api'

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
        <div className="h-36 w-36 animate-pulse rounded-2xl bg-slate-100" />
        <p className="text-xs text-slate-400">Loading QR code…</p>
      </div>
    )
  }

  if (error || !base64) {
    return (
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <QrCode className="h-8 w-8 text-slate-300" />
        <p className="text-xs text-slate-400">QR code unavailable</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
        <img
          src={`data:image/png;base64,${base64}`}
          alt={`QR code for order ${orderId}`}
          className="h-36 w-36 rounded-xl object-contain"
        />
      </div>
      <p className="text-xs text-slate-500">Show this at the counter to collect your order.</p>
    </div>
  )
}
