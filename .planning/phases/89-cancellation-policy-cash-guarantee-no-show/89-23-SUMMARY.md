---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 23
subsystem: go-live
tags: [go-live, flag-flip, wording, deploy]
requires: [89-20, 89-21, 89-22, 89-24]
provides: ["new cancellation policy, card-after-trip and cash guarantee live for all clients"]
affects: []
key-files:
  created: []
  modified:
    - content/pages/{en,ru,es,fr,ar,hi,zh}/terms.json
    - .planning/phases/89-cancellation-policy-cash-guarantee-no-show/89-GO-LIVE-CHECKLIST.md
decisions:
  - "D-16: no counsel review, owner accepts the risk (recorded earlier, not re-asked)"
  - "D-17: go live for everyone at once; owner approved on 2026-11-09 with D2-D13 deferred"
status: complete
completed: 2026-11-09
---

# 89-23: go-live decision, wording merge, flag flip

## What happened

1. Gate before merge: tsc baseline only (8 old errors in `tests/`), `npm run build` OK, full vitest
   383/386 files green under load; the 3 timeouts (load-sensitive UI tests) pass in isolation, and a
   later full run was 386/386.
2. Terms "last updated" set to 9 November 2026 in all 7 locales (commit 7db6ebd7).
3. PR #94 (`feat/89-wording`) merged to main, merge commit 0608b977. The first production build
   failed on the known Turbopack Google Fonts flake; `vercel redeploy` produced
   prestigo-site-77itn1nop, aliased to rideprestigo.com.
4. After deploy: /, /terms, /faq, /ru/faq, /book, /llms.txt, /robots.txt return 200; /terms shows
   the new date; llms.txt states the new free-cancellation rule.
5. The owner selected "All clients" in Admin → Settings → Card payment.
   `pricing_globals.card_flow_mode = 'on'` read at 2026-11-09 16:30 UTC. Canary list unchanged.

## Rollback

Admin → Settings → Card payment → Off. New bookings go back to pay-now; existing bookings keep
their stored policy.

## Left

- Check the first non-canary booking: `payment_mode`, `cancel_policy_version`, `text_version`;
  bookings created before the flip keep a NULL policy.
- Live money checks D2-D13 (deferred in 89-22).
