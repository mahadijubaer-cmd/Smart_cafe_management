'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

import apiClient from '@/lib/api'

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

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Loading menu…</div>
  }

  const available = items.filter((i) => i.is_available)
  const unavailable = items.filter((i) => !i.is_available)

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-black text-slate-900">Menu Availability</h1>
      <p className="mb-8 text-sm text-slate-500">
        Toggle items on or off. Customers cannot order unavailable items.
      </p>

      {items.length === 0 && (
        <p className="text-sm text-slate-500">No menu items found.</p>
      )}

      {available.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Available ({available.length})
          </h2>
          <div className="space-y-2">
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
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <XCircle className="h-4 w-4" />
            Unavailable ({unavailable.length})
          </h2>
          <div className="space-y-2">
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
    <div className="flex items-center justify-between rounded-xl border border-black/8 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.name} className="h-10 w-10 rounded-lg object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-lg">
            🍽
          </div>
        )}
        <div>
          <p className="font-medium text-slate-800">{item.name}</p>
          <p className="text-xs text-slate-500">BDT {Number(item.price).toFixed(0)} · {item.prep_time_mins} min</p>
        </div>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={onToggle}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:opacity-50',
          item.is_available ? 'bg-primary' : 'bg-slate-300',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
            item.is_available ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  )
}
