'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Gift, Loader2, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'

import ProtectedRoute from '@/components/ProtectedRoute'
import apiClient from '@/lib/api'
import { useStore } from '@/store/useStore'
import type { User } from '@/types'

const QUICK_TOPUP_AMOUNTS = [100, 200, 500, 1000]
const PAGE_SIZE = 8
const REWARD_TIER = 500

type PaymentHistoryItem = {
  payment_id: string
  order_id: string
  amount: number | string
  method: string
  status: string
  created_at: string
  order: {
    order_id: string
    total_amount: number | string
    discount_amount: number | string
    payment_status: string
    created_at: string
  }
}

type WalletTransaction = {
  id: string
  kind: 'payment' | 'topup'
  title: string
  subtitle: string
  amount: number
  method: string
  status: string
  createdAt: string
}

function formatBdt(amount: number) {
  return `BDT ${amount.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function useAnimatedNumber(target: number, duration = 700) {
  const [displayValue, setDisplayValue] = useState(target)
  const previousValueRef = useRef(target)

  useEffect(() => {
    const from = previousValueRef.current
    const to = target

    if (from === to) {
      setDisplayValue(to)
      return
    }

    let frameId = 0
    let startTime: number | null = null

    const animate = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp
      }

      const progress = Math.min((timestamp - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(from + (to - from) * eased)

      if (progress < 1) {
        frameId = window.requestAnimationFrame(animate)
      } else {
        previousValueRef.current = to
      }
    }

    frameId = window.requestAnimationFrame(animate)

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [duration, target])

  return displayValue
}

function getTopUpEntry(amount: number): WalletTransaction {
  return {
    id: `topup-${Date.now()}`,
    kind: 'topup',
    title: 'Wallet top-up',
    subtitle: 'Balance added from the wallet page',
    amount,
    method: 'topup',
    status: 'completed',
    createdAt: new Date().toISOString(),
  }
}

function getPaymentEntry(payment: PaymentHistoryItem): WalletTransaction {
  return {
    id: payment.payment_id,
    kind: 'payment',
    title: `Order ${payment.order_id.slice(0, 8).toUpperCase()}`,
    subtitle: `Order total ${formatBdt(Number(payment.order.total_amount))}`,
    amount: -Math.abs(Number(payment.amount)),
    method: payment.method,
    status: payment.status,
    createdAt: payment.created_at,
  }
}

export default function StudentWalletPage() {
  const router = useRouter()
  const setUser = useStore((state) => state.setUser)
  const setWalletBalance = useStore((state) => state.setWalletBalance)
  const setRewardPoints = useStore((state) => state.setRewardPoints)
  const walletBalance = useStore((state) => state.walletBalance)
  const rewardPoints = useStore((state) => state.rewardPoints)

  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [progressReady, setProgressReady] = useState(false)

  const animatedBalance = useAnimatedNumber(walletBalance)

  const refreshProfile = async () => {
    const response = await apiClient.get('/auth/me')
    const profile = response.data as User
    setUser(profile)
    setWalletBalance(Number(profile.wallet_balance))
    setRewardPoints(Number(profile.reward_points))
  }

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        await refreshProfile()
      } catch {
        if (mounted) {
          toast.error('Unable to refresh your wallet profile')
        }
      } finally {
        if (mounted) {
          setProfileLoading(false)
        }
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const loadHistory = async () => {
      try {
        const response = await apiClient.get('/payments/history')
        const rows = Array.isArray(response.data) ? (response.data as PaymentHistoryItem[]) : []
        if (!mounted) return
        setTransactions(rows.map(getPaymentEntry))
      } catch {
        if (mounted) {
          setTransactions([])
          toast.error('Unable to load transaction history')
        }
      } finally {
        if (mounted) {
          setHistoryLoading(false)
        }
      }
    }

    void loadHistory()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setProgressReady(true), 120)
    return () => window.clearTimeout(timer)
  }, [])

  const rewardProgress = rewardPoints % REWARD_TIER
  const normalizedProgress = rewardProgress === 0 && rewardPoints > 0 ? REWARD_TIER : rewardProgress
  const rewardProgressPercent = normalizedProgress === REWARD_TIER ? 100 : (normalizedProgress / REWARD_TIER) * 100
  const pointsToNextTier = rewardPoints > 0 && rewardProgress === 0 ? 0 : REWARD_TIER - rewardProgress

  const totalPages = Math.max(Math.ceil(transactions.length / PAGE_SIZE), 1)
  const visibleTransactions = useMemo(
    () => transactions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [currentPage, transactions],
  )

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const handleQuickAmount = (value: number) => setAmount(String(value))

  const handleTopUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000) {
      toast.error('Enter an amount between 1 and 10000')
      return
    }

    setLoading(true)
    try {
      const response = await apiClient.post('/payments/topup', { amount: parsedAmount })
      const nextBalance = Number(response.data?.wallet_balance ?? walletBalance + parsedAmount)

      setWalletBalance(nextBalance)
      setTransactions((current) => [getTopUpEntry(parsedAmount), ...current])
      setAmount('')
      toast.success('Wallet topped up successfully')

      void refreshProfile()
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Unable to top up wallet')
    } finally {
      setLoading(false)
    }
  }

  const displayBalance = formatBdt(animatedBalance)
  const loadingState = profileLoading || historyLoading

  return (
    <ProtectedRoute allowedRoles={['student']}>
      <main className="min-h-screen bg-[linear-gradient(180deg,#f1ede4_0%,#ffffff_38%,#edf5ef_100%)] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 inline-flex rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#1A4D2E]">
                Wallet
              </p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Balance, rewards, and history</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                Keep your wallet funded, monitor your reward tier, and review every payment from one place.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[#1A4D2E]/30 hover:text-[#1A4D2E]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="space-y-6">
              <div className="overflow-hidden rounded-[2rem] border border-black/10 bg-[linear-gradient(135deg,#14351f_0%,#1a4d2e_55%,#2d6a3d_100%)] p-6 text-white shadow-[0_24px_80px_rgba(20,53,31,0.28)] md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/70">Available balance</p>
                    <div className="mt-3 flex items-end gap-3">
                      <h2 className="text-4xl font-black md:text-5xl">{displayBalance}</h2>
                      {profileLoading ? <Loader2 className="mb-2 h-5 w-5 animate-spin text-white/80" /> : null}
                    </div>
                    <p className="mt-3 max-w-md text-sm leading-6 text-white/75">
                      Spend this directly on wallet payments or top it up before checkout.
                    </p>
                  </div>
                  <div className="rounded-3xl bg-white/10 p-4 text-white ring-1 ring-white/15 backdrop-blur">
                    <Wallet className="h-8 w-8" />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Reward points</p>
                  <div className="mt-3 flex items-center gap-3">
                    <Gift className="h-6 w-6 text-[#1A4D2E]" />
                    <span className="text-3xl font-black text-slate-900">{rewardPoints.toLocaleString('en-BD')}</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    {pointsToNextTier === 0 && rewardPoints > 0
                      ? 'You have reached a reward tier.'
                      : `${pointsToNextTier} points to the next reward.`}
                  </p>
                </div>

                <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Reward tier</p>
                  <div className="mt-3 text-sm text-slate-600">
                    500 points unlocks a free menu item on the next checkout.
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#1A4D2E] to-[#79a55e] transition-[width] duration-700 ease-out"
                      style={{ width: progressReady ? `${rewardProgressPercent}%` : '0%' }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{normalizedProgress} / {REWARD_TIER} points</span>
                    <span>Next tier: {pointsToNextTier || 0} points</span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Top up wallet</h3>
                    <p className="mt-1 text-sm text-slate-500">Pick a quick amount or enter a custom value up to 10,000 BDT.</p>
                  </div>
                  <div className="rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold text-[#1A4D2E]">
                    Fast checkout ready
                  </div>
                </div>

                <form className="space-y-5" onSubmit={handleTopUp}>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {QUICK_TOPUP_AMOUNTS.map((preset) => {
                      const active = Number(amount) === preset
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleQuickAmount(preset)}
                          className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${active ? 'border-[#1A4D2E] bg-[#1A4D2E] text-white shadow-lg shadow-[#1A4D2E]/15' : 'border-black/10 bg-slate-50 text-slate-700 hover:border-[#1A4D2E]/30 hover:bg-[#1A4D2E]/5'}`}
                        >
                          BDT {preset}
                        </button>
                      )
                    })}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-900" htmlFor="topup-amount">
                      Custom amount
                    </label>
                    <input
                      id="topup-amount"
                      type="number"
                      min="1"
                      max="10000"
                      inputMode="numeric"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="Enter amount"
                      className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#1A4D2E] focus:ring-2 focus:ring-[#1A4D2E]/10"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1A4D2E] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#163f25] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Add Funds
                  </button>
                </form>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Transaction history</h3>
                    <p className="mt-1 text-sm text-slate-500">Wallet payments and added funds.</p>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    Page {currentPage} of {totalPages}
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-black/10">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-black/10 text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.15em] text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Details</th>
                          <th className="px-4 py-3">Amount</th>
                          <th className="px-4 py-3">Method</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/10 bg-white">
                        {loadingState ? (
                          <tr>
                            <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                              Loading history...
                            </td>
                          </tr>
                        ) : visibleTransactions.length === 0 ? (
                          <tr>
                            <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                              No transactions yet.
                            </td>
                          </tr>
                        ) : (
                          visibleTransactions.map((entry) => {
                            const isCredit = entry.kind === 'topup'
                            return (
                              <tr key={entry.id} className="hover:bg-slate-50/60">
                                <td className="px-4 py-3 text-slate-600">{formatDate(entry.createdAt)}</td>
                                <td className="px-4 py-3">
                                  <div className="space-y-1">
                                    <p className="font-semibold text-slate-900">{entry.title}</p>
                                    <p className="text-xs text-slate-500">{entry.subtitle}</p>
                                  </div>
                                </td>
                                <td className={`px-4 py-3 font-semibold ${isCredit ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {isCredit ? '+' : '-'} {formatBdt(Math.abs(entry.amount))}
                                </td>
                                <td className="px-4 py-3 text-slate-600">{entry.method}</td>
                                <td className="px-4 py-3">
                                  <span className="rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[#1A4D2E]">
                                    {entry.status}
                                  </span>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                    disabled={currentPage >= totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </ProtectedRoute>
  )
}