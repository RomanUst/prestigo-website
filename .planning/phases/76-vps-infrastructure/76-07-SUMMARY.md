---
phase: 76-vps-infrastructure
plan: 07
subsystem: infra
tags: [outage-test, playwright, e2e, uptimerobot, healthchecks, stripe, contact-form]

requires:
  - phase: 76-04
    provides: "chatwoot/espocrm/caddy Docker Compose stacks + smoke.sh"
  - phase: 76-06
    provides: "UptimeRobot (v3 API) + Healthchecks.io monitors, provision-monitors.sh --status, D-02 apps_http check"
provides:
  - "scripts/qa/contact_form_e2e.py — production page-render + contact-form submit check, fails on any chat./crm. request"
  - "infra/vps/runbooks/outage-test.md — repeatable D-19(a) outage procedure + dated Test log with the actual 2026-09-28 run"
  - "Real evidence: production site, booking-to-Stripe, and contact form all worked while every VPS container was stopped; all 6 relevant alert targets detected the outage within 5 minutes; full recovery confirmed"
affects: [76-08, 76-09, 81, 82]

actuals:
  tokens: 3771
  tasks: 1
  commits: 1
  plan_head_before: d4fa459395e9c6c7c95efee602d220a05a4add2b
  plan_head_after: 7d00d3163f9357856e48575573298ea68a638f3e

tech-stack:
  added: []
  patterns:
    - "contact_form_e2e.py imports should_abort_analytics and the messages/<locale>.json label resolver (t/load_messages) from booking_e2e.py rather than duplicating them — both QA scripts stay locked to the same source of truth for UI text and the same never-fire-real-analytics guarantee"
    - "context.on('request', ...) records every request URL for the whole browser context (not per-page) so a VPS-host request from any navigation during the run is caught, matching the plan's 'runtime complement to D-19(b)' requirement"

key-files:
  created:
    - scripts/qa/contact_form_e2e.py
    - infra/vps/runbooks/outage-test.md
  modified: []

key-decisions:
  - "Compose project stop order was caddy -> chatwoot -> espocrm (drop the public entry point first, then the two apps) and recovery order was espocrm -> chatwoot -> caddy (bring apps up before re-exposing them), matching the plan's action text exactly"
  - "docker compose up -d needed sudo on this VPS even though docker compose stop did not — up reads each stack's env_file (0600 root-only), stop does not. Recovery commands were re-run with sudo (Rule 3 auto-fix); no plan or script change needed, documented in outage-test.md's Test log and here"
  - "Connection failures to chat./crm. during the outage manifested as a TCP connect timeout, not an immediate 'connection refused' — Caddy (the only 80/443 publisher) was stopped, so nothing answered the SYN on this host's firewall; either signature satisfies the plan's 'both fail to connect' requirement and is recorded accurately rather than reworded to match the plan's 'refused' phrasing"

requirements-completed: []

coverage:
  - id: D1
    description: "INFRA-05(a)/D-19(a): with every VPS container stopped, production rideprestigo.com renders /, /book, /contact and /ru with HTTP 200, the booking wizard reaches the rendered Stripe Payment Element with no charge, and the contact form submits successfully"
    requirement: "INFRA-05"
    verification:
      - kind: e2e
        ref: "scripts/qa/out/booking_e2e.json runs[-1] -> reachedStripe: true, bookingReference PRG-20260928-D8E6DC, captured 08:38:37Z while all three compose stacks were stopped"
        status: pass
      - kind: e2e
        ref: "scripts/qa/out/contact_form_e2e.json -> submitted: true, successVisible: true, all 4 pages status 200, vpsRequests: []"
        status: pass
    human_judgment: false
  - id: D2
    description: "INFRA-05(a): the contact-form inquiry email reaches the manager inbox while the VPS is offline"
    requirement: "INFRA-05"
    verification: []
    human_judgment: true
    rationale: "Claude has no access to the manager mailbox — the form's server-side accept (successVisible: true, HTTP 200 from /api/contact) is proven, but actual email arrival is a fact only the owner can confirm. This is Task 2's item 3."
  - id: D3
    description: "Runtime complement to D-19(b): the browser session recorded zero requests to chat.rideprestigo.com or crm.rideprestigo.com during the entire outage-proof run"
    verification:
      - kind: e2e
        ref: "scripts/qa/out/contact_form_e2e.json -> vpsRequests: [] (context-wide request listener, not per-page)"
        status: pass
    human_judgment: false
  - id: D4
    description: "INFRA-03/SC#3: during the outage UptimeRobot marks both app monitors down and Healthchecks marks prestigo-sidekiq, prestigo-tls-expiry, prestigo-espocrm-internals and prestigo-apps-http down; the owner receives the Telegram and email alerts within minutes of the stop time, and recovery notices after restart"
    requirement: "INFRA-03"
    verification:
      - kind: other
        ref: "provision-monitors.sh --status polled every 60s: all 6 targets confirmed down by 2026-09-28T08:42:09Z (4m56s after the 08:37:13Z Caddy stop, well under the 20-minute budget); all 9 lines confirmed up again by 08:47:39Z after recovery"
        status: pass
    human_judgment: true
    rationale: "The server-side down/up transitions on both SaaS platforms are proven live via --status polling, but actual Telegram/email receipt is a fact only the owner's phone and inbox can confirm — this is Task 2's items 1 and 2, same pattern as 76-06's D9."
  - id: D5
    description: "After restart smoke.sh prints only OK and all nine monitors/checks are up again"
    verification:
      - kind: other
        ref: "ssh prestigo-vps smoke.sh -> 13/13 OK at 08:44:27Z (re-confirmed again after this SUMMARY was drafted); provision-monitors.sh --status -> all 9 lines up at 08:47:39Z"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-19 split honored: the delivery-after-recovery half of INFRA-05 is recorded as Phases 81/82 scope in the test log, not claimed here"
    verification:
      - kind: other
        ref: "grep -q '81/82' infra/vps/runbooks/outage-test.md -> exit 0 (Purpose section + a dedicated 'Out of scope reminder' section)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-09-28
status: complete-pending-owner
---

# Phase 76 Plan 07: Controlled VPS Outage Test Summary

**Ran a real, full outage on production (caddy + chatwoot + espocrm all stopped 08:37:13Z-08:37:55Z): the site, the booking wizard through the rendered Stripe Payment Element, and the contact form all kept working with zero requests to chat./crm.; all 6 relevant alert targets (2 UptimeRobot + 4 Healthchecks) detected the outage within 4m56s, and full recovery (smoke.sh clean, all 9 monitors/checks up) was confirmed by 08:47:39Z.**

## Performance

- **Duration:** ~20 min (Task 1 only — Tasks 2/3 are explicitly out of this executor's scope, see "Pending" below)
- **Started:** 2026-09-28T08:34:57Z (T0 baseline check)
- **Completed:** 2026-09-28T08:47:39Z (last recovery confirmation)
- **Tasks:** 1/1 (Task 1, the tracer task, executed by this run; Tasks 2-3 pending)
- **Files modified:** 2

## Accomplishments

- Stopped all three Docker Compose stacks (`caddy`, `chatwoot`, `espocrm`) on the VPS in the plan's specified order, confirmed both `chat.rideprestigo.com` and `crm.rideprestigo.com` failed to connect from the Mac.
- Ran `booking_e2e.py` against production while the VPS was fully dark: guest checkout reached the rendered Stripe Payment Element (`reachedStripe: true`), booking reference `PRG-20260928-D8E6DC`, no charge attempted.
- Wrote and ran `scripts/qa/contact_form_e2e.py`: visited `/`, `/book`, `/contact`, `/ru` (all HTTP 200), filled and submitted the contact form, confirmed the success heading, and recorded zero requests to either VPS host for the entire browser session.
- Polled `provision-monitors.sh --status` every 60 seconds: both UptimeRobot monitors and `prestigo-sidekiq`/`prestigo-tls-expiry`/`prestigo-espocrm-internals`/`prestigo-apps-http` were all confirmed down by **08:42:09Z**, 4 minutes 56 seconds after the Caddy stop — well inside the 20-minute polling budget the plan allowed.
- Restarted `espocrm`, `chatwoot`, then `caddy` (in that order); `smoke.sh` printed only `OK` (13/13) at **08:44:27Z**; `--status` confirmed all 9 monitor/check lines `up` again by **08:47:39Z**.
- Wrote `infra/vps/runbooks/outage-test.md` with the full procedure, the D-02 alert-routing expectations (from 76-06), the cleanup rule, and the actual dated Test log for this run.

## Task Commits

1. **Task 1 (tracer): controlled VPS outage — site/booking/contact proof, alert detection, recovery, dated log** — `7d00d316` (test)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update — see note below on why REQUIREMENTS.md is untouched)

## Files Created/Modified

- `scripts/qa/contact_form_e2e.py` — Playwright check: visits 4 production pages, submits the contact form, fails if any request goes to chat./crm. or if any page/submit assertion fails; writes `scripts/qa/out/contact_form_e2e.json`
- `infra/vps/runbooks/outage-test.md` — repeatable D-19(a) procedure, D-02 alert-routing expectations, cleanup rule (strict E2E marker), and this run's actual Test log

## Decisions Made

See `key-decisions` in frontmatter. In short: stop/recovery order followed the plan exactly (drop the public entry point first, bring apps up before re-exposing them); `docker compose up -d` needed `sudo` on this VPS even though `stop` did not (env_file permission asymmetry, Rule 3 auto-fix, no code change); the observed chat./crm. connection failure was a TCP timeout rather than an immediate refusal and is recorded as observed rather than reworded to match the plan's "refused" phrasing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `docker compose up -d` failed with a permission error during recovery — needed `sudo`**
- **Found during:** Task 1, recovery step (restarting `espocrm`)
- **Issue:** `cd /opt/prestigo/espocrm && docker compose up -d` (as the `deploy` user, no sudo) failed with `open /etc/prestigo/espocrm.env: permission denied`. The earlier `docker compose stop` for all three stacks had succeeded without sudo — `stop` doesn't need to read the compose file's `env_file` directive, but `up -d` does, and that file is `0600 root:root` per 76-04/76-05's credential-custody design (intentional — never relaxed for this test).
- **Fix:** Re-ran all three recovery commands (`espocrm`, `chatwoot`, `caddy`) with `sudo docker compose up -d`. `deploy` has passwordless sudo (per this session's dispatch context); no config or script change was needed.
- **Files modified:** none (operational only)
- **Verification:** All three stacks recreated/started cleanly with `sudo`; `smoke.sh` confirmed 13/13 `OK` afterward.
- **Committed in:** n/a (operational fix, not a code change; documented in `outage-test.md`'s Test log and this SUMMARY)

---

**Total deviations:** 1 auto-fixed (Rule 3, blocking — recovery command needed sudo).
**Impact on plan:** No scope creep, no plan or script change. The permission asymmetry between `stop` (no env-file read) and `up -d` (reads it) is now documented in `outage-test.md` for any future run of this test.

## Issues Encountered

**`contact_form_e2e.py`'s first attempt (08:38:42Z) hit a 30-second `page.goto` timeout navigating to `/book`** with `wait_until="load"` — self-resolved on an immediate retry (08:39:23Z run: all 4 pages 200, submitted, success visible, zero VPS requests). Not reproduced on retry and not correlated with the outage (the site is served from Vercel, not the VPS being tested) — most likely a transient cold-start or network blip on the Mac's connection to Vercel's edge during the first navigation. No script change made; if this recurs on a future run, consider raising the `/book` navigation timeout or switching to `wait_until="domcontentloaded"` for that one page.

## Known Stubs

None.

## Threat Flags

None new. All new surface (the QA browser hitting production during a real outage, no new credentials, no new endpoints) was already enumerated in this plan's `<threat_model>` (T-76-29 through T-76-32, T-76-SC) and mitigated exactly as designed: `booking_e2e.py` stopped at the rendered Payment Element (never charged), `contact_form_e2e.py`'s request listener proved zero chat./crm. traffic, and `should_abort_analytics` kept this run out of GA4/Meta.

## User Setup Required

None — no new external service configuration. The API keys used for `provision-monitors.sh --status` polling were supplied by the orchestrator's dispatch context for this session only (shell environment variables, never written to disk, never echoed) — no `USER-SETUP.md` needed.

## Pending (Tasks 2-3)

Per this session's explicit dispatch instruction, **Task 2 (owner confirmation) and Task 3 (orchestrator cleanup via Supabase MCP) are NOT executed by this run.** No Supabase rows were touched or deleted. Everything the owner and the orchestrator need to close out this plan:

### Outage window (UTC, 2026-09-28)

- **Stop sequence:** caddy stopped 08:37:13Z, chatwoot stopped 08:37:22Z, espocrm stopped 08:37:55Z.
- **Connection failures confirmed:** both `chat.rideprestigo.com` and `crm.rideprestigo.com` failed to connect (TCP timeout) at 08:38:14Z.
- **Recovery sequence:** espocrm restarted 08:42:49Z, chatwoot restarted 08:43:09Z, caddy restarted 08:44:01Z.
- **Full recovery confirmed:** `smoke.sh` clean at 08:44:27Z; all 9 monitors/checks `up` again at 08:47:39Z.
- **Outage window for alert-timing purposes:** 08:37:13Z (first stop) - 08:44:01Z (last restart command).

### Alert first-down / first-up times (for the owner to compare against Telegram/email)

| Monitor/check | Alerts via | First down | First confirmed up (poll resolution ±60s) |
|---|---|---|---|
| UptimeRobot "Chatwoot app" | Email only (D-02) | 08:42:09Z | 08:47:39Z |
| UptimeRobot "EspoCRM login" | Email only (D-02) | 08:42:09Z | 08:47:39Z |
| Healthchecks prestigo-sidekiq | Telegram + email | 08:42:09Z | 08:47:39Z |
| Healthchecks prestigo-tls-expiry | Telegram + email | 08:42:09Z | 08:47:39Z |
| Healthchecks prestigo-espocrm-internals | Telegram + email | 08:42:09Z | 08:47:39Z |
| Healthchecks prestigo-apps-http | Telegram + email | 08:42:09Z | 08:47:39Z |

`prestigo-disk-mem` and `prestigo-kvm4-trigger` briefly entered `grace` state during both the outage and recovery windows (visible in the poll transcript) but never registered `down` — expected, since those two checks monitor the VPS host itself (disk/RAM), which stayed up throughout; only the `chatwoot`/`espocrm`/`caddy` compose stacks were stopped. `prestigo-backup` was unaffected throughout (nightly-only ping, unrelated to this test's window).

### Contact form submission

- **Submitted:** ~08:39:26Z (between the successful run's `startedAt: 2026-09-28T08:39:23.626128+00:00` and `finishedAt: 2026-09-28T08:39:29.644358+00:00`), while the VPS was still fully offline.
- **Test inquiry content:** name "E2E Outage Test (Phase 76)", email `e2e+outage@rideprestigo.com`, phone `+420700000000`, message "Phase 76 VPS outage test - please ignore". Expected subject line at the manager mailbox: `New inquiry: E2E Outage Test (Phase 76) - <service or unspecified>`.

### E2E booking reference(s) created during the outage window (for Task 3 cleanup)

- **`PRG-20260928-D8E6DC`** — locale `en`, path `guest`, created `2026-09-28T08:38:37.615568+00:00`. This is the only entry in `scripts/qa/out/booking_e2e_refs.json` that falls inside the outage window (08:37:13Z-08:44:01Z); all other entries in that file predate this plan (2026-09-26, from earlier phases' QA runs) and must NOT be touched.

### Strict marker for cleanup (Task 3, precedent 75-20)

```sql
client_email like 'e2e+%@rideprestigo.com'
  and client_first_name = 'E2E'
  and client_last_name = 'TEST'
  and status = 'unpaid'
```

Task 3's procedure (select -> backup to `.planning/phases/76-vps-infrastructure/evidence/e2e-cleanup-backup.json` -> verify `PRG-20260928-D8E6DC` is in the result -> delete -> verify returned set equals the pre-delete set -> re-select and confirm 0 rows) is specified in full in `76-07-PLAN.md`'s Task 3 and was intentionally not run by this executor (no Supabase MCP access, and explicitly out of scope for this dispatch).

### D-19 split (recorded, not claimed here)

The "no event lost, delivered once the VPS is back" half of INFRA-05 — i.e., that a Chatwoot/EspoCRM-dependent workflow queued during this outage is retried and delivered after recovery — is **Phases 81/82** scope, not tested by this plan. This run only proves the site kept working and the owner was alerted while the VPS was dark.

## Next Phase Readiness

- Task 1's automated proof is complete and committed (`7d00d316`); `scripts/qa/contact_form_e2e.py` and `infra/vps/runbooks/outage-test.md` are ready for reuse on any future outage drill.
- **Blocking for full plan closure:** Task 2 (owner confirms Telegram/email/inbox receipt and approves cleanup) and Task 3 (orchestrator deletes the one E2E booking row via Supabase MCP, with backup) — both explicitly deferred to the orchestrator per this session's dispatch instructions.
- `requirements-completed` is `[]` in this SUMMARY's frontmatter per this session's explicit instruction not to touch REQUIREMENTS.md; INFRA-05/INFRA-03's remaining Phase-76 coverage should be evaluated once Tasks 2-3 close.

---
*Phase: 76-vps-infrastructure*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: scripts/qa/contact_form_e2e.py
- FOUND: infra/vps/runbooks/outage-test.md
- FOUND commit: 7d00d316
- Re-ran all Task 1 `<verify>` commands live: `CONTACT_OK`, `STRIPE_OK PRG-20260928-D8E6DC`, `ssh prestigo-vps smoke.sh` -> 13/13 OK, exit 0
- Re-ran all Task 1 `<acceptance_criteria>` checks: `grep -q "81/82"` -> exit 0; `python3 -m py_compile scripts/qa/contact_form_e2e.py` -> exit 0; every recorded first-down time is <= 20 minutes after stop (actual: 4m56s); E2E booking reference listed above (`PRG-20260928-D8E6DC`)
- No Supabase rows touched; no cleanup performed (Task 3 explicitly deferred)
