'use client'

import { useEffect, useMemo, useState } from 'react'

import apiClient from '@/lib/api'

type TimeSlotPickerProps = {
  selectedSlot: Date | null
  onSelect: (slot: Date) => void
}

function formatTime(slot: Date) {
  return slot.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function toIsoMinuteKey(slot: Date) {
  const clone = new Date(slot)
  clone.setSeconds(0, 0)
  return clone.toISOString()
}

export default function TimeSlotPicker({ selectedSlot, onSelect }: TimeSlotPickerProps) {
  const [unavailableSlots, setUnavailableSlots] = useState<string[]>([])

  useEffect(() => {
    let mounted = true

    const loadSlots = async () => {
      try {
        const response = await apiClient.get('/tables/reserved-slots')
        if (!mounted) return

        const slots = Array.isArray(response.data) ? response.data : response.data?.slots || []
        setUnavailableSlots(slots.map((slot: string) => new Date(slot).toISOString()))
      } catch {
        if (mounted) {
          setUnavailableSlots([])
        }
      }
    }

    loadSlots()

    return () => {
      mounted = false
    }
  }, [])

  const slots = useMemo(() => {
    const result: Date[] = []
    const start = new Date()
    start.setHours(8, 0, 0, 0)
    const end = new Date()
    end.setHours(21, 0, 0, 0)

    for (let current = new Date(start); current <= end; current = new Date(current.getTime() + 30 * 60 * 1000)) {
      result.push(new Date(current))
    }

    return result
  }, [])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {slots.map((slot) => {
          const isoKey = toIsoMinuteKey(slot)
          const isUnavailable = unavailableSlots.includes(isoKey)
          const isSelected = selectedSlot ? toIsoMinuteKey(selectedSlot) === isoKey : false

          return (
            <button
              key={isoKey}
              type="button"
              disabled={isUnavailable}
              onClick={() => !isUnavailable && onSelect(slot)}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                isUnavailable
                  ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                  : isSelected
                    ? 'bg-[#1A4D2E] text-white shadow-lg shadow-[#1A4D2E]/20'
                    : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {formatTime(slot)}
            </button>
          )
        })}
      </div>
    </div>
  )
}