'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Send, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import apiClient from '@/lib/api'

type InvitableRole = 'staff' | 'cleaner' | 'server' | 'outlet_admin'

interface PendingInvite {
  invite_id: string
  email: string
  role: string
  expires_at: string
  accepted_at?: string | null
}

function inviteStatus(inv: PendingInvite): { label: string; color: string } {
  if (inv.accepted_at) return { label: 'Accepted', color: 'bg-green-100 text-green-700' }
  if (new Date(inv.expires_at) < new Date()) return { label: 'Expired', color: 'bg-red-100 text-red-600' }
  return { label: 'Pending', color: 'bg-amber-100 text-amber-700' }
}

export default function InvitePage() {
  const params = useParams<{ tenant_slug: string }>()

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InvitableRole>('staff')
  const [sending, setSending] = useState(false)
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [loadingInvites, setLoadingInvites] = useState(true)

  const loadInvites = async () => {
    try {
      const res = await apiClient.get('/users/invite')
      setInvites(res.data as PendingInvite[])
    } catch {
      toast.error('Unable to load sent invitations.')
    } finally {
      setLoadingInvites(false)
    }
  }

  useEffect(() => {
    loadInvites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    try {
      await apiClient.post('/users/invite', { email: email.trim(), role })
      toast.success(`Invitation sent to ${email.trim()}`)
      setEmail('')
      await loadInvites()
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      toast.error(axiosErr.response?.data?.detail ?? 'Failed to send invitation.')
    } finally {
      setSending(false)
    }
  }

  const handleResend = async (inv: PendingInvite) => {
    try {
      await apiClient.post('/users/invite', { email: inv.email, role: inv.role })
      toast.success(`Re-sent invitation to ${inv.email}`)
      await loadInvites()
    } catch {
      toast.error('Failed to resend invitation.')
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-slate-900">Invite Staff</h1>
        <Link
          href={`/${params.tenant_slug}/users`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          ← Back to Users
        </Link>
      </div>

      {/* Send form */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-700">
          <UserPlus className="h-4 w-4 text-primary" />
          Send Invitation
        </h2>

        <form className="space-y-4" onSubmit={handleSend}>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@example.com"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label htmlFor="role" className="mb-1.5 block text-sm font-medium text-slate-700">
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as InvitableRole)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="staff">Staff</option>
              <option value="cleaner">Cleaner</option>
              <option value="server">Server</option>
              <option value="outlet_admin">Outlet Admin</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={sending}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Sending…' : 'Send Invitation'}
          </button>
        </form>
      </div>

      {/* Sent invitations table */}
      {loadingInvites ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
          Loading invitations…
        </div>
      ) : invites.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-bold text-slate-700">Sent Invitations</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Expires</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => {
                const { label, color } = inviteStatus(inv)
                const expired = label === 'Expired'
                return (
                  <tr key={inv.invite_id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 font-medium text-slate-900">{inv.email}</td>
                    <td className="px-5 py-3 capitalize text-slate-600">{inv.role}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
                        {label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {expired && (
                        <button
                          type="button"
                          onClick={() => handleResend(inv)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Resend
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
