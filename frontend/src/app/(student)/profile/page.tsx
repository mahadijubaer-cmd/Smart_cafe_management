'use client'

import { useRouter } from 'next/navigation'

import ProtectedRoute from '@/components/ProtectedRoute'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store/useStore'

function getInitials(fullName: string | null) {
  if (!fullName) {
    return 'U'
  }

  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

export default function StudentProfilePage() {
  const router = useRouter()
  const user = useStore((state) => state.user)
  const walletBalance = useStore((state) => state.walletBalance)
  const rewardPoints = useStore((state) => state.rewardPoints)
  const clearAuth = useStore((state) => state.clearAuth)
  const initials = getInitials(user?.full_name ?? null)

  const handleLogout = () => {
    clearAuth()
    router.push('/login')
  }

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <main className="min-h-screen bg-[linear-gradient(180deg,#F5F0E8_0%,#ffffff_32%,#eef5ee_100%)] px-4 py-8 md:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#1A4D2E]">
              Profile
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Your account</h1>
          </div>

          <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1A4D2E] text-2xl font-bold text-white">
                {initials}
              </div>

              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-slate-900">{user?.full_name ?? 'Student User'}</h2>
                <p className="text-sm text-gray-500">{user?.email ?? 'student@bracu.ac.bd'}</p>
                <p className="text-sm font-medium text-[#1A4D2E] capitalize">{user?.role ?? 'student'}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-sm text-emerald-700">Wallet balance</p>
                <p className="mt-1 text-2xl font-black text-emerald-900">৳ {Number(walletBalance).toFixed(2)}</p>
              </div>

              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-sm text-amber-700">Reward points</p>
                <p className="mt-1 text-2xl font-black text-amber-900">{Number(rewardPoints).toLocaleString('en-BD')}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button className="bg-[#1A4D2E] text-white hover:bg-[#163f25]" type="button" onClick={() => router.push('/wallet')}>
                Open Wallet
              </Button>
              <Button variant="outline" type="button" onClick={() => router.push('/menu')}>
                Back to Menu
              </Button>
              <Button variant="outline" type="button" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </section>
        </div>
      </main>
    </ProtectedRoute>
  )
}