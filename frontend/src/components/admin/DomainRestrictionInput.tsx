'use client'

import { useState } from 'react'

import { Field, FieldDescription } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3">
        <div>
          <p className="font-medium text-card-foreground">Require domain-specific email</p>
          <p className="text-sm text-muted-foreground">
            Only email addresses matching this domain can register.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>

      {enabled && (
        <Field data-invalid={!!error}>
          <Input
            type="text"
            value={inputVal}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="@g.bracu.ac.bd"
            aria-invalid={!!error}
          />
          {error ? (
            <FieldDescription className="text-destructive">{error}</FieldDescription>
          ) : (
            <FieldDescription>
              Existing users are not affected. Only new registrations will be checked.
            </FieldDescription>
          )}
        </Field>
      )}
    </div>
  )
}
