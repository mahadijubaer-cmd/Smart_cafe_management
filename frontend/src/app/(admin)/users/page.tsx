'use client'

import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, ShieldOff, Search } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import apiClient from '@/lib/api'
import type { User } from '@/types'
import toast from 'react-hot-toast'

const PAGE_SIZE = 20

type AdminUser = User

function formatCurrency(amount: number) {
  return `BDT ${amount.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateValue: string) {
  return new Date(dateValue).toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function RoleBadge({ role }: { role: AdminUser['role'] }) {
  const styleMap: Record<AdminUser['role'], string> = {
    student: 'bg-sky-100 text-sky-700',
    staff: 'bg-amber-100 text-amber-700',
    cleaner: 'bg-emerald-100 text-emerald-700',
    admin: 'bg-slate-200 text-slate-800',
  }

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${styleMap[role]}`}>{role}</span>
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | AdminUser['role']>('all')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    let mounted = true

    const loadUsers = async () => {
      try {
        const response = await apiClient.get('/users')
        if (!mounted) return

        const data = Array.isArray(response.data) ? response.data : response.data?.items ?? []
        setUsers(data as AdminUser[])
      } catch {
        if (mounted) {
          setUsers([])
          toast.error('Unable to load users')
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadUsers()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, roleFilter])

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()

    return users.filter((user) => {
      const matchesSearch =
        query.length === 0 ||
        user.full_name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)

      const matchesRole = roleFilter === 'all' || user.role === roleFilter
      return matchesSearch && matchesRole
    })
  }, [users, search, roleFilter])

  const totalPages = Math.max(Math.ceil(filteredUsers.length / PAGE_SIZE), 1)
  const visibleUsers = filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const handleToggleUser = async (userId: string) => {
    try {
      const response = await apiClient.patch(`/users/${userId}/toggle`)
      const updatedUser = response.data as AdminUser | undefined

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.user_id === userId ? { ...user, ...(updatedUser ?? {}), is_active: updatedUser?.is_active ?? !user.is_active } : user
        )
      )

      toast.success('User status updated')
    } catch {
      toast.error('Unable to update user status')
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f2eee7_0%,#ffffff_34%,#edf5ef_100%)] px-4 py-6 md:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="mb-2 inline-flex rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#1A4D2E]">
            User Management
          </p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Manage users</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
            Search by name or email, filter by role, and toggle account status.
          </p>
        </div>

        <Card className="border-black/10 bg-white/90 shadow-sm">
          <CardContent className="space-y-5 p-5 md:p-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name or email"
                  className="pl-11"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as 'all' | AdminUser['role'])}
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">All roles</option>
                <option value="student">Student</option>
                <option value="staff">Staff</option>
                <option value="cleaner">Cleaner</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="overflow-hidden rounded-2xl border border-black/10">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-black/10 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.15em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Wallet Balance</th>
                      <th className="px-4 py-3">Reward Points</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Joined Date</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/10 bg-white">
                    {loading ? (
                      <tr>
                        <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>
                          Loading users...
                        </td>
                      </tr>
                    ) : visibleUsers.length === 0 ? (
                      <tr>
                        <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>
                          No users found.
                        </td>
                      </tr>
                    ) : (
                      visibleUsers.map((user) => (
                        <tr key={user.user_id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3 font-semibold text-slate-900">{user.full_name}</td>
                          <td className="px-4 py-3 text-slate-600">{user.email}</td>
                          <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                          <td className="px-4 py-3 text-slate-700">{formatCurrency(Number(user.wallet_balance))}</td>
                          <td className="px-4 py-3 text-slate-700">{user.reward_points.toLocaleString('en-BD')}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}
                            >
                              {user.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(user.created_at)}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => handleToggleUser(user.user_id)}
                              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${user.is_active ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                            >
                              {user.is_active ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                              {user.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                Showing {filteredUsers.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}
              </p>

              <div className="flex items-center gap-2">
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
          </CardContent>
        </Card>
      </div>
    </main>
  )
}