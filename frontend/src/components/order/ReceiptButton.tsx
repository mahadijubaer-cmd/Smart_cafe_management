'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import apiClient from '@/lib/api'
import { Button } from '@/components/ui/button'

interface ReceiptButtonProps {
  orderId: string
  className?: string
}

export default function ReceiptButton({ orderId, className }: ReceiptButtonProps) {
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const res = await apiClient.get(`/receipts/${orderId}/pdf`, {
        responseType: 'blob',
      })
      const blob = new Blob([res.data as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `receipt-${orderId.slice(0, 8).toUpperCase()}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Unable to download receipt. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={handleDownload}
      disabled={downloading}
    >
      {downloading ? (
        <Loader2 data-icon="inline-start" className="animate-spin" />
      ) : (
        <Download data-icon="inline-start" />
      )}
      {downloading ? 'Downloading…' : 'Download Receipt'}
    </Button>
  )
}
