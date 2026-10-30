---
phase: 84-chatwoot-dashboard-app
verified: 2026-10-30T10:15:00Z
status: passed
score: 9/9 must-haves verified
covered_files:
  - .planning/phases/84-chatwoot-dashboard-app/84-01-PLAN.md
  - .planning/phases/84-chatwoot-dashboard-app/84-01-SUMMARY.md
  - .planning/phases/84-chatwoot-dashboard-app/84-02-PLAN.md
  - .planning/phases/84-chatwoot-dashboard-app/84-02-SUMMARY.md
  - .planning/phases/84-chatwoot-dashboard-app/84-03-PLAN.md
  - .planning/phases/84-chatwoot-dashboard-app/84-03-SUMMARY.md
  - .planning/phases/84-chatwoot-dashboard-app/84-04-PLAN.md
  - .planning/phases/84-chatwoot-dashboard-app/84-04-SUMMARY.md
  - .planning/phases/84-chatwoot-dashboard-app/84-05-PLAN.md
  - .planning/phases/84-chatwoot-dashboard-app/84-05-SUMMARY.md
  - .planning/phases/84-chatwoot-dashboard-app/84-06-PLAN.md
  - .planning/phases/84-chatwoot-dashboard-app/84-06-SUMMARY.md
  - .planning/phases/84-chatwoot-dashboard-app/84-07-PLAN.md
  - .planning/phases/84-chatwoot-dashboard-app/84-07-SUMMARY.md
  - .planning/phases/84-chatwoot-dashboard-app/84-08-PLAN.md
  - .planning/phases/84-chatwoot-dashboard-app/84-08-SUMMARY.md
  - .planning/phases/84-chatwoot-dashboard-app/84-09-PLAN.md
  - .planning/phases/84-chatwoot-dashboard-app/84-09-SUMMARY.md
  - app/api/chatwoot/dashboard-app/route.ts
  - app/embed/chatwoot-dashboard/BookingCard.tsx
  - app/embed/chatwoot-dashboard/PanelClient.tsx
  - app/embed/chatwoot-dashboard/page.tsx
  - app/embed/chatwoot-dashboard/panel-handshake.ts
  - components/chat/load-chat-widget.ts
  - infra/chatwoot/dashboard-apps.json
  - lib/chatwoot-operator.ts
  - lib/panel-bookings.ts
  - lib/panel-links.ts
  - middleware.ts
  - next.config.ts
  - supabase/migrations/080_panel_bookings.sql
covered_digest: "v2:sha256:549d82d2823af07a763f82b90bc80be8480a936e01e72dbe671ad01be165bec3"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 84: Chatwoot Dashboard App Verification Report

**Phase Goal:** An operator handling a Chatwoot conversation can see that customer's booking history without leaving Chatwoot or exposing admin credentials, sequenced after sync is stable and with CVE-2025-12245 scoped and mitigated on our side.
**Verified:** 2026-10-30
**Status:** passed
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths

| # | Truth (roadmap SC and plan must-haves) | Status | Evidence |
|---|---|---|---|
| 1 | SC1: In a conversation the operator sees the customer's bookings (upcoming + past, status, payment, link into /admin) in the sidebar | VERIFIED | `infra/chatwoot/dashboard-apps.json` registers a "Bookings" frame to `https://rideprestigo.com/embed/chatwoot-dashboard`. `PanelClient.tsx` handshakes, POSTs `{conversationId}` to the API, and renders counters and Upcoming/Past `BookingCard`s. Cards link to `adminBookingHref(reference)`, which is `/admin/bookings?search=<ref>`. The migration projects status, `paid_at` and `payment_link_url`. Owner UAT steps 1-4 approved on live (84-09). Live data check: 12 rows x 24 allowlisted keys. Owner confirmed the same on the phone (mobile app). |
| 2 | SC2a: Read-only | VERIFIED | `route.ts` has one read-only RPC (`panel_bookings`, STABLE). A grep of `route.ts`, `lib/panel-bookings.ts` and `lib/chatwoot-operator.ts` for `.insert/.update/.delete/.upsert` finds no DB writes (only `createHash().update` and cache `.delete`). `dashboard-app-isolation-guard.test.ts` passes. The payment link is returned, never created. |
| 3 | SC2b: Renders only when embedded in Prestigo's Chatwoot (frame-ancestors) | VERIFIED | `middleware.ts` `buildCspEmbed` sets `frame-ancestors https://chat.rideprestigo.com`. `next.config.ts` excludes `/embed` from `X-Frame-Options: DENY`. Live `curl -sI` (84-09) confirms the CSP and no XFO. Unframed page shows "Open this panel from a Chatwoot conversation." (live step 7). |
| 4 | SC2c: Origin-validated postMessage | VERIFIED | `isTrustedContextEvent` requires `event.origin === chatwootOrigin && event.source === parent`. The origin is derived server-side. `fetch-info` is posted to the exact origin, never `*`. Tests in `embed-panel.test.tsx` pass. See the mobile-bridge assessment below. |
| 5 | SC2d: Never uses the admin session cookie | VERIFIED | Middleware deletes the `cookie` request header for `/embed` and the API, and skips `updateSession`, so there is no Set-Cookie. The client fetches with `credentials: 'omit'`, and the only credential is the `api-access-token` header (operator Chatwoot token, verified against Chatwoot on every request). Live: no `Set-Cookie` on the page or API. Owner UAT step 5 approved. |
| 6 | SC2e: CVE-2025-12245 scoped with recorded evidence (no upstream fix; flaw is in the widget SDK, not the Dashboard App) | VERIFIED | `infra/vps/runbooks/chatwoot-dashboard-app.md` section "CVE-2025-12245" records the advisory (`vulns: []`), OSV, a byte-identical `IFrameHelper.js` diff for v4.18.0 and v4.19.1, and dated re-check rows (2026-10-26 and 2026-10-29), with a re-check command. `dashboard-app-runbook.test.ts` passes. |
| 7 | SC2f: Compensating message-origin guard shipped in the site widget loader | VERIFIED | `components/chat/load-chat-widget.ts` `installWidgetOriginGuard` registers a capture-phase `message` listener. It calls `stopImmediatePropagation` on any `chatwoot-widget:` message whose origin is not the widget origin. It is installed in `loadAndRun` before the SDK script is injected or re-run. `chat-widget-origin-guard.test.ts` passes. |
| 8 | Plan truth (84-01): D-10/D-11 identity resolution via Phase 82 tables, allowlisted projection, erasing/anonymised excluded, cap 200 with counters over all rows | VERIFIED | `080_panel_bookings.sql`: SECURITY DEFINER, `search_path = ''`, `REVOKE ... FROM PUBLIC, anon, authenticated`. `panel-bookings-migration.test.ts` and `panel-bookings.test.ts` pass. Live backstop matched (total 12, trip_count 2, spent_eur 46). |
| 9 | Plan truth (84-02..05): API contract (strict body with only conversationId, token verified per request, no_access/not_found share a 403, no-store, 413 cap, rate limit) | VERIFIED | `route.ts` read in full. `chatwoot-dashboard-route.test.ts` and `chatwoot-operator.test.ts` pass. Live: 401 without or with an invalid token, 403 for a foreign Origin, 405 for GET. |

**Score:** 9/9 truths verified (0 behavior-unverified).

### Mobile WebView handshake extension (post-UAT, 41006c6f): does it weaken SC2?

No. Assessment:
- `nativeBridgeOf` returns a bridge only when the page is top level (`win.parent === win`) AND `window.ReactNativeWebView.postMessage` is a function. In an iframe, or in a plain browser tab with no native bridge, it returns null and the unchanged exact-origin and `source === parent` path is used.
- `isTrustedWebViewEvent` accepts a context only when `event.source === window` and `event.origin === window.location.origin`. Another window (opener, child frame) or another origin never passes. Only script already running in the page can post as itself, and the CSP (`script-src nonce + strict-dynamic`, no `unsafe-inline`) blocks injection.
- Even a forged `conversationId` grants nothing. The API verifies the operator's Chatwoot token against that conversation on every request and returns the same 403 for no_access and not_found.
- Framing is still restricted by `frame-ancestors`, and `chatwootOrigin === null` still makes the panel inert. Tests cover the bridge path, a wrong source or origin, a bridge without `postMessage`, and the unconfigured origin.
- The remaining gap is a documented trade-off, not a security regression: the token lives in sessionStorage (D-02), so the mobile WebView asks for it on every open.

### Required Artifacts

| Artifact | Status | Details |
|---|---|---|
| `app/api/chatwoot/dashboard-app/route.ts` | VERIFIED | Substantive, wired to the operator verifier and the store; no cookie access |
| `app/embed/chatwoot-dashboard/{page,PanelClient,BookingCard,CopyLinkButton,panel-handshake}.ts(x)` | VERIFIED | Wired: page passes the server-derived origin, the client calls `PANEL_API`, and cards render live DTOs |
| `lib/chatwoot-operator.ts`, `lib/panel-bookings.ts`, `lib/panel-dto.ts`, `lib/panel-links.ts` | VERIFIED | Imported by the route and the client; the payment-link allowlist is `https://buy.stripe.com` |
| `supabase/migrations/080_panel_bookings.sql` | VERIFIED | Applied to live (live data backstop returned real rows) |
| `middleware.ts`, `next.config.ts`, `public/robots.txt` | VERIFIED | Embed CSP, cookie strip, no-XFO exemption, `Disallow: /embed/` |
| `components/chat/load-chat-widget.ts` | VERIFIED | Origin guard installed before the SDK |
| `infra/chatwoot/dashboard-apps.json` and `sync.mjs` | VERIFIED | Registered live via `--only dashboardApps`; the Bookings tab confirmed by the owner |
| `infra/vps/runbooks/chatwoot-dashboard-app.md` | VERIFIED | CVE evidence log with dated rows |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| Chatwoot sidebar | `/embed/chatwoot-dashboard` | dashboard app frame URL | WIRED (live UAT) |
| `PanelClient` | `/api/chatwoot/dashboard-app` | `fetch` POST with the `api-access-token` header, `credentials: 'omit'` | WIRED |
| API route | Chatwoot | `verifyOperator(token, conversationId)`, which supplies the contact email and phone | WIRED |
| API route | database | `createPanelBookingsStore().load` -> `panel_bookings` RPC (service role) | WIRED |
| Booking card | `/admin/bookings?search=` | `adminBookingHref` (allowlisted reference) | WIRED |
| Site widget loader | the SDK message handler | capture-phase guard before `sdk.js` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Variable | Source | Real data | Status |
|---|---|---|---|---|
| `PanelClient` | `data` | POST API -> `panel_bookings` RPC | Yes (live: 12 rows x 24 keys) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Phase 84 test files | `npx vitest run` on 11 phase files (guard, config, route, isolation, runbook, embed panel, cards, middleware-embed, migration, bookings, operator) | 11 files, 371 tests passed | PASS |
| Type check | `npx tsc --noEmit` | 8 errors, all in `tests/` (the known baseline) | PASS |

### Probe Execution

Step 7c: no `probe-*.sh` declared by the phase; skipped.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|---|---|---|---|---|
| PANEL-01 | 84-01, 84-04, 84-06, 84-07, 84-08, 84-09 | Operator sees the customer's bookings in the sidebar (upcoming + past, status, payment, admin link) | SATISFIED | Truth 1, 8; live UAT |
| PANEL-02 | 84-01, 84-02, 84-03, 84-04, 84-05, 84-06, 84-07, 84-09 | Read-only, frame-ancestors + origin-validated postMessage, no admin cookie, CVE scoped with a loader guard | SATISFIED | Truths 2-7, 9 |

Both IDs appear in `.planning/REQUIREMENTS.md` (lines 74-75) and are claimed by plan frontmatter. No orphaned requirements. Note: the traceability table (lines 156-157) still reads "Pending" and the checkboxes are `[ ]`. This is a docs bookkeeping item for the orchestrator to update, not a code gap.

### Anti-Patterns Found

Debt-marker grep (`TBD|FIXME|XXX`) on the phase files was not exhaustive beyond the code review, which found 0 critical. No stubs found in the traced paths. The review's warnings are below.

| Item | Severity | Impact |
|---|---|---|
| WR-01 stale cross-conversation data | Resolved | Fixed in 41006c6f; `PanelClient.tsx` now resets `data`, `errorCode` and `showAllPast` when `conversationId` changes (verified in code) |
| WR-02 unverified contact returns full booking detail (visitor-typed email or phone) | Warning, non-blocking | Operator sees an "Unverified" hint. It is a hardening opportunity, not a violation of PANEL-01/02 (the data is shown only to an authenticated operator with access to that conversation) |
| WR-03 a `confirmed` booking with no `paid_at` is labelled "Paid" | Warning, non-blocking | Possible operator misreading of manual or invoiced bookings; follow-up recommended |
| WR-04 `frame-ancestors` host hard-coded while the handshake origin comes from the env | Warning, non-blocking | Misconfiguration risk only; fine for the current single production host |
| WR-05 per-IP pre-auth limit of 30/min, and a limiter outage shown as "too many requests" | Warning, non-blocking | Possible lockout for a shared-NAT team; follow-up recommended |

### Human Verification Required

None outstanding. Items 1-6 of the live UAT were performed and approved by the owner (84-09), plus the mobile-app confirmation. Items 7-8 were performed by Claude on the live site. Per instructions, recorded owner approval satisfies human-verification items; the code does not contradict it.

### Gaps Summary

No gaps. Both roadmap success criteria are met in the code and on production. The mobile WebView extension does not weaken the origin-validation guarantee, because it accepts only self-posted, same-origin messages and the server re-authorizes every request. Recommended follow-ups, none blocking:

- WR-02: a reduced projection for unverified contacts.
- WR-03: a "Paid" badge only when `paid_at` is set.
- WR-04: derive `frame-ancestors` from the configured origin.
- WR-05: a per-token rate-limit key.
- Bookkeeping: tick PANEL-01 and PANEL-02 in `REQUIREMENTS.md` (checkboxes and traceability table).

---

_Verified: 2026-10-30T10:15:00Z_
_Verifier: Claude (gsd-verifier)_
