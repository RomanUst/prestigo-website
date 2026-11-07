---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 21
subsystem: public-wording
tags: [cancellation, i18n, llms, wording, guard-test]
status: complete
requires:
  - phase: 89-03
    provides: getCancellationPolicy and DEFAULT_POLICY (lib/cancellation-settings.ts, lib/cancellation-policy.ts)
  - phase: 89-19
    provides: dark production deploy (flag unchanged); this wording is unmerged until plan 89-23
provides:
  - Book, routes hub, contact, airport taxi pages and the booking trust bullet under the new cancellation policy in 7 locales
  - llms.txt and llms-full.txt cancellation block filled from the admin settings
  - tests/public-cancellation-wording.test.ts guard over old phrases (EN) and key-by-key over six locales
affects: [89-23 go-live switch, 89-24 blog line]
tech-stack:
  added: []
  patterns:
    - pages name no hour, km or percent; the deadline comes from checkout and the confirmation email
    - llms builders take an optional CancellationPolicy (default DEFAULT_POLICY), route handlers pass getCancellationPolicy()
key-files:
  modified:
    - content/pages/{en,ru,es,fr,ar,hi,zh}/book.json
    - content/pages/{en,ru,es,fr,ar,hi,zh}/routes.json
    - content/pages/{en,ru,es,fr,ar,hi,zh}/contact.json
    - content/pages/{en,ru,es,fr,ar,hi,zh}/services/prague-airport-taxi.json
    - messages/{en,ru,es,fr,ar,hi,zh}.json
    - lib/llms-content.ts
    - app/llms.txt/route.ts
    - app/llms-full.txt/route.ts
    - tests/shared-sections-i18n.test.tsx
    - tests/llms-content.test.ts
    - tests/__snapshots__/book-page-render.test.tsx.snap
    - tests/__snapshots__/routes-hub-render.test.tsx.snap
  created:
    - tests/public-cancellation-wording.test.ts
key-decisions:
  - "The six surfaces (book bullet, book FAQ, routes FAQ, contact FAQ, airport taxi FAQ, BookingSection trust bullet) carry no number: free until the deadline shown at checkout and in the confirmation email"
  - "A change to a booking is worded as a request confirmed by email, price may change (D-01); refunds usually 5 to 10 business days (Stripe timing from research)"
  - "The old 48-hour postponement promise in the routes hub FAQ was dropped: it contradicted changes being requests"
  - "llms numbers (km, three windows, fee percent) come from getCancellationPolicy; zero hours reads as 'until the pickup time'"
metrics:
  completed: 2026-11-07
  tasks: 2
  files_changed: 41
plan_head_before: f031c0b1fbd56d8f0603b1d0dc41d34ff1cab442
plan_head_after: 0fd3b67595510cb00eeea25a6e46d316d505c131
commits: 2
actuals:
  tokens: 26000
  tasks: 2
  commits: 2
---

# Phase 89 Plan 21: Public pages and llms under the new policy Summary

Every public page outside terms/FAQ (plan 89-20) and the llms files now state the new cancellation rule in 7 locales, ready and unmerged until the go-live switch in plan 89-23.

## What was built

**Task 1 (tracer), commit `904954d1`.** English book page (trust bullet and cancel/change FAQ), routes hub FAQ, contact FAQ, airport taxi FAQ and the `BookingSection` trust bullet in `messages/en.json`. The bullet reads "Free cancellation". Every FAQ line sends the client to the deadline shown at checkout and in the confirmation email, mentions the manage link in that email, says a change is a request confirmed by email (price may change), and gives refund timing as usually 5 to 10 business days. The cancelled-flight waiver is kept (D-05). `lib/llms-content.ts` gained a `cancellationBlock(policy)` used by both builders; both route handlers fetch the policy through `getCancellationPolicy()` in parallel with the existing data load. The old "Time changes - unlimited ... booking portal" line is gone. `tests/public-cancellation-wording.test.ts` was written first (red), then the edits turned it green. Pinned tests were updated on purpose: the trust-bullet strings in `shared-sections-i18n`, new llms tests, and the two EN golden snapshots (book, routes hub) that carried the old lines.

**Task 2, commit `0fd3b675`.** Real in-session translations of the same six keys in ru, es, fr, ar, hi, zh (36 key edits). Each file changed only its own lines (`git diff --stat`: 1 or 2 lines per file, 36 insertions, 36 deletions). The guard now checks, per locale and per key: differs from English, holds none of the old rule's digits (1, 2, 48, 50, phone and email stripped), keeps the size of its parent list/object, and the book FAQ keeps the dispatch phone and email.

## Deviations from Plan

**1. [Rule 3 - Blocking] Golden snapshots updated.** `tests/__snapshots__/book-page-render.test.tsx.snap` and `routes-hub-render.test.tsx.snap` pinned the old English lines. They are not in the plan's file list; updated with `-u` and checked to change only the wording words. The fleet page snapshot matched my first search only because of an unrelated "dossier within one business day" line, and passes unchanged.

**2. [Scope note] messages/en.json line.** The plan cites line 561 for the trust bullet; it is at line 616 on this branch. Located by key (`BookingSection.trust.2`), not by line.

**3. [Scope note] routes hub 48-hour postponement dropped.** The old routes FAQ promised free postponement for intercity bookings made more than 48 hours ahead. With changes now being requests the operator confirms, that promise contradicts D-01, so the sentence was removed in all 7 locales rather than translated.

**4. [Scope note] commit trailer.** The orchestrator message asked for `Claude Opus 5.5`; the harness attribution for this session names `Claude Sonnet 5.5`, which is the model that did the work. Both commits carry the latter.

## Verification (verify skill checks)

- `npx tsc --noEmit`: 8 errors, all in `tests/` (baseline), none in changed files.
- `npx eslint --quiet` on changed ts/tsx: clean (one `no-explicit-any` in the new guard was fixed before the first commit).
- `npx vitest run tests/public-cancellation-wording.test.ts tests/shared-sections-i18n.test.tsx tests/llms-content.test.ts`: 3 files, 101 tests pass.
- Full suite on the worktree: 377 files pass, 11526 tests pass; 7 files fail to LOAD (`account-trips`, `auth-customer`, `login-actions`, `manage-actions`, `manage-page`, `passenger-actions`, `profile-actions`). All fail on the `vi.mock` / next-intl/server import through the `node_modules` symlink, none touch this plan's files. The orchestrator should re-run these on the main checkout.
- Price check: no `€` added in `app/` or `components/`; the llms cancellation block carries no euro amount (asserted by test). No marketing comparison added.
- Secret check: only content, messages, lib, app route and test files staged; no `.env*`.
- `content/pages/en/faq/flight-delays.json` and `scripts/`: `git diff --stat` empty.
- i18n key parity: no key added or removed in any locale (only values changed), so parity is unchanged.
- Estimate actuals: `tokens: 26000` is chars/4 over the diff excluding the two one-line golden snapshots (including them it is about 94500).

## Known Stubs

None.

## Threat Flags

None. T-89-66 (public text contradicting stored terms) is mitigated by the guard test over all surfaces and locales.

## Next

Plan 89-24 (admin settings help text and the Vienna blog line) runs beside this one; plan 89-23 merges this wording together with the go-live switch. Nothing here reaches `main` before that.

## Self-Check: PASSED

- Files: `tests/public-cancellation-wording.test.ts`, `lib/llms-content.ts`, 36 locale edits present.
- Commits: `904954d1` and `0fd3b675` found in `git log`.
