'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Store } from 'lucide-react'

import apiClient from '@/lib/api'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

export type CommandPaletteItem = { label: string; href: string; icon?: ReactNode }

type TenantResult = { tenant_id: string; name: string; slug: string }

type CommandPaletteProps = {
  items: CommandPaletteItem[]
  quickActions?: CommandPaletteItem[]
  /** Platform admin only — see specs/frontend/overview.md "Command palette (UIX-3)" for why this
   * fetches once and filters client-side instead of a server `q` search param (none exists on the
   * admin-scoped GET /tenants endpoint). */
  tenantSearch?: boolean
}

export default function CommandPalette({ items, quickActions, tenantSearch }: CommandPaletteProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tenants, setTenants] = useState<TenantResult[]>([])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!open || !tenantSearch || tenants.length > 0) return
    apiClient
      .get('/tenants', { params: { limit: 100 } })
      .then((res) => setTenants(res.data?.items ?? []))
      .catch(() => {})
  }, [open, tenantSearch, tenants.length])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to a page or action…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Pages">
          {items.map((item) => (
            <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
              {item.icon}
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {quickActions && quickActions.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Quick actions">
              {quickActions.map((action) => (
                <CommandItem key={action.href} value={action.label} onSelect={() => go(action.href)}>
                  {action.icon}
                  <span>{action.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {tenantSearch && tenants.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tenants">
              {tenants.map((tenant) => (
                <CommandItem
                  key={tenant.tenant_id}
                  value={`${tenant.name} ${tenant.slug}`}
                  onSelect={() => go('/admin/tenants')}
                >
                  <Store />
                  <span>{tenant.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{tenant.slug}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}
