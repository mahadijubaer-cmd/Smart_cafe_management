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
      className={`mx-auto grid w-full max-w-[1600px] overflow-hidden rounded-[2rem] border border-primary/10 bg-white shadow-2xl shadow-primary/10 lg:min-h-[80vh] ${gridCols} ${className}`}
    >
      <div className={`relative order-1 ${heroOrder} overflow-hidden bg-primary`}>
        <img
          src="/brand/food-illustration-panel.svg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 hidden h-full w-full object-cover md:block"
        />
        <div className="relative z-10 flex h-full flex-col justify-between p-8 text-white md:p-10">
          {hero}
        </div>
      </div>
      <div className={`order-2 ${formOrder} bg-white`}>{children}</div>
    </div>
  )
}
