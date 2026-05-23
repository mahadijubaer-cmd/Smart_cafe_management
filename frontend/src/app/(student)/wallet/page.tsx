'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Gift, Loader2, Wallet } from 'lucide-react'

import ProtectedRoute from '@/components/ProtectedRoute'
import apiClient from '@/lib/api'
import { useStore } from '@/store/useStore'
import type { Payment } from '@/types'

const QUICK_TOPUP_AMOUNTS = [100, 200, 500, 1000]
const PAGE_SIZE = 10
const REWARD_TIER = 500

type PaymentHistoryItem = Payment & {
  order: {
    order_id: string
    total_amount: number
    discount_amount: number
    payment_status: string
    created_at: string
  }
}

function formatBdt(amount: number) {
  return `BDT ${amount.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function StudentWalletPage() {
  const user = useStore((state) => state.user)
  const setUser = useStore((state) => state.setUser)

  const walletBalance = user?.wallet_balance ?? 0
  const rewardPoints = user?.reward_points ?? 0

  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<PaymentHistoryItem[]>([])
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    let mounted = true

    const loadHistory = async () => {
      try {
        const response = await apiClient.get('/payments/history')
        if (!mounted) return
        setHistory(response.data as PaymentHistoryItem[])
      } catch {
        if (mounted) {
          setHistory([])
          toast.error('Unable to load payment history')
        }
      }
    }

    loadHistory()

    return () => {
      mounted = false
    }
  }, [])

  const totalPages = Math.max(Math.ceil(history.length / PAGE_SIZE), 1)
  const visibleHistory = useMemo(
    () => history.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [currentPage, history]
  )

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const rewardProgress = rewardPoints % REWARD_TIER
  const rewardProgressPercent = Math.min((rewardProgress / REWARD_TIER) * 100, 100)
  const pointsToNextTier = REWARD_TIER - rewardProgress

  const handleQuickAmount = (value: number) => setAmount(String(value))

  const handleTopUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000) {
      toast.error('Enter a valid amount between 1 and 10000')
      return
    }

    setLoading(true)
    try {
      const response = await apiClient.post('/payments/topup', { amount: parsedAmount })
      const nextBalance = Number(response.data?.wallet_balance ?? walletBalance + parsedAmount)

      if (user) {
        setUser({ ...user, wallet_balance: nextBalance })
      }

      toast.success('Funds added successfully')
      setAmount('')
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Unable to top up wallet')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProtectedRoute allowedRoles={['student']}>
      <main className="min-h-screen bg-[linear-gradient(180deg,#f2eee7_0%,#ffffff_34%,#edf5ef_100%)] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#1A4D2E]">
              Wallet
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Your balance and rewards</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
              Add funds, track payments, and monitor your reward progress in one place.
            </p>
          </div>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="space-y-6">
              <div className="rounded-[2rem] border border-black/10 bg-[#14351f] p-6 text-white shadow-[0_24px_80px_rgba(20,53,31,0.28)] md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-white/70">Current Wallet Balance</p>
                    <h2 className="mt-3 text-4xl font-black md:text-5xl">{formatBdt(walletBalance)}</h2>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-4 text-white">
                    <Wallet className="h-7 w-7" />
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Reward Points</p>
                    <div className="mt-2 flex items-center gap-3">
                      <Gift className="h-6 w-6 text-[#1A4D2E]" />
                      <p className="text-2xl font-black text-slate-900">{rewardPoints.toLocaleString('en-BD')}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[#1A4D2E]/10 px-4 py-2 text-sm font-semibold text-[#1A4D2E]">
                    {pointsToNextTier} points to next tier
                  </div>
                </div>
                <div className="mt-5 space-y-2">
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#1A4D2E] to-[#79a55e] transition-all"
                      style={{ width: `${rewardProgressPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{rewardProgress} / {REWARD_TIER} points</span>
                    <span>500 points = free item</span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="mb-5">
                  <h3 className="text-xl font-bold text-slate-900">Top up wallet</h3>
                  <p className="mt-1 text-sm text-slate-500">Add funds using a preset amount or a custom value.</p>
                </div>

                <form className="space-y-5" onSubmit={handleTopUp}>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {QUICK_TOPUP_AMOUNTS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleQuickAmount(preset)}
                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${Number(amount) === preset ? 'border-[#1A4D2E] bg-[#1A4D2E] text-white' : 'border-black/10 bg-slate-50 text-slate-700 hover:border-[#1A4D2E]/30 hover:bg-[#1A4D2E]/5'}`}
                      >
                        BDT {preset}
                      </button>
                    ))}
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
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="Enter amount"
                      className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#1A4D2E]"
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
                    <p className="mt-1 text-sm text-slate-500">Latest wallet payments and top-ups.</p>
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
                          <th className="px-4 py-3">Order ID</th>
                          <th className="px-4 py-3">Amount</th>
                          <th className="px-4 py-3">Method</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/10 bg-white">
                        {visibleHistory.length === 0 ? (
                          <tr>
                            <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                              No transactions yet.
                            </td>
                          </tr>
                        ) : (
                          visibleHistory.map((entry) => (
                            <tr key={entry.payment_id} className="hover:bg-slate-50/60">
                              <td className="px-4 py-3 text-slate-600">{formatDate(entry.created_at)}</td>
                              <td className="px-4 py-3 font-medium text-slate-900">{`${entry.order_id.slice(0, 8)}...`}</td>
                              <td className="px-4 py-3 font-semibold text-slate-900">{formatBdt(Number(entry.amount))}</td>
                              <td className="px-4 py-3 text-slate-600">{entry.method}</td>
                              <td className="px-4 py-3">
                                <span className="rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[#1A4D2E]">
                                  {entry.status}
                                </span>
                              </td>
                            </tr>
                          ))
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