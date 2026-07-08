'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

interface OtpInputProps {
  onComplete: (code: string) => void
  onResend: () => void
  disabled?: boolean
  resendCooldownSeconds?: number
}

const DIGIT_COUNT = 6

export default function OtpInput({
  onComplete,
  onResend,
  disabled = false,
  resendCooldownSeconds = 60,
}: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(Array(DIGIT_COUNT).fill(''))
  const [cooldown, setCooldown] = useState(resendCooldownSeconds)
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(DIGIT_COUNT).fill(null))
  const completedRef = useRef(false)

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const fireComplete = useCallback(
    (updatedDigits: string[]) => {
      const code = updatedDigits.join('')
      if (code.length === DIGIT_COUNT && !completedRef.current) {
        completedRef.current = true
        onComplete(code)
      }
    },
    [onComplete],
  )

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = digits.slice()
    next[index] = digit
    setDigits(next)
    completedRef.current = false

    if (digit && index < DIGIT_COUNT - 1) {
      inputRefs.current[index + 1]?.focus()
    }

    fireComplete(next)
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = digits.slice()
        next[index] = ''
        setDigits(next)
        completedRef.current = false
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        const next = digits.slice()
        next[index - 1] = ''
        setDigits(next)
        completedRef.current = false
      }
      e.preventDefault()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < DIGIT_COUNT - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, DIGIT_COUNT)
    if (!pasted) return
    const next = Array(DIGIT_COUNT).fill('')
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i]
    }
    setDigits(next)
    completedRef.current = false
    const focusIdx = Math.min(pasted.length, DIGIT_COUNT - 1)
    inputRefs.current[focusIdx]?.focus()
    fireComplete(next)
  }

  const handleResend = () => {
    setDigits(Array(DIGIT_COUNT).fill(''))
    completedRef.current = false
    setCooldown(resendCooldownSeconds)
    onResend()
    inputRefs.current[0]?.focus()
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex items-center gap-2 sm:gap-3">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={disabled}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            aria-label={`OTP digit ${i + 1}`}
            className="h-12 w-10 rounded-xl border border-input bg-background text-center text-xl font-bold text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-50 sm:h-14 sm:w-12"
          />
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm">
        {cooldown > 0 ? (
          <span className="text-muted-foreground">
            Resend in <span className="tabular-nums font-semibold text-foreground">{cooldown}s</span>
          </span>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={handleResend} disabled={disabled} className="h-auto py-1 text-primary hover:text-primary/80">
            Resend code
          </Button>
        )}
      </div>
    </div>
  )
}
