'use client'

import { useState } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import apiClient from '@/lib/api'
import type { Category } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

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
  const [confirmTarget, setConfirmTarget] = useState<Category | null>(null)

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
      setConfirmTarget(null)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Categories
      </p>

      {categories.map((cat) => {
        const isSelected = selectedId === cat.category_id
        const isEditing = editingId === cat.category_id
        const isDeleting = deletingId === cat.category_id

        return (
          <div
            key={cat.category_id}
            className={cn(
              'group flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition',
              isSelected ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent'
            )}
          >
            {isEditing ? (
              <Input
                autoFocus
                className="h-7 min-w-0 flex-1 px-2 py-0.5 text-sm"
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
                onClick={() => onSelect(cat.category_id)}
              >
                {cat.name}
              </button>
            )}

            <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
              {isEditing ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    title="Save"
                    onClick={() => handleRename(cat)}
                  >
                    <Check />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    title="Cancel"
                    onClick={() => setEditingId(null)}
                  >
                    <X />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    title="Rename"
                    onClick={() => {
                      setEditingId(cat.category_id)
                      setEditName(cat.name)
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 text-destructive hover:text-destructive"
                    title="Delete"
                    onClick={() => setConfirmTarget(cat)}
                    disabled={isDeleting}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
          </div>
        )
      })}

      {/* Add new category */}
      <div className="mt-2 flex gap-2">
        <Input
          className="min-w-0 flex-1"
          placeholder="+ New category"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          disabled={creating}
        />
        <Button type="button" onClick={handleCreate} disabled={!newName.trim() || creating} className="shrink-0">
          Add
        </Button>
      </div>

      <AlertDialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget
                ? `This will permanently delete "${confirmTarget.name}". Items must be moved or deleted first.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingId !== null}
              onClick={() => confirmTarget && handleDelete(confirmTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
