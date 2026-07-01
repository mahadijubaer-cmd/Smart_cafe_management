'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, Check, MailCheck, UserRound } from 'lucide-react'
import toast from 'react-hot-toast'

import apiClient from '@/lib/api'
import OtpInput from '@/components/auth/OtpInput'
import TenantWelcomeBanner from '@/components/auth/TenantWelcomeBanner'
import TenantSelector from '@/components/auth/TenantSelector'
import ProfileTypeSelector from '@/components/auth/ProfileTypeSelector'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTenantInfo } from '@/hooks/useTenantInfo'
import type { TenantPublicResponse, UserRole } from '@/types'

const detailsSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  student_id: z.string().optional().or(z.literal('')),
})

type DetailsFormValues = z.infer<typeof detailsSchema>

type Step = 'organisation' | 'profile_type' | 'details' | 'otp'

const STEP_META: { key: Step; label: string; icon: typeof Building2 }[] = [
  { key: 'organisation', label: 'Organisation', icon: Building2 },
  { key: 'profile_type', label: 'Profile', icon: UserRound },
  { key: 'details', label: 'Details', icon: Check },
  { key: 'otp', label: 'Verify', icon: MailCheck },
]

function StepBar({ current, invite }: { current: Step; invite: boolean }) {
  // On the invite flow there is no organisation/profile choice.
  const steps = invite
    ? STEP_META.filter((s) => s.key === 'details' || s.key === 'otp')
    : STEP_META
  const currentIndex = steps.findIndex((s) => s.key === current)

  return (
    <div className="mb-6 flex items-center gap-2">
      {steps.map((step, index) => {
        const isDone = index < currentIndex
        const isActive = index === currentIndex
        const Icon = step.icon
        return (
          <div key={step.key} className="flex flex-1 items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                  isDone || isActive ? 'bg-primary text-white' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span
                className={`hidden text-xs font-semibold sm:block ${
                  isActive ? 'text-primary' : 'text-slate-500'
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span className={`h-0.5 flex-1 rounded-full ${isDone ? 'bg-primary' : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function TenantRegisterPage() {
  const router = useRouter()
  const params = useParams<{ tenant_slug: string }>()
  const urlSlug = params.tenant_slug
  const searchParams = useSearchParams()

  const inviteToken = searchParams.get('invite_token') ?? null

  // The organisation the user is registering under. Starts from the URL slug
  // but the user may change it in the "organisation" step.
  const [selectedSlug, setSelectedSlug] = useState<string>(urlSlug)
  const { tenant, loading: tenantLoading } = useTenantInfo(selectedSlug)

  const [step, setStep] = useState<Step>(inviteToken ? 'details' : 'organisation')
  const [selectedRole, setSelectedRole] = useState<UserRole>('customer')
  const [pendingEmail, setPendingEmail] = useState('')
  const [otpVerifying, setOtpVerifying] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DetailsFormValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { student_id: '' },
  })

  const handleTenantSelect = (t: TenantPublicResponse) => {
    setSelectedSlug(t.slug)
  }

  const handleTenantContinue = () => {
    if (!selectedSlug) {
      toast.error('Please choose your organisation first.')
      return
    }
    setStep('profile_type')
  }

  const handleProfileSelect = (role: UserRole) => {
    setSelectedRole(role)
    setStep('details')
  }

  const onSubmit = async (values: DetailsFormValues) => {
    try {
      if (inviteToken) {
        const res = await apiClient.post('/users/accept-invite', {
          token: inviteToken,
          full_name: values.full_name,
          password: values.password,
        })
        const { useStore: getStore } = await import('@/store/useStore')
        getStore.getState().setToken(res.data.access_token)
        toast.success('Account created! Welcome aboard.')
        router.push(`/${selectedSlug}/dashboard`)
        return
      }

      await apiClient.post('/auth/register', {
        full_name: values.full_name,
        email: values.email,
        password: values.password,
        role: selectedRole,
        student_id: values.student_id || null,
        tenant_slug: selectedSlug,
      })

      await apiClient.post('/otp/send', {
        email: values.email,
        purpose: 'email_verification',
        tenant_slug: selectedSlug,
      })

      setPendingEmail(values.email)
      setStep('otp')
      toast.success('Check your email for the verification code.')
    } catch (error) {
      const axiosError = error as { response?: { status?: number; data?: { detail?: string } } }
      const detail = axiosError.response?.data?.detail
      if (detail === 'This role requires an admin invitation.') {
        toast.error('This role cannot be self-registered.')
      } else if (axiosError.response?.status === 400) {
        toast.error(detail ?? 'Email is already registered.')
      } else {
        toast.error('Unable to create account. Please try again.')
      }
    }
  }

  const handleOtpComplete = async (code: string) => {
    setOtpVerifying(true)
    try {
      await apiClient.post('/otp/verify', {
        email: pendingEmail,
        purpose: 'email_verification',
        otp_code: code,
        tenant_slug: selectedSlug,
      })
      toast.success('Email verified! You can now sign in.')
      router.push(`/${selectedSlug}/login`)
    } catch {
      toast.error('Invalid or expired code. Please try again.')
      setOtpVerifying(false)
    }
  }

  const handleResend = async () => {
    try {
      await apiClient.post('/otp/send', {
        email: pendingEmail,
        purpose: 'email_verification',
        tenant_slug: selectedSlug,
      })
      toast.success('New code sent.')
    } catch {
      toast.error('Failed to resend code.')
    }
  }

  return (
    <main className="min-h-[calc(100vh-3rem)]">
      <div className="flex min-h-[calc(100vh-3rem)] items-stretch py-2 lg:py-0">
        <div className="grid w-full gap-6 xl:grid-cols-[0.95fr_1.05fr] xl:gap-8">
          {/* Form panel */}
          <Card className="order-2 overflow-hidden border-white/60 bg-white/92 backdrop-blur-sm lg:order-1">
            <CardContent className="pt-6">
              <StepBar current={step} invite={Boolean(inviteToken)} />

              {/* STEP 1 — Choose organisation */}
              {step === 'organisation' && (
                <div className="space-y-5">
                  <div>
                    <CardTitle className="text-xl">Choose your organisation</CardTitle>
                    <CardDescription className="mt-1">
                      Select the cafeteria, restaurant, or food court you belong to.
                    </CardDescription>
                  </div>

                  <TenantSelector selectedSlug={selectedSlug} onSelect={handleTenantSelect} />

                  <Button
                    className="w-full bg-primary text-white hover:bg-primary/90"
                    type="button"
                    onClick={handleTenantContinue}
                    disabled={!selectedSlug || tenantLoading}
                  >
                    Continue
                  </Button>

                  <p className="text-center text-sm text-slate-600">
                    Already registered?{' '}
                    <a className="font-semibold text-primary hover:underline" href={`/${selectedSlug}/login`}>
                      Sign in
                    </a>
                  </p>

                  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-center text-xs text-slate-600">
                    Run a cafe, restaurant, or food court?{' '}
                    <a className="font-semibold text-primary hover:underline" href="/register-organization">
                      Register your organisation
                    </a>
                  </p>
                </div>
              )}

              {/* STEP 2 — Profile type */}
              {step === 'profile_type' && (
                <div className="space-y-5">
                  <div>
                    <CardTitle className="text-xl">Create your account</CardTitle>
                    <CardDescription className="mt-1">
                      Registering with{' '}
                      <span className="font-semibold text-primary">{tenant?.name ?? selectedSlug}</span>. Choose
                      how you&apos;ll use this account.
                    </CardDescription>
                  </div>

                  {tenantLoading ? (
                    <p className="text-sm text-slate-500">Loading organisation…</p>
                  ) : (
                    <ProfileTypeSelector
                      tenantType={tenant?.tenant_type ?? 'independent_restaurant'}
                      onSelect={handleProfileSelect}
                    />
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setStep('organisation')}
                  >
                    Back to organisations
                  </Button>
                </div>
              )}

              {/* STEP 3 — Details */}
              {step === 'details' && (
                <div className="space-y-5">
                  <div>
                    <CardTitle className="text-xl">
                      {inviteToken
                        ? 'Accept your invitation'
                        : selectedRole === 'student'
                          ? 'Student registration'
                          : 'Your details'}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {inviteToken
                        ? `You've been invited to join ${tenant?.name ?? 'this organisation'}.`
                        : `Fill in your details to join ${tenant?.name ?? selectedSlug}.`}
                    </CardDescription>
                  </div>

                  <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Full name</Label>
                      <Input id="full_name" placeholder="Your full name" {...register('full_name')} />
                      {errors.full_name && (
                        <p className="text-sm text-red-600">{errors.full_name.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" placeholder="you@example.com" {...register('email')} />
                      {tenant?.allowed_email_domain && (
                        <p className="text-xs text-slate-500">
                          Must be a {tenant.allowed_email_domain} address
                        </p>
                      )}
                      {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="At least 8 characters"
                        {...register('password')}
                      />
                      {errors.password && (
                        <p className="text-sm text-red-600">{errors.password.message}</p>
                      )}
                    </div>

                    {selectedRole === 'student' && (
                      <div className="space-y-2">
                        <Label htmlFor="student_id">Student ID</Label>
                        <Input id="student_id" placeholder="e.g. 22301162" {...register('student_id')} />
                      </div>
                    )}

                    <div className="flex gap-3">
                      {!inviteToken && (
                        <Button
                          type="button"
                          variant="outline"
                          className="flex-1"
                          onClick={() => setStep('profile_type')}
                        >
                          Back
                        </Button>
                      )}
                      <Button
                        className="flex-1 bg-primary text-white hover:bg-primary/90"
                        type="submit"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Creating account…' : 'Continue'}
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {/* STEP 4 — OTP */}
              {step === 'otp' && (
                <div className="space-y-5">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <MailCheck className="h-5 w-5 text-primary" />
                      Verify your email
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Enter the 6-digit code sent to{' '}
                      <span className="font-semibold text-slate-700">{pendingEmail}</span>.
                    </CardDescription>
                  </div>

                  <OtpInput onComplete={handleOtpComplete} onResend={handleResend} disabled={otpVerifying} />

                  <p className="text-center text-sm text-slate-500">
                    Wrong email?{' '}
                    <button
                      type="button"
                      className="font-semibold text-primary hover:underline"
                      onClick={() => setStep('details')}
                    >
                      Go back
                    </button>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right panel */}
          <section className="order-1 flex flex-col justify-between overflow-hidden rounded-[2rem] border border-primary/10 bg-primary p-8 text-white shadow-2xl shadow-primary/20 md:p-10 lg:order-2">
            {tenant && !tenantLoading ? (
              <TenantWelcomeBanner tenant={tenant} />
            ) : (
              <div className="h-[72px]" />
            )}
            <div className="mt-auto">
              <h1 className="max-w-xl text-4xl font-black tracking-tight md:text-5xl lg:text-6xl">
                Your cafe account starts here.
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-white/80 md:text-lg">
                Order food, track your wallet and rewards, or manage your cafe — all from one account.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
