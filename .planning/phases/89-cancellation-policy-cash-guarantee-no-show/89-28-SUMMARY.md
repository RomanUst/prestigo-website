---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 28
subsystem: public-ui
tags: [manage-page, secret-link, cancel, change-request, i18n, next-intl, security]
requires:
  - phase: 89-02
    provides: "CSRF prefix /api/manage, LIMITS keys /api/manage/cancel and /api/manage/change-request"
  - phase: 89-08
    provides: "cancelBooking with initiator client_token, CancelResult, acknowledge check"
  - phase: 89-15
    provides: "manage page, buildManageView, named slots data-manage-slot=cancel-region and change-request"
  - phase: 89-25
    provides: "operator alert kind change_request (escaped message, never in the ledger)"
  - phase: 89-27
    provides: "client cancelled email, driver notice and operator alerts scheduled from cancelBooking"
provides:
  - "POST /api/manage/cancel: token-gated cancel through cancelBooking (client_token), uniform 404, full CancelResult mapping"
  - "POST /api/manage/change-request: token-gated request to the operator, edits nothing"
  - "ManageActions.tsx: the one client island (cancel region, change-request form) plus ManageTitle (H1 swap)"
  - "Manage.actions.* (32 keys) in 7 locales, real translations"
affects: [89-22]
requirements-completed: [HOLD-06, CANC-01]
status: complete
completed: 2026-11-06
commits: 4
plan_head_before: d763449b786eabc2fedd635f4914c15a538e4503
plan_head_after: 7cd913f5f537a02e1e02488cabbe1eb0a4015539
actuals:
  tokens: 30000
  tasks: 3
  commits: 4
key-files:
  created:
    - app/api/manage/cancel/route.ts
    - app/api/manage/change-request/route.ts
    - app/[locale]/manage/[token]/ManageActions.tsx
    - tests/manage-booking.test.ts
    - tests/manage-actions.test.tsx
  modified:
    - app/[locale]/manage/[token]/page.tsx
    - messages/{en,ru,es,fr,ar,hi,zh}.json
    - tests/manage-page.test.tsx
key-decisions:
  - "The layout has no client message provider, so the page builds every string (and rich node: bdi amounts, tel link) on the server and hands the island ready-made props; the island translates nothing."
  - "Both variants (free and late) are prepared by the page: a 409 POLICY_CHANGED switches the region at once from the server's named outcome, clears the tick, focuses the notice and calls router.refresh() so the server-rendered panel above catches up."
  - "The island uses the locale-aware useRouter from @/i18n/routing; next/navigation's useRouter is a locale-dropping navigation caught by tests/locale-links-backstop (R3)."
  - "A tiny external store keyed by token lets the H1 (ManageTitle) and the change form follow a cancel done in the island; the key means a flag can never leak onto another booking."
  - "The change-request alert key is alert:change_request:<id>:<10-minute bucket>:<8 hex of sha256(message)>: the same text twice mails once, a corrected text a minute later is still mailed."
  - "A repeat cancel and a 409 that means the booking moved (status_conflict, not_cancellable, too_late) make the page refresh into the state it is now, with no error line; a failed refund after the cancel is shown as a success with the 'finish by hand' sentence and no email promise."
patterns-established:
  - "Public secret-link write route: enforceMaxBody, checkRateLimit under its LIMITS key, strict zod body with MANAGE_TOKEN_RE (400 before any database call), resolveManageToken, one uniform 404, Cache-Control no-store on every answer."
---

# Phase 89 Plan 28: What a client can do on the manage page Summary

**A client opens the secret link and can cancel (always after an inline confirmation, late with an explicit tick and the money left to the operator) or ask for a change that reaches the operator as one email and edits nothing, in all 7 locales; a stale page cancels nothing.**

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | POST /api/manage/cancel through cancelBooking to a cancelled booking | 0d41bc19 |
| 2 | ManageActions, change-request route, page mount, EN keys | 7fbc267b |
| 3 | real translations of Manage.actions in ru, es, fr, ar, hi, zh | 10545f71 |
| fix | locale-aware router in ManageActions (R3 backstop) | 7cd913f5 |

Tracer: `POST /api/manage/cancel` is tested with the real route and a faked token resolver and `cancelBooking`; the orchestrator's own client_token behaviour is covered by `tests/payments-cancel.test.ts`. The route test asserts the exact `cancelBooking` input (initiator `client_token`, actor `{ type: 'system', id: 'client_token' }`, `acknowledge`).

## What was built

- **Cancel route** (`app/api/manage/cancel/route.ts`): body cap 2 KB, rate limit under `/api/manage/cancel`, strict `{ token, acknowledge }` (token matched against `MANAGE_TOKEN_RE`, so a malformed one is 400 with no database call), `resolveManageToken`, then `cancelBooking`. Unknown, revoked, partner, expired and vanished-booking all answer the same 404 `invalid_link`. Mapping: ok -> 200 with outcome/money (no refund id); already_cancelled -> 200; busy -> 409 `payment_busy`; conflict -> 409 `status_conflict`; not_cancellable (on_board) -> 409 with the current status; too_late -> 409; policy_changed -> 409 `POLICY_CHANGED` with the new outcome; money_failed -> 200 `money: manual`; db_failed after the cancel -> 200 late/kept; before it -> 500. Every answer is `no-store`. Nothing is logged with the token.
- **Change-request route**: same guards under its own key (5/min), strict `{ token, message }`, message trimmed, CRLF folded, control characters removed, 1 to 1000 characters. Reads the booking with an explicit column list, refuses a status that can no longer change (409 `not_changeable`, derived from `isManageActiveStatus`), then `sendPaymentOperatorAlert('change_request', ...)`. `sent` and `duplicate` are both a 200; a failed send is 502 so the client keeps the text. The route writes nothing to bookings or the ledger (asserted on the source).
- **ManageActions.tsx** (the only client component; also exports `ManageTitle`): cancel region (button, inline `role="group"` confirm, focus to the heading `tabIndex -1`, Keep my booking first and gold, Yes cancel outline in the error colour, Escape closes when not busy and returns focus, `Cancelling…` with `aria-busy` and both buttons disabled, late tick unticked on every mount and gating the confirm); result region (`role="status"`, focused); error slot (`role="alert"` for errors, `role="status"` for the policy notice which takes focus); change form (collapsed ghost button, label + textarea 5 rows maxLength 1000, helper, counter above 900, phone line, `Sending…`, success replaces the form, typed text kept in every failure).
- **page.tsx**: mounts the island in `[data-manage-slot="cancel-region"]` (free and late panels) and `[data-manage-slot="change-request"]`, builds all strings with `getTranslations('Manage.actions')`, wraps the H1 in `ManageTitle`.
- **Catalog**: 32 keys under `Manage.actions` (`cancel`, `result`, `error`, `change`) translated in-session in ru, es, fr, ar, hi, zh (formal register; ICU parameters and rich tags untouched; French non-breaking spaces before `?`, `:` `;` `%`). No script was run.

## Verification

- `npx vitest run` over `tests/manage-actions.test.tsx tests/manage-booking.test.ts tests/manage-page.test.tsx tests/payments-copy-i18n.test.ts tests/manage-link.test.ts tests/private-link-paths.test.tsx tests/locale-links-backstop.test.ts tests/i18n-completeness.test.ts tests/booking-status-parity.test.ts`: all green (manage-booking 27, manage-actions 55, manage-page 68).
- Full suite (with the symlink config below): 11182 passed, 1 failed (`tests/locale-links-backstop.test.ts` R3: `useRouter` from `next/navigation`); fixed in commit 7cd913f5 and the file re-run green together with the manage suites.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`. `npx eslint --quiet` on all touched files: clean.
- Acceptance: `grep -c client_token app/api/manage/cancel/route.ts` >= 1; a test asserts one identical answer over the four invalid reasons (plus a vanished booking); the euro sign count in `ManageActions.tsx` is 0 (asserted); no new key in the six files equals its English value (asserted).

## Deviations from Plan

**1. [Rule 2 - Missing functionality] Alert key includes a hash of the message.** The plan names `alert:change_request:<id>:<10-minute bucket>`. With only that, a client who sends a correction a minute after the first request would see success while the operator never receives it (the alert ledger swallows the second as a duplicate). The key now ends with the first 8 hex characters of sha256(message): identical text in the same bucket still mails once. The message itself still never reaches the ledger (the key holds a hash prefix only).

**2. [Rule 1 - Bug] Locale-dropping router.** First draft used `useRouter` from `next/navigation`; `tests/locale-links-backstop.test.ts` (R3 guard) failed in the full run. Switched to the router of `@/i18n/routing`; the two tests mock that module instead. Commit 7cd913f5.

**3. [Design] Empty message is blocked inline instead of a disabled button.** UI-SPEC says the Send button is "disabled while empty or sending" and also lists an inline "Please write what you would like to change." error; both cannot be reachable. The plan's truth ("an empty message is blocked inline") wins: the button is disabled only while sending, an empty or whitespace-only message shows the `role="alert"` line and focuses the textarea.

**4. [Rule 2] Extra files / keys beyond the plan's list.** `tests/manage-page.test.tsx` (mock of the locale router the island needs); catalog keys `cancel.tickLateNoFee` and `result.lateNoFee` (a late outcome with nothing to charge has no percent or amount to name), `result.generic` and `result.manual`; `ManageTitle` export for the H1 swap.

**5. [Process] The plan-head ledger file was written by hand** to the worktree git dir at the start (`gsd-plan-head-before-89-28`); `commits: 4` is measured with `git rev-list --count d763449b..HEAD` before the SUMMARY commit.

## Environment note

`node_modules` is a symlink to the main checkout; vitest then resolves next-intl's react-server build to a real path outside the root (`Cannot find module '/@fs/...'`). Tests were run with a throwaway `vitest.symlink.config.ts` (`resolve.preserveSymlinks: true`), left untracked and NOT committed. In the main checkout the normal config works.

## Known Stubs

None.

## Not verified here (needs a browser with a live token, plan 89-22 owner check)

- Real focus behaviour, 320px wrapping of the confirm buttons in ru/ar, mirrored layout in ar, and the `router.refresh()` round trip after POLICY_CHANGED (the test asserts the call and the instant switch; the refreshed server panel heading was not observed).
- Known gaps against UI-SPEC: after a cancel the "Book a new ride" button stays the ghost style (it is server-rendered; only the H1 and the change form follow the cancel); the status line under the H1 is not updated live. A page reload shows the cancelled summary with both.

## Threat Flags

None beyond the plan's register. T-89-50 (uniform 404, rate limit, 256-bit token), T-89-51 (POST with explicit button and acknowledge, GET read-only) and T-89-53 (escaped in the alert, length cap, never in the ledger or a log) are mitigated and asserted by tests.

## Self-Check: PASSED

- app/api/manage/cancel/route.ts, app/api/manage/change-request/route.ts, app/[locale]/manage/[token]/ManageActions.tsx, tests/manage-booking.test.ts, tests/manage-actions.test.tsx: FOUND
- commits 0d41bc19, 7fbc267b, 10545f71, 7cd913f5: FOUND
