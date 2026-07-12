'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Send, UserPlus, Mail } from 'lucide-react'
import { toast } from 'sonner'
import apiClient from '@/lib/api'
import PageHeader from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'

type InvitableRole = 'staff' | 'cleaner' | 'server' | 'outlet_admin'

interface PendingInvite {
  invite_id: string
  email: string
  role: string
  expires_at: string
  accepted_at?: string | null
}

function inviteStatus(inv: PendingInvite): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (inv.accepted_at) return { label: 'Accepted', variant: 'default' }
  if (new Date(inv.expires_at) < new Date()) return { label: 'Expired', variant: 'destructive' }
  return { label: 'Pending', variant: 'secondary' }
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
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Invite Staff"
        description="Invite staff, cleaners, servers, or outlet admins by email."
        breadcrumbs={[
          { label: 'Users', href: `/${params.tenant_slug}/users` },
          { label: 'Invite' },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-bold">
            <UserPlus data-icon="inline-start" />
            Send Invitation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form method="post" onSubmit={handleSend}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email address</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@example.com"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="role">Role</FieldLabel>
                <Select value={role} onValueChange={(value) => setRole(value as InvitableRole)}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="cleaner">Cleaner</SelectItem>
                    <SelectItem value="server">Server</SelectItem>
                    <SelectItem value="outlet_admin">Outlet Admin</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Button type="submit" disabled={sending} className="w-fit">
                <Send data-icon="inline-start" />
                {sending ? 'Sending…' : 'Send Invitation'}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {loadingInvites ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : invites.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm font-bold">Sent Invitations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((inv) => {
                  const { label, variant } = inviteStatus(inv)
                  const expired = label === 'Expired'
                  return (
                    <TableRow key={inv.invite_id}>
                      <TableCell className="font-medium">{inv.email}</TableCell>
                      <TableCell className="capitalize text-muted-foreground">{inv.role}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant}>{label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {expired && (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            onClick={() => handleResend(inv)}
                            className="h-auto p-0 text-xs"
                          >
                            Resend
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Mail />
            </EmptyMedia>
            <EmptyTitle>No invitations sent yet</EmptyTitle>
            <EmptyDescription>Invite staff, cleaners, servers, or outlet admins using the form above.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
