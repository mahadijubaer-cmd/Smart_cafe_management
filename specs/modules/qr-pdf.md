# Module: QR Codes & PDF Generation

**Routers:** `backend/app/routers/qr.py`, `backend/app/routers/receipts.py`, `backend/app/routers/memo.py`  
**Schemas:** `backend/app/schemas/memo.py`  
**Services:** `backend/app/services/qr_service.py`, `backend/app/services/pdf_service.py`  
**PDF library:** reportlab 4.1.0  
**QR library:** qrcode[pil]  
**Last verified:** 2026-06-30

---

## QR Code Endpoints

### `GET /api/v1/qr/order/{order_id}/base64`

**Auth:** Required | **Roles:** `customer`, `student` (own orders); admin roles (any order in tenant)

**Response `200`:**

```json
{
  "order_id": "3fa85f64-...",
  "format": "png",
  "encoding": "base64",
  "data": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```

> The base64 data is a raw PNG encoded as base64 — NOT a data URI. Frontend must prefix with `data:image/png;base64,` if used in an `<img>` src.

**Error:** `403` if customer tries to access another user's order.

---

### `GET /api/v1/qr/order/{order_id}/png`

**Auth:** Required | **Roles:** Same as base64 endpoint

**Response:** PNG binary stream

```
Content-Type: image/png
Content-Disposition: inline; filename="order_{order_id[:8]}.png"
```

---

### `GET /api/v1/qr/table/{table_number}/png`

**Auth:** None (public endpoint — no auth required)

Path param: `{table_number}` is an **integer** (the SERIAL `table_id`, not the `table_number` string like "T-01").

**Response:** PNG binary stream

```
Content-Type: image/png
Content-Disposition: inline; filename="table_{table_number}.png"
```

> **✅ [Phase 22 — Implemented 2026-07-05] (RFC-007):** For restaurant-segment tenants
> (`system/segments.md`) this endpoint's encoded QR payload changes from a bare table identifier to
> an outlet-scoped URL:
> ```
> https://<domain>/m/{public_slug}?o={outlet_slug}&t={table_number}
> ```
> `outlet_slug` is omitted for non-franchise tenants. `table_number` here is the human-readable
> `tables_map.table_number` string (e.g. `"T-04"`), not the integer `table_id` — validated against
> the outlet's own tables at order time (`modules/public-surface.md` PUB-5), not at generation time.
> Cafeteria-segment tenants are unaffected by this change.

---

### `GET /api/v1/qr/table-sheet/pdf`

**Status:** ✅ [Phase 22 — Implemented 2026-07-05] (RFC-007)

**Auth:** Required | **Roles:** Admin roles (tenant-scoped)

Generates a single PDF (reportlab, reusing the existing PDF pipeline) containing one page per table
in the caller's tenant (or a selected outlet), each with its outlet-scoped QR code (see above),
`table_number`, and `zone` printed underneath. Intended for the planned admin "Public Link" page
(`[tenant_slug]/(admin)/public-link/page.tsx`) "download table-QR PDF sheet" action.

**Query params:** `?outlet_id=` (optional, franchise tenants only)

**Response:** `application/pdf` binary stream.

---

## Receipt PDF Endpoint

### `GET /api/v1/receipts/{order_id}/pdf`

**Auth:** Required | **Roles:** `customer`, `student` (own orders); admin roles (any order in tenant)

**Business logic:**
1. Resolve order (404 if not found or belongs to another tenant)
2. Check ownership (403 if customer accessing another user's order)
3. Resolve `receipt_logs` record: if exists, reuse `receipt_no`; else generate new `receipt_no` = `RCP-YYYYMMDD-XXXXXX` and create record
4. Resolve last payment for method and timestamp
5. Resolve all order items (with menu item names)
6. Generate PDF via `pdf_service.generate_receipt_pdf()`
7. Stream as `application/pdf`

**Response:** PDF binary stream

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="receipt_{receipt_no}.pdf"
```

**Receipt content includes:**
- Tenant name and address
- Receipt number (`RCP-YYYYMMDD-XXXXXX` format)
- Order ID
- Customer name, email, student_id (if applicable)
- Line items: name, quantity, unit_price, subtotal
- Subtotal (before discount)
- Discount amount
- Total amount
- Payment method and timestamp

---

## Memo PDF Endpoint

### `POST /api/v1/memo/generate`

**Auth:** Required | **Roles:** `staff`, `outlet_admin`, `tenant_admin`

> Note: `food_court_admin`, `super_admin`, `platform_admin` are NOT included — this is for operational staff and direct tenant admins only.

**Request body:** `MemoRequest`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `ref_no` | str | Yes | `max_length=50` |
| `date` | str | Yes | Date string e.g. `"2026-06-28"` |
| `to` | str | Yes | `max_length=200` |
| `from_name` | str | Yes | `max_length=200` |
| `subject` | str | Yes | `max_length=300` |
| `body_paragraphs` | list[str] | Yes | `min_length=1` (at least one paragraph) |
| `signatory_name` | str | Yes | `max_length=150` |
| `signatory_title` | str | Yes | `max_length=150` |

**Business logic:**
1. Resolve tenant (for `tenant_name` in PDF header)
2. Generate A4 PDF memo via `pdf_service.generate_memo_pdf()`
3. Stream as `application/pdf`

**Response:** PDF binary stream

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="memo_{ref_no}.pdf"
```

Slashes in `ref_no` are replaced with hyphens in the filename.

---

## Pydantic Schema: `MemoRequest`

```python
class MemoRequest(BaseModel):
    ref_no: str = Field(..., max_length=50)
    date: str
    to: str = Field(..., max_length=200)
    from_name: str = Field(..., max_length=200)
    subject: str = Field(..., max_length=300)
    body_paragraphs: list[str] = Field(..., min_length=1)
    signatory_name: str = Field(..., max_length=150)
    signatory_title: str = Field(..., max_length=150)
```

---

## Receipt Numbering

Format: `RCP-YYYYMMDD-XXXXXX`  
- `YYYYMMDD` = date at generation time
- `XXXXXX` = first 6 characters of a UUID4 hex string (uppercase)

Example: `RCP-20260630-4A8B2C`

The number is idempotent — repeated requests for the same `order_id` return the same `receipt_no` (looked up from `receipt_logs` table).
