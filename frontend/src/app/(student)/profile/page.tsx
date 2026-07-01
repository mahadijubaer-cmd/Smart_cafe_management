'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Eye, EyeOff, ShieldCheck, Wallet, X } from 'lucide-react'
import toast from 'react-hot-toast'

import ProtectedRoute from '@/components/ProtectedRoute'
import apiClient from '@/lib/api'
import { useStore } from '@/store/useStore'
import type { User } from '@/types'

// Re-exported by: src/app/[tenant_slug]/(customer)/profile/page.tsx

function getInitials(name: string | null) {
  if (!name) return 'U'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

// ─── Change Password Modal ────────────────────────────────────────────────────

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPw !== confirmPw) {
      toast.error('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      await apiClient.post('/auth/change-password', {
        current_password: currentPw,
        new_password: newPw,
      })
      toast.success('Password changed.')
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Failed to change password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Change Password</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Current password</label>
            <input
              required
              type="password"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">New password</label>
            <div className="relative">
              <input
                required
                type={showNew ? 'text' : 'password'}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Min 8 chars, 1 uppercase, 1 digit, 1 special character
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Confirm new password</label>
            <input
              required
              type="password"
              className={[
                'w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40',
                confirmPw && confirmPw !== newPw ? 'border-red-300' : 'border-slate-200',
              ].join(' ')}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting || !currentPw || !newPw || newPw !== confirmPw}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Change Password'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentProfilePage() {
  const router = useRouter()
  const params = useParams<{ tenant_slug: string }>()
  const slug = params?.tenant_slug ?? 'bracu'

  const storeUser = useStore((state) => state.user)
  const setUser = useStore((state) => state.setUser)
  const walletBalance = useStore((state) => state.walletBalance)
  const rewardPoints = useStore((state) => state.rewardPoints)
  const clearAuth = useStore((state) => state.clearAuth)

  const [fullName, setFullName] = useState(storeUser?.full_name ?? '')
  const [phone, setPhone] = useState(storeUser?.phone ?? '')
  const [studentId, setStudentId] = useState(storeUser?.student_id ?? '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)

  useEffect(() => {
    if (storeUser) {
      setFullName(storeUser.full_name)
      setPhone(storeUser.phone ?? '')
      setStudentId(storeUser.student_id ?? '')
    }
  }, [storeUser])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const res = await apiClient.patch('/auth/me', {
        full_name: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
        student_id: studentId.trim() || undefined,
      })
      const updated = res.data as User
      setUser(updated)
      toast.success('Profile saved.')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Failed to save profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleLogout = () => {
    clearAuth()
    router.push(`/${slug}/login`)
  }

  const initials = getInitials(storeUser?.full_name ?? null)
  const isStudent = storeUser?.role === 'student'
  const memberSince = storeUser?.created_at
    ? new Date(storeUser.created_at).toLocaleDateString('en-BD', { year: 'numeric', month: 'long' })
    : null

  return (
    <ProtectedRoute allowedRoles={['student', 'customer']}>
      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-8 md:px-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-bold text-white">
              {initials}
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">{storeUser?.full_name ?? 'Your Profile'}</h1>
              <p className="text-sm text-slate-500">{storeUser?.email}</p>
            </div>
          </div>

          {/* Section 1 — Personal Info */}
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
              Personal Info
            </h2>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Full Name</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Email <span className="font-normal text-slate-400">(cannot be changed)</span>
                </label>
                <input
                  disabled
                  className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-400"
                  value={storeUser?.email ?? ''}
                  readOnly
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Phone</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                />
              </div>

              {isStudent && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Student ID</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="e.g. 22301234"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={savingProfile}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {savingProfile ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </section>

          {/* Section 2 — Security */}
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Security</h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-800">Password</p>
                  <p className="text-xs text-slate-500">Last changed: unknown</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowChangePw(true)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Change
              </button>
            </div>
          </section>

          {/* Section 3 — Wallet & Rewards */}
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
              Wallet &amp; Rewards
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-emerald-50 p-4">
                <div className="mb-1 flex items-center gap-1.5 text-emerald-700">
                  <Wallet className="h-4 w-4" />
                  <span className="text-xs font-semibold">Balance</span>
                </div>
                <p className="text-2xl font-black text-emerald-900">৳{Number(walletBalance).toFixed(2)}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-4">
                <p className="mb-1 text-xs font-semibold text-amber-700">Reward Points</p>
                <p className="text-2xl font-black text-amber-900">{Number(rewardPoints).toLocaleString('en-BD')}</p>
                <p className="mt-0.5 text-[11px] text-amber-600">= floor(total / 10) per order</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/${slug}/wallet`)}
              className="mt-4 w-full rounded-xl border border-primary/30 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
            >
              Top Up Wallet
            </button>
          </section>

          {/* Section 4 — Account */}
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Account</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Email verified</span>
                <span
                  className={[
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    storeUser?.email_verified
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-500',
                  ].join(' ')}
                >
                  {storeUser?.email_verified ? 'Verified' : 'Not verified'}
                </span>
              </div>
              {memberSince && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Member since</span>
                  <span className="text-slate-800 font-medium">{memberSince}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Role</span>
                <span className="capitalize text-slate-800 font-medium">{storeUser?.role}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-5 w-full rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Sign Out
            </button>
          </section>
        </div>
      </main>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </ProtectedRoute>
  )
}
