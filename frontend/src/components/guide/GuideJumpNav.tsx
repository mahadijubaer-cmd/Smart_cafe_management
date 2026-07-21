'use client'

import {
  QrCode,
  UserRound,
  Building2,
  UtensilsCrossed,
  Store,
  Sparkles,
  ShieldCheck,
  ChefHat,
} from 'lucide-react'
import { Card } from '@/components/ui/card'

const ROLES = [
  { id: 'guest', label: 'Walk-in guest', hint: 'Scan & order, no account', icon: QrCode },
  { id: 'customer', label: 'Customer / student', hint: 'I have an account', icon: UserRound },
  { id: 'register-org', label: 'Register your business', hint: 'Put your business on SCMS', icon: Building2 },
  { id: 'tenant-admin', label: 'Cafeteria / restaurant admin', hint: 'I run a venue', icon: UtensilsCrossed },
  { id: 'super-admin', label: 'Franchise owner', hint: 'I run multiple branches', icon: Store },
  { id: 'food-court-admin', label: 'Food court admin', hint: 'I run a shared dining floor', icon: ChefHat },
  { id: 'staff', label: 'Staff / server', hint: 'I take & prepare orders', icon: ShieldCheck },
  { id: 'cleaner', label: 'Cleaning staff', hint: 'I clear tables', icon: Sparkles },
] as const

export default function GuideJumpNav() {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ROLES.map(({ id, label, hint, icon: Icon }) => (
        <a key={id} href={`#${id}`} onClick={(e) => handleClick(e, id)} className="group block">
          <Card className="h-full rounded-2xl border-black/5 p-4 text-center transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
            <span className="mx-auto flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
              <Icon className="size-5" />
            </span>
            <p className="mt-2 text-sm font-semibold leading-tight">{label}</p>
            <p className="mt-1 text-xs leading-tight text-muted-foreground">{hint}</p>
          </Card>
        </a>
      ))}
    </div>
  )
}
