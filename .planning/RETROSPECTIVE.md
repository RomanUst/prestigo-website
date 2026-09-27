# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v2.0 — Blacklane-style Booking + Customer Accounts

**Shipped:** 2026-06-18
**Phases:** 5 (57–61) + Phase 60 as single commit | **Plans:** 22 | **Sessions:** ~8

### What Was Built

- **Customer auth foundation** — Supabase Auth for customers (email magic-link + password, Google/Apple OAuth scaffolded), `customer_profiles` table with RLS, nullable `user_id` FK on bookings, admin session isolation maintained
- **Auth-aware header + account dashboard** — Sign in / account dropdown in Nav, /login + /account pages, "My trips" empty-state shell, full profile editing (contact, corporate fields, saved passengers)
- **Blacklane booking redesign** — Unified EntryBar (5-step from 6), 15-min AM/PM time-slot picker, inline flight number for airport routes, Google Maps JS route visualization with animated copper dot + time labels, VehicleCard with photo + "What's included" list, VehicleSlideshow auto-play (1.5s) with hover-pause
- **Auth-in-checkout + guest path** — user_id linking via Stripe metadata (server-side, never client-trusted), passenger pre-fill from customer_profiles, "Continue as guest" always available, real "My trips" history
- **Analytics preservation + E2E verification** — all GA4 funnel events confirmed, OAuth login GA4 event wired, Meta Pixel/CAPI code-verified; adversarial security review resolved 15+ SEC findings

### What Worked

- **Wave-0 TDD** — writing RED test scaffolds before implementation gave confidence during refactoring and caught integration issues early (e.g., `useBookingStore.getState()` vs stale closure)
- **Phase 59 independent of 57/58** — parallelizability enabled overlapping auth and booking work; no blocking dependency chains
- **Supabase MCP for live DB verification** — querying live schema, checking migration state, and confirming RLS rules eliminated "works on my machine" gaps during Phase 57
- **Security review as a dedicated session** — front-loading a full adversarial review (SEC-01..19) before shipping caught CSRF, IDOR, open-redirect, and webhook idempotency issues cleanly
- **Single-commit Phase 60** — keeping auth-in-checkout as one focused commit (`921a15b`) rather than a full 5-plan phase kept scope tight and avoided over-engineering

### What Was Inefficient

- **ENOSPC on temp filesystem** — `/private/tmp/claude-501/` filled up, blocking sed and other tools; needed workaround with Python file I/O and `CLAUDE_CODE_TMPDIR=/tmp`
- **SessionStorage step-injection for testing** — BookingWizard resets `currentStep` to 1 on mount, making preview testing of Step 3+ require UI click-through chains rather than direct state injection
- **Phase 60 no formal GSD directory** — delivered as a single commit without PLAN/SUMMARY files; required retroactive 60-01-SUMMARY.md creation for milestone close tool
- **Audit timing** — milestone audit ran on 2026-06-16 before Phase 59/60/61 were done, generating 9 open items that were mostly "not yet started" rather than real gaps; running audit after all phases would have been cleaner

### Patterns Established

- **`useBookingStore.getState()` for fresh reads inside `useEffect`** — stale closure issue in Zustand; always use `getState()` for non-reactive reads in effects
- **`vi.hoisted()` for mock hoisting in Vitest** — required for mocking modules that use ESM imports above the test scope
- **`authenticatedUserId` from server session only in payment intent creation** — never trust `userId` from client request body; strip and re-derive server-side
- **`safeReturnTo()` open-redirect guard** — relative-only check, rejects `//` and `http://` prefixes; use in all OAuth and email redirect paths
- **Nav uses `onAuthStateChange` subscription (client-only)** — marketing pages stay static; auth state only visible after hydration

### Key Lessons

1. **Run milestone audit AFTER all phases are done** — auditing mid-milestone creates noise from "not yet started" items vs real gaps
2. **Phase 60 as single commit is a valid pattern** — for small focused features, skip the GSD plan scaffolding and document in a SUMMARY.md only
3. **OAuth "code complete" ≠ "live"** — Google/Apple OAuth requires Supabase Dashboard credential config separate from code; track this explicitly in REQUIREMENTS.md
4. **Analytics blocked by third-party = deferred, not failed** — live OTP/OAuth/payment event verification can't be automated; mark as `blocked_by: third-party` in UAT and close the phase
5. **Guest checkout must be continuously tested** — adding auth in checkout risks accidentally gating guests; the "Continue as guest" button in Step3Auth is the guard

### Cost Observations

- Model mix: primarily Sonnet 4.6 throughout
- Sessions: ~8 development sessions across 8 weeks
- Notable: security review + adversarial audit caught 19 issues that would have shipped without dedicated session

---

## Milestone: v2.1 — Admin Booking Management & Payment Recovery

**Shipped:** 2026-08-26
**Phases:** 3 (62-64) | **Plans:** 13 | **Tasks:** 28

### What Was Built
Abandoned/unpaid checkout capture with a no-duplicate webhook reconcile and an admin revenue-recovery queue (62); full admin booking editing across schedule/vehicle/route/passenger with server-authoritative price recompute, a per-field edit audit log, and optional branded change-notification email (63); admin-originated bookings with an optional Stripe Payment Link + client email that reconciles the same booking row on `checkout.session.completed` incl. round-trip both legs, plus a no-link cash/invoice path (64).

### What Worked
- **One webhook, two reconcile paths** — Phase 64's payment-link reconcile deliberately reused Phase 62's status-gated "update existing row, no duplicate" pattern; the integration checker confirmed both branches coexist cleanly in a single handler.
- **Server-authoritative money** — price and payment-link amounts are always recomputed server-side; the code-review found no client-trust gaps in the core reconcile logic.
- **Tracer-first phase shape** — 64-01 proved the entire create→link→pay→reconcile path end-to-end before expanding to attach-later and round-trip, keeping later plans low-risk.

### What Was Inefficient
- **Payment-link lifecycle blind spots** — the code review surfaced 2 blockers (round-trip sibling double-link; stale link after price edit / manual confirm) that the plans missed; caught and fixed post-hoc rather than designed in.
- **Live-infra gating** — the final phase (64-04) was pure operational work (apply migration, confirm Stripe webhook, live E2E) that stalled twice on a disconnected Supabase connector and a deferred prod test.

### Patterns Established
- Operational "close the live gap" plans (`files_modified: []`) applying migrations via Supabase MCP + information_schema probe, then gating the real payment on a blocking-human checkpoint.
- Code-review `--fix` on money logic run conservatively: prefer application-level guards + loud alerts over speculative external-API calls, defer the deeper fix.

### Key Lessons
- Design the *lifecycle* of a payment artifact (create/edit/cancel/expire), not just its happy-path creation — most blockers lived in the "what happens to the link afterwards" gap.
- A green unit suite (mocks) is not evidence a payment feature works live; the migration + webhook subscription + a real payment are separate, verification-blocking facts.

### Cost Observations
- Model mix: Opus orchestration + Sonnet executors/reviewers/fixers.
- Notable: one code-review pass caught 2 money-logic blockers that unit tests (all green) never would have.

### Cost Observations
- Model mix: Opus orchestration + Sonnet integration checker/security auditor.
- Notable: the whole milestone shipped with zero code gaps at verification — the only open items at each phase were human-only visual/ergonomic UAT checks the plans deliberately deferred.

---

## Milestone: v2.2 — Dispatch & Driver Trip Portal

**Shipped:** 2026-09-02
**Phases:** 3 (65-67) | **Plans:** 8 | **Tasks:** 23

### What Was Built
Future-first admin bookings list with a persistent default-horizon setting (Future / Last N days / All) plus in-session past/all overrides that never write back the default, KPI counters kept decoupled (65); a permanent, unguessable per-assignment `trip_token` opening a noindex trip sheet presentable to police control, delivered via driver email CTA + admin copy-link, with the accept/decline flow left byte-for-byte unchanged (66); token-gated driver trip-progress marking (en route→arrived→on board→completed/no-show) + optional note, written to dedicated `driver_assignments` columns structurally isolated from `booking.status`/GNet and surfaced live to admin (67).

### What Worked
- **Isolation-by-omission as a verifiable contract** — DTRIP-04's "never touch booking.status / GNet" was enforced by the write route importing none of those modules; grep gates returning 0 made the boundary auditable, and the integration checker confirmed it structurally end-to-end.
- **Single shared validity predicate** — `isTripLinkValid()` used by both the trip-sheet render and the write route meant zero drift between "what a driver can see" and "what a write accepts", with the check re-run live (TOCTOU-closed).
- **Disjoint columns for coexisting flows** — the new `trip_token` sitting beside the legacy accept/decline `token` (no shared mutable state) let DTRIP-07 coexistence be proven by construction, not regression luck.

### What Was Inefficient
- **Deploy-gated UAT** — both phases' final UAT checks were pure visual/ergonomic items that could only be run against production; the milestone's human verification stalled until the branch was merged and promoted.
- **"Live" semantics under-specified** — DTRIP-05's admin visibility shipped as a mount-only fetch; the requirement's word "live" implied realtime, surfaced as tech debt in the audit rather than settled at plan time.

### Patterns Established
- Token-as-credential write routes hardened as a checklist: CSRF prefix + fixed-literal rate-limit key + `enforceMaxBody` + zod `.max()` + uniform `invalid_token` (no enumeration oracle) + isolation grep gates.
- Human-only UAT items harvested from the plan's own `<human-check>` blocks into VERIFICATION.md, routing the phase to `human_needed` until run via `/gsd-verify-work` post-deploy.

### Key Lessons
- Pin down ambiguous requirement adjectives ("live", "instant") to an observable behavior at plan time, or they resurface as audit tech debt.
- For token-gated public write surfaces, isolation is most trustworthy when it's the *absence* of an import, checked by a grep gate — not a runtime guard that could be bypassed.

### Cost Observations
- Model mix: Opus orchestration + Sonnet integration checker.
- Sessions: security review short-circuited (register authored at plan time, ASVS-1) → L1 grep verification, no auditor subagent needed; 11 threats closed directly.

---

## Milestone: v3.0 — Site Internationalization (i18n)

**Shipped:** 2026-09-27
**Phases:** 8 (68-75) | **Plans:** 85 | **Tasks:** 176

### What Was Built
next-intl `app/[locale]/` routing with EN at root and every EN URL byte-identical, composed into the CSP/Supabase/CSRF middleware (68); UI chrome and the whole booking/account/auth surface moved into message catalogs (69-70); route, service, marketing, legal pages and blog moved into a per-locale content model (71); a re-runnable AI translation pipeline with glossary, DNT list, hash manifest and fail-closed verifier, producing RU/ES/FR (72) and AR/HI/ZH with RTL logical properties, bidi-isolated prices and per-locale Noto fonts (73); hreflang/sitemap/metadata/JSON-LD from one `getAlternates()`, language switcher and consent-modal language suggestion (74); a production E2E + EN-leak QA harness across 7 locales with two gap rounds (75).

### What Worked
- **Byte-parity as the safety net** — every externalization plan proved English output unchanged (snapshot/golden HTML), so a 133k-line restructure never regressed the ranked EN site.
- **One source for alternates** — pages and sitemap both call `getAlternates()`, so hreflang clusters cannot diverge.
- **Measuring leaks on production, not in theory** — the rendered EN-leak, share-meta and 404 scanners found classes of leaks (twitter meta, JSX-split text, English dates, raw-SSR 404 titles) that code review missed, and then proved them gone (0/0).
- **Fail-closed translation verifier** — broken DNT/ICU/rich-tag output is excluded from both the tree and the manifest, so re-runs self-heal.

### What Was Inefficient
- **Phase 75 ballooned to 36 plans** — E2E "verification" turned into two rounds of fixing; leak classes should have been scanned per-phase (71-74) instead of discovered at launch.
- **Middleware matcher bit three times** — .avif photos, then robots/sitemap/llms.txt 404'd in prod since Phase 68; static-extension exclusions needed a test from day one.
- **Array-leaf catalog corruption** — JSON-parse-back turned arrays into strings in RU/ES/FR (`pillars.map is not a function`); value-type parity should have been a gate, not a gap.
- **External dependency on API credit** — the translation pipeline and GH workflow stalled when Anthropic credit ran out; later translations were done in-session and the remaining debt is blocked on billing.
- **`--dry-run` wrote stub placeholders** over real content — a footgun in our own tool.

### Patterns Established
- `interpolateBidi()` + `<bdi>` for DNT tokens (prices, durations) in RTL prose; JSON-LD stays plain strings.
- Force-static pages take locale from `params`, never `getLocale()` (WINDOWS #7).
- next-intl sets `NEXT_LOCALE` on every response — never treat it as a user choice.
- QA harness under `scripts/qa/` (en_leak_rendered, share_meta_audit, notfound_audit, booking_e2e, analytics_locale_audit) with a reasoned allowlist.
- Deviation ledger (`.planning/WINDOWS.md`) for everything recorded-not-fixed.

### Key Lessons
- For i18n, add a rendered-leak scan to every externalization phase's gate, not only to the launch phase.
- Any middleware matcher change needs a test that curls every static/metadata extension.
- Tools that write to the repo must have a true no-write preview mode.
- Budget external API credit for the whole milestone, including follow-up re-runs.

### Cost Observations
- Model mix: Opus orchestration/execution, Sonnet integration checker and some executors.
- Sessions: many; Phase 75 alone consumed the largest share (36 plans, two gap rounds).
- Notable: in-session translation replaced the pipeline once credit ran out — slower but unblocked launch.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Standout Pattern |
|-----------|--------|-------|-----------------|
| v1.0 SEO Blog | 3 (54-56) | 9 | MDX hybrid model (static JSX + dynamic MDX route) |
| v2.0 Booking + Auth | 5 (57-61) | 22 | Wave-0 TDD + Supabase MCP live verification |
| v2.1 Admin Booking + Payment | 3 (62-64) | 13 | Tracer-first phases + one webhook, two reconcile paths |
| v2.2 Dispatch + Driver Portal | 3 (65-67) | 8 | Isolation-by-omission + single shared validity predicate |
| v3.0 Site i18n | 8 (68-75) | 85 | Byte-parity EN safety net + production leak-scanning harness |

### Recurring Issues

- **Live environment testing** — OAuth, OTP, payment, and now on-device/visual UAT always block automated verification; accept `blocked_by: third-party`/`release-build` and run UAT post-deploy
- **Under-specified requirement adjectives** — "live" (DTRIP-05) shipped as on-load fetch; nail observable behavior at plan time
- **Launch-phase bloat** — verification phases that discover defects turn into fix phases (v3.0 Phase 75: 36 plans); push scanners earlier
- **Temp filesystem space** — ENOSPC recurred; keep `CLAUDE_CODE_TMPDIR=/tmp` in muscle memory

### Improving Each Milestone

- v1.0 → v2.0: Added Wave-0 TDD, security review gate, Supabase MCP verification
- v2.0 → v2.1: Plan: run milestone audit after all phases, create Phase 60-style single-commit docs for small scoped fixes
- v2.1 → v2.2: Isolation contracts enforced by grep gates; token-gated write-route hardening as a reusable checklist; human UAT harvested into VERIFICATION and run post-deploy
- v2.2 → v3.0: Byte-parity snapshots as a regression gate for large restructures; production QA scanners + deviation ledger; override closeouts recorded explicitly
