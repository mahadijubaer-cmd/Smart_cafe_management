'use client'

import { useState } from 'react'

interface DomainRestrictionInputProps {
  value: string | null
  onChange: (domain: string | null) => void
}

export default function DomainRestrictionInput({ value, onChange }: DomainRestrictionInputProps) {
  const enabled = value !== null
  const [inputVal, setInputVal] = useState(value ?? '')
  const [error, setError] = useState<string | null>(null)

  const handleToggle = (on: boolean) => {
    if (!on) {
      onChange(null)
    } else {
      onChange(inputVal || null)
    }
  }

  const handleInput = (raw: string) => {
    setInputVal(raw)
    if (!raw) {
      setError(null)
      onChange(null)
      return
    }
    if (!raw.startsWith('@')) {
      setError('Domain must start with @, e.g. @g.bracu.ac.bd')
      return
    }
    setError(null)
    onChange(raw)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-black/10 bg-white px-4 py-3">
        <div>
          <p className="font-medium text-slate-800">Require domain-specific email</p>
          <p className="text-sm text-slate-500">
            Only email addresses matching this domain can register.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => handleToggle(!enabled)}
          className={[
            'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none',
            enabled ? 'bg-primary' : 'bg-slate-300',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
              enabled ? 'translate-x-5' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
      </div>

      {enabled && (
        <div className="space-y-1">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="@g.bracu.ac.bd"
            className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <p className="text-xs text-slate-500">
            Existing users are not affected. Only new registrations will be checked.
          </p>
        </div>
      )}
    </div>
  )
}
