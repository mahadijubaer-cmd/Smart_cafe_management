'use client'

import * as React from 'react'

type AlertVariant = 'default' | 'success' | 'warning'

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant
}

const variantClasses: Record<AlertVariant, string> = {
  default: 'border-slate-200 bg-slate-50 text-slate-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
}

export function Alert({ className = '', variant = 'default', ...props }: AlertProps) {
  return <div role="alert" className={`rounded-2xl border px-4 py-3 text-sm ${variantClasses[variant]} ${className}`} {...props} />
}

export function AlertTitle({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={`font-semibold leading-none tracking-tight ${className}`} {...props} />
}

export function AlertDescription({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`mt-1 leading-6 opacity-90 ${className}`} {...props} />
}