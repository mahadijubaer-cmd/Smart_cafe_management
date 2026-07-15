'use client'

/**
 * Signage playlist editor (RFC-010, Phase 25.5 — specs/modules/signage.md SGN-5/6).
 * Slide edits are held as unsaved draft state and fed straight into the real
 * `SignageRenderer` in the preview pane; "Save changes" diffs the draft against
 * the last-loaded playlist and issues the create/patch/delete/reorder calls.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Maximize2, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import PageHeader from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import SignageRenderer, {
  type BoardOrder,
  type SignageSlideShape,
  type TrendingItem,
} from '@/components/signage/SignageRenderer'
import type { KioskMenu } from '@/components/kiosk/KioskApp'
import apiClient from '@/lib/api'
import { useTenantInfo } from '@/hooks/useTenantInfo'

interface Playlist {
  playlist_id: string
  name: string
  is_default: boolean
  is_active: boolean
  slides: SignageSlideShape[]
}

interface Category {
  category_id: number
  name: string
}

const SLIDE_TYPE_LABELS: Record<string, string> = {
  menu_board: 'Menu board',
  promo_image: 'Promo image',
  announcement: 'Announcement',
  order_status_board: 'Order status board',
  trending_items: 'Trending items',
  offers: 'Offers',
}

let tempCounter = 0
function tempId() {
  tempCounter += 1
  return `temp-${Date.now()}-${tempCounter}`
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(local: string): string | null {
  return local ? new Date(local).toISOString() : null
}

export default function SignageEditorPage() {
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug
  const { tenant } = useTenantInfo(slug)

  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftSlides, setDraftSlides] = useState<SignageSlideShape[]>([])
  const [originalIds, setOriginalIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [deletePlaylistConfirm, setDeletePlaylistConfirm] = useState<Playlist | null>(null)

  const [slideDialog, setSlideDialog] = useState<SignageSlideShape | null>(null)
  const [categories, setCategories] = useState<Category[]>([])

  const [previewMenu, setPreviewMenu] = useState<KioskMenu | null>(null)
  const [previewBoard, setPreviewBoard] = useState<BoardOrder[]>([])
  const [previewTrending, setPreviewTrending] = useState<TrendingItem[]>([])

  const selected = playlists.find((p) => p.playlist_id === selectedId) ?? null

  const applyDraft = useCallback((playlist: Playlist) => {
    const sorted = [...playlist.slides].sort((a, b) => a.position - b.position)
    setDraftSlides(sorted)
    setOriginalIds(new Set(sorted.map((s) => s.slide_id)))
    setDirty(false)
  }, [])

  const loadPlaylists = useCallback(
    async (keepSelection = true) => {
      try {
        const res = await apiClient.get('/signage/playlists')
        const list = res.data as Playlist[]
        setPlaylists(list)
        const keep = keepSelection ? list.find((p) => p.playlist_id === selectedId) : undefined
        const next = keep ?? list[0] ?? null
        setSelectedId(next?.playlist_id ?? null)
        if (next) applyDraft(next)
      } catch {
        /* toast handled by interceptor */
      } finally {
        setLoading(false)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [applyDraft],
  )

  useEffect(() => {
    void loadPlaylists(false)
    apiClient
      .get('/menu/categories')
      .then((res) => setCategories(res.data as Category[]))
      .catch(() => undefined)
    apiClient
      .get('/signage/preview/menu')
      .then((res) => setPreviewMenu(res.data as KioskMenu))
      .catch(() => undefined)
    apiClient
      .get('/signage/preview/trending')
      .then((res) => setPreviewTrending((res.data as { items: TrendingItem[] }).items))
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadBoard = useCallback(async () => {
    try {
      const res = await apiClient.get('/signage/preview/board')
      setPreviewBoard((res.data as { orders: BoardOrder[] }).orders)
    } catch {
      /* stale board until next poll */
    }
  }, [])

  useEffect(() => {
    void loadBoard()
    const interval = setInterval(() => void loadBoard(), 15_000)
    return () => clearInterval(interval)
  }, [loadBoard])

  const selectPlaylist = (id: string) => {
    const p = playlists.find((pl) => pl.playlist_id === id)
    if (p) {
      setSelectedId(id)
      applyDraft(p)
    }
  }

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return
    try {
      const res = await apiClient.post('/signage/playlists', { name: newPlaylistName.trim() })
      toast.success('Playlist created')
      setNewPlaylistOpen(false)
      setNewPlaylistName('')
      await loadPlaylists(false)
      setSelectedId(res.data.playlist_id as string)
    } catch {
      /* toast handled by interceptor */
    }
  }

  const handleSetDefault = async (playlist: Playlist) => {
    try {
      await apiClient.patch(`/signage/playlists/${playlist.playlist_id}`, { is_default: true })
      toast.success(`${playlist.name} is now the default display`)
      await loadPlaylists()
    } catch {
      /* toast handled by interceptor */
    }
  }

  const handleDeletePlaylist = async () => {
    if (!deletePlaylistConfirm) return
    try {
      await apiClient.delete(`/signage/playlists/${deletePlaylistConfirm.playlist_id}`)
      toast.success('Playlist deleted')
      setSelectedId(null)
      await loadPlaylists(false)
    } catch {
      /* toast handled by interceptor */
    } finally {
      setDeletePlaylistConfirm(null)
    }
  }

  const moveSlide = (index: number, dir: -1 | 1) => {
    setDraftSlides((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next.map((s, i) => ({ ...s, position: i }))
    })
    setDirty(true)
  }

  const removeSlide = (id: string) => {
    setDraftSlides((prev) => prev.filter((s) => s.slide_id !== id).map((s, i) => ({ ...s, position: i })))
    setDirty(true)
  }

  const upsertSlide = (slide: SignageSlideShape) => {
    setDraftSlides((prev) => {
      const exists = prev.some((s) => s.slide_id === slide.slide_id)
      const next = exists ? prev.map((s) => (s.slide_id === slide.slide_id ? slide : s)) : [...prev, slide]
      return next.map((s, i) => ({ ...s, position: i }))
    })
    setDirty(true)
    setSlideDialog(null)
  }

  const handleSaveDraft = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const currentIds = new Set(draftSlides.map((s) => s.slide_id))
      const removed = [...originalIds].filter((id) => !currentIds.has(id))
      await Promise.all(removed.map((id) => apiClient.delete(`/signage/slides/${id}`)))

      const finalOrderIds: string[] = []
      for (const slide of draftSlides) {
        const payload = {
          slide_type: slide.slide_type,
          config: slide.config,
          duration_seconds: slide.duration_seconds,
          active_from: slide.active_from,
          active_until: slide.active_until,
          is_active: slide.is_active,
        }
        if (slide.slide_id.startsWith('temp-')) {
          const res = await apiClient.post(`/signage/playlists/${selected.playlist_id}/slides`, payload)
          finalOrderIds.push(res.data.slide_id as string)
        } else {
          await apiClient.patch(`/signage/slides/${slide.slide_id}`, payload)
          finalOrderIds.push(slide.slide_id)
        }
      }

      if (finalOrderIds.length > 0) {
        await apiClient.put(`/signage/playlists/${selected.playlist_id}/slides/reorder`, {
          slide_ids: finalOrderIds,
        })
      }

      toast.success('Playlist saved — paired displays refresh automatically')
      await loadPlaylists()
    } catch {
      /* toast handled by interceptor */
    } finally {
      setSaving(false)
    }
  }

  const previewLabel = dirty ? 'Live preview (unsaved changes)' : 'Live preview'

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Signage"
        description="Build playlists of menu boards, promos, order status, trending items, and offers"
        action={
          <Button onClick={() => setNewPlaylistOpen(true)}>
            <Plus data-icon="inline-start" /> New playlist
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)_480px]">
        {/* Playlist list */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Playlists</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {playlists.map((p) => (
              <button
                key={p.playlist_id}
                onClick={() => selectPlaylist(p.playlist_id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm ${
                  p.playlist_id === selectedId ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                <span className="truncate">{p.name}</span>
                {p.is_default ? <Star className="h-3.5 w-3.5 shrink-0" aria-label="Default" /> : null}
              </button>
            ))}
            {playlists.length === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">No playlists yet.</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Slide editor */}
        <div className="space-y-4">
          {selected ? (
            <>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{selected.name}</h2>
                    {selected.is_default ? <Badge variant="outline">Default display</Badge> : null}
                  </div>
                  <div className="flex gap-2">
                    {!selected.is_default ? (
                      <Button variant="outline" size="sm" onClick={() => void handleSetDefault(selected)}>
                        Set as default
                      </Button>
                    ) : null}
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/${slug}/signage-preview/${selected.playlist_id}`} target="_blank">
                        <Maximize2 data-icon="inline-start" /> Full-screen
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeletePlaylistConfirm(selected)}
                    >
                      <Trash2 data-icon="inline-start" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {draftSlides.map((slide, index) => (
                  <Card key={slide.slide_id}>
                    <CardContent className="flex items-center justify-between gap-3 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            disabled={index === 0}
                            onClick={() => moveSlide(index, -1)}
                            aria-label="Move up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            disabled={index === draftSlides.length - 1}
                            onClick={() => moveSlide(index, 1)}
                            aria-label="Move down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {SLIDE_TYPE_LABELS[slide.slide_type] ?? slide.slide_type}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {slide.duration_seconds}s
                            {!slide.is_active ? ' · inactive' : ''}
                            {slide.active_from || slide.active_until ? ' · scheduled' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setSlideDialog(slide)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeSlide(slide.slide_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    setSlideDialog({
                      slide_id: tempId(),
                      slide_type: 'menu_board',
                      position: draftSlides.length,
                      duration_seconds: 10,
                      config: {},
                      active_from: null,
                      active_until: null,
                      is_active: true,
                    })
                  }
                >
                  <Plus data-icon="inline-start" /> Add slide
                </Button>
              </div>

              <Button onClick={() => void handleSaveDraft()} disabled={saving || !dirty}>
                {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Create a playlist to get started.</p>
          )}
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm">{previewLabel}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="aspect-video w-full overflow-hidden border-t bg-background">
                <SignageRenderer
                  slides={draftSlides}
                  menu={previewMenu}
                  boardOrders={previewBoard}
                  trending={previewTrending}
                  tenantName={tenant?.name ?? slug}
                  lang="en"
                  online
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* New playlist */}
      <Dialog open={newPlaylistOpen} onOpenChange={setNewPlaylistOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="playlist-name">Name</Label>
            <Input
              id="playlist-name"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="e.g. Lobby display"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPlaylistOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreatePlaylist()} disabled={!newPlaylistName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete playlist confirm */}
      <AlertDialog open={deletePlaylistConfirm !== null} onOpenChange={(open) => !open && setDeletePlaylistConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this playlist?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletePlaylistConfirm?.name} and all its slides will be removed. Displays assigned to it fall back to
              the tenant default.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDeletePlaylist()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Slide editor dialog */}
      {slideDialog ? (
        <SlideDialog
          slide={slideDialog}
          categories={categories}
          onCancel={() => setSlideDialog(null)}
          onSave={upsertSlide}
        />
      ) : null}
    </div>
  )
}

// ── Slide editor dialog ───────────────────────────────────────────────────────

function SlideDialog({
  slide,
  categories,
  onCancel,
  onSave,
}: {
  slide: SignageSlideShape
  categories: Category[]
  onCancel: () => void
  onSave: (slide: SignageSlideShape) => void
}) {
  const [draft, setDraft] = useState<SignageSlideShape>(slide)

  const setConfig = (patch: Record<string, unknown>) =>
    setDraft((d) => ({ ...d, config: { ...d.config, ...patch } }))

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{slide.slide_id.startsWith('temp-') ? 'Add slide' : 'Edit slide'}</DialogTitle>
          <DialogDescription>Changes appear in the live preview immediately; save the playlist to publish.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Slide type</Label>
            <Select
              value={draft.slide_type}
              onValueChange={(v) => setDraft((d) => ({ ...d, slide_type: v as SignageSlideShape['slide_type'], config: {} }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SLIDE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <SlideConfigFields
            slideType={draft.slide_type}
            config={draft.config}
            categories={categories}
            setConfig={setConfig}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (seconds)</Label>
              <Input
                id="duration"
                type="number"
                min={5}
                max={120}
                value={draft.duration_seconds}
                onChange={(e) => setDraft((d) => ({ ...d, duration_seconds: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-end justify-between pb-1">
              <Label htmlFor="slide-active">Active</Label>
              <Switch
                id="slide-active"
                checked={draft.is_active}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, is_active: v }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="active-from">Show from (optional)</Label>
              <Input
                id="active-from"
                type="datetime-local"
                value={toLocalInput(draft.active_from)}
                onChange={(e) => setDraft((d) => ({ ...d, active_from: fromLocalInput(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="active-until">Show until (optional)</Label>
              <Input
                id="active-until"
                type="datetime-local"
                value={toLocalInput(draft.active_until)}
                onChange={(e) => setDraft((d) => ({ ...d, active_until: fromLocalInput(e.target.value) }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)}>Use in preview</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SlideConfigFields({
  slideType,
  config,
  categories,
  setConfig,
}: {
  slideType: string
  config: Record<string, unknown>
  categories: Category[]
  setConfig: (patch: Record<string, unknown>) => void
}) {
  switch (slideType) {
    case 'menu_board': {
      const selectedCats = (config.category_ids as number[] | undefined) ?? []
      return (
        <div className="space-y-2">
          <Label>Categories (none = show all)</Label>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
            {categories.map((c) => (
              <label key={c.category_id} className="flex items-center gap-2 px-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={selectedCats.includes(c.category_id)}
                  onChange={() => {
                    const set = new Set(selectedCats)
                    if (set.has(c.category_id)) set.delete(c.category_id)
                    else set.add(c.category_id)
                    setConfig({ category_ids: [...set] })
                  }}
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      )
    }
    case 'promo_image':
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Image URL</Label>
            <Input
              value={(config.image_url as string) ?? ''}
              onChange={(e) => setConfig({ image_url: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Headline (EN)</Label>
              <Input
                value={(config.headline_en as string) ?? ''}
                onChange={(e) => setConfig({ headline_en: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Headline (BN)</Label>
              <Input
                value={(config.headline_bn as string) ?? ''}
                onChange={(e) => setConfig({ headline_bn: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Caption</Label>
            <Input value={(config.caption as string) ?? ''} onChange={(e) => setConfig({ caption: e.target.value })} />
          </div>
        </div>
      )
    case 'announcement':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Title (EN)</Label>
              <Input value={(config.title_en as string) ?? ''} onChange={(e) => setConfig({ title_en: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Title (BN)</Label>
              <Input value={(config.title_bn as string) ?? ''} onChange={(e) => setConfig({ title_bn: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Body (EN)</Label>
              <Textarea rows={3} value={(config.body_en as string) ?? ''} onChange={(e) => setConfig({ body_en: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Body (BN)</Label>
              <Textarea rows={3} value={(config.body_bn as string) ?? ''} onChange={(e) => setConfig({ body_bn: e.target.value })} />
            </div>
          </div>
        </div>
      )
    case 'order_status_board':
      return <p className="text-sm text-muted-foreground">Shows live Preparing/Ready pickup numbers — no configuration needed.</p>
    case 'trending_items':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Title (EN)</Label>
              <Input value={(config.title_en as string) ?? ''} onChange={(e) => setConfig({ title_en: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Title (BN)</Label>
              <Input value={(config.title_bn as string) ?? ''} onChange={(e) => setConfig({ title_bn: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Window (days)</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={(config.window_days as number) ?? 7}
                onChange={(e) => setConfig({ window_days: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Item count</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={(config.limit as number) ?? 5}
                onChange={(e) => setConfig({ limit: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
      )
    case 'offers': {
      const offers = (config.offers as Array<Record<string, unknown>> | undefined) ?? []
      const update = (i: number, patch: Record<string, unknown>) => {
        const next = offers.map((o, idx) => (idx === i ? { ...o, ...patch } : o))
        setConfig({ offers: next })
      }
      return (
        <div className="space-y-3">
          {offers.map((offer, i) => (
            <Card key={i}>
              <CardContent className="space-y-2 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Title (EN)"
                    value={(offer.title_en as string) ?? ''}
                    onChange={(e) => update(i, { title_en: e.target.value })}
                  />
                  <Input
                    placeholder="Title (BN)"
                    value={(offer.title_bn as string) ?? ''}
                    onChange={(e) => update(i, { title_bn: e.target.value })}
                  />
                </div>
                <Input
                  placeholder="Subtitle"
                  value={(offer.subtitle as string) ?? ''}
                  onChange={(e) => update(i, { subtitle: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Price text, e.g. ৳250"
                    value={(offer.price_text as string) ?? ''}
                    onChange={(e) => update(i, { price_text: e.target.value })}
                  />
                  <Input
                    placeholder="Image URL"
                    value={(offer.image_url as string) ?? ''}
                    onChange={(e) => update(i, { image_url: e.target.value })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfig({ offers: offers.filter((_, idx) => idx !== i) })}
                >
                  <Trash2 data-icon="inline-start" /> Remove offer
                </Button>
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" size="sm" onClick={() => setConfig({ offers: [...offers, { title_en: '' }] })}>
            <Plus data-icon="inline-start" /> Add offer
          </Button>
        </div>
      )
    }
    default:
      return null
  }
}
