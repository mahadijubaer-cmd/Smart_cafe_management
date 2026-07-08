'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ShieldCheck, ShieldOff, Search, UserPlus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import apiClient from '@/lib/api'
import type { User, UserRole } from '@/types'
import { toast } from 'sonner'

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

const ROLE_STYLES: Record<UserRole, string> = {
  customer: 'bg-sky-100 text-sky-700',
  student: 'bg-sky-100 text-sky-700', // legacy alias
  staff: 'bg-amber-100 text-amber-700',
  server: 'bg-amber-100 text-amber-700',
  cleaner: 'bg-emerald-100 text-emerald-700',
  admin: 'bg-slate-200 text-slate-800', // legacy alias
  outlet_admin: 'bg-slate-200 text-slate-800',
  tenant_admin: 'bg-slate-200 text-slate-800',
  super_admin: 'bg-violet-100 text-violet-700',
  food_court_admin: 'bg-violet-100 text-violet-700',
  platform_admin: 'bg-rose-100 text-rose-700',
}

function RoleBadge({ role }: { role: AdminUser['role'] }) {
  const style = ROLE_STYLES[role] ?? 'bg-slate-100 text-slate-600'
  return (
    <Badge variant="outline" className={`border-transparent uppercase tracking-[0.15em] ${style}`}>
      {role}
    </Badge>
  )
}

export default function AdminUsersPage() {
  const params = useParams<{ tenant_slug: string }>()
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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              User Management
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Manage users</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
              Search by name or email, filter by role, and toggle account status.
            </p>
          </div>
          {params.tenant_slug && (
            <Button asChild>
              <Link href={`/${params.tenant_slug}/users/invite`}>
                <UserPlus data-icon="inline-start" />
                Invite Staff
              </Link>
            </Button>
          )}
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

              <Select
                value={roleFilter}
                onValueChange={(value) => setRoleFilter(value as 'all' | AdminUser['role'])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="server">Server</SelectItem>
                  <SelectItem value="cleaner">Cleaner</SelectItem>
                  <SelectItem value="outlet_admin">Outlet Admin</SelectItem>
                  <SelectItem value="tenant_admin">Tenant Admin</SelectItem>
                  <SelectItem value="food_court_admin">Food Court Admin</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            ) : visibleUsers.length === 0 ? (
              <Empty className="border border-dashed border-black/10">
                <EmptyMedia variant="icon">
                  <Search />
                </EmptyMedia>
                <EmptyTitle>No users found</EmptyTitle>
                <EmptyDescription>Try a different search term or role filter.</EmptyDescription>
              </Empty>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-black/10">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Wallet Balance</TableHead>
                        <TableHead>Reward Points</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined Date</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleUsers.map((user) => (
                        <TableRow key={user.user_id}>
                          <TableCell className="font-semibold text-slate-900">{user.full_name}</TableCell>
                          <TableCell className="text-slate-600">{user.email}</TableCell>
                          <TableCell><RoleBadge role={user.role} /></TableCell>
                          <TableCell className="text-slate-700">{formatCurrency(Number(user.wallet_balance))}</TableCell>
                          <TableCell className="text-slate-700">{user.reward_points.toLocaleString('en-BD')}</TableCell>
                          <TableCell>
                            <Badge variant={user.is_active ? 'default' : 'destructive'}>
                              {user.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-600">{formatDate(user.created_at)}</TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={user.is_active ? 'text-destructive hover:bg-destructive/10' : 'text-emerald-700 hover:bg-emerald-50'}
                              onClick={() => handleToggleUser(user.user_id)}
                            >
                              {user.is_active ? <ShieldOff data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
                              {user.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                Showing {filteredUsers.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}
              </p>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}