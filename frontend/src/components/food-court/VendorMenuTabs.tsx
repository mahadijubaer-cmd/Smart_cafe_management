'use client'

import type { VendorSummary } from './VendorTile'

interface VendorMenuTabsProps {
  vendors: VendorSummary[]
  selected: string | null
  onChange: (id: string | null) => void
}

export default function VendorMenuTabs({ vendors, selected, onChange }: VendorMenuTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={[
          'shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition',
          selected === null
            ? 'bg-primary text-white'
            : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
        ].join(' ')}
      >
        All Vendors
      </button>
      {vendors.map((v) => (
        <button
          key={v.tenant_id}
          type="button"
          onClick={() => onChange(v.tenant_id)}
          className={[
            'shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition',
            selected === v.tenant_id
              ? 'bg-primary text-white'
              : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
          ].join(' ')}
        >
          {v.name}
        </button>
      ))}
    </div>
  )
}
