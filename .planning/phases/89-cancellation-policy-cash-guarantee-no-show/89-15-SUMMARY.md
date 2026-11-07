---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 15
subsystem: public-ui
tags: [manage-page, secret-link, i18n, next-intl, privacy, my-trips]
requires:
  - phase: 89-02
    provides: "isPrivateLinkPath guards, Referrer-Policy/no-store headers on /manage"
  - phase: 89-03
    provides: "policyFromSnapshot, evaluateCancellation, proposedFeeMinor, tripFactsFromRow"
  - phase: 89-04
    provides: "resolveManageToken, ensureManageToken"
  - phase: 89-08
    provides: "cancelBooking rules mirrored for the display (fee base, too_late on unknown pickup)"
provides:
  - "lib/manage-view.ts: buildManageView (pure allow-list view model), loadManageView (explicit-column service read), isManageActiveStatus"
  - "/{locale}/manage/[token]: force-dynamic, noindex, no-referrer page with loading.tsx, one InvalidManageLinkView, ManageHeader"
  - "named slots data-manage-slot=cancel-region and change-request for plan 89-28"
  - "Manage.* and Account.trips.manage in 7 locales; Manage booking link on My trips"
affects: [89-22, 89-28]
requirements-completed: [HOLD-06, CANC-01]
status: complete
completed: 2026-11-06
commits: 2
plan_head_before: a8ea758def68907849573be3ba1f6393ee774403
plan_head_after: aea3b53d5424346ec1f172c8e343d37b3d8be22a
actuals:
  tokens: 45000
  tasks: 2
  commits: 2
key-files:
  created:
    - lib/manage-view.ts
    - app/[locale]/manage/[token]/page.tsx
    - app/[locale]/manage/[token]/loading.tsx
    - app/[locale]/manage/[token]/InvalidManageLinkView.tsx
    - app/[locale]/manage/[token]/ManageHeader.tsx
    - tests/manage-page.test.tsx
  modified:
    - app/[locale]/account/trips/page.tsx
    - messages/{en,ru,es,fr,ar,hi,zh}.json
key-decisions:
  - "The view model is an allow-list built field by field plus an explicit column list in the read; no client email, phone, name, driver, reason or note exists in the object (T-89-52, tested on the serialized JSON and on the markup)."
  - "Active statuses are derived from VALID_TRANSITIONS (can go to cancelled, not on_board), as cancelBooking does; tests/booking-status-parity bans hand-written status lists."
  - "A late outcome with nothing to charge (no card, manual booking) shows a no-fee sentence instead of a percent claim, matching cancelBooking, which then releases/refunds nothing and opens no case."
  - "An unreadable pickup instant renders the too_late (call us) panel, as cancelBooking refuses a client cancel then."
  - "Invalid view takes only the locale and is rendered with HTTP 200 for every reason, so the markup and status are identical."
  - "My trips link uses getPathname with the token path (same path buildManageUrl builds), relative, so it works on every host."
---

# Phase 89 Plan 15: Manage-booking page, read side Summary

**A client opens the secret link, sees the booking, its payment sentence and the cancellation terms it was made under (free, late with the proposed fee, or call-us after pickup), in 7 locales, and the page cannot leak any client or operator data; signed-in clients reach the same page from My trips.**

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Token through resolveManageToken and buildManageView to the page for every state-table row | 0013e3cd |
| 2 | My trips Manage link and six-locale translations | aea3b53d |

Tracer verified end to end in `tests/manage-page.test.tsx`: real page function, real buildManageView, mocked token resolver and reader; free, late, too_late, on_board, completed, cancelled (none, pending, charged, waived, refunded), no_show, unknown status, partial row, and the invalid view for malformed, unknown, throwing resolver, missing booking and throwing reader (identical markup).

## Deviations from Plan

**1. [Rule 3 - Blocking] Extra file `ManageHeader.tsx`.** The slim header is shared by the page, the invalid view and loading.tsx; a fourth small file avoided triplicating it. No behaviour change.

**2. [Rule 1 - Bug] Hand-written status list.** First draft had a `MANAGE_ACTIVE_STATUSES` array; `tests/booking-status-parity.test.ts` caught it; replaced by `isManageActiveStatus` derived from VALID_TRANSITIONS.

**3. Task split of the shared test file.** Task 1's commit carries the English-only slice of `tests/manage-page.test.tsx`; Task 2's commit adds the multi-locale, My trips and catalog parity tests (same file, per the plan).

**4. `cancelled.chargedLate`, `panel.lateNoFee`, `panel.bankNote`, `status.*` keys** were added beyond the UI-SPEC sentence list to cover a charged case without a known deadline, a late cancel with nothing to charge, and the status line names. All translated in all 7 locales.

## Verification

- `npx vitest run tests/manage-page.test.tsx tests/payments-copy-i18n.test.ts tests/account-trips.test.tsx tests/private-link-paths.test.tsx tests/booking-status-parity.test.ts`: pass (68 tests in manage-page).
- Full suite: 10930 passed; the one other failure in the full run (`seo-volume-pages` sitemap test, 60s timeout) passed alone (42/42), a load timeout unrelated to this plan.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`.
- `npx eslint --quiet` on all touched files: clean.
- Acceptance greps: `force-dynamic` count 1, `getLocale(` 0, euro sign 0 in the page.

## Environment note

node_modules is a symlink to the main checkout; vitest then resolves `next-intl/dist/...react-server.js` to a real path outside the root and fails with `Cannot find module '/@fs/...'` (also for the pre-existing `tests/account-trips.test.tsx`). Tests were run with a throwaway `vitest.symlink.config.ts` (`resolve.preserveSymlinks: true`), left untracked and NOT committed. In the main checkout the normal config works. The new test builds the react-server path from `process.cwd()`.

## Known Stubs

None. The two `data-manage-slot` divs (`cancel-region`, `change-request`) are intentional mount points for plan 89-28 (the Cancel control, confirm region and change-request form), named in the plan.

## Threat Flags

None beyond the plan's register. T-89-52 mitigated (allow-list, tested); T-89-54 accepted as planned.

## Backstops (not verifiable here)

320px wrapping of long addresses in ru/ar, and mirrored layout plus Noto fonts in ar/hi through the localized route, need a browser with a real token (plan 89-22 owner check). The page was not opened in a browser (needs Supabase and a live token).

## Self-Check: PASSED

Files exist (lib/manage-view.ts, the five page files, tests, summary); commits 0013e3cd and aea3b53d are on the branch.
