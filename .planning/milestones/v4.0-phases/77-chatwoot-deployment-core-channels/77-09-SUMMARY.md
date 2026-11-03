---
phase: 77-chatwoot-deployment-core-channels
plan: 09
subsystem: infra
tags: [chatwoot, inspect, reports, hmac, vercel-env, secret-gate, custody, runbook]

requires:
  - phase: 77-chatwoot-deployment-core-channels
    provides: "plan 77-07 shared client (lib/client.mjs), sync.mjs, live Website inbox (id 3, hmac_mandatory) and full config"
provides:
  - "infra/chatwoot/inspect.mjs: read-only --status, --activity, --report, --contact --expect-identifier, --print website-token|hmac-token"
  - "Vercel Production env CHATWOOT_BASE_URL, CHATWOOT_WEBSITE_TOKEN, CHATWOOT_WIDGET_HMAC_SECRET (sensitive), HMAC piped from the Chatwoot API without being displayed"
  - "infra/vps/env/chatwoot-integration.env.example: secret names feeding the pre-commit infra secret gate, proven by Probe I"
  - "infra/chatwoot/README.md (config-as-code, token custody, rotation) and a post-upgrade Chatwoot config check in the upgrade runbook"
affects: [77-11 (inspect --status/--activity for email inboxes), 77-12, 77-13 (inspect --report/--activity/--contact), 78, 79 (adding a channel), 80]

actuals:
  tokens: 12000
  tasks: 3
  commits: 3
  plan_head_before: 765588ed6adae943248d35a17ee97fedc91e774a
  plan_head_after: 1f53195ba71af993e55ccdfdbc194e8179d482b3

tech-stack:
  added: []
  patterns:
    - "Secret hand-off by pipe: --print refuses a terminal (isTTY), value fetched only after the check, consumer is `vercel env add ... --sensitive --yes`"
    - "Read-only operator tooling on the shared client: formatters are pure and exported, gathering is GET-only, tests run on an in-memory fake API"
    - "Secret-gate names come from infra/vps/env/*.env.example: adding a name file extends the KEY=value block list with no hook edit"

key-files:
  created:
    - infra/chatwoot/inspect.mjs
    - tests/chatwoot-inspect.test.ts
    - infra/vps/env/chatwoot-integration.env.example
    - infra/chatwoot/README.md
  modified:
    - scripts/qa/secret_gate_probe.sh
    - infra/vps/runbooks/upgrade.md

key-decisions:
  - "Reports: GET /api/v2/accounts/{id}/summary_reports/{inbox|label} works on Chatwoot v4.18.0-ce; the reports/summary fallback is implemented and unit-tested but was not needed live"
  - "inspect exit codes follow the plan interface: 2 for both API and config errors (sync.mjs uses 1 for config)"
  - "process.exitCode instead of process.exit so a piped --print value is fully flushed"
  - "Team names in --status are shown as configured (Bookings, B2B) although Chatwoot stores them lower-case"

patterns-established:
  - "Never run `--print` unpiped; verify a pipe's payload with `| wc -c`, which prints a length only"
  - "After each channel inbox is created (77-11, 77-13): sync.mjs, then inspect --status must read `present`"

requirements-completed: [INBOX-03, INBOX-06, INBOX-02]

coverage:
  - id: D1
    description: "inspect --status shows live Chatwoot state on the shared client, read-only"
    requirement: "INBOX-02"
    verification:
      - kind: unit
        ref: "tests/chatwoot-inspect.test.ts#inspect --status (tracer)"
        status: pass
      - kind: other
        ref: "node infra/chatwoot/inspect.mjs --status (live, exit 0; output below)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-05/INBOX-03: widget config and HMAC secret in Vercel Production via a pipe; --print refuses a terminal"
    requirement: "INBOX-03"
    verification:
      - kind: unit
        ref: "tests/chatwoot-inspect.test.ts#--print (T-77-21: a secret only ever flows into a pipe)"
        status: pass
      - kind: other
        ref: "vercel env ls production lists CHATWOOT_BASE_URL, CHATWOOT_WEBSITE_TOKEN, CHATWOOT_WIDGET_HMAC_SECRET (count 3)"
        status: pass
    human_judgment: false
  - id: D3
    description: "INBOX-06/D-22: --report per inbox and per ch-* label from Chatwoot's native reports API"
    requirement: "INBOX-06"
    verification:
      - kind: unit
        ref: "tests/chatwoot-inspect.test.ts#--report (INBOX-06 / D-22)"
        status: pass
      - kind: other
        ref: "node infra/chatwoot/inspect.mjs --report --since 2026-09-01T00:00:00Z (live, exit 0, path /summary_reports)"
        status: pass
    human_judgment: false
  - id: D4
    description: "--activity and --contact expose ids/labels/statuses/booleans only, never PII"
    requirement: "INBOX-03"
    verification:
      - kind: unit
        ref: "tests/chatwoot-inspect.test.ts#--activity, #--contact (INBOX-03, T-77-23: booleans only)"
        status: pass
    human_judgment: false
  - id: D5
    description: "New secret names are recognised by the pre-commit infra secret gate; custody and rotation documented"
    requirement: "INBOX-03"
    verification:
      - kind: other
        ref: "sh scripts/qa/secret_gate_probe.sh: PROBE chatwoot-hmac-secret: BLOCKED, PROBE telegram-bot-token: BLOCKED, all other probes unchanged"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-09-29
status: complete
---

# Phase 77 Plan 09: Chatwoot Inspect Tooling and Widget Secret Hand-Off Summary

**A read-only `inspect.mjs` (status, activity, native reports, contact identity, pipe-only secret print) on the shared client, and the production identity route's three Vercel env vars provisioned by pipe with the HMAC secret never displayed.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 3 (Task 1 tracer, Tasks 2 and 3 auto/tdd)
- **Files:** 4 created, 2 modified

## Accomplishments

- `infra/chatwoot/inspect.mjs` (410 lines): pure exported formatters (`formatStatus`, `formatActivity`, `formatReport`, `formatContact`, `printSecret`) plus GET-only gatherers on `createChatwootClient` (so it sends `api-access-token`, never the underscore header).
- Live `--status`, `--activity` and `--report` verified against production Chatwoot; a test asserts every request the tool makes is a GET.
- `--print website-token|hmac-token` writes the value with no newline only when stdout is not a TTY; on a terminal it prints `refusing to print a secret to a terminal; pipe it` to stderr, exits 1 and does not even fetch the value (tested for both kinds).
- Vercel Production now holds `CHATWOOT_BASE_URL`, `CHATWOOT_WEBSITE_TOKEN` and `CHATWOOT_WIDGET_HMAC_SECRET` (added with `--sensitive`).
- `chatwoot-integration.env.example` lists the six names with empty values and custody notes; the existing hook derived them automatically and Probe I proves a pasted `CHATWOOT_WIDGET_HMAC_SECRET` value is blocked.
- README (sync/inspect usage, custody table, rotation of API token / HMAC secret / Telegram token, adding a channel for Phases 78-79) and upgrade runbook step 6b.

## Task Commits

1. **Task 1 (tracer): inspect --status live** - `405e902d` (feat)
2. **Task 2: env hand-off, secret-gate names, Probe I** - `984e0852` (security)
3. **Task 3: activity/report/contact tests, README, upgrade check** - `1f53195b` (feat)

## Live outputs (no secrets)

`node infra/chatwoot/inspect.mjs --status` (exit 0):

```
labels=11
teams=Bookings(owner),B2B(owner)
custom_attributes=16
canned=35
automation_rules=108
inbox Website web_widget hmac_mandatory=true reply_time=in_a_few_minutes widget_color=#0F1D2C pre_chat_email_required=true
inbox Email info@ Channel::Email missing
inbox Email bookings@ Channel::Email missing
inbox Telegram Channel::Telegram present
```

`node infra/chatwoot/inspect.mjs --report --since 2026-09-01T00:00:00Z` (exit 0):

```
reports_path=/summary_reports
report inbox PrestigoChauffeurBot conversations=1 avg_first_response_s=85 avg_resolution_s=null
report inbox Restore drill canary conversations=1 avg_first_response_s=0 avg_resolution_s=1
report inbox Website conversations=0 avg_first_response_s=null avg_resolution_s=null
report label ch-email conversations=0 avg_first_response_s=null avg_resolution_s=null
report label ch-telegram conversations=0 avg_first_response_s=null avg_resolution_s=null
report label ch-web conversations=0 avg_first_response_s=null avg_resolution_s=null
```

**Reports API path that worked on v4.18.0-ce:** `GET /api/v2/accounts/{id}/summary_reports/inbox` and `.../summary_reports/label` (with `since`/`until` epoch seconds). The `reports/summary?type=&id=` fallback is only used on a 404 and did not fire live (covered by a fake-API test). The path used is printed to stderr as `reports_path=...`.

`node infra/chatwoot/inspect.mjs --activity --limit 5` (exit 0) listed the two pre-existing conversations (Telegram bot inbox, restore-drill canary): ids, status, `labels=none`, `assignee_is_owner=false`, `team=none`, `last_outgoing=sent`. Those two conversations pre-date the channel automation rules (rules fire on `conversation_created`), so they carry no label or team; new conversations will.

Vercel Production env names present (values never shown; all listed as Encrypted, the HMAC secret created with `--sensitive`): `CHATWOOT_BASE_URL`, `CHATWOOT_WEBSITE_TOKEN`, `CHATWOOT_WIDGET_HMAC_SECRET`. Payload sizes of the two piped values checked with `| wc -c` (24 and 24 bytes, non-empty).

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Telegram token name also probed**
- **Issue:** the plan's Probe I covers `CHATWOOT_WIDGET_HMAC_SECRET` only, but `TELEGRAM_CHAT_BOT_TOKEN` is the other new secret name in the env example.
- **Fix:** added a second probe `telegram-bot-token` next to `chatwoot-hmac-secret` in `scripts/qa/secret_gate_probe.sh`. Both print BLOCKED.
- **Commit:** 984e0852

**2. [Rule 3 - Blocking] Vercel project link missing in the worktree**
- **Issue:** `vercel env ls/add` needs `.vercel/project.json`, which is untracked and absent from a fresh worktree.
- **Fix:** copied the (non-secret, gitignored) `.vercel/project.json` from the main checkout into the worktree for the run and removed it before returning. No project change.

**3. [Note] Task 1 shipped the whole module**
The tracer commit already contains every mode of `inspect.mjs` (the code is one cohesive file); Task 1 tests covered `--status`, and the `--print`, `--activity`, `--report` and `--contact` tests were added in the Task 2 and Task 3 commits as planned.

**Total deviations:** 1 auto-added, 1 blocking workaround, 1 note. No architectural changes.

## Deferred / Owner steps

- **Deploy needed for the env vars to take effect.** The three variables are set for Production but only reach a running deployment on the next production deploy; I did not deploy (not allowed for this run). The 77-10 widget / identity route code is what consumes them.
- `python3 scripts/qa/chat_widget_probe.py --click https://rideprestigo.com --locales en --pages /` (listed in the new upgrade runbook step 6b) was not run here: it needs the widget launcher deployed to production first.
- HMAC rotation in the README notes that this Chatwoot version may have no regenerate control in the UI; the exact rotation mechanism has not been exercised and should be confirmed the first time it is needed.

## Known Stubs

None.

## Threat Flags

None. T-77-21 (`--print` refuses a TTY, tested; the secret went Chatwoot API -> pipe -> `vercel env add`, never a terminal, log, or this file), T-77-22 (env example feeds the gate; Probe I blocked) and T-77-23 (`--contact` booleans only, `--activity` ids/labels/statuses only, both tested for absence of names/emails/bodies) are mitigated. T-77-SC: no package installs.

## Next Phase Readiness

- 77-11 (email inboxes): run `node infra/chatwoot/sync.mjs`, then `inspect --status` must show both email inboxes `present`.
- 77-12 / 77-13: use `inspect --activity`, `--report` and `--contact --expect-identifier` for verification.

## Self-Check: PASSED

- Files present: `infra/chatwoot/inspect.mjs`, `tests/chatwoot-inspect.test.ts`, `infra/vps/env/chatwoot-integration.env.example`, `infra/chatwoot/README.md`; modified `scripts/qa/secret_gate_probe.sh`, `infra/vps/runbooks/upgrade.md`.
- Commits `405e902d`, `984e0852`, `1f53195b` present in `git log`.
- `npx vitest run tests/chatwoot-inspect.test.ts tests/chatwoot-sync.test.ts tests/chatwoot-config.test.ts` 120/120 passed (27 in the inspect file); `npx eslint --quiet` clean on the two new JS/TS files; `npx tsc --noEmit` reports 0 errors in `chatwoot-inspect`.
- `grep -c isTTY tests/chatwoot-inspect.test.ts` = 8; `grep -c "CHATWOOT_WIDGET_HMAC_SECRET=$" infra/vps/env/chatwoot-integration.env.example` = 1; `grep -c "sync.mjs --dry-run" infra/vps/runbooks/upgrade.md` = 1; `grep -ci "rotate\|rotation" infra/chatwoot/README.md` = 5; price-guard grep over `infra/chatwoot` finds nothing.
- `sh scripts/qa/secret_gate_probe.sh` prints BLOCKED for `chatwoot-hmac-secret` and `telegram-bot-token` and no NOT BLOCKED line.
- `--print` was only ever run piped.
