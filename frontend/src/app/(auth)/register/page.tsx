import { redirect } from 'next/navigation'

// See `(auth)/login/page.tsx` for the full explanation: this bare, non-tenant-scoped route
// predates tenant-scoped registration (`/{tenant_slug}/register`) and posted to `/auth/register`
// without a `tenant_slug`, which the backend requires — every submission 422'd. Redirect to
// `/discover`, where a visitor can find their organization and register under its own slug, or
// jump to `/register-organization` to create a new one.
export default function LegacyRegisterRedirect() {
  redirect('/discover')
}
