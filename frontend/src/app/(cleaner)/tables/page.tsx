'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCheck } from 'lucide-react'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import useWebSocket from '@/hooks/useWebSocket'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useStore } from '@/store/useStore'
import type { CleanerLog } from '@/types'

type CleanerAssignment = CleanerLog & {
  table?: {
    table_id: number
    table_number: string
    zone: string
    capacity: number
    status: string
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return 'N/A'
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function CleanCard({
  assignment,
  onStart,
  onDone,
}: {
  assignment: CleanerAssignment
  onStart: (logId: string) => Promise<void>
  onDone: (logId: string) => Promise<void>
}) {
  return (
    <article className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Table {assignment.table?.table_number ?? assignment.table_id}</p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">{assignment.table?.zone ?? 'Unknown zone'}</h3>
          <p className="text-sm text-slate-500">Capacity {assignment.table?.capacity ?? 'N/A'}</p>
        </div>
        <Badge variant="secondary">{assignment.status}</Badge>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <p><span className="font-semibold text-slate-900">Assigned:</span> {formatDateTime(assignment.assigned_at)}</p>
        <p><span className="font-semibold text-slate-900">Status:</span> {assignment.status}</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" onClick={() => onStart(assignment.log_id)} variant="outline">
          Start Cleaning
        </Button>
        <Button type="button" onClick={() => onDone(assignment.log_id)}>
          Mark Done
        </Button>
      </div>
    </article>
  )
}

export default function CleanerTablesPage() {
  const user = useStore((state) => state.user)
  const token = useStore((state) => state.token)
  const [assignments, setAssignments] = useState<CleanerAssignment[]>([])
  const [completedToday, setCompletedToday] = useState<CleanerAssignment[]>([])
  const [pendingDoneLogId, setPendingDoneLogId] = useState<string | null>(null)

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.status !== 'done'),
    [assignments],
  )

  const completedAssignments = useMemo(
    () => [...completedToday].sort((left, right) => Number(new Date(right.cleaned_at ?? right.assigned_at)) - Number(new Date(left.cleaned_at ?? left.assigned_at))),
    [completedToday],
  )

  const syncAssignments = async () => {
    const response = await apiClient.get('/cleaners/assignments')
    const fetched = response.data as CleanerAssignment[]

    setAssignments((current) => {
      const currentMap = new Map(current.map((assignment) => [assignment.log_id, assignment]))
      const merged = [...current]

      for (const assignment of fetched) {
        if (!currentMap.has(assignment.log_id)) {
          merged.unshift(assignment)
          continue
        }

        const existingIndex = merged.findIndex((item) => item.log_id === assignment.log_id)
        if (existingIndex >= 0) {
          merged[existingIndex] = {
            ...merged[existingIndex],
            ...assignment,
          }
        }
      }

      return merged
    })
  }

  useEffect(() => {
    syncAssignments().catch(() => setAssignments([]))
  }, [])

  const handleMessage = useMemo(
    () => (event: Record<string, unknown>) => {
      if (event.type !== 'CLEAN_ASSIGNED') {
        return
      }

      void syncAssignments()
    },
    [],
  )

  useWebSocket(user?.user_id || '', token || '', handleMessage)

  const handleStart = async (logId: string) => {
    const response = await apiClient.patch(`/cleaners/assignments/${logId}/start`)
    const updated = response.data as CleanerAssignment

    setAssignments((current) => current.map((assignment) => (assignment.log_id === logId ? { ...assignment, ...updated } : assignment)))
  }

  const handleDone = async (logId: string) => {
    const response = await apiClient.patch(`/cleaners/assignments/${logId}/done`)
    const updated = response.data as CleanerAssignment

    setAssignments((current) => current.filter((assignment) => assignment.log_id !== logId))
    setCompletedToday((current) => [
      {
        ...updated,
        cleaned_at: updated.cleaned_at ?? new Date().toISOString(),
      },
      ...current,
    ])
    setPendingDoneLogId(null)
  }

  return (
    <ProtectedRoute allowedRoles={["cleaner"]}>
      <main className="min-h-screen bg-[linear-gradient(180deg,#F5F0E8_0%,#ffffff_32%,#eef5ee_100%)] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              Cleaner assignments
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Table cleaning queue</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
              Track your live assignments, start cleaning, and close out completed work.
            </p>
          </div>

          <section className="grid gap-5">
            {activeAssignments.length > 0 ? (
              activeAssignments.map((assignment) => (
                <CleanCard
                  key={assignment.log_id}
                  assignment={assignment}
                  onStart={handleStart}
                  onDone={(logId) => {
                    setPendingDoneLogId(logId)
                    return Promise.resolve()
                  }}
                />
              ))
            ) : (
              <Empty className="border border-dashed border-slate-200 bg-white">
                <EmptyMedia variant="icon">
                  <CheckCheck />
                </EmptyMedia>
                <EmptyTitle>No active assignments</EmptyTitle>
                <EmptyDescription>New table cleaning tasks will appear here.</EmptyDescription>
              </Empty>
            )}
          </section>

          <section>
            <details className="rounded-3xl border border-black/10 bg-white shadow-sm">
              <summary className="cursor-pointer list-none px-6 py-5 text-lg font-bold text-slate-900">
                Completed Today ({completedAssignments.length})
              </summary>
              <div className="border-t border-black/10 px-6 pb-6 pt-4">
                {completedAssignments.length > 0 ? (
                  <div className="grid gap-4">
                    {completedAssignments.map((assignment) => (
                      <div key={assignment.log_id} className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-emerald-900">Table {assignment.table?.table_number ?? assignment.table_id}</p>
                            <p className="text-sm text-emerald-700">{assignment.table?.zone ?? 'Unknown zone'} · Capacity {assignment.table?.capacity ?? 'N/A'}</p>
                          </div>
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">done</Badge>
                        </div>
                        <p className="mt-3 text-sm text-emerald-800">Completed at {formatDateTime(assignment.cleaned_at)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No completed assignments yet today.</p>
                )}
              </div>
            </details>
          </section>
        </div>
      </main>

      <AlertDialog open={pendingDoneLogId !== null} onOpenChange={(open) => !open && setPendingDoneLogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this cleaning as done?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the table back to available and close the assignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDoneLogId) {
                  void handleDone(pendingDoneLogId)
                }
              }}
            >
              Mark Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProtectedRoute>
  )
}