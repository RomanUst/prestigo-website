---
phase: 78-whatsapp-cloud-api-channel-coexistence
plan: 10
subsystem: infra
tags: [whatsapp, meta-templates, i18n, chatwoot, templates-as-code]
requires:
  - phase: 78-whatsapp-cloud-api-channel-coexistence
    provides: "4 WA-02 templates + content-rules test (plan 78-08); template CLI and validateTemplate (plan 78-03)"
provides:
  - "driver-details, reopen-conversation, invoice-ready, payment-received in 7 locales (28 more submissions)"
  - "full D-07 set: 8 templates x 7 locales = 56, offline-validated"
  - "tests/whatsapp-templates.test.ts REQUIRED_KEYS = exactly the 8 D-07 keys (set equality)"
affects: [78-13, 78-17]
tech-stack:
  added: []
  patterns: ["a single phone-shaped synthetic example ('+420 000 000 000') is exempt from the phone regex; all other digit runs still rejected"]
key-files:
  created:
    - infra/chatwoot/whatsapp-templates/driver-details.json
    - infra/chatwoot/whatsapp-templates/reopen-conversation.json
    - infra/chatwoot/whatsapp-templates/invoice-ready.json
    - infra/chatwoot/whatsapp-templates/payment-received.json
  modified:
    - tests/whatsapp-templates.test.ts
key-decisions:
  - "D-10 invoice shape = body-attachment (owner, 2026-09-29, via orchestrator; reply exactly 'body-attachment'): body-only template with a 'Send my invoice' quick reply; the PDF is sent as a normal attachment after the customer taps and the 24 h window opens. No public invoice URL, no header, no sample upload."
  - "payment-received closes with 'reply here if you need anything' rather than a button: body-only per D-11, and a customer reply opens the window anyway"
  - "The driver_phone synthetic example is the only string exempted from the test's phone-number regex; the test pins it to exactly '+420 000 000 000' and asserts it differs from BUSINESS_PHONE_DIGITS"
requirements-completed: [WA-02]
status: complete
duration: 15min
completed: 2026-09-29
commits: 2
plan_head_before: ae65a32a2e4b13b5d2a2333bf99d51ca3a0edec8
plan_head_after: ae0f9d45a1dcf50b8711a26226e4f45f068f961f
actuals:
  tokens: 14000
  tasks: 3
  commits: 2
---

# Phase 78 Plan 10: WhatsApp templates part 2 (WA-02 remaining four) Summary

**Driver details, re-open conversation, invoice ready (body-attachment) and payment received written as code in 7 native locales; the full 8-template D-07 set (56 submissions) validates offline.**

## Templates

| Key | Meta name | Variables | Buttons |
|-----|-----------|-----------|---------|
| driver-details | prestigo_driver_details | first_name, booking_ref, driver_name, driver_phone, vehicle, plate, meeting_point | QUICK_REPLY ok ("Got it"), QUICK_REPLY question |
| reopen-conversation | prestigo_reopen_conversation | first_name, booking_ref | QUICK_REPLY continue ("Continue here") |
| invoice-ready | prestigo_invoice_ready | first_name, booking_ref | QUICK_REPLY send_invoice ("Send my invoice"); header null |
| payment-received | prestigo_payment_received | first_name, booking_ref | none (body-only) |

All four: UTILITY, NAMED parameters, en/ru/es/fr/ar/hi/zh (zh -> `zh_CN`), signed "— Prestigo", examples synthetic. driver_phone example is `+420 000 000 000` (non-dialable). invoice-ready and payment-received bodies contain no digits in any script and no link.

## D-10 decision (checkpoint resolved before dispatch)

Task 2 (`checkpoint:decision`, `gate="blocking-human"`) was put to the owner by the orchestrator before this agent ran. Reply, verbatim: "body-attachment" (owner, 2026-09-29, via orchestrator). Consequences applied:

- invoice-ready has `header: null` and one `send_invoice` quick reply; the operator attaches the PDF in Chatwoot (uploaded to Meta as media) once the tap opens the 24 h window. Runbook wording is plan 78-17's job.
- The document-header branch was NOT built: `whatsapp-templates.mjs`, `tests/whatsapp-graph.test.ts` and `COVERAGE.md` are untouched (the "Template media header (DOCUMENT for the invoice)" row stays as it was; no `META_WA_APP_ID`, no sample PDF).
- T-78-32 mitigated: no invoice PDF is ever exposed at a public URL.

## Verification output

- `node infra/chatwoot/whatsapp-templates.mjs --validate` -> after Task 1 `validated=35`; after Task 3 56 `valid ...` lines, `validated=56`, no `invalid` lines. `ls infra/chatwoot/whatsapp-templates/*.json | wc -l` = 8.
- `npx vitest run tests/whatsapp-templates.test.ts tests/whatsapp-graph.test.ts` -> 116 passed across the two files. `npx eslint --quiet tests/whatsapp-templates.test.ts` clean.
- `gsd-tools check api-coverage.verify-pre` -> `"passed": true` (60 capabilities, 28 opt-out).
- Tracer (Task 1): RED confirmed (missing file), GREEN, `--validate` validated=35 re-run before expansion.

## Task Commits

1. Task 1 (tracer): `d4932dac` - driver-details template + tests (RED first, then GREEN).
2. Task 2: no commit (owner decision, recorded above).
3. Task 3: `ae0f9d45` - invoice-ready, reopen-conversation, payment-received; REQUIRED_KEYS widened to 8 with set-equality test; per-template tests (RED first: 7 failing, then GREEN).

## Deviations from Plan

**1. [Rule 1 - Bug] Phone regex in "synthetic examples" test rejected the plan-mandated driver_phone example**
- Found during: Task 1 test authoring.
- Issue: `\+?\d[\d ()-]{8,}\d` matches `+420 000 000 000`, so driver-details would fail the shared synthetic-example rule.
- Fix: the test strips the exact string `+420 000 000 000` before applying the phone regex; the driver-details test pins the example to that exact value and checks it is not the business number and contains only zeros after the country code.
- Commit: `d4932dac`.

**2. Process notes**
- node_modules symlinked from the main checkout (gitignored, not committed, nothing installed).
- The plan ledger / cwd sentinel files were not created (git-dir commands are refused by the sandbox in this worktree); `commits:` measured directly as `git rev-list --count ae65a32a..HEAD` = 2 (before this SUMMARY commit).

Otherwise the plan executed as written.

## Open assumptions

- Meta may re-categorize any UTILITY template (payment-received and reopen-conversation are the likeliest) to MARKETING on submission; not knowable offline. Plan 78-13 records the outcome.
- Native wording was written in-session and has had no native-speaker review; Meta's review is the first external check.
- driver_name, driver_phone, vehicle, plate, meeting_point values are supplied at send time; the operator should give them in the customer's language where relevant.

## Known Stubs

None.

## Threat Flags

None. T-78-32 (no public invoice link: body-attachment chosen), T-78-33 (digit-free payment/invoice copy, currency matcher on every string), T-78-34 (non-dialable driver_phone example, compared with the business number in the test) are mitigated and tested.

## Self-Check: PASSED

- All four template files and tests/whatsapp-templates.test.ts exist.
- Commits d4932dac and ae0f9d45 exist on the worktree branch.
