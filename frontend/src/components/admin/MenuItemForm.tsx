'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Upload } from 'lucide-react'
import { toast } from 'sonner'
import apiClient from '@/lib/api'
import type { Category, MenuItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Field, FieldGroup, FieldLabel, FieldContent } from '@/components/ui/field'

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{isEdit ? `Edit: ${item?.name}` : 'Add Menu Item'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <FieldGroup className="gap-4 p-5">
            {/* Image */}
            <Field>
              <FieldLabel>Image</FieldLabel>
              <div className="flex items-center gap-3">
                {displayImage ? (
                  <img
                    src={displayImage}
                    alt="Preview"
                    className="size-16 rounded-xl border object-cover"
                  />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-xl border-2 border-dashed text-muted-foreground">
                    <Upload />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {displayImage ? 'Replace Image' : 'Upload Image'}
                  </Button>
                  {displayImage && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto justify-start p-0 text-destructive"
                      onClick={() => {
                        setPendingImage(null)
                        setImageUrl('')
                      }}
                    >
                      Remove
                    </Button>
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
            </Field>

            {/* Name */}
            <Field data-invalid={!name.trim()}>
              <FieldLabel>Name *</FieldLabel>
              <Input
                required
                aria-invalid={!name.trim()}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Chicken Biryani"
              />
            </Field>

            {/* Description */}
            <Field>
              <FieldLabel>Description</FieldLabel>
              <Textarea
                rows={2}
                className="resize-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </Field>

            {/* Price + Prep time */}
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!price}>
                <FieldLabel>Price (৳) *</FieldLabel>
                <Input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  aria-invalid={!price}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>Prep Time (min)</FieldLabel>
                <Input
                  type="number"
                  min="0"
                  value={prepTime}
                  onChange={(e) => setPrepTime(Number(e.target.value))}
                />
              </Field>
            </div>

            {/* Category */}
            <Field data-invalid={!categoryId}>
              <FieldLabel>Category *</FieldLabel>
              <Select
                value={categoryId ? String(categoryId) : ''}
                onValueChange={(v) => setCategoryId(Number(v))}
              >
                <SelectTrigger aria-invalid={!categoryId}>
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
            </Field>

            {/* Toggles */}
            <div className="flex gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={isAvailable} onCheckedChange={(c) => setIsAvailable(!!c)} />
                <span className="font-medium">Available</span>
              </label>
              {homemadeEnabled && (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={isHomemade} onCheckedChange={(c) => setIsHomemade(!!c)} />
                  <span className="font-medium">Homemade</span>
                </label>
              )}
            </div>

            {/* Recipe (collapsible placeholder) */}
            <div className="rounded-xl border bg-muted/50">
              <Button
                type="button"
                variant="ghost"
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground"
                onClick={() => setRecipeOpen((o) => !o)}
              >
                <span>Recipe / Ingredients</span>
                {recipeOpen ? <ChevronUp /> : <ChevronDown />}
              </Button>
              {recipeOpen && (
                <FieldContent className="border-t px-4 py-3 text-xs text-muted-foreground">
                  Recipe linking is available after the item is saved. Edit the item to manage ingredients.
                </FieldContent>
              )}
            </div>
          </FieldGroup>

          <DialogFooter className="border-t px-5 py-4 sm:justify-start">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Item'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
