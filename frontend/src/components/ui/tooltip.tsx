'use client'

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type TooltipProps = {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom'
}

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  const updatePosition = () => {
    const element = triggerRef.current
    if (!element) return

    const rect = element.getBoundingClientRect()
    setPosition({
      top: side === 'top' ? rect.top - 12 : rect.bottom + 12,
      left: rect.left + rect.width / 2,
    })
  }

  useLayoutEffect(() => {
    if (open) {
      updatePosition()
    }
  }, [open, side])

  useEffect(() => {
    if (!open) return

    const onWindowChange = () => updatePosition()
    window.addEventListener('scroll', onWindowChange, true)
    window.addEventListener('resize', onWindowChange)

    return () => {
      window.removeEventListener('scroll', onWindowChange, true)
      window.removeEventListener('resize', onWindowChange)
    }
  }, [open])

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && position && typeof window !== 'undefined'
        ? createPortal(
            <div
              className="pointer-events-none fixed z-50 -translate-x-1/2 rounded-xl border border-black/10 bg-slate-950 px-3 py-2 text-xs font-medium text-white shadow-2xl"
              style={{ top: position.top, left: position.left }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}
