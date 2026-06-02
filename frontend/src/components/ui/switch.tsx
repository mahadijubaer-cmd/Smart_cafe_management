'use client'

import * as React from 'react'

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export function Switch({ checked = false, onCheckedChange, className = '', ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      className={[
        'inline-flex h-6 w-11 items-center rounded-full border border-transparent p-0.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#1A4D2E]/20',
        checked ? 'bg-[#1A4D2E]' : 'bg-gray-300',
        className,
      ].join(' ')}
      {...props}
    >
      <span
        className={[
          'h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}