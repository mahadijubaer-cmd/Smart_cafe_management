'use client'

import * as React from 'react'

type ButtonVariant = 'default' | 'outline' | 'ghost'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-primary text-white hover:opacity-90',
  outline: 'border border-primary bg-white text-primary hover:bg-primary/5',
  ghost: 'bg-transparent text-primary hover:bg-primary/10',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={`inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition ${variantClasses[variant]} ${className}`}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'