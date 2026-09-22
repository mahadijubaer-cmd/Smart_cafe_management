'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import { getClaimsFromToken, getRoleFromToken, isTokenExpired } from '@/lib/auth'
import { useStore } from '@/store/useStore'
import OtpInput from '@/components/auth/OtpInput'
import SplitAuthPanel from '@/components/layout/SplitAuthPanel'
import { Button } from '@/components/ui/button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { UserRole } from '@/types'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormValues = z.infer<typeof loginSchema>

type Step = 'credentials' | 'otp'

const CUSTOMER_ROLES: UserRole[] = ['customer', 'student']
const STAFF_ROLES: UserRole[] = ['staff', 'server']
const CLEANER_ROLES: UserRole[] = ['cleaner']
const ADMIN_ROLES: UserRole[] = ['tenant_admin', 'outlet_admin', 'super_admin', 'food_court_admin', 'platform_admin', 'admin']

function getRedirectPath(role: UserRole | null, slug: string): string {
  if (!role) return `/${slug}/menu`
  if (CUSTOMER_ROLES.includes(role)) return `/${slug}/menu`
  if (STAFF_ROLES.includes(role)) return `/${slug}/orders`
  if (CLEANER_ROLES.includes(role)) return `/${slug}/cleaning-queue`
  if (ADMIN_ROLES.includes(role)) return `/${slug}/dashboard`
  return `/${slug}/menu`
}

function isAdminRole(role: UserRole | null): boolean {
  if (!role) return false
  return ADMIN_ROLES.includes(role)
}

export default function TenantLoginPage() {
  const router = useRouter()
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug

  const token = useStore((state) => state.token)
  const setToken = useStore((state) => state.setToken)
  const setTenantContext = useStore((state) => state.setTenantContext)
  const clearAuth = useStore((state) => state.clearAuth)

  const [step, setStep] = useState<Step>('credentials')
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [pendingEmail, setPendingEmail] = useState('')
  const [otpVerifying, setOtpVerifying] = useState(false)

  const existingClaims = useMemo(() => getClaimsFromToken(token), [token])

  useEffect(() => {
    if (!token || !existingClaims) return
    // An expired token must never auto-redirect — /auth/me would 401 on the target page and
    // bounce back here, creating an infinite /login ↔ /menu loop. Drop it instead.
    if (isTokenExpired(token)) {
      clearAuth()
      return
    }
    // A valid session for a DIFFERENT tenant shouldn't be sent into this tenant's app either —
    // stay on the login form so the user can sign in to this organisation.
    if (existingClaims.tenant_slug !== slug) return
    router.replace(getRedirectPath(existingClaims.role as UserRole, slug))
  }, [clearAuth, existingClaims, router, slug, token])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  const hydrateAndRedirect = (accessToken: string) => {
    setToken(accessToken)
    const claims = getClaimsFromToken(accessToken)
    if (claims) {
      setTenantContext({
        tenant_id: claims.tenant_id,
        tenant_type: claims.tenant_type,
        tenant_slug: claims.tenant_slug ?? slug,
        outlet_id: claims.outlet_id,
        brand_color: claims.brand_color,
      })
    }
    const role = getRoleFromToken(accessToken)
    router.replace(getRedirectPath(role, slug))
  }

  const onSubmit = async (values: LoginFormValues) => {
    try {
      const response = await apiClient.post('/auth/login', { ...values, tenant_slug: slug })
      const accessToken = response.data.access_token as string
      const role = getRoleFromToken(accessToken)

      if (isAdminRole(role)) {
        // Trigger OTP 2FA for admin roles
        await apiClient.post('/otp/send', { email: values.email, purpose: 'login', tenant_slug: slug })
        setPendingToken(accessToken)
        setPendingEmail(values.email)
        setStep('otp')
        toast.success('A verification code has been sent to your email.')
      } else {
        hydrateAndRedirect(accessToken)
      }
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status
      if (status === 401) {
        toast.error('Invalid email or password')
      } else {
        toast.error('Unable to sign in. Please try again.')
      }
    }
  }

  const handleOtpComplete = async (code: string) => {
    if (!pendingToken) return
    setOtpVerifying(true)
    try {
      await apiClient.post('/otp/verify', {
        email: pendingEmail,
        purpose: 'login',
        otp_code: code,
        tenant_slug: slug,
      })
      hydrateAndRedirect(pendingToken)
    } catch {
      toast.error('Invalid or expired code. Please try again.')
      setOtpVerifying(false)
    }
  }

  const handleResend = async () => {
    try {
      await apiClient.post('/otp/send', { email: pendingEmail, purpose: 'login', tenant_slug: slug })
      toast.success('New code sent.')
    } catch {
      toast.error('Failed to resend code.')
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-3rem)] items-center px-4 py-2 lg:py-6">
      <SplitAuthPanel
        className="motion-safe:animate-scale-in"
        heroSide="left"
        hero={
          <>
            <p className="motion-safe:animate-fade-up mb-4 inline-flex w-fit rounded-full bg-white/10 px-4 py-1 text-sm font-medium text-white/90">
              Smart Cafe Management System
            </p>
            <div className="mt-auto">
              <h1 className="motion-safe:animate-fade-up max-w-xl text-4xl font-black tracking-tight md:text-5xl lg:text-6xl">
                Welcome back to the cafe dashboard.
              </h1>
              <p
                className="motion-safe:animate-fade-up mt-4 max-w-lg text-base leading-7 text-white/80 md:text-lg"
                style={{ animationDelay: '80ms' }}
              >
                Sign in to manage orders, tables, cleaning workflows, and dining activity from one place.
              </p>
            </div>
          </>
        }
      >
            {step === 'credentials' ? (
              <div key="credentials" className="motion-safe:animate-fade-up">
                <CardHeader>
                  <CardTitle>Login</CardTitle>
                  <CardDescription>Use your registered email and password to continue.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <form method="post" onSubmit={handleSubmit(onSubmit)}>
                    <FieldGroup>
                      <Field data-invalid={!!errors.email}>
                        <FieldLabel htmlFor="email">Email</FieldLabel>
                        <Input
                          id="email"
                          type="email"
                          autoComplete="username"
                          placeholder="you@example.com"
                          aria-invalid={!!errors.email}
                          {...register('email')}
                        />
                        {errors.email ? <FieldDescription className="text-destructive">{errors.email.message}</FieldDescription> : null}
                      </Field>

                      <Field data-invalid={!!errors.password}>
                        <div className="flex items-center justify-between">
                          <FieldLabel htmlFor="password">Password</FieldLabel>
                          <a
                            href={`/${slug}/forgot-password`}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Forgot password?
                          </a>
                        </div>
                        <Input
                          id="password"
                          type="password"
                          autoComplete="current-password"
                          placeholder="••••••••"
                          aria-invalid={!!errors.password}
                          {...register('password')}
                        />
                        {errors.password ? <FieldDescription className="text-destructive">{errors.password.message}</FieldDescription> : null}
                      </Field>

                      <Button className="w-full transition-transform hover:-translate-y-0.5" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Signing in…' : 'Sign in'}
                      </Button>
                    </FieldGroup>
                  </form>

                  <p className="mt-6 text-center text-sm text-muted-foreground">
                    Need an account?{' '}
                    <a className="font-semibold text-primary hover:underline" href={`/${slug}/register`}>
                      Sign up
                    </a>
                  </p>
                </CardContent>
              </div>
            ) : (
              <div key="otp" className="motion-safe:animate-fade-up">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    Two-factor verification
                  </CardTitle>
                  <CardDescription>
                    Enter the 6-digit code sent to <span className="font-semibold text-foreground">{pendingEmail}</span>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <OtpInput
                    onComplete={handleOtpComplete}
                    onResend={handleResend}
                    disabled={otpVerifying}
                  />
                  <p className="mt-6 text-center text-sm text-muted-foreground">
                    Not you?{' '}
                    <button
                      type="button"
                      className="font-semibold text-primary hover:underline"
                      onClick={() => { setStep('credentials'); setPendingToken(null) }}
                    >
                      Back to login
                    </button>
                  </p>
                </CardContent>
              </div>
            )}
      </SplitAuthPanel>
    </main>
  )
}
