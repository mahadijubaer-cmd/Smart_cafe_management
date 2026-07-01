'use client'

import { useState } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import apiClient from '@/lib/api'
import type { Category } from '@/types'

interface CategoryManagerProps {
  categories: Category[]
  selectedId: number | null
  onSelect: (id: number) => void
  onCategoriesChange: (cats: Category[]) => void
}

export default function CategoryManager({
  categories,
  selectedId,
  onSelect,
  onCategoriesChange,
}: CategoryManagerProps) {
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      const res = await apiClient.post(`/menu/categories?name=${encodeURIComponent(name)}&display_order=${categories.length}`)
      const created = res.data as Category
      onCategoriesChange([...categories, created])
      setNewName('')
      toast.success(`Category "${created.name}" created`)
    } catch {
      toast.error('Failed to create category')
    } finally {
      setCreating(false)
    }
  }

  const handleRename = async (cat: Category) => {
    const name = editName.trim()
    if (!name || name === cat.name) {
      setEditingId(null)
      return
    }
    try {
      const res = await apiClient.put(
        `/menu/categories/${cat.category_id}?name=${encodeURIComponent(name)}&display_order=${cat.display_order}`
      )
      const updated = res.data as Category
      onCategoriesChange(categories.map((c) => (c.category_id === cat.category_id ? updated : c)))
      toast.success('Category renamed')
    } catch {
      toast.error('Failed to rename category')
    } finally {
      setEditingId(null)
    }
  }

  const handleDelete = async (cat: Category) => {
    if (confirmDeleteId !== cat.category_id) {
      setConfirmDeleteId(cat.category_id)
      return
    }
    setDeletingId(cat.category_id)
    try {
      await apiClient.delete(`/menu/categories/${cat.category_id}`)
      const next = categories.filter((c) => c.category_id !== cat.category_id)
      onCategoriesChange(next)
      if (selectedId === cat.category_id) onSelect(next[0]?.category_id ?? -1)
      toast.success(`Category "${cat.name}" deleted`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Cannot delete — move or delete items first')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Categories
      </p>

      {categories.map((cat) => {
        const isSelected = selectedId === cat.category_id
        const isEditing = editingId === cat.category_id
        const isDeleting = deletingId === cat.category_id
        const awaitingConfirm = confirmDeleteId === cat.category_id

        return (
          <div
            key={cat.category_id}
            className={[
              'group flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition',
              isSelected ? 'bg-primary text-white' : 'text-slate-700 hover:bg-slate-100',
            ].join(' ')}
          >
            {isEditing ? (
              <input
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-0.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(cat)
                  if (e.key === 'Escape') setEditingId(null)
                }}
              />
            ) : (
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left font-medium"
                onClick={() => {
                  setConfirmDeleteId(null)
                  onSelect(cat.category_id)
                }}
              >
                {cat.name}
              </button>
            )}

            <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    title="Save"
                    onClick={() => handleRename(cat)}
                    className="rounded p-0.5 hover:bg-black/10"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Cancel"
                    onClick={() => setEditingId(null)}
                    className="rounded p-0.5 hover:bg-black/10"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    title="Rename"
                    onClick={() => {
                      setEditingId(cat.category_id)
                      setEditName(cat.name)
                    }}
                    className="rounded p-0.5 hover:bg-black/10"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title={awaitingConfirm ? 'Confirm delete' : 'Delete'}
                    onClick={() => handleDelete(cat)}
                    disabled={isDeleting}
                    className={[
                      'rounded p-0.5 transition',
                      awaitingConfirm
                        ? 'text-red-600 hover:bg-red-100'
                        : 'hover:bg-black/10',
                    ].join(' ')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}

      {/* Add new category */}
      <div className="mt-2 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="+ New category"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          disabled={creating}
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={!newName.trim() || creating}
          className="shrink-0 rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  )
}
