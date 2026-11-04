# Phase 88: Card on File & Scheduled Holds - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-04
**Phase:** 88-card-on-file-scheduled-holds
**Areas discussed:** Pay now vs card, Hold at checkout, Hold failure, Price/time change after hold

---

## Pay now vs card

| Option | Description | Selected |
|--------|-------------|----------|
| Save card only | One path, nothing charged now, charged after the trip (Blacklane-style) | ✓ |
| Client chooses | "Pay now" and "Pay after the trip" side by side | |
| Save card, pay-now as a link | Save card primary, small "prefer to pay now" link | |

**User's choice:** Save card only

| Option | Description | Selected |
|--------|-------------|----------|
| Transfers and hourly | Every online-paid booking | ✓ |
| Transfers only | Hourly keeps pay-now for now | |

**User's choice:** Transfers and hourly

---

## Hold at checkout

| Option | Description | Selected |
|--------|-------------|----------|
| Only if pickup ≤ 72 h | One rule, money frozen at most 3 days; further out → scheduled hold at 72 h | ✓ |
| If pickup ≤ 6 days | On-session 3DS hold for anything within 6 days; fewer declines, money frozen longer | |

**User's choice:** Only if pickup ≤ 72 h

| Option | Description | Selected |
|--------|-------------|----------|
| Exact date | "Nothing charged now. On 12 November we'll hold the amount…" | ✓ |
| General rule | "Held 72 h before pickup, charged after the trip" | |

**User's choice:** Exact date

---

## Hold failure

| Option | Description | Selected |
|--------|-------------|----------|
| Link now + one retry | Payment link + alert immediately, one automatic retry ~12 h later if unpaid | ✓ |
| Link only | No automatic retry; operator retries from admin | |

| Option | Description | Selected |
|--------|-------------|----------|
| Email via Resend | From Vercel, plus admin badge | ✓ |
| Email + Telegram bot | Extra Telegram message, owner adds bot token | |

| Option | Description | Selected |
|--------|-------------|----------|
| Operator decides | Trip stays active, second alert 24 h before pickup; auto-cancel is Phase 89 | ✓ |
| Auto-cancel in Phase 89 | Same now, add auto-cancel to Phase 89 | |

---

## Price/time change after hold

| Option | Description | Selected |
|--------|-------------|----------|
| Difference charged separately after the trip | Capture hold in full + off-session charge for the difference; link on decline | ✓ |
| Re-place the hold now | Release + new full hold; two holds visible, decline risk | |
| Only within the hold | No automatic difference; operator sends a link | |

| Option | Description | Selected |
|--------|-------------|----------|
| Release and re-place | Release old hold now, scheduler places new one at new pickup − lead | ✓ |
| Keep, charge card after the trip | Hold expires, fallback charge after the trip | |

---

## Claude's Discretion

- Retry delay, scheduler cadence, QStash vs daily cron split
- Stripe Customer for guests, confirmSetup integration, ledger schema, webhook routing
- Admin payment panel layout, email template design, draft consent wording

## Deferred Ideas

- Auto-cancel of unpaid bookings near pickup → consider in Phase 89
- Telegram bot alerts → not now
- Pay-now option alongside card-on-file → revisit if corporate clients ask
