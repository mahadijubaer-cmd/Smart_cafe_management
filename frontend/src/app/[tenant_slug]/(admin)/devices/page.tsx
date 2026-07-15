'use client'

/**
 * Admin device registry (RFC-010, Phase 25.2 — specs/modules/devices.md).
 * Register kiosk/signage terminals, issue pairing codes, revoke credentials.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyRound, ListVideo, MonitorPlay, MonitorSmartphone, Plus, ShieldOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import PageHeader from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

interface DeviceRow {
  device_id: string
  name: string
  device_type: 'kiosk' | 'signage'
  outlet_id: string | null
  is_active: boolean
  paired: boolean
  token_prefix: string | null
  settings: Record<string, unknown>
  paired_at: string | null
  last_seen_at: string | null
  created_at: string
}

interface PlaylistOption {
  playlist_id: string
  name: string
  is_default: boolean
}

const STALE_AFTER_MS = 5 * 60 * 1000 // DEV-9

function seenBadge(device: DeviceRow) {
  if (!device.paired) return <Badge variant="outline">Unpaired</Badge>
  if (!device.last_seen_at) return <Badge variant="outline">Never seen</Badge>
  const ageMs = Date.now() - new Date(device.last_seen_at).getTime()
  if (ageMs < STALE_AFTER_MS) {
    return <Badge className="border-transparent bg-emerald-100 text-emerald-700">Online</Badge>
  }
  return (
    <Badge className="border-transparent bg-amber-100 text-amber-700">
      Last seen {new Date(device.last_seen_at).toLocaleString()}
    </Badge>
  )
}

export default function AdminDevicesPage() {
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [loading, setLoading] = useState(true)

  // Add dialog
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'kiosk' | 'signage'>('kiosk')
  const [saving, setSaving] = useState(false)

  // Pairing code dialog
  const [codeDevice, setCodeDevice] = useState<DeviceRow | null>(null)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [codeSecondsLeft, setCodeSecondsLeft] = useState(0)

  // Revoke / delete confirmation
  const [confirmAction, setConfirmAction] = useState<{ device: DeviceRow; kind: 'revoke' | 'delete' } | null>(null)

  // Assign playlist (signage only)
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([])
  const [playlistDevice, setPlaylistDevice] = useState<DeviceRow | null>(null)
  const [playlistChoice, setPlaylistChoice] = useState<string>('')

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/devices')
      setDevices(res.data as DeviceRow[])
    } catch {
      setDevices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const interval = setInterval(() => void load(), 60_000) // refresh online badges
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    apiClient
      .get('/signage/playlists')
      .then((res) => setPlaylists(res.data as PlaylistOption[]))
      .catch(() => undefined)
  }, [])

  const openPlaylistDialog = (device: DeviceRow) => {
    setPlaylistDevice(device)
    setPlaylistChoice((device.settings?.playlist_id as string | undefined) ?? '')
  }

  const handleAssignPlaylist = async () => {
    if (!playlistDevice) return
    try {
      await apiClient.patch(`/devices/${playlistDevice.device_id}`, {
        settings: { ...playlistDevice.settings, playlist_id: playlistChoice || null },
      })
      toast.success(`${playlistDevice.name} will refresh with the assigned playlist`)
      await load()
    } catch {
      /* toast handled by interceptor */
    } finally {
      setPlaylistDevice(null)
    }
  }

  // Pairing-code countdown
  useEffect(() => {
    if (!pairingCode || codeSecondsLeft <= 0) return
    const timer = setInterval(() => setCodeSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [pairingCode, codeSecondsLeft])

  const handleAdd = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      await apiClient.post('/devices', { name: newName.trim(), device_type: newType })
      toast.success('Device registered — generate a pairing code to connect it')
      setAddOpen(false)
      setNewName('')
      await load()
    } catch {
      /* toast handled by interceptor */
    } finally {
      setSaving(false)
    }
  }

  const handlePairingCode = async (device: DeviceRow) => {
    try {
      const res = await apiClient.post(`/devices/${device.device_id}/pairing-code`)
      setCodeDevice(device)
      setPairingCode(res.data.code as string)
      setCodeSecondsLeft(res.data.expires_in as number)
    } catch {
      /* toast handled by interceptor */
    }
  }

  const handleConfirmedAction = async () => {
    if (!confirmAction) return
    const { device, kind } = confirmAction
    try {
      if (kind === 'revoke') {
        await apiClient.post(`/devices/${device.device_id}/revoke`)
        toast.success(`${device.name} revoked — it will return to its pairing screen`)
      } else {
        await apiClient.delete(`/devices/${device.device_id}`)
        toast.success(`${device.name} deleted`)
      }
      await load()
    } catch {
      /* toast handled by interceptor */
    } finally {
      setConfirmAction(null)
    }
  }

  const countdownLabel = useMemo(() => {
    const m = Math.floor(codeSecondsLeft / 60)
    const s = codeSecondsLeft % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }, [codeSecondsLeft])

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Devices"
        description="Kiosk terminals and signage displays paired to this venue"
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus data-icon="inline-start" /> Add device
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : devices.length === 0 ? (
            <Empty className="py-16">
              <EmptyMedia variant="icon">
                <MonitorSmartphone />
              </EmptyMedia>
              <EmptyTitle>No devices yet</EmptyTitle>
              <EmptyDescription>
                Register a kiosk or signage display, then pair it with a one-time code.
              </EmptyDescription>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device) => (
                    <TableRow key={device.device_id}>
                      <TableCell className="font-medium">{device.name}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 capitalize">
                          {device.device_type === 'kiosk' ? (
                            <MonitorSmartphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          ) : (
                            <MonitorPlay className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          )}
                          {device.device_type}
                        </span>
                      </TableCell>
                      <TableCell>{seenBadge(device)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {device.token_prefix ? `${device.token_prefix}…` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handlePairingCode(device)}
                            title={device.paired ? 'Re-pair (rotates the token)' : 'Generate pairing code'}
                          >
                            <KeyRound data-icon="inline-start" />
                            {device.paired ? 'Re-pair' : 'Pair'}
                          </Button>
                          {device.device_type === 'signage' ? (
                            <Button variant="outline" size="sm" onClick={() => openPlaylistDialog(device)}>
                              <ListVideo data-icon="inline-start" /> Playlist
                            </Button>
                          ) : null}
                          {device.paired ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setConfirmAction({ device, kind: 'revoke' })}
                            >
                              <ShieldOff data-icon="inline-start" /> Revoke
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Delete ${device.name}`}
                            onClick={() => setConfirmAction({ device, kind: 'delete' })}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add device */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register a device</DialogTitle>
            <DialogDescription>
              Give the terminal a recognizable name, then pair it with a one-time code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="device-name">Name</Label>
              <Input
                id="device-name"
                placeholder="e.g. Lobby kiosk, Counter display"
                value={newName}
                maxLength={80}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as 'kiosk' | 'signage')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kiosk">Kiosk — self-service ordering</SelectItem>
                  <SelectItem value="signage">Signage — display screen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleAdd()} disabled={saving || !newName.trim()}>
              {saving ? 'Saving…' : 'Register'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pairing code */}
      <Dialog
        open={pairingCode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPairingCode(null)
            setCodeDevice(null)
            void load()
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pairing code — {codeDevice?.name}</DialogTitle>
            <DialogDescription>
              On the device, open <span className="font-mono">/{codeDevice?.device_type}</span> and enter
              this code. Single use{codeDevice?.paired ? '; pairing again replaces the old credential' : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="font-mono text-5xl font-bold tracking-[0.3em]">{pairingCode}</div>
            <p className={`text-sm ${codeSecondsLeft === 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {codeSecondsLeft > 0 ? `Expires in ${countdownLabel}` : 'Code expired — generate a new one'}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign playlist (signage) */}
      <Dialog open={playlistDevice !== null} onOpenChange={(open) => !open && setPlaylistDevice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign playlist — {playlistDevice?.name}</DialogTitle>
            <DialogDescription>
              Leave unset to fall back to the tenant&apos;s default playlist (SGN-3).
            </DialogDescription>
          </DialogHeader>
          <Select value={playlistChoice || '__default__'} onValueChange={(v) => setPlaylistChoice(v === '__default__' ? '' : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">Use tenant default</SelectItem>
              {playlists.map((p) => (
                <SelectItem key={p.playlist_id} value={p.playlist_id}>
                  {p.name}
                  {p.is_default ? ' (default)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlaylistDevice(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleAssignPlaylist()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke / delete confirmation */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.kind === 'revoke' ? 'Revoke this device?' : 'Delete this device?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.kind === 'revoke'
                ? `${confirmAction?.device.name} will immediately lose access and return to its pairing screen. You can re-pair it later.`
                : `${confirmAction?.device.name} will be removed permanently. A connected terminal returns to its pairing screen.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleConfirmedAction()}
            >
              {confirmAction?.kind === 'revoke' ? 'Revoke' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
