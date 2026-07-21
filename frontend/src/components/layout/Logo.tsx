interface LogoProps {
  /** 'dark' = ink for dark surfaces (header/footer bars); 'light' = ink for light/theme-aware surfaces (Navbar, admin sidebar). */
  theme?: 'light' | 'dark'
  className?: string
}

const PALETTES = {
  light: { tile: '#DCEEE1', stroke: '#1A4D2E', tileOpacity: 1 },
  dark: { tile: 'none', stroke: '#F7F3EC', tileOpacity: 0.85 },
} as const

export default function Logo({ theme = 'dark', className = 'size-6' }: LogoProps) {
  const p = PALETTES[theme]
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true">
      <rect x="15" y="15" width="60" height="60" rx="14" fill={p.tile} stroke={p.stroke} strokeWidth="4" opacity={p.tileOpacity} />
      <rect x="85" y="15" width="60" height="60" rx="14" fill="#E8734A" />
      <rect x="15" y="85" width="60" height="60" rx="14" fill={p.tile} stroke={p.stroke} strokeWidth="4" opacity={p.tileOpacity} />
      <rect x="85" y="85" width="60" height="60" rx="14" fill={p.tile} stroke={p.stroke} strokeWidth="4" opacity={p.tileOpacity} />
      <g transform="translate(115,45)">
        <path d="M0 -11 C6 -11 10 -6 10 -1 C10 5 0 14 0 14 C0 14 -10 5 -10 -1 C-10 -6 -6 -11 0 -11 Z" fill="#FFFFFF" />
        <circle cx="0" cy="-1" r="3.4" fill="#E8734A" />
      </g>
    </svg>
  )
}
