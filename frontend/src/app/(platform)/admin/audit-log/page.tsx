'use client'

import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

interface AuditLogEntry {
  log_id: string
  actor_id: string | null
  actor_email: string
  action: string
  target_tenant_id: string | null
  target_tenant_name: string | null
  target_tenant_slug: string | null
  details: string | null
  created_at: string
}

const ACTIONS = [
  'tenant_created',
  'tenant_updated',
  'tenant_tier_changed',
  'tenant_activated',
  'tenant_suspended',
  'tenant_deleted',
  'impersonation_started',
]

const PAGE_SIZE = 50

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('')
  const [skip, setSkip] = useState(0)

  const load = async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/platform/audit-logs', {
        params: { action: actionFilter || undefined, skip, limit: PAGE_SIZE },
      })
      setItems(res.data.items)
      setTotal(res.data.total)
    } catch {
      toast.error('Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [actionFilter, skip])

  return (
    <ProtectedRoute allowedRoles={['platform_admin']}>
      <div className="min-h-screen bg-background px-4 py-6 md:px-6 lg:px-8">
        <div className="flex flex-col mx-auto max-w-6xl gap-6">
          <PageHeader
            eyebrow="Platform Admin"
            title="Audit Log"
            description="Every platform-admin tenant mutation — create, tier change, activate, suspend, delete, impersonate."
            breadcrumbs={[{ label: 'Platform' }, { label: 'Audit Log' }]}
          />

          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                {total} entries
              </CardTitle>
              <Select
                value={actionFilter || 'all'}
                onValueChange={(value) => { setActionFilter(value === 'all' ? '' : value); setSkip(0) }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a} value={a} className="capitalize">{a.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
                </div>
              ) : items.length === 0 ? (
                <Empty className="border border-dashed border-border bg-muted">
                  <EmptyMedia variant="icon">
                    <History />
                  </EmptyMedia>
                  <EmptyTitle>No audit log entries</EmptyTitle>
                  <EmptyDescription>Tenant mutations will show up here as they happen.</EmptyDescription>
                </Empty>
              ) : (
                <div className="motion-safe:animate-fade-up overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Target Tenant</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((entry) => (
                        <TableRow key={entry.log_id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {new Date(entry.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{entry.actor_email}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="capitalize">
                              {entry.action.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {entry.target_tenant_name ?? <span className="text-muted-foreground">—</span>}
                            {entry.target_tenant_slug ? (
                              <span className="ml-1 font-mono text-xs text-muted-foreground">/{entry.target_tenant_slug}</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                            {entry.details ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing {items.length === 0 ? 0 : skip + 1}–{skip + items.length} of {total}
                </p>
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        aria-disabled={skip === 0}
                        className={skip === 0 ? 'pointer-events-none opacity-50' : undefined}
                        onClick={(event) => {
                          event.preventDefault()
                          setSkip(Math.max(0, skip - PAGE_SIZE))
                        }}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        aria-disabled={skip + PAGE_SIZE >= total}
                        className={skip + PAGE_SIZE >= total ? 'pointer-events-none opacity-50' : undefined}
                        onClick={(event) => {
                          event.preventDefault()
                          setSkip(skip + PAGE_SIZE)
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  )
}
