'use client'

import { useEffect, useState } from 'react'
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import apiClient from '@/lib/api'
import CategoryManager from '@/components/admin/CategoryManager'
import MenuItemForm from '@/components/admin/MenuItemForm'
import PageHeader from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import type { Category, MenuItem } from '@/types'

// ─── Menu item row ────────────────────────────────────────────────────────────

function MenuItemRow({
  item,
  onEdit,
  onDelete,
  onToggle,
}: {
  item: MenuItem
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      {/* Thumbnail */}
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">🍽️</div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-bold text-foreground truncate">{item.name}</span>
          <span className="text-sm font-semibold text-primary">৳{Number(item.price).toFixed(0)}</span>
          {item.is_homemade && <Badge variant="secondary">Homemade</Badge>}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {item.prep_time_mins} min
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Availability toggle */}
        <Button
          type="button"
          size="sm"
          variant={item.is_available ? 'secondary' : 'outline'}
          onClick={onToggle}
          title={item.is_available ? 'Mark unavailable' : 'Mark available'}
        >
          {item.is_available ? 'Available' : 'Unavailable'}
        </Button>

        <Button type="button" size="icon" variant="outline" onClick={onEdit} title="Edit">
          <Pencil className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="outline"
          className="text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMenuPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [homemadeEnabled, setHomemadeEnabled] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null)

  // Load categories + tenant settings on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [catsRes, tenantRes] = await Promise.allSettled([
          apiClient.get('/menu/categories'),
          apiClient.get('/tenants/me'),
        ])
        if (catsRes.status === 'fulfilled') {
          const cats = catsRes.value.data as Category[]
          setCategories(cats)
          if (cats.length > 0) setSelectedCategoryId(cats[0].category_id)
        }
        if (tenantRes.status === 'fulfilled') {
          const tenant = tenantRes.value.data as { homemade_enabled?: boolean }
          setHomemadeEnabled(tenant.homemade_enabled ?? false)
        }
      } catch {
        /* ignore */
      }
    }
    load()
  }, [])

  // Load items when category changes
  useEffect(() => {
    if (selectedCategoryId === null) {
      setItems([])
      return
    }
    setLoadingItems(true)
    apiClient
      .get(`/menu/items?category_id=${selectedCategoryId}`)
      .then((res) => setItems(res.data as MenuItem[]))
      .catch(() => setItems([]))
      .finally(() => setLoadingItems(false))
  }, [selectedCategoryId])

  const handleToggle = async (item: MenuItem) => {
    try {
      await apiClient.patch(`/menu/items/${item.item_id}/toggle`)
      setItems((prev) =>
        prev.map((i) =>
          i.item_id === item.item_id ? { ...i, is_available: !i.is_available } : i
        )
      )
    } catch {
      toast.error('Failed to toggle availability')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await apiClient.delete(`/menu/items/${deleteTarget.item_id}`)
      setItems((prev) => prev.filter((i) => i.item_id !== deleteTarget.item_id))
      toast.success(`"${deleteTarget.name}" deleted`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Cannot delete item')
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleFormSave = async () => {
    setShowForm(false)
    setEditingItem(undefined)
    // Reload items for current category
    if (selectedCategoryId !== null) {
      const res = await apiClient.get(`/menu/items?category_id=${selectedCategoryId}`)
      setItems(res.data as MenuItem[])
    }
  }

  const selectedCategory = categories.find((c) => c.category_id === selectedCategoryId)

  return (
    <div className="flex h-full min-h-screen">
      {/* Left: Category panel */}
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card p-4 lg:block">
        <CategoryManager
          categories={categories}
          selectedId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
          onCategoriesChange={(cats) => {
            setCategories(cats)
            if (cats.length > 0 && !cats.find((c) => c.category_id === selectedCategoryId)) {
              setSelectedCategoryId(cats[0]?.category_id ?? null)
            }
          }}
        />
      </aside>

      {/* Main: Item list */}
      <main className="flex-1 space-y-4 p-6">
        <PageHeader
          title={selectedCategory ? selectedCategory.name : 'All Items'}
          description={`${items.length} item${items.length !== 1 ? 's' : ''}`}
          action={
            <Button
              type="button"
              onClick={() => {
                setEditingItem(undefined)
                setShowForm(true)
              }}
            >
              <Plus data-icon="inline-start" />
              Add Item
            </Button>
          }
        />

        {/* Mobile category selector */}
        <div className="lg:hidden">
          <Select
            value={selectedCategoryId !== null ? String(selectedCategoryId) : undefined}
            onValueChange={(value) => setSelectedCategoryId(Number(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.category_id} value={String(c.category_id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Items */}
        {loadingItems ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Empty className="border border-dashed border-border py-16">
            <EmptyMedia variant="icon">
              <Plus />
            </EmptyMedia>
            <EmptyTitle>No items in this category yet.</EmptyTitle>
            <EmptyDescription>
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setEditingItem(undefined)
                  setShowForm(true)
                }}
              >
                + Add the first item
              </Button>
            </EmptyDescription>
          </Empty>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <MenuItemRow
                key={item.item_id}
                item={item}
                onEdit={() => {
                  setEditingItem(item)
                  setShowForm(true)
                }}
                onDelete={() => setDeleteTarget(item)}
                onToggle={() => handleToggle(item)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Form modal */}
      {showForm && (
        <MenuItemForm
          item={editingItem}
          categories={categories}
          homemadeEnabled={homemadeEnabled}
          onSave={handleFormSave}
          onClose={() => {
            setShowForm(false)
            setEditingItem(undefined)
          }}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleteTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The item will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
