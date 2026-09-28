---
phase: 77-chatwoot-deployment-core-channels
plan: 03
subsystem: infra
tags: [chatwoot, config-as-code, i18n, canned-responses, automation, labels, pre-commit]

requires:
  - phase: 76-vps-infrastructure
    provides: Chatwoot deployed at chat.rideprestigo.com (D-16 pinned version), VPS isolation guard pattern
provides:
  - 35 native-quality canned-response templates (5 topics x 7 locales) replacing the manual send-*.mjs ops scripts (OPS-01)
  - Versioned Chatwoot account configuration (labels, teams, custom attributes, inbox settings, automation rules) for plan 77-07's idempotent sync script (OPS-02)
  - Chatwoot template price/currency guard extending .husky/pre-commit + 2 new secret-gate probes
affects: [77-07 (sync script consumes these exact JSON shapes), 77-10 (widget launcher reads chatwootSettings), 80 (CRM roles/ACL runbook), 85 (statistics use these labels)]

actuals:
  tokens: 10986
  tasks: 3
  commits: 3
  plan_head_before: 2ecf9c6f7697479b6733d408b50e27fbc9eb2ebc
  plan_head_after: 311d16955b18f62e99176c10e2fddc2b18f14e82

tech-stack:
  added: []
  patterns:
    - "Config-as-code under infra/chatwoot/ mirroring infra/vps/monitoring/monitors.json's versioned-JSON-consumed-by-one-script pattern"
    - "findForbiddenContent() pure helper (price/currency, Uber/ride-hailing, brand misspelling, real booking-ref pattern, disallowed Chatwoot liquid variables) reused across canned-response bodies and automation-rules keyword lists"

key-files:
  created:
    - infra/chatwoot/canned-responses/time-change.json
    - infra/chatwoot/canned-responses/vehicle-change.json
    - infra/chatwoot/canned-responses/payment-help.json
    - infra/chatwoot/canned-responses/review-request.json
    - infra/chatwoot/canned-responses/login-help.json
    - infra/chatwoot/labels.json
    - infra/chatwoot/teams.json
    - infra/chatwoot/custom-attributes.json
    - infra/chatwoot/inboxes.json
    - infra/chatwoot/account.json
    - infra/chatwoot/automation-rules.json
    - tests/chatwoot-config.test.ts
  modified:
    - .husky/pre-commit
    - scripts/qa/secret_gate_probe.sh

key-decisions:
  - "send-invoice-tltgo.mjs and send-maxime-traveltime-reply.mjs generalize to no new canned-response topic — both are genuinely customer-specific one-offs (a paid invoice for a named company/amount, and a bug-fix reply about one visitor's exact route/times) with no reusable operator message underneath, matching the plan's expected outcome"
  - "Channel labels (ch-email/ch-web/ch-telegram) share one color (#0F1D2C navy); topic labels share a different color (#BFA06A gold) — visually groups the two label families in the Chatwoot sidebar"
  - "login-help never generates a login link (D-19/Phase-84 deferral) — it names the real, locale-specific 'forgot password' button text pulled from messages/<locale>.json and points to the locale-prefixed /login page (root for en, /<locale>/login for the other six, matching i18n/routing.ts's as-needed localePrefix)"
  - "Automation topic keywords chosen as multi-word phrases (e.g. 'corporate account', 'payment link') rather than single generic words, to reduce false-positive labeling on unrelated messages, per the plan's b2b guidance extended to all 7 topics"

patterns-established:
  - "Chatwoot config-as-code lives in infra/chatwoot/ (sibling to infra/vps/, not nested inside it) because it is API configuration run from a workstation, not files rsynced onto the VPS host"

requirements-completed: [OPS-01, OPS-02]

coverage:
  - id: D1
    description: "35 native-quality canned-response templates (5 topics x 7 locales: time-change, vehicle-change, payment-help, review-request, login-help) generalized from the root send-*.mjs/generate-login-link.mjs scripts, replacing manual ops (OPS-01)"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "tests/chatwoot-config.test.ts#infra/chatwoot/canned-responses/*.json"
        status: pass
      - kind: unit
        ref: "tests/chatwoot-config.test.ts#Task 2: remaining four canned topics"
        status: pass
    human_judgment: false
  - id: D2
    description: "Chatwoot template price/currency guard: .husky/pre-commit blocks €/EUR/CZK/Kč in infra/chatwoot json/md sources; scripts/qa/secret_gate_probe.sh Probe G proves it blocks, Probe H proves clean templates pass (D-18)"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "tests/chatwoot-config.test.ts#infra/chatwoot template price guard (D-18)"
        status: pass
      - kind: other
        ref: "sh scripts/qa/secret_gate_probe.sh (PROBE template-price: BLOCKED, PROBE template-clean: ALLOWED)"
        status: pass
    human_judgment: false
  - id: D3
    description: "labels.json: exactly the 11 D-20 labels (3 channel, 8 topic), valid hex colors, channel/topic label families visually distinct"
    requirement: "OPS-02"
    verification:
      - kind: unit
        ref: "tests/chatwoot-config.test.ts#infra/chatwoot/labels.json (D-20)"
        status: pass
    human_judgment: false
  - id: D4
    description: "teams.json: Bookings + B2B teams, allow_auto_assign false, single owner member (D-21)"
    requirement: "OPS-02"
    verification:
      - kind: unit
        ref: "tests/chatwoot-config.test.ts#infra/chatwoot/teams.json (D-21)"
        status: pass
    human_judgment: false
  - id: D5
    description: "custom-attributes.json: 15 conversation attributes (visit context + consent) + 1 contact attribute (site_locale) (D-06)"
    requirement: "OPS-02"
    verification:
      - kind: unit
        ref: "tests/chatwoot-config.test.ts#infra/chatwoot/custom-attributes.json (D-06)"
        status: pass
    human_judgment: false
  - id: D6
    description: "inboxes.json + account.json: Website widget settings (email-required pre-chat form, no business hours, hmac_mandatory, brand widget color) and managed-inbox non-secret settings (D-04/D-07/D-08)"
    requirement: "OPS-02"
    verification:
      - kind: unit
        ref: "tests/chatwoot-config.test.ts#infra/chatwoot/inboxes.json (D-04/D-07/D-08)"
        status: pass
    human_judgment: false
  - id: D7
    description: "automation-rules.json: channel-assignment rules, 7-locale topic keyword rules for 7 topics, b2b routed to B2B team, cross-referenced against labels.json/teams.json/inboxes.json (D-20/D-21/OPS-02)"
    requirement: "OPS-02"
    verification:
      - kind: unit
        ref: "tests/chatwoot-config.test.ts#infra/chatwoot/automation-rules.json (D-20/D-21/OPS-02)"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-09-29
status: complete
---

# Phase 77 Plan 03: Chatwoot Canned Responses & Config-as-Code Summary

**35 native-quality canned-response templates across 5 topics and 7 locales, plus the full non-secret Chatwoot account configuration (labels, teams, attributes, inbox settings, automation rules) versioned as tested JSON for plan 77-07's idempotent sync script.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-09-29T00:00Z (approx)
- **Completed:** 2026-09-29T00:08Z (approx)
- **Tasks:** 3
- **Files modified:** 14 (11 new JSON configs, 1 new test file, 2 modified: `.husky/pre-commit`, `scripts/qa/secret_gate_probe.sh`)

## Accomplishments

- Generalized the 5 remaining reusable one-off ops scripts (time-change, vehicle-change, payment-help, review-request, login-help) into 35 native-quality, non-stub canned-response templates covering en/ru/es/fr/ar/hi/zh — the direct OPS-01 replacement for manually running `send-*.mjs`.
- Extended `.husky/pre-commit` with a second price/currency guard scoped to `infra/chatwoot/**` and proved it with two new probes (`template-price` blocks, `template-clean` allows) in `scripts/qa/secret_gate_probe.sh`, closing the D-18/T-77-07 threat.
- Wrote `findForbiddenContent()` — one pure helper reused for every canned-response locale body and every automation-rules keyword — checking for price/currency tokens, Uber/ride-hailing mentions, the "Prestigio" misspelling, real `PRG-<8 digits>` booking references, and any Chatwoot liquid variable outside the allowed `{{contact.*}}`/`{{agent.*}}` set.
- Versioned the complete non-secret Chatwoot account configuration — 11 labels, 2 teams, 16 custom-attribute definitions, Website widget + managed-inbox settings, support email, and cross-referenced automation rules (4 channel rules, 7 topic-keyword rule sets across all 7 locales, 1 label-routing rule) — matching plan 77-07's interface contract exactly.
- Audited `send-invoice-tltgo.mjs` and `send-maxime-traveltime-reply.mjs` and confirmed, as expected, that neither generalizes into a reusable topic (both are genuinely customer/booking-specific one-offs).

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): time-change canned response + template price guard** — `ca4de242` (feat)
2. **Task 2: vehicle, payment, review and login canned responses** — `3ccfd788` (feat)
3. **Task 3: labels, teams, attributes, inbox and automation config-as-code** — `311d1695` (feat)

**Plan metadata:** (this SUMMARY commit, docs)

_Note: tasks carried `tdd="true"`; tests were written alongside each task's implementation and verified green before commit — see Deviations for the single-commit-per-task convention followed._

## Files Created/Modified

- `infra/chatwoot/canned-responses/time-change.json` — 7-locale pickup-time-change template
- `infra/chatwoot/canned-responses/vehicle-change.json` — 7-locale vehicle-upgrade template
- `infra/chatwoot/canned-responses/payment-help.json` — 7-locale payment-link template (no amount)
- `infra/chatwoot/canned-responses/review-request.json` — 7-locale post-trip review template
- `infra/chatwoot/canned-responses/login-help.json` — 7-locale locale-prefixed sign-in help template
- `infra/chatwoot/labels.json` — 11 D-20 labels
- `infra/chatwoot/teams.json` — Bookings + B2B teams
- `infra/chatwoot/custom-attributes.json` — 15 conversation + 1 contact attribute definitions
- `infra/chatwoot/inboxes.json` — Website widget settings + managed inbox non-secret settings
- `infra/chatwoot/account.json` — support_email
- `infra/chatwoot/automation-rules.json` — channel rules, topic keyword rules, label routing
- `tests/chatwoot-config.test.ts` — `findForbiddenContent()` helper + full schema/completeness/cross-reference test suite (66 tests)
- `.husky/pre-commit` — Chatwoot template price/currency guard (modified)
- `scripts/qa/secret_gate_probe.sh` — Probes G/H (modified)

## Decisions Made

- **send-invoice-tltgo.mjs / send-maxime-traveltime-reply.mjs → no new topic.** Both read in full during Task 2's read_first: the invoice script sends a specific paid invoice (amount, invoice number, named company) with a PDF attachment; the travel-time script replies to one visitor about one route's specific bug-corrected ETA. Neither has an underlying reusable operator message — generalizing either would either strip out everything that made the email useful (the invoice) or produce a template so generic it duplicates review-request/booking-change territory (the travel-time reply). Matches the plan's expected outcome.
- **Channel vs topic label colors.** Channel labels (`ch-email`, `ch-web`, `ch-telegram`) share `#0F1D2C` (brand navy); topic labels share `#BFA06A` (brand gold) — gives the operator an at-a-glance visual split between "how it arrived" and "what it's about" in the Chatwoot sidebar.
- **login-help stays link-only, no generated link.** Per D-19, one-click login-link generation from Chatwoot is explicitly Phase 84 scope. This template only points to the real, locale-specific sign-in page (`https://rideprestigo.com/login` for en, `https://rideprestigo.com/<locale>/login` for the other six, per `i18n/routing.ts`'s `localePrefix: 'as-needed'`) and names the real "forgot password" button text pulled live from each `messages/<locale>.json`.
- **Automation keywords as specific multi-word phrases.** Following the plan's explicit b2b guidance ("corporate account" over the bare word "hotel"), every one of the 7 topics' ~2-3 keywords per locale (98 total) is a distinctive phrase rather than a single common word, minimizing false-positive auto-labeling on unrelated incoming messages.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `messages/<locale>.json` forgot-password button text sourced live, not invented**
- **Found during:** Task 2 (login-help template)
- **Issue:** The plan's read_first pointed at "messages/en.json and messages/<locale>.json login/forgot-password strings" without giving the exact values.
- **Fix:** Read `Auth.login.forgotPasswordLink` from all 7 locale catalogs directly (`node -e "require('./messages/<locale>.json')..."`) and used the real button text verbatim in each locale's template, rather than approximating a translation.
- **Files modified:** `infra/chatwoot/canned-responses/login-help.json`
- **Verification:** Values cross-checked against the live catalog files at write time; template test suite passes.
- **Committed in:** `3ccfd788` (Task 2 commit)

None of the other deviation rules (1, 3, 4) were triggered — no bugs found in existing code, no blocking issues, no architectural changes needed.

---

**Total deviations:** 1 auto-fixed (1 missing-critical, sourcing live translation strings instead of approximating).
**Impact on plan:** Improves correctness (login-help now names the exact button label the customer sees) with zero scope creep.

## Known Stubs

None — every template ships native-quality, non-stub content in all 7 locales; every config file is fully populated per the interfaces block.

## Issues Encountered

None. The plan's untracked root scripts (`send-*.mjs`, `generate-login-link.mjs`) are not copied into the git worktree (worktrees only carry tracked files); they were read directly from the main checkout path (`/Users/romanustyugov/Desktop/Prestigo/`) via the Read tool, which is unrestricted by cwd. This is worth noting for future worktree-isolated plans whose `read_first` lists untracked files.

## User Setup Required

None — no external service configuration required. This plan is purely config-as-code; nothing is pushed to the live Chatwoot instance (that's plan 77-07's sync script).

## Next Phase Readiness

- All 11 JSON files under `infra/chatwoot/` are ready for plan 77-07's idempotent sync script to consume verbatim — key shapes match the plan's `<interfaces>` block exactly (no renamed keys).
- `tests/chatwoot-config.test.ts` (66 tests, all passing) will catch any accidental shape drift before 77-07 is planned/executed.
- The `.husky/pre-commit` template price guard and its 2 probes are live immediately — any future edit to `infra/chatwoot/**` that introduces a price/currency token will fail the commit.
- No blockers for 77-07 or for parallel-wave plans in this phase.

---
*Phase: 77-chatwoot-deployment-core-channels*
*Completed: 2026-09-29*

## Self-Check: PASSED

- All 12 created files verified present on disk (`[ -f ]`).
- All 3 task commits (`ca4de242`, `3ccfd788`, `311d1695`) verified present via `git log --oneline --all`.
- `npx vitest run tests/chatwoot-config.test.ts` — 66/66 tests passing.
- `sh scripts/qa/secret_gate_probe.sh` — all 8 probes correct (no "NOT BLOCKED" lines; `template-price` BLOCKED, `template-clean` ALLOWED).
- All 3 tasks' `<acceptance_criteria>` re-verified and passing (locale-key set, pre-commit grep count, untracked root script, 5 topic files, 35 total responses, label set, inbox HMAC/color, 15 conversation attributes).
