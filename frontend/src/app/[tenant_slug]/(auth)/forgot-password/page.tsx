'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import apiClient from '@/lib/api'
import OtpInput from '@/components/auth/OtpInput'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'

type Step = 'email' | 'otp' | 'newPassword'

const PASSWORD_HINT =
  'At least 8 characters, one uppercase letter, one digit, and one special character.'

function StrengthBar({ password }: { password: string }) {
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[!@#$%^&*()\-_=+[\]{}|;':",./<>?]/.test(password),
  ].filter(Boolean).length

  const colors = ['bg-muted', 'bg-destructive', 'bg-amber-400', 'bg-blue-400', 'bg-emerald-500']
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? colors[score] : 'bg-muted'}`}
          />
        ))}
      </div>
      {password.length > 0 && (
        <p className="text-xs text-muted-foreground">{labels[score]}</p>
      )}
    </div>
  )
}

export default function ForgotPasswordPage() {
  const router = useRouter()
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Step 1 — send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    try {
      await apiClient.post('/auth/forgot-password', { email: email.trim(), tenant_slug: slug })
      // Always advance — BR-AUTH-1 means we never reveal if the email exists
      toast.success('Check your email for a reset code.')
      setStep('otp')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Step 2 — verify OTP (frontend-held code, passed to step 3)
  const handleOtpComplete = (code: string) => {
    setOtpCode(code)
    setStep('newPassword')
  }

  const handleResend = async () => {
    try {
      await apiClient.post('/auth/forgot-password', { email, tenant_slug: slug })
      toast.success('New code sent.')
    } catch {
      toast.error('Failed to resend code.')
    }
  }

  // Step 3 — submit new password
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await apiClient.post('/auth/reset-password', {
        email,
        otp_code: otpCode,
        new_password: newPassword,
        tenant_slug: slug,
      })
      toast.success('Password updated. Please log in.')
      router.push(`/${slug}/login`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Failed to reset password.')
      if (msg?.toLowerCase().includes('otp') || msg?.toLowerCase().includes('expired')) {
        setStep('otp')
        setOtpCode('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const passwordsMismatch = Boolean(confirmPassword && confirmPassword !== newPassword)

  return (
    <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          {/* Step indicators */}
          <div className="mb-8 flex items-center gap-2">
            {(['email', 'otp', 'newPassword'] as Step[]).map((s, i) => (
              <div key={s} className="flex flex-1 items-center gap-2">
                <div
                  className={[
                    'flex size-7 items-center justify-center rounded-full text-xs font-bold transition',
                    s === step
                      ? 'bg-primary text-primary-foreground'
                      : ['email', 'otp', 'newPassword'].indexOf(s) <
                        ['email', 'otp', 'newPassword'].indexOf(step)
                      ? 'bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  {i + 1}
                </div>
                {i < 2 && <div className="h-px flex-1 bg-border" />}
              </div>
            ))}
          </div>

          {step === 'email' && (
            <>
              <CardHeader className="px-0 pt-0">
                <CardTitle>Forgot your password?</CardTitle>
                <CardDescription>Enter your email and we&apos;ll send you a reset code.</CardDescription>
              </CardHeader>
              <form onSubmit={handleSendOtp} className="mt-6">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="email">Email address</FieldLabel>
                    <Input
                      id="email"
                      required
                      type="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </Field>
                  <Button type="submit" disabled={submitting || !email.trim()} className="w-full">
                    {submitting ? 'Sending…' : 'Send reset code'}
                  </Button>
                </FieldGroup>
              </form>
              <p className="mt-5 text-center text-sm text-muted-foreground">
                Remember your password?{' '}
                <a href={`/${slug}/login`} className="font-semibold text-primary hover:underline">
                  Sign in
                </a>
              </p>
            </>
          )}

          {step === 'otp' && (
            <>
              <CardHeader className="px-0 pt-0">
                <CardTitle>Enter the code</CardTitle>
                <CardDescription>
                  We sent a 6-digit code to <span className="font-semibold text-foreground">{email}</span>.
                </CardDescription>
              </CardHeader>
              <div className="mt-6">
                <OtpInput onComplete={handleOtpComplete} onResend={handleResend} />
              </div>
              <p className="mt-5 text-center text-sm text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setStep('email')}
                  className="font-semibold text-primary hover:underline"
                >
                  ← Change email
                </button>
              </p>
            </>
          )}

          {step === 'newPassword' && (
            <>
              <CardHeader className="px-0 pt-0">
                <CardTitle>Set new password</CardTitle>
                <CardDescription>Choose a strong password for your account.</CardDescription>
              </CardHeader>
              <form onSubmit={handleReset} className="mt-6">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="new_password">New password</FieldLabel>
                    <div className="relative">
                      <Input
                        id="new_password"
                        required
                        type={showPw ? 'text' : 'password'}
                        className="pr-10"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowPw((v) => !v)}
                        className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </Button>
                    </div>
                    <StrengthBar password={newPassword} />
                    <FieldDescription className="text-[11px]">{PASSWORD_HINT}</FieldDescription>
                  </Field>

                  <Field data-invalid={passwordsMismatch}>
                    <FieldLabel htmlFor="confirm_password">Confirm password</FieldLabel>
                    <Input
                      id="confirm_password"
                      required
                      type="password"
                      aria-invalid={passwordsMismatch}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                    {passwordsMismatch && (
                      <FieldDescription className="text-destructive">Passwords do not match</FieldDescription>
                    )}
                  </Field>

                  <Button
                    type="submit"
                    disabled={submitting || !newPassword || newPassword !== confirmPassword}
                    className="w-full"
                  >
                    {submitting ? 'Updating…' : 'Update password'}
                  </Button>
                </FieldGroup>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
