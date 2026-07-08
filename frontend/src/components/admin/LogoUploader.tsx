'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'

interface LogoUploaderProps {
  currentLogoUrl: string | null
  tenantSlug: string
  onUploaded: (url: string) => void
}

const MAX_MB = 2
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export default function LogoUploader({ currentLogoUrl, onUploaded }: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(currentLogoUrl)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Only PNG, JPEG, and WebP images are allowed.')
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`File too large. Maximum size is ${MAX_MB} MB.`)
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('logo', file)

      const stored = typeof window !== 'undefined' ? localStorage.getItem('scms-store') : null
      const token = stored ? (JSON.parse(stored) as { state?: { token?: string } }).state?.token : null

      const res = await axios.post<{ logo_url: string }>(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/tenants/me/logo`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      )
      onUploaded(res.data.logo_url)
      toast.success('Logo updated.')
    } catch {
      toast.error('Failed to upload logo. Please try again.')
      setPreview(currentLogoUrl)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-input bg-muted/40 px-6 py-8 transition hover:border-primary hover:bg-primary/5"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Logo preview" className="size-20 rounded-xl object-cover" />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <ImagePlus className="size-8" />
          </div>
        )}
        {uploading ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> Uploading…
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">
            Click to upload · PNG, JPEG or WebP · Max {MAX_MB} MB
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
    </div>
  )
}
