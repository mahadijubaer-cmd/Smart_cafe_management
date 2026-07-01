'use client'

import { useEffect, useState } from 'react'
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import apiClient from '@/lib/api'
import CategoryManager from '@/components/admin/CategoryManager'
import MenuItemForm from '@/components/admin/MenuItemForm'
import type { Category, MenuItem } from '@/types'

// ─── Alert Dialog (inline — no shadcn) ───────────────────────────────────────

function AlertDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: string
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

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
    <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      {/* Thumbnail */}
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
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
          <span className="font-bold text-slate-900 truncate">{item.name}</span>
          <span className="text-sm font-semibold text-primary">৳{Number(item.price).toFixed(0)}</span>
          {item.is_homemade && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Homemade
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {item.prep_time_mins} min
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Availability toggle */}
        <button
          type="button"
          onClick={onToggle}
          title={item.is_available ? 'Mark unavailable' : 'Mark available'}
          className={[
            'rounded-full px-3 py-1 text-xs font-semibold transition',
            item.is_available
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
          ].join(' ')}
        >
          {item.is_available ? 'Available' : 'Unavailable'}
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="rounded-xl border border-red-100 p-2 text-red-500 hover:bg-red-50"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
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
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 lg:block">
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
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {selectedCategory ? selectedCategory.name : 'All Items'}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {items.length} item{items.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingItem(undefined)
              setShowForm(true)
            }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Add Item
          </button>
        </div>

        {/* Mobile category selector */}
        <div className="lg:hidden">
          <select
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none"
            value={selectedCategoryId ?? ''}
            onChange={(e) => setSelectedCategoryId(Number(e.target.value))}
          >
            {categories.map((c) => (
              <option key={c.category_id} value={c.category_id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Items */}
        {loadingItems ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center">
            <p className="text-slate-400 text-sm">No items in this category yet.</p>
            <button
              type="button"
              onClick={() => {
                setEditingItem(undefined)
                setShowForm(true)
              }}
              className="mt-3 text-sm font-semibold text-primary hover:underline"
            >
              + Add the first item
            </button>
          </div>
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
      <AlertDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This cannot be undone. The item will be permanently removed."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
