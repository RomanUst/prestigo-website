---
phase: 84-chatwoot-dashboard-app
plan: 08
subsystem: ui
tags: [chatwoot, dashboard-app, embed, booking-card, clipboard, refresh]
status: complete
requires: ["84-01", "84-07"]
provides:
  - "app/embed/chatwoot-dashboard/BookingCard.tsx: D-06 booking card; exports default BookingCard plus formatPickup, formatPragueTime, formatEur"
  - "app/embed/chatwoot-dashboard/CopyLinkButton.tsx: D-09 copy with clipboard API, execCommand and read-only input fallbacks"
  - "app/embed/chatwoot-dashboard/PanelClient.tsx: full page structure, states, show-more, refresh triggers, footer"
  - "app/embed/chatwoot-dashboard/panel.css: card, badge, layout and state styles for both themes"
affects: [84-09]
tech-stack:
  added: []
  patterns:
    - "Own-property label lookup (hasOwnProperty) so raw keys like constructor never hit Object.prototype"
    - "Copy chain: navigator.clipboard.writeText, then execCommand on an off-screen readonly textarea, then a selected read-only input"
    - "Single panel live region: cards announce through an onAnnounce prop; a standalone card renders its own sr-only region"
    - "Auto refresh triggers skip while a request is in flight (loadingRef), so focus plus visibility never double-fetch"
key-files:
  created:
    - app/embed/chatwoot-dashboard/BookingCard.tsx
    - app/embed/chatwoot-dashboard/CopyLinkButton.tsx
    - tests/embed-panel-cards.test.tsx
  modified:
    - app/embed/chatwoot-dashboard/PanelClient.tsx
    - app/embed/chatwoot-dashboard/panel.css
key-decisions:
  - "Copy button requires BOTH paymentState awaiting_payment and isSafePaymentLinkUrl on the client (UI-SPEC D-09), on top of the server check"
  - "Panel 'Updated hh:mm' uses the server generatedAt (Prague time), so it stays honest when a background refresh fails and old data remains"
  - "no_access clears the loaded data (only its copy shows); every other error keeps the last good data below the error line"
  - "Zero-booking state shows 'No bookings' without the counters block"
  - "All panel links (Open in admin, Create booking, Lead, Open all bookings) open in a new tab with rel noopener noreferrer, because a plain link would navigate the Chatwoot iframe itself"
  - "Section headings use 'Upcoming <span>· n</span>' with a real space so the accessible name reads 'Upcoming · 3'"
requirements-completed: [PANEL-01]
duration: 40min
completed: 2026-10-29
commits: 2
plan_head_before: 2ea3e8175241f69140f20c8863cbe7aeaacabddb
plan_head_after: 64f90e1d71f33f609b7008ca1e8f960250eaee13
actuals:
  tokens: 16000
  tasks: 2
  commits: 2
---

# Phase 84 Plan 08: Full panel UI Summary

The Chatwoot panel now matches the approved UI-SPEC: full D-06 booking cards with a three-tier Copy payment link, the D-05 page structure, the D-08 empty state, the D-12 hint, verification and phone-mismatch lines, self-refresh and a footer. It stays read-only: links, Refresh, Show more, Copy and Forget token are the only controls.

## What was built

- **BookingCard** (text-only React output): date heading in Europe/Prague with a Return badge; route (`origin`, `to destination`, or `origin - n h` for hourly); badge row (status, payment, reference); meta line `Vehicle · n pax · n bags · amount` (amount via `Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })`, omitted when null); driver with trip-progress badge; `Flight x`; Customer notes clamped to 3 lines with a Show full note toggle (overflow measured with scrollHeight, kept sticky once detected); actions row with `Open in admin` (new tab, `noopener noreferrer`, only for an href under `/admin/`) and the Copy button. Optional rows are omitted entirely. Unknown status, vehicle class or progress renders raw in the neutral badge; payment badge is absent for cancelled bookings. Trip progress reuses the status hues (arrived = on_location, on_board = assigned, no_show = cancelled).
- **CopyLinkButton**: re-checks `isSafePaymentLinkUrl` before rendering anything (no button and no URL text for http, other hosts, lookalike hosts, credentials, ports, `javascript:`). Click tries the async clipboard API, then `document.execCommand('copy')` on a selected off-screen readonly textarea (removed afterwards, focus restored), then reveals a read-only auto-selected input with `Press Ctrl/Cmd+C to copy`. Success shows `Copied` for 2 s and announces `Payment link copied`. The link is never opened.
- **PanelClient**: header (h1 Bookings, Refresh / Refreshing...), contact line, verified or unverified hint (unpaid-hue dot, primary text, never red) above the counters, `Phone matches a different customer` meta line, counters `dl` (Trips, Total spent), `Upcoming · n` with every upcoming card (first one gets the accent rule), `Past · n` with 10 cards and `Show n more` expanding locally (no request), `Open all bookings in admin` when pastTruncated, per-section empty lines, the empty state (`No bookings found for {email or phone}.`, `Create booking in admin`, `Open Lead in EspoCRM` only for an https leadUrl), the D-12 no_contact hint, no_access showing only its copy, and a footer with `Updated hh:mm` and `Forget token` (clears sessionStorage, back to token entry, no confirmation).
- **Refresh**: window focus, `visibilitychange` to visible, a 30 s interval that fires only while visible, and the button. A background refresh keeps the last good response on screen with no skeleton; failures show the mapped error above the still-visible cards; a 401 clears the token.
- **panel.css**: accent left rule, notes clamp, actions row, offscreen textarea, hint dot, counters (Display 20/600 tabular), section spacing, footer, badge border at 25% of the foreground (`color-mix` with a solid fallback), 280-400 px no-horizontal-scroll rules (`min-width: 0`, `overflow-wrap: anywhere`).

## Verification

- `npx vitest run tests/embed-panel-cards.test.tsx tests/embed-panel.test.tsx tests/dashboard-app-isolation-guard.test.ts tests/infra-vps-isolation-guard.test.ts tests/middleware-embed.test.ts`: 5 files, 213 tests pass (symlinked node_modules). `embed-panel-cards` has 60 tests (card fields and order, hues, prototype-key safety, notes clamp, three copy tiers, unsafe-link matrix, tracer through PanelClient, counters, sections, show-more, empty and no-contact states, hints, refresh triggers incl. fake-timer 30 s and in-flight skip, background refresh and error ordering, footer and Forget token, a11y structure, read-only guarantees, source greps).
- `npx tsc --noEmit`: no errors under `app/embed` or the new test. `npx eslint --quiet app/embed tests/embed-panel-cards.test.tsx tests/embed-panel.test.tsx`: clean.
- Acceptance greps: `currency: 'EUR'` 1, no euro sign in `app/embed`, `execCommand('copy')` 1, `noopener noreferrer` present, `Show full note` 1, hint copy 1, `Create booking in admin` 1, `visibilitychange` 2, no `type="search"`.
- Pre-commit hook ran on both commits (no `--no-verify`).
- Tracer gate: the Task 1 `<verify>` (tests plus tsc filter) was re-run end to end after the commit and passed before Task 2 (automated-only verify).
- The `verify` skill and its browser check were not run: the worktree has no `.claude/skills` copy and subagents may not start a dev server. The orchestrator owns the browser check.

## Deviations from Plan

None - plan executed as written. Notes:
- RED was shown for Task 1 (module not found before the components existed). Task 2 tests were written before the PanelClient rewrite landed, but the rewrite and tests were then run together; the one failing run was a real finding (accessible name of the heading collapsed the space, fixed by writing `Upcoming <span>`).
- The heading fix and the single-live-region design (announce prop) are both implementation choices inside the plan's contract, not scope changes.

## Not done here (left to the orchestrator / 84-09)

- Browser check of `/embed/chatwoot-dashboard` (width 280/320/400 px, both themes, contrast).
- Live check inside Chatwoot of which clipboard tier works in the real cross-origin iframe (UI-SPEC backstop).
- STATE.md and ROADMAP.md are not touched, as instructed.

## Known Stubs

None. Every row is wired to API data; optional rows are omitted when empty by design.

## Threat Flags

None beyond the plan's threat model. T-84-34 (XSS): text rendering only, source grep test forbids HTML-injection props, links are fixed or validated. T-84-35 (malicious payment link): button only for https buy.stripe.com with awaiting_payment, re-checked on the client. T-84-36 (unverified contact): hint shown above the counters. T-84-SC: no packages installed.

## Self-Check: PASSED

- BookingCard.tsx, CopyLinkButton.tsx, PanelClient.tsx, panel.css, tests/embed-panel-cards.test.tsx: present.
- Commits 9ad66f56 (Task 1) and 64f90e1d (Task 2) present on branch worktree-agent-a326c28ab18f1b7cc.
