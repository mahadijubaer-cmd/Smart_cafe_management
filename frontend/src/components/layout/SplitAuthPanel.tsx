import type { ReactNode } from 'react'

interface SplitAuthPanelProps {
  /** Marketing/hero-copy side content (badge, heading, subtext, or a dynamic banner). */
  hero: ReactNode
  /** Which visual side the hero renders on at the `lg` breakpoint. Always renders above the form on mobile. */
  heroSide?: 'left' | 'right'
  /** Form-side content. */
  children: ReactNode
  className?: string
}

export default function SplitAuthPanel({ hero, heroSide = 'right', children, className = '' }: SplitAuthPanelProps) {
  const gridCols = heroSide === 'left' ? 'lg:grid-cols-[1.05fr_0.95fr]' : 'lg:grid-cols-[0.95fr_1.05fr]'
  const heroOrder = heroSide === 'left' ? 'lg:order-1' : 'lg:order-2'
  const formOrder = heroSide === 'left' ? 'lg:order-2' : 'lg:order-1'

  return (
    <div
      className={`mx-auto grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-primary/10 bg-white shadow-2xl shadow-primary/10 ${gridCols} ${className}`}
    >
      <div className={`order-1 ${heroOrder} flex flex-col justify-between bg-primary p-8 text-white md:p-10`}>
        {hero}
      </div>
      <div className={`order-2 ${formOrder} bg-white`}>{children}</div>
    </div>
  )
}
