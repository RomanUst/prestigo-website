# Phase 63: Admin Booking Editing + Change Notification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-20
**Phase:** 63-admin-booking-editing-change-notification
**Areas discussed:** Edit surface & save model, Price recalc & override, Change-notification email, Round-trip shared fields

---

## Edit Surface & Save Model

| Option | Description | Selected |
|--------|-------------|----------|
| Inline edit in expanded row | Add edit mode to the existing expandable BookingsTable row (consistent with notes/driver-price editing) | ✓ |
| Modal (reuse wizard) | Modal built on AdminBookingWizard/ManualBookingForm | |
| Separate page | /admin/bookings/[id]/edit full page | |

**User's choice:** Inline edit in expanded row.

**Save model follow-up:**

| Option | Description | Selected |
|--------|-------------|----------|
| Single "Save" button | All dirty fields committed in one PATCH; one pre-save review point | |
| Per-field autosave | Each field autosaves independently (like notes today) | |
| (Free text) | "возможность исправлять все поля одним и сохранять каждое поле отдельно" | ✓ |

**User's choice (free text):** All fields editable at once in one edit mode, but each field saved by its own save button. Reconciled: price-affecting fields (vehicle/route) route through a price-review step before persisting.
**Notes:** User initially answered "кнопка сохранить на каждое поле", then clarified they want simultaneous editing of all fields with per-field save granularity.

---

## Price Recalc & Override (AEDIT-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Record new amount, money manual | Update amount; collect any difference out of system | (aligned) |
| Warn but allow | Same, with explicit risk flag | |
| Same for all statuses | No paid/unpaid special-casing | (aligned) |
| (Free text) | "посылает ссылку на оплату клиенту по желанию админа, если админ считает что разница не большая то ссылка не посылается" | ✓ |

**User's choice (free text):** Optionally send a payment link for the difference at admin's discretion; if the difference is small, no link.
**Notes:** Payment-link machinery belongs to Phase 64 — clarified with user. Phase 63 records the new amount (recompute or override); collecting the difference is manual/out-of-system now; the top-up payment link is deferred to depend on Phase 64. Follow-up on override: user confirmed "всегда решает админ о дополнительном сборе" → operator can override the recomputed amount (reuse override_price + tolerance pattern), and always decides about collection.

---

## Change-Notification Email (AEDIT-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle only | Per-save "notify client" toggle | |
| Toggle + global flag | Per-save toggle AND a notification_flags key (both must allow) | (part of choice) |
| (Free text) | "тумблер и флаг, плюс сохранять все логи об изменениях" | ✓ |

**User's choice (free text):** Toggle + global flag, PLUS persist all change logs.

**Audit-log scope follow-up:**

| Option | Description | Selected |
|--------|-------------|----------|
| A — lightweight change record | DB rows per change (field, old→new, operator, time, emailed?), no UI | |
| B — full audit journal + UI | Plus a change-history screen/section | ✓ |

**User's choice:** Variant B — full audit journal with UI, included in Phase 63.
**Notes:** This pulls FOLLOW-02 (previously deferred to v2) into Phase 63 — flagged as scope expansion; user confirmed. REQUIREMENTS.md FOLLOW-02 status to be reconciled. Email shows only changed fields old→new (locked by success criteria). History-block placement assumed inside the expanded row (planner may refine).

---

## Round-Trip Shared Fields (AEDIT-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Strictly current leg only | Every edit (incl. contact) affects only the edited row | ✓ |
| Contact to both legs, trip per-leg | Schedule/route/vehicle per-leg; contact propagates to sibling | |

**User's choice:** Strictly current leg only — no propagation, even for contact fields.
**Notes:** Matches success criteria literally; leg isolation is architecturally free (separate rows by id).

---

## Claude's Discretion

- Editability by booking status (cancelled/completed likely read-only; active statuses editable).
- GNet-sourced booking edits — whether to push to GNet (guard by booking_source) or keep local this phase.
- Route→distance recompute — locate/reuse the booking-flow Maps distance helper.
- Email micro-copy, history-block styling, notification_flags key name.

## Deferred Ideas

- Top-up payment link for a price difference on a paid booking → depends on / belongs with Phase 64.
- Automatic collection / re-charge of price differences → out of scope (admin collects manually).
- FOLLOW-02 is NOT deferred anymore — user chose to include the audit log + history UI in Phase 63.
