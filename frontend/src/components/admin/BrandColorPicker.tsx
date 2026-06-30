'use client'

import { useState, useEffect } from 'react'

interface BrandColorPickerProps {
  value: string
  onChange: (color: string) => void
}

const PRESETS = [
  '#1A4D2E', '#2B4C7E', '#6B21A8', '#B91C1C',
  '#B45309', '#0F766E', '#1D4ED8', '#374151',
]

export default function BrandColorPicker({ value, onChange }: BrandColorPickerProps) {
  const [hex, setHex] = useState(value)
  const [inputVal, setInputVal] = useState(value)

  useEffect(() => {
    setHex(value)
    setInputVal(value)
  }, [value])

  const handleInput = (raw: string) => {
    setInputVal(raw)
    const normalized = raw.startsWith('#') ? raw : `#${raw}`
    if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
      setHex(normalized)
      onChange(normalized)
    }
  }

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => { setHex(c); setInputVal(c); onChange(c) }}
            className="h-8 w-8 rounded-lg border-2 transition hover:scale-110"
            style={{
              backgroundColor: c,
              borderColor: hex === c ? '#000' : 'transparent',
            }}
          />
        ))}
      </div>

      {/* Hex input + native color picker */}
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={hex}
          onChange={(e) => { setHex(e.target.value); setInputVal(e.target.value); onChange(e.target.value) }}
          className="h-10 w-10 cursor-pointer rounded-lg border border-black/10 p-0.5"
        />
        <input
          type="text"
          value={inputVal}
          onChange={(e) => handleInput(e.target.value)}
          maxLength={7}
          placeholder="#1A4D2E"
          className="w-32 rounded-xl border border-black/10 px-3 py-2 font-mono text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <span className="text-sm text-slate-500">Selected: </span>
        <span
          className="inline-block h-6 w-16 rounded-md border border-black/10"
          style={{ backgroundColor: hex }}
        />
      </div>

      {/* Live preview */}
      <div className="rounded-2xl border border-black/8 bg-white p-5">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">Preview</p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: hex }}
          >
            Order Now
          </button>
          <button
            type="button"
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
            style={{ color: hex, borderColor: hex }}
          >
            View Menu
          </button>
          <span className="text-sm font-semibold" style={{ color: hex }}>
            SCMS Platform
          </span>
        </div>
      </div>
    </div>
  )
}
