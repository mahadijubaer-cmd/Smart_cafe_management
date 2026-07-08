'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const registerSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['student', 'staff', 'cleaner']),
  student_id: z.string().optional().or(z.literal('')),
})

type RegisterFormValues = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: 'student',
      student_id: '',
    },
  })

  const onSubmit = async (values: RegisterFormValues) => {
    try {
      await apiClient.post('/auth/register', {
        ...values,
        student_id: values.student_id || null,
      })

      toast.success('Account created. Please log in.')
      router.push('/login')
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status
      if (status === 400) {
        toast.error('Email is already registered')
      } else {
        toast.error('Unable to create account. Please try again.')
      }
    }
  }

  return (
    <main className="min-h-[calc(100vh-3rem)]">
      <div className="flex min-h-[calc(100vh-3rem)] items-stretch py-2 lg:py-0">
        <div className="grid w-full gap-6 xl:grid-cols-[0.95fr_1.05fr] xl:gap-8">
          <Card className="order-2 overflow-hidden border-white/60 bg-white/92 backdrop-blur-sm lg:order-1">
            <CardHeader>
              <CardTitle>Create your account</CardTitle>
              <CardDescription>Register as a student, staff member, or cleaner.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full name</Label>
                  <Input id="full_name" placeholder="Your full name" {...register('full_name')} />
                  {errors.full_name ? <p className="text-sm text-red-600">{errors.full_name.message}</p> : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@example.com" {...register('email')} />
                  {errors.email ? <p className="text-sm text-red-600">{errors.email.message}</p> : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" placeholder="At least 8 characters" {...register('password')} />
                  {errors.password ? <p className="text-sm text-red-600">{errors.password.message}</p> : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <select
                    id="role"
                    className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    {...register('role')}
                  >
                    <option value="student">Student</option>
                    <option value="staff">Staff</option>
                    <option value="cleaner">Cleaner</option>
                  </select>
                  {errors.role ? <p className="text-sm text-red-600">{errors.role.message}</p> : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="student_id">Student ID</Label>
                  <Input id="student_id" placeholder="Optional" {...register('student_id')} />
                  {errors.student_id ? <p className="text-sm text-red-600">{errors.student_id.message}</p> : null}
                </div>

                <Button className="w-full bg-[#1A4D2E] text-white hover:bg-[#163f25]" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating account...' : 'Create account'}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-600">
                Already registered?{' '}
                <a className="font-semibold text-primary hover:underline" href="/login">
                  Sign in
                </a>
              </p>
            </CardContent>
          </Card>

          <section className="order-1 flex flex-col justify-between overflow-hidden rounded-[2rem] border border-primary/10 bg-[#1A4D2E] p-8 text-white shadow-2xl shadow-primary/20 md:p-10 lg:order-2">
            <p className="mb-4 inline-flex w-fit rounded-full bg-white/10 px-4 py-1 text-sm font-medium text-white/90">
              Join the platform
            </p>
            <h1 className="max-w-xl text-4xl font-black tracking-tight md:text-5xl lg:text-6xl">
              Set up a cafe profile in a few steps.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-white/80 md:text-lg">
              Register once and start managing your menu, orders, or cleaning tasks from a single account.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}