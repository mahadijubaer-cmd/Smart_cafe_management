'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'

export type SwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>

export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, SwitchProps>(
  ({ className, ...props }, ref) => {
    return (
      <SwitchPrimitive.Root
        ref={ref}
        className={cn(
          'inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent p-0.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4D2E]/20 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[#1A4D2E] data-[state=unchecked]:bg-gray-300 dark:data-[state=unchecked]:bg-slate-700',
          className
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
      </SwitchPrimitive.Root>
    )
  }
)

Switch.displayName = SwitchPrimitive.Root.displayName
