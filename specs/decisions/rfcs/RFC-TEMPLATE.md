# RFC-XXX: [Feature Title]

**Date:** YYYY-MM-DD  
**Author:** [Your name]  
**Status:** Draft | Proposed | Accepted | Implemented | Superseded | Withdrawn  
**Related spec files:** [e.g., specs/modules/auth.md, specs/frontend/workflows.md]

---

## 1. Motivation

*Why is this feature needed? What problem does it solve? Who is affected?*

---

## 2. Proposed Design

### 2.1 Overview

*1-3 sentence summary of the approach.*

### 2.2 User-Facing Behaviour

*Describe what the user experiences. For UI changes: describe the screens and interactions. For API changes: describe how a client uses the new endpoints.*

### 2.3 New or Changed API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/...` | Required | ... |

*Include full request/response schema for each endpoint.*

### 2.4 Database Changes

*Any new tables, new columns, or schema modifications.*

```sql
-- Example:
ALTER TABLE tenants ADD COLUMN new_field VARCHAR(100);
```

*Link to updated data model: specs/system/data-model.md*

### 2.5 Frontend Pages / Components

| Page / Component | Path | What it does |
|---|---|---|
| ... | ... | ... |

### 2.6 Business Rules

*Any new rules that must be enforced. These must also be added to the relevant specs/modules/*.md before implementation.*

---

## 3. Alternatives Considered

*What other approaches were considered and why they were rejected.*

---

## 4. Open Questions

*Anything that still needs to be decided before implementation can begin.*

- [ ] Question 1?
- [ ] Question 2?

---

## 5. Implementation Checklist

**SPEC CHANGES FIRST — no code until all spec checkboxes are ticked.**

- [ ] specs/modules/{relevant}.md updated
- [ ] specs/system/data-model.md updated (if DB change)
- [ ] specs/frontend/overview.md updated (if frontend types change)
- [ ] specs/frontend/workflows.md updated (if user journey changes)
- [ ] Alembic migration written (if DB change)
- [ ] Backend implementation
- [ ] Tests written (covering spec'd behaviour + error paths)
- [ ] Frontend implementation
- [ ] CHANGELOG.md updated
