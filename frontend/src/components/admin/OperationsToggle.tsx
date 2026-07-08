'use client'

import { Switch } from '@/components/ui/switch'

interface OperationsToggleProps {
  id: string
  label: string
  description: string
  consequence?: string
  checked: boolean
  onChange: (val: boolean) => void
}

export default function OperationsToggle({
  id,
  label,
  description,
  consequence,
  checked,
  onChange,
}: OperationsToggleProps) {
  return (
    <div className="flex items-start justify-between gap-6 rounded-xl border bg-card px-4 py-4">
      <div className="flex-1">
        <label htmlFor={id} className="font-medium text-card-foreground">
          {label}
        </label>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        {consequence && checked && (
          <p className="mt-1 text-xs font-medium text-amber-600">{consequence}</p>
        )}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  )
}
