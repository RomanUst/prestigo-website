---
phase: 76-vps-infrastructure
plan: 06
subsystem: infra
tags: [vps, monitoring, healthchecks, uptimerobot, systemd, alerting, telegram]

requires:
  - phase: 76-04
    provides: "Chatwoot + EspoCRM live behind Caddy, smoke.sh, container names (chatwoot-redis-1, espocrm-db-1, ...)"
  - phase: 76-05
    provides: "backup.sh already sources /etc/prestigo/monitor.env opportunistically and pings HC_PING_BACKUP when set — no code change needed when monitor.env first appears"
provides:
  - "infra/vps/monitoring/monitors.json — versioned source of truth for 2 UptimeRobot monitors + 6 Healthchecks.io checks (D-01..D-04, D-12)"
  - "infra/vps/scripts/provision-monitors.sh — idempotent SaaS provisioner (matches by friendly_name / unique name), --status mode, reads keys only from UPTIMEROBOT_API_KEY/HEALTHCHECKS_API_KEY env vars, never writes them anywhere"
  - "infra/vps/env/monitor.env.example — six HC_PING_* keys"
  - "infra/vps/scripts/monitor.sh — five on-VPS depth checks (disk_mem, kvm4_trigger, sidekiq, espocrm_internals, tls_expiry), MONITOR_DRY_RUN, --only, threshold overrides; every check gracefully skips its ping and still succeeds when monitor.env/its own HC_PING_* var is absent"
  - "infra/vps/systemd/prestigo-monitor.{service,timer} — 5-minute oneshot timer, installed and enabled on the VPS"
  - "infra/vps/runbooks/monitoring.md — architecture, monitor/check inventory, alert response playbook, KVM 4 upgrade triggers, maintenance-pause procedure, re-provisioning instructions"
affects: [76-07, 76-08, 76-09]

actuals:
  tokens: 11498
  tasks: 2
  commits: 2
  plan_head_before: 884c979c5deb905bcd77a503d00234ea9f2ebf0f
  plan_head_after: 0f879ebe1c67460efac899d33483baa160543a0f

tech-stack:
  added: ["UptimeRobot (free tier, external SaaS)", "Healthchecks.io (free tier, external SaaS)"]
  patterns:
    - "monitor.sh's hc() ping helper mirrors backup.sh's hc() exactly: skip-and-log (never abort) when its HC_PING_* var is unset, plus a MONITOR_DRY_RUN short-circuit that logs 'WOULD PING ...' before ever reaching curl — lets every fail branch be proven live without risking a real page"
    - "Each on-VPS check runs in its own subshell (run_check wrapper) so one check's internal `set -e` exit never aborts the other four — matches the plan's 'never aborts the other checks' requirement"
    - "provision-monitors.sh: each SaaS section (uptimerobot/healthchecks) is fully independent and gated on its own env var being set, so the script degrades gracefully with only one key present and gives a clear 'keys missing' exit with zero keys"

key-files:
  created:
    - infra/vps/monitoring/monitors.json
    - infra/vps/scripts/provision-monitors.sh
    - infra/vps/env/monitor.env.example
    - infra/vps/scripts/monitor.sh
    - infra/vps/systemd/prestigo-monitor.service
    - infra/vps/systemd/prestigo-monitor.timer
    - infra/vps/runbooks/monitoring.md
  modified:
    - infra/vps/README.md

key-decisions:
  - "UptimeRobot chosen over Better Stack per the plan's Claude-discretion note: free tier confirms keyword monitors + Telegram integration and allows commercial use (re-checked 2026-09-27)"
  - "Chatwoot keyword_value is the compound substring \"queue_services\":\"ok\",\"data_services\":\"ok\" (not just one field) — JSON key order is fixed by api_controller.rb's source, so the exact substring only ever appears when BOTH services report ok, matching the interfaces block's 'marker proving both data and queue services are ok' requirement"
  - "EspoCRM keyword_value is <title>EspoCRM</title>, confirmed live against the rendered login page's actual head markup (not guessed) — distinguishes the real app shell from a Caddy error page"
  - "Task 2's commit is named for what it actually contains (repo-side monitor definitions + provisioner) rather than the plan's literal 'external monitors provisioned (tracer)' wording, since Task 1's owner accounts don't exist yet and no live API call was made this session"
  - "monitor.sh's --only NAME dispatch uses a per-check subshell (not a trap/ERR handler) so 'never aborts the other checks' holds even when a check's own internal command fails outside an if-guard"

requirements-completed: []

coverage:
  - id: D1
    description: "D-01/INFRA-03 (repo-side only): monitors.json declares UptimeRobot keyword monitors for both apps' app-level health, chosen from live-fetched marker text; provision-monitors.sh idempotently creates them once owner API keys exist"
    requirement: "INFRA-03"
    verification:
      - kind: other
        ref: "jq -e '.uptimerobot | length == 2' infra/vps/monitoring/monitors.json -> exit 0; live curl of both public URLs confirmed the chosen keyword_value strings are the actual current response bodies"
        status: pass
    human_judgment: true
    rationale: "the monitors themselves are not live — Task 1 (owner creates the UptimeRobot/Healthchecks accounts + Telegram handshakes) is deferred to end-of-phase, so no human/automated check can confirm the monitors actually alert until the owner completes Task 1 and Claude runs provision-monitors.sh"
  - id: D2
    description: "D-02: no custom Telegram bot code exists anywhere in this change; lib/content/telegram.ts untouched"
    verification:
      - kind: other
        ref: "git diff --quiet HEAD -- lib/content/telegram.ts -> exit 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-03: prestigo-backup Healthchecks check definition carries the ~26h dead-man's-switch shape (24h timeout + 2h grace) matching backup.sh's already-live nightly schedule"
    requirement: "INFRA-04"
    verification:
      - kind: other
        ref: "jq -e '.healthchecks[] | select(.name==\"prestigo-backup\") | .timeout == 86400 and .grace == 7200' infra/vps/monitoring/monitors.json -> exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-04b/c/d, D-12: monitor.sh implements all five on-VPS checks (disk_mem, kvm4_trigger, sidekiq, espocrm_internals, tls_expiry), each independently proven live on the VPS against real container/host state"
    requirement: "INFRA-03"
    verification:
      - kind: other
        ref: "live run with no monitor.env: all 5 checks OK, exit 0 (disk=12% mem=22% swap=0%, kvm4 no-history-yet, sidekiq heartbeat age 0-6s, espocrm daemon+mariadb healthy, both TLS certs ok); dry-run with DISK_MAX_PCT=1 MEM_MAX_PCT=1 TLS_MIN_DAYS=400 -> WOULD PING fail for disk_mem and tls_expiry, WOULD PING success for the other three, zero real network calls; normal dry run -> WOULD PING success for all five"
        status: pass
    human_judgment: false
  - id: D5
    description: "prestigo-monitor.timer runs every 5 minutes, enabled and active; a manual service start completes cleanly (Result=success) even with /etc/prestigo/monitor.env entirely absent — every ping logs 'skipped (no ping URL)' and the run still exits 0"
    requirement: "INFRA-04"
    verification:
      - kind: other
        ref: "systemctl is-enabled -> enabled; is-active -> active; list-timers shows NEXT in ~5min; systemctl start + systemctl show -p Result -> Result=success; journalctl shows all five 'skipped (no ping URL)' lines"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-12/monitoring.md: runbook documents both KVM 4 upgrade triggers (automated 7-day RAM>80%, manual 'a second operator is onboarded') plus the in-panel upgrade procedure and alert response playbook for every monitor/check"
    verification:
      - kind: other
        ref: "grep -q 'second operator' && grep -q 'KVM 4' infra/vps/runbooks/monitoring.md -> both pass"
        status: pass
    human_judgment: false
  - id: D7
    description: "Task 1 (owner creates Healthchecks.io + UptimeRobot accounts, connects Telegram, hands over API keys) — deliberately deferred to end-of-phase per this run's dispatch"
    verification: []
    human_judgment: true
    rationale: "owner accounts deferred to end of phase; see 'Deferred owner actions' below for the checklist and the exact Claude follow-up commands"

duration: ~35min
completed: 2026-09-28
status: complete-pending-owner
---

# Phase 76 Plan 06: External Monitoring & On-VPS Depth Checks Summary

**UptimeRobot + Healthchecks.io monitor definitions and an idempotent provisioner are versioned and validated (repo-only — no owner API keys exist yet), while all five on-VPS depth checks (disk/mem, KVM 4 trigger, Sidekiq, EspoCRM internals, TLS expiry) run live on a 5-minute systemd timer, gracefully no-op'ing every ping until the owner's SaaS accounts exist.**

## Performance

- **Duration:** ~35 min
- **Started:** ~2026-09-27T22:49Z
- **Completed:** 2026-09-27T23:04Z
- **Tasks:** 2/3 completed (Task 1 deferred, see below)
- **Files created:** 7, modified: 1

## Accomplishments

- `infra/vps/monitoring/monitors.json` declares the 2 UptimeRobot monitors and 6 Healthchecks.io checks required by D-01 through D-04 and D-12, with keyword values chosen from the **live** current response bodies of `https://chat.rideprestigo.com/api` (the compound substring `"queue_services":"ok","data_services":"ok"`, which only appears when both services are healthy) and `https://crm.rideprestigo.com/` (`<title>EspoCRM</title>`, confirmed against the actual rendered markup, not guessed).
- `infra/vps/scripts/provision-monitors.sh` is written, `bash -n` clean, and validated end-to-end **without** calling any live API: with no keys exported it prints a clear "keys missing" error naming exactly which env vars are needed and pointing at Task 1, and exits 1. Each SaaS section (UptimeRobot / Healthchecks) is independently gated on its own API key so the script degrades gracefully with only one key present. It is idempotent by construction — UptimeRobot monitors matched by `friendly_name`, Healthchecks checks created with `unique: ["name"]`.
- `infra/vps/env/monitor.env.example` documents the six `HC_PING_*` keys with empty values.
- `infra/vps/scripts/monitor.sh` implements all five on-VPS checks and is **live on the VPS**, proven against real container/host state: with `/etc/prestigo/monitor.env` genuinely absent, all five checks report `OK` and every ping logs `skipped (no ping URL)`, exit 0. A dry run with `DISK_MAX_PCT=1 MEM_MAX_PCT=1 TLS_MIN_DAYS=400` produces `WOULD PING ... fail` for `disk_mem` and `tls_expiry` (and `WOULD PING ... success` for the other three) with zero real network calls; a normal-threshold dry run produces `WOULD PING ... success` for all five.
- `infra/vps/systemd/prestigo-monitor.{service,timer}` are installed and enabled on the VPS (`systemctl is-enabled`/`is-active` both confirm), and a manual `systemctl start` completed with `Result=success` — the timer runs cleanly in the current pre-provisioning state.
- `infra/vps/runbooks/monitoring.md` documents the alerting architecture (everything off the VPS is primary, D-01/D-02), the full monitor/check inventory, a response playbook per alert type, both KVM 4 upgrade triggers, the maintenance-pause procedure, and how to re-provision from `monitors.json`.
- `infra/vps/README.md`'s runbook index corrected `monitoring.md`'s attribution from "Plan 76-07" to "Plan 76-06" (same stale-cross-reference class as 76-05's `upgrade.md` fix).

## Task Commits

1. **Task 2 (tracer, repo-side only): monitor definitions and provisioning script** - `c072302d` (feat) — named for what it actually contains (see Deviations)
2. **Task 3: on-VPS checks, systemd timer, and monitoring runbook** - `0f879ebe` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

## Files Created/Modified

- `infra/vps/monitoring/monitors.json` - 2 UptimeRobot monitors + 6 Healthchecks checks, versioned declaratively
- `infra/vps/scripts/provision-monitors.sh` - idempotent provisioner, `--status` mode, env-only keys
- `infra/vps/env/monitor.env.example` - six `HC_PING_*` keys, empty values
- `infra/vps/scripts/monitor.sh` - five checks, `--only`, `MONITOR_DRY_RUN`, threshold overrides
- `infra/vps/systemd/prestigo-monitor.service` - oneshot, `TimeoutStartSec=4min`
- `infra/vps/systemd/prestigo-monitor.timer` - `OnBootSec=2min`, `OnUnitActiveSec=5min`, `AccuracySec=30s`
- `infra/vps/runbooks/monitoring.md` - architecture/inventory/playbook/KVM4-triggers/maintenance/re-provisioning
- `infra/vps/README.md` - runbook-index attribution fix
- Host (not in git): `/opt/prestigo/{monitoring,scripts,systemd,runbooks}` synced; `prestigo-monitor.{service,timer}` installed in `/etc/systemd/system/`, enabled+active; `/var/log/prestigo/mem-usage.log` created by live check runs; `/opt/prestigo/DEPLOYED_SHA` updated to `0f879ebe`

## Verification

- `bash -n infra/vps/scripts/monitor.sh && bash -n infra/vps/scripts/provision-monitors.sh` -> exit 0
- `jq -e ".healthchecks | length == 6"` and `jq -e ".uptimerobot | length == 2"` on `monitors.json` -> both pass
- `jq -e '.healthchecks[] | select(.name=="prestigo-backup") | .timeout == 86400 and .grace == 7200'` -> pass (D-03 ~26h)
- `! grep -Eq "(api_key|X-Api-Key)[\"=: ]+[A-Za-z0-9]{12,}" provision-monitors.sh monitors.json` -> pass (no key literals)
- `git diff --quiet HEAD -- lib/content/telegram.ts` -> pass (D-02: content bot untouched)
- `bash infra/vps/scripts/provision-monitors.sh` with no keys exported -> clear error naming both required env vars, exit 1 (no live API call)
- `ssh prestigo-vps 'sudo /opt/prestigo/scripts/monitor.sh'` with `/etc/prestigo/monitor.env` genuinely absent -> all 5 checks OK, all 5 pings "skipped (no ping URL)", exit 0
- `ssh prestigo-vps 'sudo env MONITOR_DRY_RUN=1 DISK_MAX_PCT=1 MEM_MAX_PCT=1 TLS_MIN_DAYS=400 HC_PING_*=<dummy hc-ping.com URLs> monitor.sh'` -> `WOULD PING HC_PING_DISK_MEM fail`, `WOULD PING HC_PING_TLS fail`, the other three `WOULD PING ... success`, zero real network calls (dummy URLs, never actually curled since `MONITOR_DRY_RUN=1` short-circuits before the curl line)
- Same command with default thresholds -> `WOULD PING ... success` for all five
- `ssh prestigo-vps 'systemctl is-enabled prestigo-monitor.timer; systemctl is-active prestigo-monitor.timer'` -> `enabled` / `active`
- `ssh prestigo-vps 'systemctl start prestigo-monitor.service && systemctl show prestigo-monitor.service -p Result'` -> `Result=success`
- `grep -q "second operator" && grep -q "KVM 4"` on `monitoring.md` -> both pass
- `grep -q "REDISCLI_AUTH" monitor.sh` -> pass

## Decisions Made

See `key-decisions` in frontmatter. In short: UptimeRobot chosen per the plan's Claude-discretion clause; both keyword values were chosen from **live** response bodies (not assumed from documentation), matching the plan's explicit instruction to fetch both endpoints first; Task 2's commit message honestly describes what actually happened (repo-side definitions + provisioner) rather than reusing the plan's literal "provisioned" wording, since no live SaaS provisioning occurred this session.

## Deviations from Plan

### Auto-fixed Issues

None (Rule 1-3 code fixes) — the plan's own files_modified list was implemented as written.

### Scope note (not a deviation, a designed divergence per this run's explicit dispatch)

**1. Task 2's commit message deviates from the plan's literal text**
- **Found during:** Task 2
- **Issue:** The plan's action text specifies committing as `feat(76-06): external monitors provisioned (tracer)`. Since Task 1 (owner accounts) is deferred and no API keys exist, no monitor was actually provisioned this session — using that exact message would misstate what the commit contains.
- **Fix:** Committed as `feat(76-06): monitor definitions and provisioning script (owner accounts deferred)`, with the commit body explaining the deferral explicitly.
- **Files modified:** none beyond the plan's own list — commit-message wording only.
- **Verification:** `git log --oneline` shows the honest message; the commit's actual diff matches exactly what the plan's Task 2 files_modified specifies.
- **Committed in:** `c072302d`

---

**Total deviations:** 0 code auto-fixes; 1 commit-message wording adjustment (not a Rule 1-3 fix — a factual-accuracy correction, made necessary by Task 1's deferral).
**Impact on plan:** None on functionality. No scope creep.

## Issues Encountered

**Chatwoot's `/api` `data_services` field intermittently reports `"failing"`** (discovered while fetching the live UptimeRobot keyword marker for Task 2). Observed multiple times during this session, in bursts lasting roughly 10-60 seconds, then self-resolving:

```
{"version":"4.18.0","timestamp":"...","queue_services":"ok","data_services":"failing"}
```

Investigated (read-only, no changes made): `data_services` comes from Chatwoot's own `ApiController#postgres_status` (`ActiveRecord::Base.connection.active?`, rescuing `ActiveRecord::ConnectionNotEstablished`). During the failing window: `chatwoot-postgres-1`/`chatwoot-rails-1` both show `RestartCount=0`, `OOMKilled=false`; `docker logs chatwoot-postgres-1` has zero errors in the surrounding 5 minutes; `pg_stat_activity` shows 9 connections, well under `max_connections=100`; an in-process `rails runner` check and a `Rack::Test` request both return `"ok"` even while the real public endpoint (both via Caddy and via a direct `docker exec ... ruby -rnet/http` call to `127.0.0.1:3000`) intermittently returns `"failing"`. Suspected cause: Puma/ActiveRecord connection-pool reaping (`config/database.yml`'s `reaping_frequency: 30s` default) transiently reclaiming a request thread's checked-out connection, but this is not confirmed.

**Not fixed** — `chatwoot.env`/`chatwoot/compose.yml` belong to plan 76-04's `files_modified`, not this plan's (Scope Boundary). **Recorded** as WINDOWS.md entry #30 (`kind: deviation`, `status: open`, phase 76, file `infra/vps/chatwoot/compose.yml`) so it stays visible before `/gsd-ship`. **Practical implication for this plan's own deliverables:** none of `monitor.sh`'s five on-VPS checks touch Chatwoot's Postgres connection at all (they check disk/mem/KVM4/Sidekiq's own Redis heartbeat/EspoCRM/TLS) — this issue only affects the **already-committed, not-yet-live** UptimeRobot Chatwoot monitor definition in `monitors.json`. Once the owner completes Task 1 and the monitor goes live, it may occasionally show a brief real DOWN state for this reason — that is arguably the monitor **correctly catching a real intermittent condition**, not a monitoring defect, but it is worth investigating further in a later phase (likely Phase 77, when Chatwoot sees real traffic) before it pages the owner with false urgency for a self-resolving blip.

## Known Stubs

None in this plan's own deliverables — every file this plan created is fully functional as written (no placeholder logic). The one true "stub" state is external: the two SaaS monitors declared in `monitors.json` are not yet live, entirely because Task 1's owner accounts don't exist — tracked explicitly via coverage entry D7 and the "Deferred owner actions" section below, not silently.

## Threat Flags

None — every new surface (Healthchecks ping URLs, UptimeRobot/Healthchecks API keys, the Redis heartbeat read, MariaDB healthcheck exec) was already enumerated in this plan's `<threat_model>` (T-76-25 through T-76-28, T-76-SC) and mitigated as designed; no unplanned surface was introduced.

## User Setup Required

None new beyond Task 1 (see below) — no additional owner action is introduced by Task 3's on-VPS work, which required no credentials beyond what 76-01..76-05 already supplied.

## Deferred owner actions (Task 1 + provisioning)

**Not executed.** Per this run's explicit dispatch instruction, Task 1 (`type="checkpoint:human-action"`, `gate="blocking-human"`) — the owner creating the Healthchecks.io and UptimeRobot accounts, completing both Telegram bot handshakes, and handing over the two API keys — is deliberately deferred so the owner can complete every Phase 76 owner action in one batch at the end of the phase. **Nothing was faked or simulated.** No API calls were made to either service. `requirements-completed` is empty in this SUMMARY's frontmatter; `INFRA-03`/`INFRA-04` stay open in REQUIREMENTS.md until Task 1 closes and the monitors are actually live.

### Owner checklist (copied from Task 1's `<instructions>`)

Claude already: has backups running with a ping hook waiting for a Healthchecks URL, and knows exactly which monitors to create (Claude creates all monitors and checks itself via API once keys are provided).

Owner, in order:

1. **healthchecks.io** — sign up with your email (the email alert channel is created automatically). Integrations -> Telegram -> follow the instructions: open `@HealthchecksBot` in Telegram, send `/start`, open the link it replies with, attach it to your project. Then Settings -> API Access -> create a read-write API key.
2. **uptimerobot.com** — sign up (free plan). Integrations -> Telegram -> add, open the bot link in Telegram, press Start. Your account email is already an alert contact. Then Integrations & API -> Main API key -> create it.
3. Reply with both API keys. Claude uses them only in this plan's commands and never stores them.

### Exact Claude follow-up commands (once the owner replies with both keys)

```bash
# 1. Provision both SaaS accounts from monitors.json (idempotent — safe to re-run)
UPTIMEROBOT_API_KEY="<owner's key>" HEALTHCHECKS_API_KEY="<owner's key>" \
  bash infra/vps/scripts/provision-monitors.sh
# -> prints created=N for each section, then the six HC_PING_*=url lines
#    between "--- MONITOR ENV ---" and "--- END MONITOR ENV ---"

# 2. Install those six ping URLs on the VPS as monitor.env (root, mode 600)
#    — pipe directly, never via a file on this Mac or in shell history:
UPTIMEROBOT_API_KEY="<owner's key>" HEALTHCHECKS_API_KEY="<owner's key>" \
  bash infra/vps/scripts/provision-monitors.sh \
  | sed -n '/^--- MONITOR ENV/,/^--- END MONITOR ENV/p' | sed '1d;$d' \
  | ssh prestigo-vps 'sudo install -m 600 -o root -g root /dev/stdin /etc/prestigo/monitor.env'

# 3. Confirm all 8 lines report "up" (allow one 5-minute timer cycle to pass first)
UPTIMEROBOT_API_KEY="<owner's key>" HEALTHCHECKS_API_KEY="<owner's key>" \
  bash infra/vps/scripts/provision-monitors.sh --status

# 4. Send one real test alert end-to-end (Telegram + email) before declaring done —
#    e.g. temporarily stop a monitored container and confirm the alert arrives on
#    both channels, then restart it and confirm the recovery alert also arrives.
```

### Verification Claude must run once the owner replies with both API keys

- Run the four commands above.
- Confirm `--status` shows all 8 lines (`2 uptimerobot + 6 healthchecks`) ending in `up`.
- Confirm the owner received one real test alert (down + recovery) on both Telegram and email.
- Once verified: re-classify coverage entries D1 and D7 in this SUMMARY (or a follow-up SUMMARY) from `human_judgment: true` to a passing `verification`, and run `requirements.mark-complete INFRA-03 INFRA-04` (currently withheld — also withheld pending 76-05's own Task 3 closure, which gates the same two IDs).

**Resume signal for Task 1 (unchanged from the plan):** Owner replies "monitoring accounts ready" with both API keys — or describes any problem completing either signup/Telegram handshake.

## Next Phase Readiness

- All five on-VPS depth checks run live, every 5 minutes, and degrade gracefully to a clean no-op until the owner's SaaS accounts exist — no risk of a broken/erroring timer in the interim.
- `infra/vps/scripts/provision-monitors.sh` and `infra/vps/monitoring/monitors.json` are ready for the owner-key follow-up the moment Task 1 closes — no further code changes needed, just the four commands above.
- `infra/vps/runbooks/monitoring.md` is ready for reference by Phase 76's remaining plans (76-07 outage test, 76-08/09 restore drill) and any future alert response.
- **Blocker for closing this plan's requirements:** Task 1 (owner creates both SaaS accounts + Telegram handshakes + hands over API keys) is outstanding, same as 76-05's Task 3. `INFRA-03`/`INFRA-04` should not be marked complete until both plans' deferred owner actions close. Collect this alongside 76-05's Task 3 and any other Phase 76 owner actions at end-of-phase per this run's instruction.
- **Non-blocking finding for a later phase:** Chatwoot's intermittent `data_services:failing` (WINDOWS.md #30) is worth a focused look once Phase 77 puts real traffic through Chatwoot — it may cause occasional brief false-seeming DOWN alerts on the Chatwoot UptimeRobot monitor once Task 1 goes live.

---
*Phase: 76-vps-infrastructure*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: infra/vps/monitoring/monitors.json
- FOUND: infra/vps/scripts/provision-monitors.sh
- FOUND: infra/vps/env/monitor.env.example
- FOUND: infra/vps/scripts/monitor.sh
- FOUND: infra/vps/systemd/prestigo-monitor.service
- FOUND: infra/vps/systemd/prestigo-monitor.timer
- FOUND: infra/vps/runbooks/monitoring.md
- FOUND commit: c072302d (Task 2)
- FOUND commit: 0f879ebe (Task 3)
- Re-ran all Task 2/3 `<verify>`/acceptance-criteria commands that don't require live API keys — all PASS (see "Verification" section above)
- Task 2's plan-specified `<verify>` commands requiring `UPTIMEROBOT_API_KEY`/`HEALTHCHECKS_API_KEY` and Task 3's second `<verify>` command (`provision-monitors.sh --status`) were **not** run — they require Task 1's owner API keys, which do not exist yet. Not claimed as done anywhere in this SUMMARY or in REQUIREMENTS.md.
