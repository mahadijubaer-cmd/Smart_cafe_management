'use client'

import { Badge } from '@/components/ui/badge'

interface HourlyData {
  hour: number
  order_count: number
}

interface HourlyHeatmapProps {
  data: HourlyData[]
}

function formatHour(h: number) {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

export default function HourlyHeatmap({ data }: HourlyHeatmapProps) {
  // Fill all 24 hours (sparse → dense)
  const byHour = new Map(data.map((d) => [d.hour, d.order_count]))
  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: byHour.get(i) ?? 0,
  }))

  const max = Math.max(...hours.map((h) => h.count), 1)

  function barColor(count: number) {
    const ratio = count / max
    if (ratio === 0) return 'bg-slate-100'
    if (ratio < 0.25) return 'bg-amber-200'
    if (ratio < 0.5) return 'bg-amber-400'
    if (ratio < 0.75) return 'bg-orange-500'
    return 'bg-rose-600'
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-1">
        {hours.map(({ hour, count }) => (
          <div
            key={hour}
            className="group relative flex flex-1 flex-col items-center"
          >
            {/* Bar */}
            <div
              className={`w-full rounded-t transition-all ${barColor(count)}`}
              style={{ height: `${Math.max((count / max) * 80, count > 0 ? 4 : 2)}px` }}
            />
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-lg group-hover:block">
              {formatHour(hour)} — {count} order{count !== 1 ? 's' : ''}
            </div>
          </div>
        ))}
      </div>
      {/* X-axis labels — every 3 hours */}
      <div className="flex">
        {hours.map(({ hour }) => (
          <div key={hour} className="flex-1 text-center text-[9px] text-muted-foreground">
            {hour % 3 === 0 ? formatHour(hour) : ''}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Badge variant="outline" className="gap-1.5 font-normal">
          <span className="size-2.5 rounded-sm bg-slate-100" /> 0
        </Badge>
        <Badge variant="outline" className="gap-1.5 font-normal">
          <span className="size-2.5 rounded-sm bg-amber-300" /> Low
        </Badge>
        <Badge variant="outline" className="gap-1.5 font-normal">
          <span className="size-2.5 rounded-sm bg-orange-500" /> Mid
        </Badge>
        <Badge variant="outline" className="gap-1.5 font-normal">
          <span className="size-2.5 rounded-sm bg-rose-600" /> Peak
        </Badge>
      </div>
    </div>
  )
}
