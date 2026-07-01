'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import apiClient from '@/lib/api'
import OtpInput from '@/components/auth/OtpInput'

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

  const colors = ['bg-slate-200', 'bg-red-400', 'bg-amber-400', 'bg-blue-400', 'bg-green-500']
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? colors[score] : 'bg-slate-200'}`}
          />
        ))}
      </div>
      {password.length > 0 && (
        <p className="text-xs text-slate-500">{labels[score]}</p>
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

  return (
    <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        {/* Step indicators */}
        <div className="mb-8 flex items-center gap-2">
          {(['email', 'otp', 'newPassword'] as Step[]).map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition',
                  s === step
                    ? 'bg-primary text-white'
                    : ['email', 'otp', 'newPassword'].indexOf(s) <
                      ['email', 'otp', 'newPassword'].indexOf(step)
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-100 text-slate-400',
                ].join(' ')}
              >
                {i + 1}
              </div>
              {i < 2 && <div className="h-px flex-1 bg-slate-200" />}
            </div>
          ))}
        </div>

        {step === 'email' && (
          <>
            <h1 className="text-xl font-black text-slate-900">Forgot your password?</h1>
            <p className="mt-1 text-sm text-slate-500">
              Enter your email and we'll send you a reset code.
            </p>
            <form onSubmit={handleSendOtp} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Email address
                </label>
                <input
                  required
                  type="email"
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Send reset code'}
              </button>
            </form>
            <p className="mt-5 text-center text-sm text-slate-500">
              Remember your password?{' '}
              <a href={`/${slug}/login`} className="font-semibold text-primary hover:underline">
                Sign in
              </a>
            </p>
          </>
        )}

        {step === 'otp' && (
          <>
            <h1 className="text-xl font-black text-slate-900">Enter the code</h1>
            <p className="mt-1 text-sm text-slate-500">
              We sent a 6-digit code to <span className="font-semibold text-slate-700">{email}</span>.
            </p>
            <div className="mt-6">
              <OtpInput
                onComplete={handleOtpComplete}
                onResend={handleResend}
              />
            </div>
            <p className="mt-5 text-center text-sm text-slate-500">
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
            <h1 className="text-xl font-black text-slate-900">Set new password</h1>
            <p className="mt-1 text-sm text-slate-500">
              Choose a strong password for your account.
            </p>
            <form onSubmit={handleReset} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  New password
                </label>
                <div className="relative">
                  <input
                    required
                    type={showPw ? 'text' : 'password'}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <StrengthBar password={newPassword} />
                <p className="mt-1 text-[11px] text-slate-400">{PASSWORD_HINT}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Confirm password
                </label>
                <input
                  required
                  type="password"
                  className={[
                    'w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40',
                    confirmPassword && confirmPassword !== newPassword
                      ? 'border-red-300 bg-red-50'
                      : 'border-slate-200',
                  ].join(' ')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || !newPassword || newPassword !== confirmPassword}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
