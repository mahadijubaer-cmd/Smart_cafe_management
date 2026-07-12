import { redirect } from 'next/navigation'

// This bare, non-tenant-scoped route predates tenant-scoped auth (`/{tenant_slug}/login`).
// Its login form posted to `/auth/login` without a `tenant_slug`, which the backend has
// required on every request since multi-tenancy landed — every submission 422'd and the
// page could never succeed. It's still a real navigation target (`ProtectedRoute`'s
// `loginPath` falls back here when the tenant slug isn't known yet), so rather than leaving
// a dead form in place, send visitors to `/discover`, the app's actual "find your
// organization" entry point.
export default function LegacyLoginRedirect() {
  redirect('/discover')
}
