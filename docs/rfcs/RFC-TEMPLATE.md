# RFC-XXX: [Feature Title]

**Date:** YYYY-MM-DD  
**Author:** [Your name]  
**Status:** Draft | Proposed | Accepted | Implemented | Superseded | Withdrawn  
**Related spec files:** [e.g., spec/04-api-reference.md, spec/07-frontend.md]

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

*Link to updated data model: docs/spec/02-data-model.md*

### 2.5 Frontend Pages / Components

| Page / Component | Path | What it does |
|---|---|---|
| ... | ... | ... |

### 2.6 Business Rules

*Any new rules that must be enforced. These must also be added to docs/spec/06-business-rules.md before implementation.*

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

*Complete before marking status as Implemented.*

- [ ] spec/04-api-reference.md updated
- [ ] spec/02-data-model.md updated (if DB change)
- [ ] spec/06-business-rules.md updated (if new rules)
- [ ] spec/07-frontend.md updated (if frontend change)
- [ ] Alembic migration written
- [ ] Backend implementation
- [ ] Tests written (covering spec'd behaviour + error paths)
- [ ] Frontend implementation
- [ ] CHANGELOG.md updated
