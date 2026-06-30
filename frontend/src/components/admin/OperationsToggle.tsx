interface OperationsToggleProps {
  id: string
  label: string
  description: string
  consequence?: string
  checked: boolean
  onChange: (val: boolean) => void
}

export default function OperationsToggle({
  id,
  label,
  description,
  consequence,
  checked,
  onChange,
}: OperationsToggleProps) {
  return (
    <div className="flex items-start justify-between gap-6 rounded-xl border border-black/10 bg-white px-4 py-4">
      <div className="flex-1">
        <p className="font-medium text-slate-800">{label}</p>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        {consequence && checked && (
          <p className="mt-1 text-xs font-medium text-amber-600">{consequence}</p>
        )}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none',
          checked ? 'bg-primary' : 'bg-slate-300',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  )
}
