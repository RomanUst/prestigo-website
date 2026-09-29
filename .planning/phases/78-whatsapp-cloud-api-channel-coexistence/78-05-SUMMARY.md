---
phase: 78-whatsapp-cloud-api-channel-coexistence
plan: 05
subsystem: infra
tags: [whatsapp, cloud-api, runbook, chatwoot, pricing, vitest]

requires:
  - phase: 77-chatwoot-deployment-core-channels
    provides: chatwoot-channels.md channel inventory, backup-restore.md backup-first rule
provides:
  - infra/vps/runbooks/whatsapp.md with all 14 required sections (WA-03)
  - WhatsApp row in the Chatwoot channel inventory, pointer to the runbook
  - tests/whatsapp-runbook.test.ts structure, safety and privacy assertions (52 tests)
affects: [78-11, 78-12, 78-16, 78-17]

actuals:
  tokens: 10500
  tasks: 2
  commits: 2
plan_head_before: 938a8024af8222d73ee269aac671349d86a3c614
plan_head_after: 3ca44ae4d78223c3db2e396f6bef5a7259f69b6f

tech-stack:
  added: []
  patterns:
    - "Runbook structure test: heading/body parser ignoring fenced code, exact-once headings in order, non-empty body per section"
    - "Privacy needle assembled from parts so the test never spells the old number (all separator forms incl. U+00A0 and U+202F)"

key-files:
  created:
    - infra/vps/runbooks/whatsapp.md
    - tests/whatsapp-runbook.test.ts
  modified:
    - infra/vps/runbooks/chatwoot-channels.md

key-decisions:
  - "Pricing table uses the EUR figures of a business-messaging provider's republication of Meta's card (Meta's own EUR card is a download the tools could not open); stated as MEDIUM confidence in the runbook"
  - "Customer-country rows use the research list, not booking data: no Supabase MCP was available to this agent and .env.local must not be read"
  - "Only one 'Rates as of' line; the launch re-check by plan 78-16 (backstop 78-17) re-dates it"

patterns-established:
  - "Later plans append owner facts to whatsapp.md: onboarding results (78-11, 78-12), away message text/end date/business-line arrangement (78-16), live date and checklist status (78-17)"

requirements-completed: [WA-03]

coverage:
  - id: D1
    description: "whatsapp.md covers recovery, signature enforcement, never-delete-without-fresh-backup rule, VPS-down, rotation, PIN, SIM custody"
    requirement: WA-03
    verification:
      - kind: unit
        ref: "tests/whatsapp-runbook.test.ts#WhatsApp runbook: structure / never-delete rule"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dated EUR pricing table (12 markets), 2026-10-01 service-message billing, estimated spend, monthly owner check"
    requirement: WA-03
    verification:
      - kind: unit
        ref: "tests/whatsapp-runbook.test.ts#WhatsApp runbook: pricing (D-19)"
        status: pass
    human_judgment: true
    rationale: "Rate figures come from a secondary republication of Meta's EUR card and must be re-verified in WhatsApp Manager at launch; a test can only check shape and date stamp"
  - id: D3
    description: "No secret, PIN, token shape or former personal number in the runbook or inventory"
    requirement: WA-03
    verification:
      - kind: unit
        ref: "tests/whatsapp-runbook.test.ts#WhatsApp runbook: privacy and secrets (T-78-16)"
        status: pass
      - kind: other
        ref: "sh scripts/qa/secret_gate_probe.sh (all probes as expected)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Owner onboarding, template workflow, window label, transition and off-site checklists are correct against Meta and Chatwoot behaviour"
    requirement: WA-03
    verification:
      - kind: unit
        ref: "tests/whatsapp-runbook.test.ts#onboarding, transition and listings"
        status: pass
    human_judgment: true
    rationale: "Procedures describe tools built by plans 78-03, 78-04, 78-09 and Meta UI steps; correctness is only provable in the owner's live run (plans 78-11, 78-12)"

duration: 25min
completed: 2026-09-29
status: complete
---

# Phase 78 Plan 05: WhatsApp Runbook (WA-03) Summary

**Complete, dated, secret-free WhatsApp channel runbook under infra/vps/runbooks/ (recovery, hard never-delete-without-fresh-backup rule, EUR pricing with 2026-10-01 service-message billing, owner onboarding, templates, window label, transition and off-site checklists), plus a 52-test structural and privacy guard and the WhatsApp row in the Chatwoot channel inventory.**

## Performance

- **Duration:** about 25 min
- **Tasks:** 2 (Task 1 tracer, Task 2 auto; both tdd)
- **Files:** 3 (2 created, 1 modified)

## Accomplishments

- `infra/vps/runbooks/whatsapp.md`: 14 required `##` sections, each exactly once, in the specified order, each with real content. The never-delete section states that inbox deletion cascades conversations and tears down webhooks / deregisters the number, links `backup-restore.md`, and points to non-destructive recovery levers first.
- Pricing section: 12-market EUR table (Czechia priced as Rest of Central and Eastern Europe, DE, UK, FR, ES, IT, RU, IN, UAE, SA, US, China), single `Rates as of 2026-09-29` line, service-message billing from 2026-10-01, the unconfirmed 1,000-free-service-messages note, assumed-volume spend estimate (single to low double-digit EUR a month), monthly owner check in WhatsApp Manager, and the launch re-verification pointer (78-16, backstop 78-17).
- `chatwoot-channels.md`: WhatsApp inventory row (`Channel::Whatsapp`, `ch-whatsapp`), the "not a Chatwoot inbox yet" paragraph replaced with a pointer to `whatsapp.md`, and a "no phone-app client at all" line in the Chatwoot-is-the-only-client section.
- `tests/whatsapp-runbook.test.ts`: heading exactly-once / non-empty-body / order checks, tool and env-name references, never-delete assertions, pricing table (>= 8 data rows, EUR header, one date stamp), off-site surface names, old-number needle from parts across space / U+00A0 / U+202F / hyphen / none with +420 / 00420 / 420 prefixes (with a self-check that the needle matches every form), no `META_WA_*=value`, no `EAA`+40 token shape, no PIN followed by six digits, runbook not under `infra/chatwoot/`.

## Task Commits

1. **Task 1 (tracer): runbook safety core + inventory row + structural test** - `eeecc00c` (docs)
2. **Task 2: dated pricing, onboarding, templates/limits, window label, transition, off-site checklists** - `3ca44ae4` (docs)

Both tasks were run test-first: the test was written and observed failing (38 of 44, then 21 of 52 failing) before the runbook content existed, then green. Each task is one commit as the plan specifies, so there are no separate `test(...)` RED commits.

**Tracer gate:** `<verify>` (vitest + `secret_gate_probe.sh`) re-run and passed before expansion; expanded to Task 2.

## Pricing sources and re-check (for plan 78-16 to reuse)

Fetched 2026-09-29 with `curl` from the executor (WebFetch not available to this agent):

- Meta pricing page `https://developers.facebook.com/docs/whatsapp/pricing/` (redirects to `.../documentation/business-messaging/whatsapp/pricing`): per-message model confirmed; rate cards "effective July 1, 2026"; EUR rate card is only a CSV/PDF download link (not readable). Lists Oct 1, 2026 rate updates for Bangladesh, Iraq, Nepal, Sri Lanka, Kazakhstan, Kuwait, Morocco, Oman, Ukraine only (none of them in the runbook table).
- Meta non-template pricing page `https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages/`: service messages charged per message from 2026-10-01, rate equal to utility/authentication by market, no volume tiers, utility templates inside an open window also chargeable from 2026-10-01; rates for 2026-10-01 were due to be published by 2026-09-01.
- EUR rate card republication `https://edna.io/pricing-whatsapp-cbp-eur/` (table "After 01.10.2026"): all 12 runbook rows read from it and identical to the RESEARCH figures (no change). It also states "first 1000 service messages per month are free"; Meta's page does not, so the runbook keeps it as unconfirmed.
- Re-check at launch: read WhatsApp Manager, Pricing, EUR rate card directly (the authoritative source), compare to the table, re-date the single `Rates as of` line.

## Customer-country derivation

Not derived from bookings: the Supabase MCP is not available to this agent and `.env.local` is off limits. The RESEARCH country list was used and the runbook says so, with an instruction to replace or add rows once the top calling codes of real bookings are known (aggregate count per prefix only, never phone numbers).

## Test count

52 tests in `tests/whatsapp-runbook.test.ts`, all passing. `tests/infra-vps-isolation-guard.test.ts` also green (69 total in the combined run). `npx tsc --noEmit` reports no error in the new test. `sh scripts/qa/secret_gate_probe.sh` output as expected (BLOCKED / ALLOWED lines all correct).

## Decisions Made

- Runbook lives in `infra/vps/runbooks/` (currency gate not involved), test asserts path and that `infra/chatwoot/whatsapp.md` does not exist.
- The inventory row refers to the business number only as `lib/contact-channels.ts`, `BUSINESS_PHONE_E164`; the former personal number is never spelled anywhere (test enforced for the runbook and the inventory file).
- Transition-section facts (final away text, end date, live date) are "pending" placeholders in a small table for plans 78-16 / 78-17 to fill.
- Telegram bot profile added to the off-site checklist with a concrete action: re-run `infra/chatwoot/telegram/set-bot-profile.mjs` after the switch, because it derives its WhatsApp link from the site constant.

## Deviations from Plan

None - plan executed exactly as written. Two notes that are environment differences, not deviations from the plan's content:

- WebFetch and Supabase MCP were not available to this agent, so pricing was re-verified with `curl` and the country list fell back to the RESEARCH list (both cases the plan explicitly allows for).
- Worktree had no `node_modules`; a gitignored symlink to the main checkout's `node_modules` was created so vitest and tsc could run (no packages installed). The symlink is untracked and ignored.

## Issues Encountered

None.

## Known Stubs

None. The "pending" cells in the transition fact table are intentional hand-off points for plans 78-16 and 78-17 (recorded owner facts), not missing functionality.

## Threat Flags

None. No new network endpoints, auth paths or schema changes; documentation and a test only.

## User Setup Required

None - no external service configuration required by this plan. The runbook itself is the checklist for the owner steps in plans 78-11 and 78-12.

## Next Phase Readiness

- Plans 78-11, 78-12, 78-16, 78-17 can append owner facts to the named sections of `whatsapp.md`.
- The runbook references tools built by plans 78-03, 78-04, 78-09 (`whatsapp-channel.mjs`, `whatsapp-templates.mjs`, `inspect.mjs --whatsapp`, `sync.mjs --window-delay-override`); their flag names follow the plan's interface block and should be re-checked against the shipped CLIs when those plans merge.

## Self-Check: PASSED

- FOUND: infra/vps/runbooks/whatsapp.md, tests/whatsapp-runbook.test.ts, infra/vps/runbooks/chatwoot-channels.md (modified)
- FOUND commits: eeecc00c, 3ca44ae4
- Acceptance criteria re-run: `test -f whatsapp.md && test ! -e infra/chatwoot/whatsapp.md` exit 0; never-delete heading count 1; `Channel::Whatsapp` count 1; `^## ` count 14; `Rates as of` count 1; display-name string count 1.
- Plan verification: `npx vitest run tests/whatsapp-runbook.test.ts` 52/52 pass; `sh scripts/qa/secret_gate_probe.sh` exit 0, no NOT BLOCKED line.

---
*Phase: 78-whatsapp-cloud-api-channel-coexistence*
*Completed: 2026-09-29*
