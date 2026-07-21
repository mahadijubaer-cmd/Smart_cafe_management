interface MarqueeStripProps {
  items: string[]
  className?: string
}

export default function MarqueeStrip({ items, className = '' }: MarqueeStripProps) {
  const track = (
    <div className="flex shrink-0 items-center gap-3 pr-3" aria-hidden="true">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-3 whitespace-nowrap">
          <span className="text-sm font-semibold uppercase tracking-wide text-white/70">{item}</span>
          <span className="text-white/30">&middot;</span>
        </span>
      ))}
    </div>
  )

  return (
    <div className={`overflow-hidden ${className}`} role="list" aria-label="Platform highlights">
      <div className="flex w-max motion-safe:animate-marquee motion-reduce:flex-wrap motion-reduce:gap-3">
        {track}
        <div className="motion-reduce:hidden" aria-hidden="true">
          {track}
        </div>
      </div>
    </div>
  )
}
