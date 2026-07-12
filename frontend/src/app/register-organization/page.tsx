'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, Check, Loader2, ShieldCheck, Store } from 'lucide-react'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import { getClaimsFromToken, getRoleFromToken } from '@/lib/auth'
import { useStore } from '@/store/useStore'
import OrgCategorySelector from '@/components/auth/OrgCategorySelector'
import type { Segment } from '@/lib/segments'
import { TENANT_TYPE_META } from '@/lib/tenantTypes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TenantType } from '@/types'

type Step = 'category' | 'organisation' | 'admin'

const STEP_META: { key: Step; label: string; icon: typeof Store }[] = [
  { key: 'category', label: 'Category', icon: Store },
  { key: 'organisation', label: 'Organisation', icon: Building2 },
  { key: 'admin', label: 'Admin', icon: ShieldCheck },
]

const DOMAIN_TYPES: TenantType[] = ['academic', 'corporate']

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function StepBar({ current }: { current: Step }) {
  const currentIndex = STEP_META.findIndex((s) => s.key === current)
  return (
    <div className="mb-6 flex items-center gap-2">
      {STEP_META.map((step, index) => {
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
              <span className={`hidden text-xs font-semibold sm:block ${isActive ? 'text-primary' : 'text-slate-500'}`}>
                {step.label}
              </span>
            </div>
            {index < STEP_META.length - 1 && (
              <span className={`h-0.5 flex-1 rounded-full ${isDone ? 'bg-primary' : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function RegisterOrganizationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const segmentFilter = searchParams.get('segment') as Segment | null
  const setToken = useStore((state) => state.setToken)
  const setTenantContext = useStore((state) => state.setTenantContext)

  const [step, setStep] = useState<Step>('category')
  const [tenantType, setTenantType] = useState<TenantType | null>(null)

  // Organisation
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [city, setCity] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [brandColor, setBrandColor] = useState('#1A4D2E')
  const [allowedDomain, setAllowedDomain] = useState('')

  // Admin
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const effectiveSlug = slugTouched ? slug : slugify(name)
  const showDomainField = tenantType ? DOMAIN_TYPES.includes(tenantType) : false

  const categoryLabel = useMemo(
    () => (tenantType ? TENANT_TYPE_META[tenantType].label : ''),
    [tenantType]
  )

  const handleCategoryContinue = () => {
    if (!tenantType) {
      toast.error('Please choose a category first.')
      return
    }
    setStep('organisation')
  }

  const handleOrgContinue = () => {
    if (name.trim().length < 2) {
      toast.error('Enter your organisation name.')
      return
    }
    if (!/^[a-z0-9-]{2,80}$/.test(effectiveSlug)) {
      toast.error('The URL name must be lowercase letters, numbers, and hyphens only.')
      return
    }
    setSlug(effectiveSlug)
    setSlugTouched(true)
    setStep('admin')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantType) return

    setSubmitting(true)
    try {
      const res = await apiClient.post('/tenants/register', {
        organization: {
          name: name.trim(),
          slug: effectiveSlug,
          tenant_type: tenantType,
          city: city.trim() || null,
          contact_email: contactEmail.trim() || null,
          brand_color: brandColor,
          allowed_email_domain: showDomainField && allowedDomain.trim() ? allowedDomain.trim() : null,
        },
        admin: {
          full_name: adminName.trim(),
          email: adminEmail.trim(),
          password: adminPassword,
        },
      })

      const accessToken = res.data.access_token as string
      setToken(accessToken)
      const claims = getClaimsFromToken(accessToken)
      if (claims) {
        setTenantContext({
          tenant_id: claims.tenant_id,
          tenant_type: claims.tenant_type,
          tenant_slug: claims.tenant_slug ?? effectiveSlug,
          outlet_id: claims.outlet_id,
          brand_color: claims.brand_color,
        })
      }
      const role = getRoleFromToken(accessToken)
      toast.success('Organisation created! Welcome to your dashboard.')
      router.replace(`/${res.data.tenant_slug ?? effectiveSlug}/dashboard`)
      void role
    } catch (error) {
      const axiosError = error as { response?: { status?: number; data?: { detail?: string } } }
      toast.error(axiosError.response?.data?.detail ?? 'Could not create the organisation. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-stretch gap-6 px-4 py-6 lg:grid-cols-[0.95fr_1.05fr] lg:gap-8 lg:py-10">
        {/* Form panel */}
        <Card className="light motion-safe:animate-scale-in order-2 self-center overflow-hidden border-black/5 bg-white shadow-sm lg:order-1">
          <CardContent className="pt-6">
            <StepBar current={step} />

            {/* STEP 1 — Category */}
            {step === 'category' && (
              <div className="flex flex-col gap-5">
                <div className="motion-safe:animate-fade-up">
                  <CardTitle className="text-xl">
                    {segmentFilter === 'cafeteria' && 'Register your cafeteria'}
                    {segmentFilter === 'restaurant' && 'Register your restaurant'}
                    {!segmentFilter && 'Register your organisation'}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {segmentFilter
                      ? 'Choose the category that best describes your organisation.'
                      : 'Choose the category that best describes your business. This decides how your account works on the platform.'}
                  </CardDescription>
                </div>

                <OrgCategorySelector selected={tenantType} onSelect={setTenantType} segmentFilter={segmentFilter} />

                <Button
                  className="w-full bg-primary text-white transition-transform hover:-translate-y-0.5 hover:bg-primary/90"
                  type="button"
                  onClick={handleCategoryContinue}
                  disabled={!tenantType}
                >
                  Continue
                </Button>

                <p className="text-center text-sm text-slate-600">
                  Just want to order food?{' '}
                  <Link
                    className="font-semibold text-primary hover:underline"
                    href={segmentFilter ? `/discover?segment=${segmentFilter}` : '/discover'}
                  >
                    Find your organisation
                  </Link>
                </p>
              </div>
            )}

            {/* STEP 2 — Organisation details */}
            {step === 'organisation' && (
              <div className="motion-safe:animate-fade-up flex flex-col gap-5">
                <div>
                  <CardTitle className="text-xl">Organisation details</CardTitle>
                  <CardDescription className="mt-1">
                    Setting up a <span className="font-semibold text-primary">{categoryLabel}</span>.
                  </CardDescription>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="org-name">Organisation name</Label>
                    <Input
                      id="org-name"
                      placeholder="e.g. Green Fork Bistro"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="org-slug">Web address (URL name)</Label>
                    <div className="flex items-center gap-1 rounded-2xl border border-black/10 bg-slate-50 px-3">
                      <span className="text-sm text-slate-400">/</span>
                      <input
                        id="org-slug"
                        className="flex-1 bg-transparent py-3 text-sm outline-none"
                        placeholder="green-fork"
                        value={effectiveSlug}
                        onChange={(e) => {
                          setSlugTouched(true)
                          setSlug(slugify(e.target.value))
                        }}
                      />
                      <span className="text-xs text-slate-400">/login</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Your customers will visit <span className="font-medium">/{effectiveSlug || 'your-org'}</span> to sign in.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="org-city">City (optional)</Label>
                      <Input id="org-city" placeholder="Dhaka" value={city} onChange={(e) => setCity(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="org-color">Brand colour</Label>
                      <div className="flex items-center gap-2">
                        <input
                          id="org-color"
                          type="color"
                          value={brandColor}
                          onChange={(e) => setBrandColor(e.target.value)}
                          className="h-11 w-14 cursor-pointer rounded-xl border border-black/10 bg-white"
                        />
                        <span className="text-sm text-slate-500">{brandColor}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="org-contact">Contact email (optional)</Label>
                    <Input
                      id="org-contact"
                      type="email"
                      placeholder="hello@yourorg.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                    />
                  </div>

                  {showDomainField && (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="org-domain">Allowed email domain (optional)</Label>
                      <Input
                        id="org-domain"
                        placeholder="@yourcompany.com"
                        value={allowedDomain}
                        onChange={(e) => setAllowedDomain(e.target.value)}
                      />
                      <p className="text-xs text-slate-500">
                        Restrict who can register — only emails on this domain will be accepted.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setStep('category')}>
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-primary text-white transition-transform hover:-translate-y-0.5 hover:bg-primary/90"
                    type="button"
                    onClick={handleOrgContinue}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3 — Admin account */}
            {step === 'admin' && (
              <div className="motion-safe:animate-fade-up flex flex-col gap-5">
                <div>
                  <CardTitle className="text-xl">Create your admin account</CardTitle>
                  <CardDescription className="mt-1">
                    This is the owner account for <span className="font-semibold text-primary">{name}</span>.
                  </CardDescription>
                </div>

                <form method="post" className="flex flex-col gap-4" onSubmit={handleSubmit}>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="admin-name">Your full name</Label>
                    <Input
                      id="admin-name"
                      placeholder="Your name"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="admin-email">Email</Label>
                    <Input
                      id="admin-email"
                      type="email"
                      placeholder="you@yourorg.com"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="admin-password">Password</Label>
                    <Input
                      id="admin-password"
                      type="password"
                      placeholder="Min 8 chars, 1 uppercase, 1 digit, 1 special"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                    />
                    <p className="text-xs text-slate-500">
                      Must include an uppercase letter, a digit, and a special character.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setStep('organisation')}
                    >
                      Back
                    </Button>
                    <Button
                      className="flex-1 gap-2 bg-primary text-white transition-transform hover:-translate-y-0.5 hover:bg-primary/90"
                      type="submit"
                      disabled={submitting}
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Create organisation
                    </Button>
                  </div>
                </form>
              </div>
            )}

            <div className="mt-6 border-t border-slate-100 pt-4 text-center">
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-primary"
              >
                <ArrowLeft className="h-3 w-3" /> Back to home
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Right panel */}
        <section className="order-1 flex flex-col justify-between overflow-hidden rounded-[2rem] border border-primary/10 bg-primary p-8 text-white shadow-2xl shadow-primary/20 md:p-10 lg:order-2">
          <p className="motion-safe:animate-fade-up mb-4 inline-flex w-fit rounded-full bg-white/10 px-4 py-1 text-sm font-medium text-white/90">
            For business owners
          </p>
          <div className="mt-auto">
            <h1 className="motion-safe:animate-fade-up max-w-xl text-4xl font-black tracking-tight md:text-5xl lg:text-6xl">
              Put your cafe on the platform.
            </h1>
            <p
              className="motion-safe:animate-fade-up mt-4 max-w-lg text-base leading-7 text-white/80 md:text-lg"
              style={{ animationDelay: '80ms' }}
            >
              Restaurants, cafeterias, franchises, and food courts — pick your category, set up your
              organisation, and start taking orders in minutes.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
