'use client'

import { ReactNode, createContext, useContext, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { Button } from './button'

type AlertDialogContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const AlertDialogContext = createContext<AlertDialogContextValue | null>(null)

function useAlertDialogContext() {
  const context = useContext(AlertDialogContext)
  if (!context) {
    throw new Error('AlertDialog components must be used inside <AlertDialog>.')
  }
  return context
}

type AlertDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}

export function AlertDialog({ open: controlledOpen, onOpenChange, children }: AlertDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen

  const value = useMemo(
    () => ({
      open,
      setOpen: (nextOpen: boolean) => {
        if (onOpenChange) {
          onOpenChange(nextOpen)
          return
        }
        setUncontrolledOpen(nextOpen)
      },
    }),
    [onOpenChange, open],
  )

  return <AlertDialogContext.Provider value={value}>{children}</AlertDialogContext.Provider>
}

type TriggerProps = {
  children: ReactNode
}

export function AlertDialogTrigger({ children }: TriggerProps) {
  const { setOpen } = useAlertDialogContext()

  return (
    <button type="button" onClick={() => setOpen(true)}>
      {children}
    </button>
  )
}

type ContentProps = {
  children: ReactNode
  className?: string
}

export function AlertDialogContent({ children, className = '' }: ContentProps) {
  const { open, setOpen } = useAlertDialogContext()

  if (typeof window === 'undefined' || !open) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close dialog overlay"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className={`relative z-10 w-full max-w-lg rounded-3xl border border-black/10 bg-white p-6 shadow-2xl ${className}`}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function AlertDialogHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-2 ${className}`}>{children}</div>
}

export function AlertDialogTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-2xl font-bold tracking-tight text-slate-900 ${className}`}>{children}</h2>
}

export function AlertDialogDescription({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm leading-6 text-slate-600 ${className}`}>{children}</p>
}

export function AlertDialogFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mt-6 flex flex-wrap justify-end gap-3 ${className}`}>{children}</div>
}

type ActionProps = React.ComponentProps<typeof Button> & {
  children: ReactNode
}

export function AlertDialogAction({ children, onClick, ...props }: ActionProps) {
  const { setOpen } = useAlertDialogContext()

  return (
    <Button
      {...props}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
          setOpen(false)
        }
      }}
    >
      {children}
    </Button>
  )
}

type CancelProps = React.ComponentProps<typeof Button> & {
  children: ReactNode
}

export function AlertDialogCancel({ children, onClick, ...props }: CancelProps) {
  const { setOpen } = useAlertDialogContext()

  return (
    <Button
      {...props}
      variant="outline"
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
          setOpen(false)
        }
      }}
    >
      {children}
    </Button>
  )
}
