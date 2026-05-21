'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'

import apiClient from '@/lib/api'
import { getRoleFromToken } from '@/lib/auth'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormValues = z.infer<typeof loginSchema>

const redirectByRole: Record<string, string> = {
  student: '/menu',
  staff: '/staff/orders',
  cleaner: '/cleaner/tables',
  admin: '/admin/dashboard',
}

export default function LoginPage() {
  const router = useRouter()
  const token = useStore((state) => state.token)
  const setToken = useStore((state) => state.setToken)
  const setUser = useStore((state) => state.setUser)

  const existingRole = useMemo(() => getRoleFromToken(token), [token])

  useEffect(() => {
    if (token && existingRole) {
      router.replace(redirectByRole[existingRole] ?? '/menu')
    }
  }, [existingRole, router, token])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (values: LoginFormValues) => {
    try {
      const response = await apiClient.post('/auth/login', values)
      const accessToken = response.data.access_token as string

      setToken(accessToken)
      setUser(null)

      const role = getRoleFromToken(accessToken)
      router.replace(role ? redirectByRole[role] ?? '/menu' : '/menu')
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status
      if (status === 401) {
        toast.error('Invalid email or password')
      } else {
        toast.error('Unable to sign in. Please try again.')
      }
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#F5F0E8_0%,#FFFFFF_45%,#DDE9DE_100%)] px-4 py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="flex flex-col justify-center rounded-[2rem] border border-primary/10 bg-primary p-8 text-white shadow-2xl shadow-primary/20">
            <p className="mb-4 inline-flex w-fit rounded-full bg-white/10 px-4 py-1 text-sm font-medium text-white/90">
              Smart Cafe Management System
            </p>
            <h1 className="max-w-xl text-4xl font-black tracking-tight md:text-5xl">
              Welcome back to the cafe dashboard.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-white/80">
              Sign in to manage orders, tables, cleaning workflows, and student dining activity from one place.
            </p>
          </section>

          <Card className="self-center">
            <CardHeader>
              <CardTitle>Login</CardTitle>
              <CardDescription>Use your registered email and password to continue.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@example.com" {...register('email')} />
                  {errors.email ? <p className="text-sm text-red-600">{errors.email.message}</p> : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" placeholder="••••••••" {...register('password')} />
                  {errors.password ? <p className="text-sm text-red-600">{errors.password.message}</p> : null}
                </div>

                <Button className="w-full bg-[#1A4D2E] text-white hover:bg-[#163f25]" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Signing in...' : 'Sign in'}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-600">
                Need an account?{' '}
                <a className="font-semibold text-primary hover:underline" href="/register">
                  Register
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}