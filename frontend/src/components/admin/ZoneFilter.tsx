'use client'

interface ZoneFilterProps {
  zones: string[]
  selected: string | null
  onChange: (zone: string | null) => void
}

export default function ZoneFilter({ zones, selected, onChange }: ZoneFilterProps) {
  const tabs = ['All', ...zones]

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => {
        const value = tab === 'All' ? null : tab
        const active = selected === value
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(value)}
            className={[
              'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition',
              active
                ? 'bg-primary text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            {tab}
          </button>
        )
      })}
    </div>
  )
}
