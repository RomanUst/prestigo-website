---
phase: 78-whatsapp-cloud-api-channel-coexistence
plan: 04
subsystem: infra
tags: [chatwoot, whatsapp, config-as-code, automation-rules, execution-delay, inspect]

requires:
  - phase: 77-chatwoot-deployment-core-channels
    provides: infra/chatwoot sync.mjs/inspect.mjs, inboxes/labels/automation-rules JSON, in-memory fake Chatwoot test pattern
provides:
  - Managed WhatsApp inbox (Channel::Whatsapp) in inboxes.json with four non-secret settings, all false
  - ch-whatsapp and wa-window-closing labels, 'channel: whatsapp' channel rule, windowRules block (1200 min)
  - sync.mjs: execution_delay support, delayed_automations feature check, --window-delay-override, owner membership for every managed inbox
  - inspect.mjs --whatsapp [--expect-connected] read-only health view (enums, counts, booleans only)
affects: [78-03, 78-12, 78-15, whatsapp-runbook]

actuals:
  tokens: 14000
  tasks: 3
  commits: 3

commits: 3
plan_head_before: 938a8024af8222d73ee269aac671349d86a3c614
plan_head_after: 6099a00be092e06e7cbf0c1218842a31c3e89ea8

tech-stack:
  added: []
  patterns:
    - "Window rules as a windowRules block expanded to a delayed rule plus a clearing rule, both optional"
    - "Feature-flag tri-state (on/off/unknown) read once per run from the account payload"
    - "Health view normalises raw payloads to enums/counts/booleans inside the gather step so no credential can reach a formatter"

key-files:
  created: []
  modified:
    - infra/chatwoot/inboxes.json
    - infra/chatwoot/labels.json
    - infra/chatwoot/automation-rules.json
    - infra/chatwoot/sync.mjs
    - infra/chatwoot/inspect.mjs
    - tests/chatwoot-sync.test.ts
    - tests/chatwoot-config.test.ts
    - tests/chatwoot-inspect.test.ts

key-decisions:
  - "Account 'features' is handled as a name->boolean map, a list of enabled names, or absent (unknown); the real payload shape is still [ASSUMED] and gets confirmed at the first live sync (plan 78-12)"
  - "delayed_automations off -> both window rules reported skipped and counted in skipped=; unknown -> created as optional with a warning line"
  - "Enum-like health values that are not letters/digits/underscores starting with a letter print as 'other' so a phone number or name can never be echoed"
  - "The delay validator (isValidWindowDelay, parseWindowDelayOverride) is exported from sync.mjs and reused by the config test"

patterns-established:
  - "inspect --whatsapp derives signature_secret_configured and verification_pin_stored from key presence with a non-empty value; provider_source is printed only from a fixed set"

requirements-completed: [WA-01, WA-02]

coverage:
  - id: D1
    description: "WhatsApp inbox is described in config-as-code and sync labels, routes and assigns its conversations like the other channels; a rerun is a no-op"
    requirement: WA-01
    verification:
      - kind: unit
        ref: "tests/chatwoot-sync.test.ts#WhatsApp inbox (78-04 tracer)"
        status: pass
      - kind: unit
        ref: "tests/chatwoot-config.test.ts#managed WhatsApp inbox: Channel::Whatsapp, only the four non-secret settings, all false (D-15/D-17)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Delayed 'window closing' label rules with execution_delay, feature check, one-run override and boundary validation (10..43200, integers)"
    requirement: WA-02
    verification:
      - kind: unit
        ref: "tests/chatwoot-sync.test.ts#WhatsApp window rules, feature check and override (78-04)"
        status: pass
      - kind: unit
        ref: "tests/chatwoot-config.test.ts#windowRules delayMinutes is an integer inside Chatwoot execution_delay range 10..43200"
        status: pass
    human_judgment: false
  - id: D3
    description: "Owner is added as member of every existing managed inbox; missing inboxes stay missing and are never created"
    requirement: WA-01
    verification:
      - kind: unit
        ref: "tests/chatwoot-sync.test.ts#adds the owner to every existing managed inbox (email, telegram, whatsapp) once; a rerun changes nothing"
        status: pass
    human_judgment: false
  - id: D4
    description: "inspect --whatsapp prints only enums, counts and booleans and --expect-connected gates on CONNECTED + signature secret + no stored pin"
    requirement: WA-01
    verification:
      - kind: unit
        ref: "tests/chatwoot-inspect.test.ts#inspect --whatsapp (78-04, T-78-12: enums, counts and booleans only)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Behavior of the delayed rule on live Chatwoot (delayed_automations flag, execution_delay cancel-on-reply)"
    verification: []
    human_judgment: true
    rationale: "Only unit-tested against an in-memory fake; live behavior is exercised by the 10-minute test in plan 78-15 and the first live sync in plan 78-12"

duration: 25min
completed: 2026-09-29
status: complete
---

# Phase 78 Plan 04: WhatsApp Chatwoot config-as-code and inspect health view Summary

**Config-as-code for the WhatsApp Cloud inbox (label, route, assign, delayed 20 h window-closing label with feature check and one-run override, owner membership for every managed inbox) plus an `inspect --whatsapp` health view that can only print enums, counts and booleans.**

## Performance

- **Duration:** about 25 min
- **Completed:** 2026-09-29T18:26Z
- **Tasks:** 3 (1 tracer, 2 auto/tdd)
- **Files modified:** 8 (5 source/config, 3 test files)

## Accomplishments

- WhatsApp inbox described in `inboxes.json` (`Channel::Whatsapp`, settings `enable_auto_assignment`, `greeting_enabled`, `csat_survey_enabled`, `working_hours_enabled`, all `false`); sync resolves it by channel type when the owner named it differently ("Prestigo WhatsApp" in the fixture) and PATCHes only those four settings, never a `channel` or `provider_config` key.
- `ch-whatsapp` (#0F1D2C) and `wa-window-closing` (#BFA06A) labels; `channel: whatsapp` rule adds `ch-whatsapp`, assigns the Bookings team and the owner. Second sync run: create=0 update=0.
- `windowRules` expands to `window: whatsapp closing soon` (message_created, incoming, `execution_delay` 1200, add_label) and `window: whatsapp reply clears label` (message_created, outgoing, remove_label), both optional. `differs()` compares `execution_delay`. A 422 is reported as skipped and the run continues.
- Feature handling: `delayed_automations` on -> created; features present without it -> both rules `skipped: ... (delayed_automations off)` and counted in `skipped=`; no features in the account payload -> created as optional with `warning: delayed_automations state unknown ...`.
- `--window-delay-override <minutes>` (also `=` form) validated as a plain integer in 10..43200 (9, 43201, 12.5, abc, empty, 1e3 rejected), applied to the expansion for that run only and logged as "not persisted". Verified sequence: override run update=1, normal run update=1 (restores 1200), next run update=0.
- Owner membership: `ensureOwnerInboxMember` now runs for every managed inbox that resolves; a missing inbox is still `missing:` and skipped.
- `inspect --whatsapp [--expect-connected]` (details below).

### Exact `inspect --whatsapp` output keys (in order)

```
status=  code_verification_status=  platform_type=  name_status=  quality_rating=  messaging_limit_tier=
signature_secret_configured=true|false
verification_pin_stored=true|false
provider_source=manual_setup_v2|embedded_signup|other
templates total=N approved=N pending=N rejected=N other=N
window_rule_delay_minutes=<n|missing>
delayed_automations=true|false|unknown
```

No inbox: `whatsapp inbox missing`, exit 1. Two `Channel::Whatsapp` inboxes: `ChatwootConfigError` (exit 2). `--expect-connected` failure text goes to stderr and names the failing check (`status is not CONNECTED`, `signature_secret_configured is not true`, `verification_pin_stored is not false`). All requests are GET. `SECRET_KINDS` is unchanged.

### How the account `features` map was handled

`GET /api/v1/accounts/1` is read once per run (cached in the sync context; for `inspect` via a tolerant GET). `featureState(account, 'delayed_automations')` returns `on`/`off`/`unknown`:
- object map: `true` -> on, anything else (including a missing key) -> off
- array of enabled names: included -> on, else off
- neither present -> unknown

The real payload shape stays unverified (RESEARCH marked it [ASSUMED]); the first live sync in plan 78-12 will show which branch fires, via the warning line or the skipped lines.

### Owner membership effect on production (applied at the first live sync, plan 78-12 Task 2)

On the first live sync the owner is added as an inbox member wherever not yet a member. The result per inbox is printed as `  [update] inbox <name>: owner member` lines and counted as an update for that inbox:

| Inbox | Effect at first live sync |
|-------|---------------------------|
| Email info@ | owner added if not already a member (unknown until the live run) |
| Email bookings@ | owner added if not already a member (unknown until the live run) |
| Telegram | owner added if not already a member (unknown until the live run) |
| WhatsApp | owner added (inbox created via manual flow has no members) |

Plan 78-12 should copy the actual `owner member` lines from that run into its own record. Nothing was run against production in this plan (unit tests with mocks only).

### Test counts

- Baseline before this plan: 125 tests across the three files (sync, config, inspect).
- After: 163 tests across those three files (sync 49, config 75, inspect 39); with `chatwoot-identity` 187 passing. Full related set (`chat-visit-context`, `middleware-i18n`, `telegram-bot-profile`) still 77 passing.
- `npx eslint --quiet` on the two `.mjs` files and three test files: clean. `npx tsc --noEmit`: 8 errors, identical to the documented `tests/` baseline, none in chatwoot files.
- `sh scripts/qa/secret_gate_probe.sh`: all probes as expected (BLOCKED/ALLOWED), including `template-price` and `template-clean` on the edited infra/chatwoot JSON.

## Task Commits

1. **Task 1 (tracer): WhatsApp inbox, ch-whatsapp label and channel rule** - `0739c748` (feat)
2. **Task 2: delayed window-closing rules, feature check, override flag, owner membership** - `f31f196f` (feat)
3. **Task 3: inspect --whatsapp health view** - `6099a00b` (feat)

**Plan metadata:** the SUMMARY commit that follows this file (docs).

_TDD: RED was run and observed failing before each implementation step (14 failing after the Task 1 test edits, 25 after Task 2, 12 after Task 3); tests and implementation are committed together per task._

## Files Created/Modified

- `infra/chatwoot/inboxes.json` - managed WhatsApp entry
- `infra/chatwoot/labels.json` - `ch-whatsapp`, `wa-window-closing`
- `infra/chatwoot/automation-rules.json` - `channel: whatsapp` rule and `windowRules`
- `infra/chatwoot/sync.mjs` - `isValidWindowDelay`, `parseWindowDelayOverride`, `featureState`, window rule expansion, `execution_delay` in `differs()`, `--window-delay-override`, owner membership for managed inboxes; `planCollection` and `subsetEqual` untouched (plan 78-03 imports them)
- `infra/chatwoot/inspect.mjs` - `gatherWhatsapp`, `formatWhatsapp`, `whatsappExpectationFailures`, `--whatsapp`, `--expect-connected`
- `tests/chatwoot-sync.test.ts`, `tests/chatwoot-config.test.ts`, `tests/chatwoot-inspect.test.ts` - fake WhatsApp fixtures with distinctive fake `provider_config` values, count-based assertions turned into explicit lists

## Decisions Made

- Feature state is tri-state and shape-tolerant (see above); unknown creates optional rules rather than blocking.
- Skipped window rules (flag off) count toward `skipped=` in the automation line, so `summary: skipped=` is non-zero until the owner enables `delayed_automations`.
- `inspect` treats a 4xx on `/health`, `/message_templates`, inbox detail and the account read as "no data" (prints `unknown` / zero counts) instead of failing, so `--expect-connected` fails cleanly rather than crashing.
- Non-enum health values print as `other` (defense against echoing a phone number or name into a line).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `parseArgs` return type in sync.mjs lacked the new `windowDelayOverride` key**
- **Found during:** Task 3 (final `npx tsc --noEmit`)
- **Issue:** the test file accessed `parseArgs(...).windowDelayOverride`, which TypeScript inferred as nonexistent, adding two errors beyond the documented baseline.
- **Fix:** added a JSDoc `@returns`/`@type` for the options object.
- **Files modified:** infra/chatwoot/sync.mjs
- **Verification:** `npx tsc --noEmit` back to the 8 baseline errors; tests still green.
- **Committed in:** 6099a00b (part of Task 3 commit)

**Other notes (not deviations):**
- The plan says the labels tracer count "becomes 13"; the tracer commit correctly asserts 12 (only `ch-whatsapp` exists then) and Task 2 raises it to 13.
- Existing tests whose skipped counts changed because a missing WhatsApp inbox and its two window rules are now reported as skipped (`skipped=3` -> 4 -> 5/6, full-run fixtures gained a WhatsApp inbox) were updated in the same commits.

**Total deviations:** 1 auto-fixed (1 bug). **Impact on plan:** none on scope.

## Issues Encountered

- `node_modules` is absent in the worktree. I made a gitignored symlink `node_modules -> /Users/romanustyugov/Desktop/Prestigo/node_modules` (no install performed) so vitest, eslint and tsc could run inside the worktree. The symlink is ignored by git and not part of any commit; the orchestrator re-runs the tests in the main tree after merge anyway.
- The `gsd-plan-head-before` ledger file could not be written by the sandbox (raw `.git` path in a shell command was refused); `plan_head_before` above is the worktree base `938a8024...` recorded from the verified spawn-time HEAD, and `commits: 3` was measured with `git rev-list --count` on that base.

## Threat Flags

None. Mitigations implemented and tested: T-78-12 (no provider_config value in inspect or sync output, distinctive-string tests), T-78-13 (PATCH to the WhatsApp inbox carries no channel/provider_config), T-78-14 (WhatsApp-scoped rules limited to label/team/agent actions, and no send action anywhere in the rules config), T-78-15 (feature-state check with skip/warn and optional rules; live 10-minute test is plan 78-15).

## Known Stubs

None.

## User Setup Required

None in this plan. Plan 78-12 owns creating the inbox by hand, enabling `delayed_automations` in Super Admin, and the first live sync.

## Next Phase Readiness

- Plan 78-12 can run `sync.mjs --dry-run` then live, and `inspect.mjs --whatsapp --expect-connected` after the inbox exists and `app_secret` is stored.
- Plan 78-15 can use `--window-delay-override 10` for the live 10-minute check, then a normal sync restores 1200.
- Plan 78-03 imports `planCollection` and `subsetEqual` from sync.mjs: signatures and behavior are unchanged.

---
*Phase: 78-whatsapp-cloud-api-channel-coexistence*
*Completed: 2026-09-29*

## Self-Check: PASSED

- All 8 modified files present; commits `0739c748`, `f31f196f`, `6099a00b` found in `git log`.
- Task acceptance criteria re-run: WhatsApp managed entry and ch-whatsapp/channel rule present, `execution_delay` x5 and `window-delay-override` x8 in sync.mjs, `windowRules[0]` delay 1200 optional, `'--whatsapp'` in inspect.mjs, `SECRET_KINDS` line unchanged, eslint clean.
- Plan verification: 163 tests pass across the three chatwoot test files; `secret_gate_probe.sh` probes as expected.
