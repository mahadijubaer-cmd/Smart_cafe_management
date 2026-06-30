'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import toast from 'react-hot-toast'

import apiClient from '@/lib/api'
import OtpInput from '@/components/auth/OtpInput'
import TenantWelcomeBanner from '@/components/auth/TenantWelcomeBanner'
import ProfileTypeSelector from '@/components/auth/ProfileTypeSelector'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTenantInfo } from '@/hooks/useTenantInfo'
import type { UserRole } from '@/types'

const detailsSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  student_id: z.string().optional().or(z.literal('')),
})

type DetailsFormValues = z.infer<typeof detailsSchema>

type Step = 'profile_type' | 'details' | 'otp'

export default function TenantRegisterPage() {
  const router = useRouter()
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug

  const { tenant, loading: tenantLoading } = useTenantInfo(slug)

  const [step, setStep] = useState<Step>('profile_type')
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

  const handleProfileSelect = (role: UserRole) => {
    setSelectedRole(role)
    setStep('details')
  }

  const onSubmit = async (values: DetailsFormValues) => {
    try {
      await apiClient.post('/auth/register', {
        full_name: values.full_name,
        email: values.email,
        password: values.password,
        role: selectedRole,
        student_id: values.student_id || null,
        tenant_slug: slug,
      })

      // BUG FIX: purpose must be 'email_verification'; also include tenant_slug
      await apiClient.post('/otp/send', {
        email: values.email,
        purpose: 'email_verification',
        tenant_slug: slug,
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
      // BUG FIX: field name is 'otp_code' (not 'code'); purpose is 'email_verification'
      await apiClient.post('/otp/verify', {
        email: pendingEmail,
        purpose: 'email_verification',
        otp_code: code,
        tenant_slug: slug,
      })
      toast.success('Email verified! You can now sign in.')
      router.push(`/${slug}/login`)
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
        tenant_slug: slug,
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

            {step === 'profile_type' && (
              <>
                <CardHeader>
                  <CardTitle>Create your account</CardTitle>
                  <CardDescription>Choose how you&apos;ll use this account.</CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  {tenantLoading ? (
                    <p className="text-sm text-slate-500">Loading organisation…</p>
                  ) : (
                    <ProfileTypeSelector
                      tenantType={tenant?.tenant_type ?? 'independent_restaurant'}
                      onSelect={handleProfileSelect}
                    />
                  )}
                  <p className="mt-6 text-center text-sm text-slate-600">
                    Already registered?{' '}
                    <a className="font-semibold text-primary hover:underline" href={`/${slug}/login`}>
                      Sign in
                    </a>
                  </p>
                </CardContent>
              </>
            )}

            {step === 'details' && (
              <>
                <CardHeader>
                  <CardTitle>
                    {selectedRole === 'student' ? 'Student registration' : 'Create your account'}
                  </CardTitle>
                  <CardDescription>Fill in your details to get started.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
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
                      {errors.email && (
                        <p className="text-sm text-red-600">{errors.email.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input id="password" type="password" placeholder="At least 8 characters" {...register('password')} />
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
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setStep('profile_type')}
                      >
                        Back
                      </Button>
                      <Button
                        className="flex-1 bg-[#1A4D2E] text-white hover:bg-[#163f25]"
                        type="submit"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Creating account…' : 'Continue'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </>
            )}

            {step === 'otp' && (
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MailCheck className="h-5 w-5 text-primary" />
                    Verify your email
                  </CardTitle>
                  <CardDescription>
                    Enter the 6-digit code sent to{' '}
                    <span className="font-semibold text-slate-700">{pendingEmail}</span>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <OtpInput
                    onComplete={handleOtpComplete}
                    onResend={handleResend}
                    disabled={otpVerifying}
                  />
                  <p className="mt-6 text-center text-sm text-slate-500">
                    Wrong email?{' '}
                    <button
                      type="button"
                      className="font-semibold text-primary hover:underline"
                      onClick={() => setStep('details')}
                    >
                      Go back
                    </button>
                  </p>
                </CardContent>
              </>
            )}

          </Card>

          {/* Right panel */}
          <section className="order-1 flex flex-col justify-between overflow-hidden rounded-[2rem] border border-primary/10 bg-[#1A4D2E] p-8 text-white shadow-2xl shadow-primary/20 md:p-10 lg:order-2">
            {tenant && !tenantLoading && (
              <TenantWelcomeBanner tenant={tenant} />
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
