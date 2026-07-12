'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Check, Copy, Send, Trash2, UserPlus, Mail } from 'lucide-react'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

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
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

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
      const res = await apiClient.post('/users/invite', { email: email.trim(), role })
      toast.success(`Invitation sent to ${email.trim()}`)
      setEmail('')
      setLastInviteLink(res.data?.invite_link ?? null)
      setLinkCopied(false)
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
      const res = await apiClient.post('/users/invite', { email: inv.email, role: inv.role })
      toast.success(`Re-sent invitation to ${inv.email}`)
      setLastInviteLink(res.data?.invite_link ?? null)
      setLinkCopied(false)
      await loadInvites()
    } catch {
      toast.error('Failed to resend invitation.')
    }
  }

  const handleCopyLink = async () => {
    if (!lastInviteLink) return
    try {
      await navigator.clipboard.writeText(lastInviteLink)
      setLinkCopied(true)
      toast.success('Invite link copied.')
    } catch {
      toast.error('Could not copy the link — select and copy it manually.')
    }
  }

  const handleRevoke = async (inv: PendingInvite) => {
    setRevokingId(inv.invite_id)
    try {
      await apiClient.delete(`/users/invite/${inv.invite_id}`)
      toast.success(`Revoked invitation for ${inv.email}`)
      await loadInvites()
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      toast.error(axiosErr.response?.data?.detail ?? 'Failed to revoke invitation.')
    } finally {
      setRevokingId(null)
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

      {lastInviteLink ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Invite link (shown once)</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={lastInviteLink}>
                {lastInviteLink}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Already emailed — copy this only as a fallback if the email doesn&apos;t arrive. It won&apos;t be shown again.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2" onClick={handleCopyLink}>
              {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {linkCopied ? 'Copied' : 'Copy link'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

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
                  const pending = label === 'Pending'
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
                        <div className="flex items-center justify-end gap-3">
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
                          {pending && (
                            <AlertDialog>
                              <AlertDialogTrigger>
                                <Button
                                  type="button"
                                  variant="link"
                                  size="sm"
                                  disabled={revokingId === inv.invite_id}
                                  className="h-auto gap-1 p-0 text-xs text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Revoke
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Revoke invitation?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {inv.email} will no longer be able to use this invite link. You can send a new invitation any time.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction variant="destructive" onClick={() => handleRevoke(inv)}>
                                    Revoke
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
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
