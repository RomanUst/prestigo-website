# Phase 64: Admin-Created Bookings with Payment Link - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-21
**Phase:** 64-admin-created-bookings-with-payment-link
**Areas discussed:** Статус и очередь, Отправка ссылки, Письмо с оплатой, Жизненный цикл + доплата

---

## Статус и очередь

### Status while awaiting payment (with link)
| Option | Description | Selected |
|--------|-------------|----------|
| unpaid (Phase 62) | Reuse `unpaid`: lands in amber recovery queue; reconciliation + badge already work | ✓ |
| pending | Keep current POST behavior; semantically vague, not in queue | |
| New awaiting_payment | Dedicated status; new migration + badge + transitions, duplicates unpaid | |

**User's choice:** unpaid (Phase 62)

### Status when saved without link (cash/invoice)
| Option | Description | Selected |
|--------|-------------|----------|
| confirmed | Offline payment → operationally confirmed, not in unpaid queue | |
| pending (as now) | Keep current POST default | |
| Operator chooses | Form offers status choice (confirmed / pending) | ✓ |

**User's choice:** Operator chooses (default confirmed per CONTEXT D-02)

---

## Отправка ссылки

### Delivery model
| Option | Description | Selected |
|--------|-------------|----------|
| Email + copy URL | Auto-email on save (one action) + show copyable URL (WhatsApp) + "send again" | ✓ |
| Auto-email only | Save → email sent, nothing else | |
| Link first, email separately | Generate without sending; operator sends in a second step | |

**User's choice:** Email + copy URL

### Link expiry
| Option | Description | Selected |
|--------|-------------|----------|
| No expiry, one per booking | Reusable URL until paid; simplest | ✓ |
| Expires after N | 24–48h or until trip date; needs expiry/regenerate handling | |
| You decide | Leave to researcher/planner per Stripe capabilities | |

**User's choice:** No expiry, one per booking

---

## Письмо с оплатой

### Email content
| Option | Description | Selected |
|--------|-------------|----------|
| Summary + amount + button | Branded, trip summary + amount due + "Pay now" button | ✓ |
| Minimal | Amount + pay button only | |
| You decide | Micro-copy to planner/UI-SPEC | |

**User's choice:** Summary + amount + button

### Send gating
| Option | Description | Selected |
|--------|-------------|----------|
| Always transactional + logEmail | It's the operator's action, not a notification; only logEmail dedup | ✓ |
| Toggle + global flag | Full symmetry with Phase 63 change email | |
| You decide | Leave to planner | |

**User's choice:** Always transactional + logEmail

---

## Жизненный цикл + доплата

### Attach link later to existing booking
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, from bookings list | "Generate payment link" action in expanded row of existing unpaid/pending booking | ✓ |
| Only at creation | Link only in the create form | |
| You decide | Leave to planner | |

**User's choice:** Yes, from bookings list

### Top-up link for edited paid booking (deferred from Phase 63) — scope decision
| Option | Description | Selected |
|--------|-------------|----------|
| Defer | Phase 64 = full-amount bookings; top-up (partial reconcile) is a separate phase | ✓ |
| Include in 64 | Build top-up on the same link machinery | |
| You decide | Leave to planner | |

**User's choice:** Defer

---

## Claude's Discretion

- Exact Stripe mechanism (Payment Link object vs. server-created Checkout Session) — behavior locked, mechanism open.
- Payment-request email micro-copy and layout.
- Whether a column is added to persist link/session id vs. keying on `booking_reference` metadata.
- UI placement/labels of copy-URL, send-again, and row-level "Generate payment link" controls.

## Deferred Ideas

- Top-up payment link for a price difference on an already-paid edited booking — re-deferred to a separate phase.
- Automatic charging / re-charge of amounts.
- Payment-link expiry + regenerate-on-expiry.
- Automatic reminders for unpaid pay-link bookings (v2 / FOLLOW-01 bucket).
