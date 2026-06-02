'use client'

import { useEffect, useMemo, useState } from 'react'

import apiClient from '@/lib/api'

type TimeSlotPickerProps = {
  selectedSlot: Date | null
  onSelect: (slot: Date) => void
  date?: Date
}

function formatTime(slot: Date) {
  return slot.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function toIsoMinuteKey(slot: Date) {
  const clone = new Date(slot)
  clone.setSeconds(0, 0)
  return clone.toISOString()
}

function sameCalendarDay(left: Date, right: Date) {
  return left.toDateString() === right.toDateString()
}

export default function TimeSlotPicker({ selectedSlot, onSelect, date }: TimeSlotPickerProps) {
  const [unavailableSlots, setUnavailableSlots] = useState<string[]>([])
  const selectedDate = useMemo(() => date ?? new Date(), [date])

  useEffect(() => {
    let mounted = true

    const loadSlots = async () => {
      try {
        const response = await apiClient.get('/tables/reserved-slots', {
          params: {
            date: selectedDate.toISOString(),
          },
        })
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
  }, [selectedDate])

  const slots = useMemo(() => {
    const result: Date[] = []
    const start = new Date(selectedDate)
    start.setHours(8, 0, 0, 0)
    const end = new Date(selectedDate)
    end.setHours(21, 0, 0, 0)

    for (let current = new Date(start); current <= end; current = new Date(current.getTime() + 30 * 60 * 1000)) {
      result.push(new Date(current))
    }

    return result
  }, [selectedDate])

  const now = new Date()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <div>
          <p className="font-semibold text-slate-900">
            {sameCalendarDay(selectedDate, new Date()) ? 'Today' : selectedDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
          <p className="text-xs text-slate-500">Available slots from 8:00 AM to 9:00 PM in 30-minute intervals.</p>
        </div>
        <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#1A4D2E]">
          {unavailableSlots.length} reserved
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {slots.map((slot) => {
          const isoKey = toIsoMinuteKey(slot)
          const isUnavailable = unavailableSlots.includes(isoKey)
          const isSelected = selectedSlot ? toIsoMinuteKey(selectedSlot) === isoKey : false
          const isPast = sameCalendarDay(slot, now) && slot.getTime() < now.getTime() - 5 * 60 * 1000

          return (
            <button
              key={isoKey}
              type="button"
              disabled={isUnavailable || isPast}
              onClick={() => !isUnavailable && !isPast && onSelect(slot)}
              className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                isUnavailable || isPast
                  ? 'cursor-not-allowed border-black/5 bg-slate-100 text-slate-400'
                  : isSelected
                    ? 'border-[#1A4D2E] bg-[#1A4D2E] text-white shadow-lg shadow-[#1A4D2E]/15'
                    : 'border-black/10 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-[#1A4D2E]/20 hover:shadow-md'
              }`}
            >
              <span className="block">{formatTime(slot)}</span>
              <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${isSelected ? 'bg-white/15 text-white' : isUnavailable || isPast ? 'bg-slate-200 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>
                {isPast ? 'Past' : isUnavailable ? 'Reserved' : isSelected ? 'Selected' : 'Available'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}