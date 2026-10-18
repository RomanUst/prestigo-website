---
phase: 81-lead-capture-site-forms-supabase-espocrm
source: 81-REVIEW.md
recorded: 2026-10-18
critical: 0
warning: 4
info: 7
open: 7
fixed: 4
updated: 2026-10-18
---

# Phase 81 — Code Review Disposition

Advisory review (0 critical). Every finding is open until triaged; none blocks phase completion.
The four warnings were fixed on branch `claude/beautiful-mayer-240991` (see the notes below the table).

| ID | Finding | Disposition |
|----|---------|-------------|
| WR-01 | Deferral re-publish reuses one dedup id, so the second deferral is silently dropped by QStash | fixed |
| WR-02 | A CRM 400 permanently fails the delivery and drops the Lead with no alert; only the phone number has a fallback | fixed |
| WR-03 | Booking Lead value is understated for round trips and never refreshed after a price edit | fixed (amount); edit refresh: documented limitation |
| WR-04 | Public form endpoints now feed a permanent store and the CRM with no spam control and no retention | fixed (CSRF + contact honeypot); retention: open |
| IN-01 | Failed email leaves an orphan inquiry with no dispatch, and a retry creates a duplicate Lead | open |
| IN-02 | `retryLater` and `breaker` ignore the result of `reschedule` and `publish` | open |
| IN-03 | A skipped purge is never re-evaluated | open |
| IN-04 | Dead code and duplicated QStash client | open |
| IN-05 | CRM role scope is wider than needed, and `cSupabaseRef` is editable in the UI | open |
| IN-06 | A missing or invalid CRM config or assignee fails silently | open |
| IN-07 | `outbox_complete` and `outbox_reschedule` do not check the lease holder | open |

## Notes on the fixed warnings

**WR-01 (fixed).** `deferOrFinish` now uses `deferDedupSuffix(attempts, now, delay)` =
`d<attempts>_<now epoch s + delay>`: each deferral to a new time is a new QStash message, while two deferrals
aimed at the same instant (a duplicate delivery) still collapse. The fixed 30 s step is kept for rows held by
another worker (deferring to `lease_until` would make the normal concurrent loser wait 120 s instead of 30 s);
with unique ids the chain re-checks every 30 s and claims once the lease expires. Test: two consecutive
deferrals of a blocked row publish two different dedup ids (`tests/lead-sync.test.ts`).

**WR-02 (fixed).** `createLead` relaxes the body on each 400: without phone, then without email (the address
moves into the description), then a minimal body (ref, status, source, name, description; no assignee, no
custom marks). Only after that is the row `failed`. Every terminal failure logs
`[lead-sync] ALERT lead_delivery_failed key=<key> code=<code>` (ids and code only), and the daily sweep
returns `failed: <n>` for rows that turned `failed` in the last 25 h and logs
`[outbox-sweep] ALERT failed_last_25h=<n>`. Runbook updated. Tests in `tests/lead-sync.test.ts` and
`tests/outbox-sweep.test.ts`.

**WR-03 (amount fixed; edit refresh documented).** The finding's premise is partly off: the outbound row's
`amount_eur` is the combined, post-promo checkout total (buildBookingRows keeps `meta.amountEur` on the
outbound row and writes `null` on the return row), so adding the return leg would double-count. The real gap
was that round trips saved by the `create_round_trip_bookings` fallback have `amount_eur` null on both legs
(both production round trips, checked read-only on 2026-10-18), so the Lead had no value at all. New
`bookingLeadAmountEur`: use `amount_eur` when present, else for a round trip
`czkToEur(outbound_amount_czk + return_amount_czk)` (pre-promo, both legs). Edit refresh (price or contact
edits never reach the Lead until the next status change) is documented as a known limitation in
`infra/vps/runbooks/lead-capture.md` with the proposed trigger widening; no migration was written or applied
(needs a versioned key shape in `parseOutboxKey` too, so it is a planned change, not a review fix).

**WR-04 (CSRF + honeypot fixed; retention open).** `/api/corporate-contact` and `/api/submit-multiday-quote`
added to `CSRF_PROTECTED_PREFIXES`; all three forms post with a same-origin `fetch`, so the browser sends
an allowed Origin, and a missing Origin is still allowed (non-strict path). `/api/contact` and
`ContactForm` got the corporate form's hidden `website` honeypot: a filled honeypot answers `{ ok: true }` and
stores, emails and dispatches nothing. Customer-facing responses are unchanged. Not done: a honeypot or
Turnstile on the multi-day form, and the `inquiries` retention decision (job or privacy-notice wording);
both are owner decisions.
