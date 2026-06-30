# Spec-First Workflow

> **Read this before making any change to the codebase.**

---

## The Golden Rule

```
Spec → Code → Tests
```

The spec in `specs/` is the source of truth. When the spec and the code disagree, **fix the code** (or create an RFC to change the spec first). Never fix the spec to match wrong code without the team agreeing.

---

## Step-by-Step: Adding a Feature

1. **Locate or create the spec file** for the module you're changing (see `README.md` → File Ownership Map)

2. **Write the spec first:**
   - Define the endpoint: method, path, auth requirements, request body, response body, error cases
   - Define request/response schemas: every field, type, required/optional, constraints
   - Define business rules: any invariant that the backend must enforce
   - Add a Phase marker if the feature isn't implemented yet: `❌ [Phase N — Not yet implemented]`

3. **If it's a new feature:** Create an RFC in `decisions/rfcs/` using `decisions/rfcs/RFC-TEMPLATE.md` before writing the spec. The RFC must be accepted before code is written.

4. **If it's an architectural decision:** Create an ADR in `decisions/adrs/` using `decisions/adrs/ADR-TEMPLATE.md`.

5. **Write the code** to match the spec.

6. **Write the tests** to verify the spec'd behaviour. Tests assert observable behaviour (HTTP status codes, response shapes, error messages), not implementation details.

7. **Update `CHANGELOG.md`** under `[Unreleased]`.

---

## Step-by-Step: Fixing a Bug

1. **Identify the spec** for the broken behaviour.
2. **Verify whether the spec is correct:** Is this the spec'd behaviour that is broken, or was the spec wrong?
   - If the spec was right and code is wrong: Fix the code. No spec change needed.
   - If the spec was wrong: Update the spec first, then fix the code.
3. **Write a regression test** that would have caught this bug.

---

## Step-by-Step: Changing Existing Behaviour

1. **Create an RFC** to propose the change.
2. **Wait for RFC acceptance** (self-accept is fine for this project as long as the spec is updated before the code).
3. **Update the spec** in the relevant module file.
4. **Update the code**.
5. **Update affected tests**.
6. **Update `CHANGELOG.md`**.

---

## Phase Markers

All planned but not-yet-implemented features are marked with:

```
❌ [Phase N — Not yet implemented]
```

See `operations/roadmap.md` for phase definitions and acceptance criteria.

---

## Quick Reference

| "I want to know..." | "Read this file" |
|---|---|
| What tenant types exist | `system/overview.md` |
| How request auth works | `system/architecture.md` + `system/security.md` |
| What columns a table has | `system/data-model.md` |
| How an endpoint works | The module file (e.g. `modules/orders.md`) |
| What fields a schema has | The module file for that domain |
| What business rules apply | The module file for that domain |
| How real-time events work | `modules/websocket.md` |
| How user journeys work end-to-end | `frontend/workflows.md` |
| How to run tests | `operations/testing.md` |
| What's planned next | `operations/roadmap.md` |
