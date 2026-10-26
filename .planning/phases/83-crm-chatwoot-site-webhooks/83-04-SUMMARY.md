---
phase: 83-crm-chatwoot-site-webhooks
plan: 04
subsystem: crm-chat-policy
status: complete
tags: [chatwoot, espocrm, lead-source, spam-filter, pure-functions, vitest]

requires:
  - phase: 81-lead-capture-site-forms-supabase-espocrm
    provides: LEAD_SOURCE / lib/lead-mapping.ts, infra/espocrm/enums.json Lead.source sync
  - phase: 77-chat-chatwoot
    provides: infra/chatwoot/labels.json config-as-code
provides:
  - lib/chat-classify.ts pure chat policy (lead source, D-18 filter, names, text limits, note formats)
  - LEAD_SOURCE.websiteChat / telegram and matching Lead.source enum values
  - Chatwoot label no-lead (config-as-code, applied at go-live)
affects: [83-07, 83-08, 83-09, 83-10, 83-13, 83-14]

actuals:
  tokens: 21000
  tasks: 2
  commits: 2
plan_head_before: 1bec9e554f02791f2c2acfe8835b2d3035536922
plan_head_after: 966bb68d34514e2410f3f112cb729bef10b190a7

tech-stack:
  added: []
  patterns:
    - "Pure policy module (no env/fetch/clock) that handlers only wire"
    - "User text to CRM goes through plainLine/plainBlock: control chars stripped, length caps, tag-like openers defanged"

key-files:
  created:
    - lib/chat-classify.ts
    - tests/chat-classify.test.ts
  modified:
    - lib/lead-mapping.ts
    - infra/espocrm/enums.json
    - infra/chatwoot/labels.json
    - tests/lead-mapping.test.ts
    - tests/espocrm-enums.test.ts
    - tests/chatwoot-config.test.ts
    - tests/chatwoot-sync.test.ts

key-decisions:
  - "Lead source reuses Email and WhatsApp and adds Website chat and Telegram; the inbox name (info@ / bookings@) goes into the Lead description, not the source"
  - "D-18 replaces the D-07 header list: auto_reply flag, no-reply/bounce/daemon/notification local part, own domain (rideprestigo.com and subdomains); bulk mail from normal senders is handled by the manual no-lead label"
  - "Notes keep the first message and summary on ONE line (plainLine) so customer text cannot forge a Summary: or marker line; only the Lead description keeps line breaks (plainBlock, placed last)"
  - "'<' followed by a letter, /, ! or ? is replaced by a single guillemet in all CRM text (no markup survives); '1 < 2' is untouched"

requirements-completed: [HOOK-01, HOOK-02]

coverage:
  - id: D1
    description: "Every Chatwoot channel maps to exactly one Lead source; Website chat and Telegram exist in LEAD_SOURCE and enums.json"
    requirement: HOOK-01
    verification:
      - kind: unit
        ref: "tests/chat-classify.test.ts#leadSourceForChannel (HOOK-01); tests/lead-mapping.test.ts#LEAD_SOURCE and LEAD_ATTR fix the CRM names; tests/espocrm-enums.test.ts#Lead.source"
        status: pass
  - id: D2
    description: "D-18 non-target filter (auto_reply, no_reply_sender, own_domain) with boundary cases"
    requirement: HOOK-01
    verification:
      - kind: unit
        ref: "tests/chat-classify.test.ts#nonTargetReason (D-18)"
        status: pass
  - id: D3
    description: "no-lead label in config-as-code plus case-insensitive detection"
    requirement: HOOK-01
    verification:
      - kind: unit
        ref: "tests/chatwoot-config.test.ts#infra/chatwoot/labels.json; tests/chat-classify.test.ts#hasNoLeadLabel (D-07)"
        status: pass
  - id: D4
    description: "Lead description, append note, resolve history entry and conversion note with truncation, UTC dates, markers, summary-note convention"
    requirement: HOOK-02
    verification:
      - kind: unit
        ref: "tests/chat-classify.test.ts#note formats (D-03, D-08, D-20); #summaryFromNotes (D-09)"
        status: pass
---

# Phase 83 Plan 04: Chat policy Summary

**Pure `lib/chat-classify.ts` fixes the chat Lead source per channel, the D-18 non-target filter, name cleaning, text caps and the Lead / append / resolve / conversion note formats; Lead.source gains 'Website chat' and 'Telegram' and Chatwoot gets a `no-lead` label, all as code.**

## Accomplishments

- Task 1 (tracer): channel -> `leadSourceForChannel` -> `LEAD_SOURCE` -> `enums.json` Lead.source proven end to end; `no-lead` label added (14 labels now). Three pins updated deliberately.
- Task 2: `nonTargetReason`, `topicLabels`, `cleanContactName` (haikunator names never used), `plainLine` / `plainBlock`, `summaryFromNotes` (last private outgoing `Итог:` / `Summary:` note wins, 1000 cap), `conversationUrl`, `resolveMarker` / `openMarker`, and the four format functions. Marker is always the last line; no transcript, no HTML, no price.
- 51 tests in `tests/chat-classify.test.ts`; 275 pass across the five related files. eslint clean, `tsc` has no errors in touched files, purity grep (`process.env|fetch(|Date.now(|new Date()`) prints 0.

## Task Commits

1. Task 1 (tracer): `08e9df00` feat(83-04): chat lead sources and no-lead label (tracer)
2. Task 2: `966bb68d` feat(83-04): chat policy - D-18 filter, names, text limits and note formats

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tests/chatwoot-sync.test.ts pinned the label count at 13**
- **Found during:** Task 1 (running related tests after adding `no-lead`)
- **Issue:** three label-sync tests asserted `create=13` / `unchanged=13|12` / 13 stored labels; adding the 14th label broke them.
- **Fix:** updated the three expectations to 14 (and `unchanged=13` in the drift test). Not listed in the plan's `files_modified`.
- **Files modified:** tests/chatwoot-sync.test.ts
- **Commit:** 08e9df00

### Interpretation notes (not deviations)

- `plainLine` / `plainBlock` cut at `max` INCLUDING the trailing ellipsis (output length is exactly `max`).
- `summaryFromNotes` also accepts an API-style numeric message type `1` (RESEARCH A14) and skips a summary note whose body is empty, falling back to an earlier one.
- Customer text is not stripped of a literal euro sign (it is the customer's words, not a Prestigo price); the module itself contains no price and tests assert none of the formats add one.

## Known Stubs

None.

## Threat Flags

None. T-83-16 (stored injection) mitigated by `plainLine` / `plainBlock` and the no-HTML tests; T-83-17 (mail floods) mitigated by the D-18 filter plus the `no-lead` label.

## Live actions left for the orchestrator / go-live (83-14)

- Run the EspoCRM enum sync (adds Lead.source 'Website chat', 'Telegram') and the Chatwoot label sync (creates `no-lead`). Nothing was applied to a live system here.

## Environment note

`node_modules` was symlinked from the main checkout (not committed); all related tests ran green through the symlink.

## Self-Check: PASSED

- lib/chat-classify.ts, tests/chat-classify.test.ts: found
- commits 08e9df00 and 966bb68d: found on branch worktree-agent-a6019cb36a43032d7
