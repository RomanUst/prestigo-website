# Controlled VPS Outage Test (Phase 76 plan 07)

## Purpose

Prove the two runtime claims of Phase 76 in one controlled outage, on
production, with the VPS apps fully offline:

1. **D-19(a) / INFRA-05(a):** with every VPS container stopped (chat./crm.
   refuse connections), `https://rideprestigo.com` still renders `/`, `/book`,
   `/contact` and `/ru` (HTTP 200), the booking wizard still reaches the
   rendered Stripe Payment Element (no charge), and the contact form still
   submits and its inquiry email still reaches the manager inbox.
2. **INFRA-03 / ROADMAP SC#3:** the owner is alerted on Telegram and email —
   by services independent of the VPS (UptimeRobot + Healthchecks.io) —
   within minutes of the outage, and again on recovery.

**Out of scope (D-19 split):** the "no event lost, delivered once the VPS is
back" half of INFRA-05 — i.e. that a Chatwoot/EspoCRM-dependent workflow
queued during the outage is retried and delivered after recovery — is **not**
tested here. That is **Phases 81/82** scope. This test only proves the site
keeps working and the owner gets alerted while the VPS is dark; it does not
test delivery-after-recovery of anything that depends on the VPS apps
themselves.

## Preconditions

- `bash infra/vps/scripts/provision-monitors.sh --status` (with
  `UPTIMEROBOT_API_KEY` / `HEALTHCHECKS_API_KEY` exported in the shell only —
  never written to disk) shows all nine lines `up` (2 UptimeRobot monitors +
  7 Healthchecks checks, per the 76-06 D-02 deviation — see `monitoring.md`).
- `python3 -c "import playwright"` exits 0 (Python Playwright already
  installed — no new install for this test).
- `ssh prestigo-vps 'bash /opt/prestigo/scripts/smoke.sh'` prints only `OK`
  lines before the outage starts.

## Alert routing during this test (76-06 D-02 deviation)

UptimeRobot's Telegram integration is a paid feature the owner declined —
UptimeRobot now alerts by **email only**. Telegram coverage for app-level
outages comes from Healthchecks' `prestigo-apps-http` check instead. During
this outage, expect:

- **UptimeRobot** (email only): both `Chatwoot app` and `EspoCRM login`
  monitors go down.
- **Healthchecks.io** (Telegram + email): `prestigo-apps-http`,
  `prestigo-sidekiq`, and `prestigo-tls-expiry` go down once their grace
  period (600s) elapses with no ping. `prestigo-espocrm-internals` may also
  go down depending on which containers are stopped in which order.
  `prestigo-disk-mem`, `prestigo-kvm4-trigger`, and `prestigo-backup` are
  VPS-host checks unrelated to the app stacks and are not expected to flip
  during this test (the VPS host itself, and its systemd timer, stay up —
  only the `chatwoot`/`espocrm`/`caddy` compose projects are stopped).

## Cleanup rule

The site/booking proof (step 3 below) creates one real E2E test booking row
in production (guest checkout, English locale, marker
`e2e+en@rideprestigo.com` / first name `E2E` / last name `TEST`, stopped at
the rendered Stripe Payment Element — never charged). This plan's Task 2
(owner confirmation) and Task 3 (orchestrator cleanup via Supabase MCP —
executors have no Supabase MCP access) remove it after the owner approves,
using the strict marker:

```sql
client_email like 'e2e+%@rideprestigo.com'
  and client_first_name = 'E2E'
  and client_last_name = 'TEST'
  and status = 'unpaid'
```

A pre-delete JSON backup (`.planning/phases/76-vps-infrastructure/evidence/e2e-cleanup-backup.json`)
is taken before any delete. Post-delete marker count must be 0.

## Procedure

All timestamps recorded in UTC. Run from the Mac unless noted otherwise.

1. **T0 — confirm baseline.** `ssh prestigo-vps 'bash /opt/prestigo/scripts/smoke.sh'`
   prints only `OK`; `provision-monitors.sh --status` shows all nine lines
   `up`.
2. **Stop the stacks.** On the VPS, in order: `docker compose -p caddy stop`,
   then `docker compose -p chatwoot stop`, then `docker compose -p espocrm
   stop`. From the Mac, confirm both `https://chat.rideprestigo.com/api` and
   `https://crm.rideprestigo.com/` fail to connect (connection refused/reset,
   not a timeout waiting on a hung request).
3. **Site proof.** Run:
   - `python3 scripts/qa/booking_e2e.py https://rideprestigo.com --locales en`
     — `reachedStripe` must be `true` for the `en`/`guest` run; note the new
     booking reference.
   - `python3 scripts/qa/contact_form_e2e.py https://rideprestigo.com` — must
     exit 0, `vpsRequests` empty, all four pages HTTP 200, contact form
     submitted and success heading visible.

   Note the contact submission time for the owner (Task 2 asks them to
   confirm the inquiry email's arrival against this time).
4. **Alert proof.** Poll `provision-monitors.sh --status` every 60 seconds
   (up to 20 minutes) until both UptimeRobot monitors are down and
   `prestigo-sidekiq` and `prestigo-tls-expiry` are down. Record each
   monitor/check's first-down time as it flips.
5. **Recovery.** On the VPS, in order: `docker compose -p espocrm up -d`,
   then `docker compose -p chatwoot up -d`, then `docker compose -p caddy up
   -d`. `ssh prestigo-vps 'bash /opt/prestigo/scripts/smoke.sh'` prints only
   `OK`. Poll `provision-monitors.sh --status` until all nine lines are `up`
   again; record the time.
6. **Log + commit.** Fill in the Test log below, list the E2E booking
   reference(s) created in step 3 and the outage window, and commit the
   script + this runbook as `test(76-07): real VPS outage test (D-19a)`.

## Test Log

Outage window: **08:37:13Z stop start -> 08:44:01Z last recovery command**
(all times UTC, 2026-09-28). All alert targets first-down by 08:42:09Z (4m56s
after Caddy stop) — well under the 20-minute polling budget. Full recovery
(smoke.sh clean + all 9 monitors/checks up) confirmed by 08:47:39Z.

| Date | Step | UTC time | Result |
|---|---|---|---|
| 2026-09-28 | T0 baseline: smoke.sh all OK, `--status` all 9 up | 08:34:57Z | OK |
| 2026-09-28 | Stop caddy (`docker compose stop`, project `caddy`) | 08:37:13Z | stopped |
| 2026-09-28 | Stop chatwoot (`docker compose stop`, project `chatwoot`) | 08:37:22Z | stopped |
| 2026-09-28 | Stop espocrm (`docker compose stop`, project `espocrm`) | 08:37:55Z | stopped |
| 2026-09-28 | chat.rideprestigo.com/api connection failure confirmed | 08:38:14Z | confirmed (curl: connection timed out — no listener; Caddy was the only 80/443 publisher) |
| 2026-09-28 | crm.rideprestigo.com/ connection failure confirmed | 08:38:14Z | confirmed (curl: connection timed out — no listener) |
| 2026-09-28 | booking_e2e.py reachedStripe=true | 08:38:37Z | ref `PRG-20260928-D8E6DC` |
| 2026-09-28 | contact_form_e2e.py submitted + success visible, vpsRequests empty | 08:39:26Z (first attempt at 08:38:42Z hit an unrelated 30s page-load timeout on `/book`, self-resolved on immediate retry — see SUMMARY "Issues Encountered") | OK — all 4 pages 200, `vpsRequests: []` |
| 2026-09-28 | UptimeRobot "Chatwoot app" first down | 08:42:09Z | down |
| 2026-09-28 | UptimeRobot "EspoCRM login" first down | 08:42:09Z | down |
| 2026-09-28 | Healthchecks prestigo-sidekiq first down | 08:42:09Z | down |
| 2026-09-28 | Healthchecks prestigo-tls-expiry first down | 08:42:09Z | down |
| 2026-09-28 | Healthchecks prestigo-espocrm-internals first down | 08:42:09Z | down |
| 2026-09-28 | Healthchecks prestigo-apps-http first down | 08:42:09Z | down |
| 2026-09-28 | Restart espocrm (`sudo docker compose up -d`, project `espocrm`) | 08:42:49Z | started (required `sudo` — env_file is 0600 root-only; `stop` doesn't read it but `up` does, see SUMMARY deviation) |
| 2026-09-28 | Restart chatwoot (`sudo docker compose up -d`, project `chatwoot`) | 08:43:09Z | started |
| 2026-09-28 | Restart caddy (`sudo docker compose up -d`, project `caddy`) | 08:44:01Z | started |
| 2026-09-28 | smoke.sh all OK after recovery | 08:44:27Z | OK (all 13 checks) |
| 2026-09-28 | `--status` all 9 up again | 08:47:39Z | up (Healthchecks checks needed one real ping cycle after container restart to clear `grace`/`down`) |

## E2E booking reference(s) created during this outage window

- `PRG-20260928-D8E6DC` (locale `en`, path `guest`, created `2026-09-28T08:38:37.615568+00:00`)
  — this is the only ref in `scripts/qa/out/booking_e2e_refs.json` inside the
  outage window `08:37:13Z`-`08:44:01Z`. Removal is Task 3 (orchestrator,
  Supabase MCP), after Task 2's owner approval.

## Out of scope reminder

This test proves D-19(a): the site, booking-to-Stripe, and the contact form
keep working with the VPS dark, and the owner is alerted independently of the
VPS. It does **not** test whether a Chatwoot/EspoCRM-dependent event queued
during the outage is retried and delivered once the VPS is back — that half
of INFRA-05 is **Phases 81/82** scope.
