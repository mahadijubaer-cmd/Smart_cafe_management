# ADR-008: All `<form>` Elements Must Specify `method="post"`

**Date:** 2026-07-11
**Status:** Implemented
**Deciders:** Mahadi Jubaer

---

## Context

The user reported seeing email and password appear in the browser URL bar while logging in. Root
cause, confirmed both by live testing and by an earlier (at the time misdiagnosed) Playwright
automation run that showed the exact same symptom:

Every form in the frontend — login, register, forgot/reset password, invite, admin CRUD forms —
relies entirely on React to intercept submission:
```tsx
<form onSubmit={handleSubmit(onSubmit)}>
```
`react-hook-form`'s `handleSubmit` calls `event.preventDefault()` internally, so once React has
hydrated and attached its event listeners, this works correctly and no native submission ever
happens. **But there is an unavoidable window before hydration completes** (SSR delivers static
HTML immediately; JS hydration attaches listeners afterward) during which the DOM is visually
interactive but no JS handlers are attached yet. If a user submits (click or Enter) inside that
window, the browser falls back to the native HTML form behavior. An unspecified `method` defaults
to `GET`, which serializes every named input — including `password` — into the URL:
```
GET /bracu/login?email=admin%40bracu.scms&password=Admin%401234
```
This is not a rare edge case in this project specifically: this app's Next.js dev server has been
directly observed taking 10–30+ seconds to compile a route on first hit (cold compile, verified
during earlier live-testing sessions), which is exactly the kind of slow-hydration window that
triggers this. It would also happen in production on a slow connection or an underpowered device.

Once credentials are in a URL, they persist in browser history, get logged in server access logs,
and can leak via `Referer` headers to any third-party resource the page subsequently loads — a real
credential-exposure bug, not just a cosmetic one.

## Decision

**Every `<form>` element must specify `method="post"`,** even though React is expected to intercept
submission in all normal cases. This is a zero-behavior-change, defense-in-depth addition: it does
not alter anything about how the form works when JS is running (React still calls
`preventDefault()` and the real submission still goes through `apiClient`/axios) — it only changes
what happens on the native-fallback path, from "leak all field values into the URL" to "POST them in
a request body" (still not ideal — it'd hit the Next.js page route itself, not the real API, and
would likely 404/405 — but critically, no credential ends up in the URL, browser history, or access
logs).

Applied to all 17 `<form>` elements found across the frontend (`Grep -rn "<form" frontend/src`),
prioritizing the 7 files with a `type="password"` field first: both `login/page.tsx`,
`register/page.tsx` (legacy and `[tenant_slug]`), `forgot-password/page.tsx` (both forms),
`register-organization/page.tsx`, and `(student)/profile/page.tsx`.

We did not build a custom `<Form>` wrapper component to enforce this automatically — with only 17
call sites and no evidence of the codebase adding new forms frequently enough to make manual review
unreliable, a wrapper would be premature abstraction. This ADR documents the rule for future forms;
a wrapper is a reasonable future step if forms keep multiplying without this convention being
followed.

## Consequences

**Positive:**
- Closes a real credential-exposure path with a one-attribute, zero-risk change per form.
- No behavior change in the common case (JS loaded and hydrated) — the fix is invisible to a working
  session.

**Negative:**
- Doesn't fully fix the "slow hydration" root cause itself (that's inherent to SSR + Next.js dev
  mode) — it only makes the fallback path safe instead of also functional. A user submitting during
  that window still won't have their login/registration actually processed (the POST goes to the
  wrong endpoint); they'll need to resubmit once the page is interactive. Acceptable trade: safety
  over functionality for a window that's supposed to be sub-second in production.
- Relies on manual convention (this ADR) rather than a structural guarantee — see the `<Form>`
  wrapper alternative noted above if this regresses.
