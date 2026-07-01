'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Upload, X } from 'lucide-react'
import toast from 'react-hot-toast'
import apiClient from '@/lib/api'
import type { Category, MenuItem } from '@/types'

interface MenuItemFormProps {
  item?: MenuItem
  categories: Category[]
  homemadeEnabled: boolean
  onSave: () => void
  onClose: () => void
}

export default function MenuItemForm({
  item,
  categories,
  homemadeEnabled,
  onSave,
  onClose,
}: MenuItemFormProps) {
  const isEdit = !!item

  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [price, setPrice] = useState(item ? String(item.price) : '')
  const [prepTime, setPrepTime] = useState(item?.prep_time_mins ?? 10)
  const [categoryId, setCategoryId] = useState<number>(
    item?.category_id ?? categories[0]?.category_id ?? 0
  )
  const [isAvailable, setIsAvailable] = useState(item?.is_available ?? true)
  const [isHomemade, setIsHomemade] = useState(item?.is_homemade ?? false)
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? '')
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [pendingImagePreview, setPendingImagePreview] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [recipeOpen, setRecipeOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!pendingImage) {
      setPendingImagePreview('')
      return
    }
    const url = URL.createObjectURL(pendingImage)
    setPendingImagePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingImage])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Only PNG, JPEG, and WebP images are supported')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be ≤ 5 MB')
      return
    }
    setPendingImage(file)
  }

  const uploadImage = async (itemId: string): Promise<string | null> => {
    if (!pendingImage) return null
    const formData = new FormData()
    formData.append('image', pendingImage)
    const res = await apiClient.post(`/menu/items/${itemId}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return (res.data as { image_url: string }).image_url
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !price || !categoryId) {
      toast.error('Name, price, and category are required')
      return
    }
    setSaving(true)
    try {
      let savedItemId: string

      if (isEdit && item) {
        await apiClient.patch(`/menu/items/${item.item_id}`, {
          name: name.trim(),
          description: description.trim() || null,
          price: Number(price),
          prep_time_mins: prepTime,
          category_id: categoryId,
          is_available: isAvailable,
          is_homemade: isHomemade,
        })
        savedItemId = item.item_id
      } else {
        const res = await apiClient.post('/menu/items', {
          name: name.trim(),
          description: description.trim() || null,
          price: Number(price),
          prep_time_mins: prepTime,
          category_id: categoryId,
          is_available: isAvailable,
          is_homemade: isHomemade,
        })
        savedItemId = (res.data as MenuItem).item_id
      }

      // Upload image after item exists
      if (pendingImage) {
        await uploadImage(savedItemId)
      }

      toast.success(isEdit ? 'Item updated' : 'Item created')
      onSave()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Failed to save item')
    } finally {
      setSaving(false)
    }
  }

  const displayImage = pendingImagePreview || imageUrl

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">
            {isEdit ? `Edit: ${item?.name}` : 'Add Menu Item'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="space-y-4 p-5">
            {/* Image */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Image</label>
              <div className="flex items-center gap-3">
                {displayImage ? (
                  <img
                    src={displayImage}
                    alt="Preview"
                    className="h-16 w-16 rounded-xl object-cover border border-slate-200"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-slate-400">
                    <Upload className="h-5 w-5" />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {displayImage ? 'Replace Image' : 'Upload Image'}
                  </button>
                  {displayImage && (
                    <button
                      type="button"
                      onClick={() => {
                        setPendingImage(null)
                        setImageUrl('')
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleImageSelect}
                />
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Name *</label>
              <input
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Chicken Biryani"
              />
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Description</label>
              <textarea
                rows={2}
                className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>

            {/* Price + Prep time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Price (৳) *</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Prep Time (min)</label>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  value={prepTime}
                  onChange={(e) => setPrepTime(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Category *</label>
              <select
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Toggles */}
            <div className="flex gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isAvailable}
                  onChange={(e) => setIsAvailable(e.target.checked)}
                  className="accent-primary h-4 w-4"
                />
                <span className="font-medium text-slate-700">Available</span>
              </label>
              {homemadeEnabled && (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isHomemade}
                    onChange={(e) => setIsHomemade(e.target.checked)}
                    className="accent-primary h-4 w-4"
                  />
                  <span className="font-medium text-slate-700">Homemade</span>
                </label>
              )}
            </div>

            {/* Recipe (collapsible placeholder) */}
            <div className="rounded-xl border border-slate-100 bg-slate-50">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-600"
                onClick={() => setRecipeOpen((o) => !o)}
              >
                <span>Recipe / Ingredients</span>
                {recipeOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {recipeOpen && (
                <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                  Recipe linking is available after the item is saved. Edit the item to manage ingredients.
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t border-slate-200 px-5 py-4">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Item'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
