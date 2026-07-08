'use client'

import * as React from 'react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'

import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from './button'

export const AlertDialog = AlertDialogPrimitive.Root

export function AlertDialogTrigger({ children }: { children: React.ReactNode }) {
  return <AlertDialogPrimitive.Trigger asChild>{children}</AlertDialogPrimitive.Trigger>
}

export function AlertDialogContent({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm data-[state=open]:animate-fade-in" />
      <AlertDialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-black/10 bg-white p-6 shadow-2xl focus:outline-none',
          className
        )}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  )
}

export function AlertDialogHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('space-y-2', className)}>{children}</div>
}

export function AlertDialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <AlertDialogPrimitive.Title className={cn('text-2xl font-bold tracking-tight text-slate-900', className)}>
      {children}
    </AlertDialogPrimitive.Title>
  )
}

export function AlertDialogDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <AlertDialogPrimitive.Description className={cn('text-sm leading-6 text-slate-600', className)}>
      {children}
    </AlertDialogPrimitive.Description>
  )
}

export function AlertDialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mt-6 flex flex-wrap justify-end gap-3', className)}>{children}</div>
}

type ActionProps = ButtonProps & { children: React.ReactNode }

export function AlertDialogAction({ children, ...props }: ActionProps) {
  return (
    <AlertDialogPrimitive.Action asChild>
      <Button {...props}>{children}</Button>
    </AlertDialogPrimitive.Action>
  )
}

type CancelProps = ButtonProps & { children: React.ReactNode }

export function AlertDialogCancel({ children, variant = 'outline', ...props }: CancelProps) {
  return (
    <AlertDialogPrimitive.Cancel asChild>
      <Button variant={variant} {...props}>
        {children}
      </Button>
    </AlertDialogPrimitive.Cancel>
  )
}
