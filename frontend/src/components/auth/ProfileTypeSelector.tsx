import type { TenantType, UserRole } from '@/types'

interface ProfileOption {
  role: UserRole
  label: string
  description: string
}

const CUSTOMER_OPTION: ProfileOption = {
  role: 'customer',
  label: 'Customer',
  description: 'Order food, track your wallet and rewards.',
}

const STUDENT_OPTION: ProfileOption = {
  role: 'student',
  label: 'Student',
  description: 'Student account with campus meal benefits.',
}

interface ProfileTypeSelectorProps {
  tenantType: TenantType
  onSelect: (role: UserRole) => void
}

export default function ProfileTypeSelector({ tenantType, onSelect }: ProfileTypeSelectorProps) {
  const options: ProfileOption[] =
    tenantType === 'academic' ? [STUDENT_OPTION, CUSTOMER_OPTION] : [CUSTOMER_OPTION]

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700">How will you use this account?</p>
      <div className="grid gap-3">
        {options.map((opt) => (
          <button
            key={opt.role}
            type="button"
            onClick={() => onSelect(opt.role)}
            className="flex items-start gap-4 rounded-xl border border-black/10 bg-white px-5 py-4 text-left shadow-sm transition hover:border-primary hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
              {opt.label.charAt(0)}
            </span>
            <span>
              <span className="block font-semibold text-slate-800">{opt.label}</span>
              <span className="block text-sm text-slate-500">{opt.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
