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
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-foreground">How will you use this account?</p>
      <div className="grid gap-3">
        {options.map((opt) => (
          <button
            key={opt.role}
            type="button"
            onClick={() => onSelect(opt.role)}
            className="flex items-start gap-4 rounded-xl border bg-card px-5 py-4 text-left shadow-sm transition hover:border-primary hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {opt.label.charAt(0)}
            </span>
            <span>
              <span className="block font-semibold">{opt.label}</span>
              <span className="block text-sm text-muted-foreground">{opt.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
