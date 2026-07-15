'use client'

/**
 * Shared pairing screen for kiosk + signage terminals (RFC-010, DEV-2).
 * On-screen numeric keypad — keys are ≥48px touch targets (WCAG 2.5.8 /
 * EN 301 549 §5.5) since venue terminals may have no physical keyboard.
 */
import { useCallback, useEffect, useState } from 'react'
import { Delete, MonitorSmartphone } from 'lucide-react'

import { pairDevice, type DeviceProfile } from '@/lib/deviceApi'
import { t, type DeviceLang } from '@/components/device/strings'

const CODE_LENGTH = 6

export default function PairingScreen({
  lang = 'en',
  onPaired,
}: {
  lang?: DeviceLang
  onPaired: (profile: DeviceProfile) => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(
    async (fullCode: string) => {
      setBusy(true)
      setError(null)
      try {
        const profile = await pairDevice(fullCode)
        onPaired(profile)
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status
        setError(t(lang, status === 429 ? 'pairTooMany' : 'pairInvalid'))
        setCode('')
      } finally {
        setBusy(false)
      }
    },
    [lang, onPaired]
  )

  const press = useCallback(
    (digit: string) => {
      if (busy) return
      setError(null)
      const next = (code + digit).slice(0, CODE_LENGTH)
      setCode(next)
      if (next.length === CODE_LENGTH) void submit(next)
    },
    [busy, code, submit]
  )

  const backspace = useCallback(() => {
    if (!busy) setCode((c) => c.slice(0, -1))
  }, [busy])

  // External keyboard support (EN 301 549 closed-functionality note).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') backspace()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press, backspace])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-6 text-foreground">
      <div className="flex flex-col items-center gap-2 text-center">
        <MonitorSmartphone className="h-12 w-12 text-primary" aria-hidden="true" />
        <h1 className="text-3xl font-bold">{t(lang, 'pairTitle')}</h1>
        <p className="max-w-md text-lg text-muted-foreground">{t(lang, 'pairSubtitle')}</p>
      </div>

      {/* Code display */}
      <div className="flex gap-3" role="status" aria-label={`${code.length} of ${CODE_LENGTH} digits entered`}>
        {Array.from({ length: CODE_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`flex h-16 w-12 items-center justify-center rounded-lg border-2 text-3xl font-bold ${
              i < code.length ? 'border-primary bg-primary/5' : 'border-border'
            }`}
          >
            {code[i] ?? ''}
          </div>
        ))}
      </div>

      <div aria-live="assertive" className="min-h-6 text-lg font-medium text-destructive">
        {busy ? <span className="text-muted-foreground">{t(lang, 'pairing')}</span> : error}
      </div>

      {/* Keypad — 64px keys, 12px gaps */}
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => press(d)}
            disabled={busy}
            className="h-16 w-16 rounded-xl border bg-card text-2xl font-semibold shadow-sm transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:scale-95 disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <div aria-hidden="true" />
        <button
          type="button"
          onClick={() => press('0')}
          disabled={busy}
          className="h-16 w-16 rounded-xl border bg-card text-2xl font-semibold shadow-sm transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:scale-95 disabled:opacity-50"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          disabled={busy}
          aria-label="Delete last digit"
          className="flex h-16 w-16 items-center justify-center rounded-xl border bg-card shadow-sm transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:scale-95 disabled:opacity-50"
        >
          <Delete className="h-7 w-7" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
