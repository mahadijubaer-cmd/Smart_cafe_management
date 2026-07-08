'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'

interface MenuItem {
  item_id: string
  name: string
  description: string | null
  price: string
  image_url: string | null
  is_available: boolean
  prep_time_mins: number
  category_id: number
}

export default function StaffMenuPage() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    apiClient.get<MenuItem[]>('/menu/items')
      .then((res) => setItems(res.data))
      .catch(() => toast.error('Could not load menu items.'))
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async (item: MenuItem) => {
    setToggling(item.item_id)
    try {
      const res = await apiClient.patch<MenuItem>(`/menu/items/${item.item_id}/toggle`)
      setItems((prev) => prev.map((i) => i.item_id === item.item_id ? res.data : i))
    } catch {
      toast.error('Failed to update item availability.')
    } finally {
      setToggling(null)
    }
  }

  const available = items.filter((i) => i.is_available)
  const unavailable = items.filter((i) => !i.is_available)

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-black">Menu Availability</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Toggle items on or off. Customers cannot order unavailable items.
      </p>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Empty>
          <EmptyMedia variant="icon">
            <XCircle />
          </EmptyMedia>
          <EmptyTitle>No menu items found</EmptyTitle>
          <EmptyDescription>Add menu items to manage their availability here.</EmptyDescription>
        </Empty>
      ) : (
        <>
          {available.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Available
                <Badge variant="secondary">{available.length}</Badge>
              </h2>
              <div className="flex flex-col gap-2">
                {available.map((item) => (
                  <MenuItemRow
                    key={item.item_id}
                    item={item}
                    loading={toggling === item.item_id}
                    onToggle={() => handleToggle(item)}
                  />
                ))}
              </div>
            </section>
          )}

          {unavailable.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <XCircle className="size-4" />
                Unavailable
                <Badge variant="secondary">{unavailable.length}</Badge>
              </h2>
              <div className="flex flex-col gap-2">
                {unavailable.map((item) => (
                  <MenuItemRow
                    key={item.item_id}
                    item={item}
                    loading={toggling === item.item_id}
                    onToggle={() => handleToggle(item)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function MenuItemRow({
  item,
  loading,
  onToggle,
}: {
  item: MenuItem
  loading: boolean
  onToggle: () => void
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image_url} alt={item.name} className="size-10 rounded-lg object-cover" />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-lg">
              🍽
            </div>
          )}
          <div>
            <p className="font-medium">{item.name}</p>
            <p className="text-xs text-muted-foreground">BDT {Number(item.price).toFixed(0)} · {item.prep_time_mins} min</p>
          </div>
        </div>

        <Switch checked={item.is_available} disabled={loading} onCheckedChange={onToggle} />
      </CardContent>
    </Card>
  )
}
