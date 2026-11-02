---
phase: 76-vps-infrastructure
plan: 04
subsystem: infra
tags: [vps, docker, compose, caddy, chatwoot, espocrm, tls, letsencrypt, mariadb, postgres]

requires:
  - phase: 76-01
    provides: "Hostinger KVM 2 VPS reachable as deploy, D-15 secret gate covering infra/vps"
  - phase: 76-02
    provides: "Hardened Ubuntu 24.04 host, /opt/prestigo, /etc/prestigo, edge Docker network"
  - phase: 76-03
    provides: "chat/crm DNS A records live, /etc/prestigo/smtp.env (Resend relay, proven)"
provides:
  - "Chatwoot CE (chatwoot/chatwoot:v4.18.0-ce + pgvector/pgvector:0.8.6-pg16 + redis:7.4.11-alpine) live at https://chat.rideprestigo.com over auto-renewing Let's Encrypt TLS, admin account created before Caddy ever exposed the host, public signup closed"
  - "EspoCRM CE (espocrm/espocrm:10.0.8 + mariadb:11.4.13) live at https://crm.rideprestigo.com over auto-renewing TLS, installed itself from env (no web installer exposed), SMTP via Resend + 2FA (Totp) enabled via Settings API, least-privilege 'restore-drill-canary' API user for plan 76-09"
  - "infra/vps/scripts/gen-env.sh - chatwoot + espocrm subcommands, never overwrites, never prints"
  - "infra/vps/scripts/smoke.sh - public + --local-only modes, reusable by plans 76-06/76-08/76-09"
  - "infra/vps/runbooks/app-deploy.md - first-install order, D-12 mem table, D-17/D-18 posture, two confirmed upstream/procedural gotchas with fixes"
  - "Only 22/80/443 reachable from the internet (proven by an external nc scan); every other app/DB port loopback-bound"
affects: [76-05, 76-06, 76-07, 76-08, 76-09, 77, 80]

actuals:
  tokens: 9329
  tasks: 3
  commits: 3
  plan_head_before: 0403cf000e7884976b9c545b995edc2e5defbdc3
  plan_head_after: abb8798787f81ad1e6eaddb2baed4246402fcdf7

tech-stack:
  added: [Docker Compose stacks (chatwoot, espocrm, caddy), Chatwoot CE, EspoCRM CE, Caddy 2 automatic HTTPS]
  patterns:
    - "Three independent Compose projects (chatwoot/espocrm/caddy) sharing one external `edge` Docker network; only Caddy publishes 80/443, every app/DB port binds 127.0.0.1 or stays edge/private-only"
    - "gen-env.sh: idempotent first-install secret generator, refuses to overwrite, never prints, sourced values copied from smtp.env without ever appearing in a shell history"
    - "Admin account created via a rails runner call mirroring the vendor's own onboarding controller, executed strictly before the reverse proxy is started - installer/onboarding window never publicly reachable"

key-files:
  created:
    - infra/vps/chatwoot/compose.yml
    - infra/vps/espocrm/compose.yml
    - infra/vps/caddy/compose.yml
    - infra/vps/caddy/Caddyfile
    - infra/vps/scripts/gen-env.sh
    - infra/vps/scripts/smoke.sh
    - infra/vps/env/chatwoot.env.example
    - infra/vps/env/espocrm.env.example
    - infra/vps/runbooks/app-deploy.md
  modified: []

key-decisions:
  - "Docker Hub v2 tags API queried live at execution time (not trusted from research): chatwoot/chatwoot:v4.18.0-ce, pgvector/pgvector:0.8.6-pg16, redis:7.4.11-alpine, caddy:2.11.4-alpine, espocrm/espocrm:10.0.8, mariadb:11.4.13 - all four non-audited namespaces (pgvector, library/redis, library/mariadb, espocrm) re-checked for official namespace + pull count at deploy time per D-16"
  - "EspoCRM volume layout follows the CURRENT (non-legacy) espocrm-docker contract - data/custom/client-custom mounted as three separate volumes, not the whole /var/www/html tree - confirmed by reading docker-entrypoint.sh/entrypoint-utils.sh from espocrm/espocrm-docker@master before writing compose.yml; mounting the whole tree is now a deprecated 'legacy installation method' that can hard-abort on a truly fresh mount"
  - "Chatwoot admin created via a rails runner call that mirrors Installation::OnboardingController#create exactly (verified against the pinned v4.18.0 tag's actual source on GitHub before writing the action), executed after rails/sidekiq are up but before the Caddy stack starts - the installer/onboarding window was never publicly reachable at any point"
  - "ENABLE_ACCOUNT_SIGNUP=false is set via env AND confirmed as the InstallationConfig DB row's actual value (config/installation_config.yml's own default) by querying installation_configs.serialized_value directly on the live Postgres - not just trusted from the env var - before running the POST signup probe"

patterns-established:
  - "Docker single-file bind mounts (Caddyfile) must be followed by a container RESTART after any rsync, not just a config reload - rsync's temp-file+rename swaps the host inode and a running container's bind mount stays attached to the old one"
  - "When an official Docker image's entrypoint hardcodes an assumption (espocrm-docker's set-password admin), verify the actual install completed (marker file / isInstalled flag) rather than trusting a running container status - a restart-loop can look identical to a healthy boot in `docker compose ps` for several seconds"

requirements-completed: [INFRA-01, INFRA-04]

coverage:
  - id: D1
    description: "INFRA-01: chat.rideprestigo.com serves Chatwoot's health JSON (queue_services/data_services both ok) over a Let's Encrypt certificate with >60 days validity; plain HTTP redirects to HTTPS"
    requirement: "INFRA-01"
    verification:
      - kind: other
        ref: "curl -fsS https://chat.rideprestigo.com/api -> {\"version\":\"4.18.0\",...,\"queue_services\":\"ok\",\"data_services\":\"ok\"}; openssl x509 -checkend 5184000 -> not expiring; curl -o /dev/null -w '%{http_code}' http://chat.rideprestigo.com/ -> 308"
        status: pass
    human_judgment: false
  - id: D2
    description: "INFRA-01: crm.rideprestigo.com serves the EspoCRM login page over a Let's Encrypt certificate; /api/v1/App/user answers 401 (app alive, auth enforced)"
    requirement: "INFRA-01"
    verification:
      - kind: other
        ref: "curl -fsS https://crm.rideprestigo.com/ | grep -ci espo -> 9; curl -o /dev/null -w '%{http_code}' https://crm.rideprestigo.com/api/v1/App/user -> 401; openssl x509 -checkend 5184000 -> not expiring"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-16/INFRA-04: every image in the three compose.yml files is pinned to an exact tag re-verified against Docker Hub at deploy time; no floating tags"
    requirement: "INFRA-04"
    verification:
      - kind: other
        ref: "grep -Eqi 'image: [^ ]+:latest' (no match, pass); grep -Eh 'image:' infra/vps/*/compose.yml | grep -Ev ':[0-9v]' (no unversioned match, pass)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-12: every container carries a non-zero mem_limit, Sidekiq concurrency is 3, and no container is OOM-killed or restart-looping 10+ minutes after deploy"
    verification:
      - kind: other
        ref: "docker inspect --format HostConfig.Memory on all 8 containers -> all non-zero (1536m/1024m/384m/768m/128m tiers); after a 618s wait, all 8 containers RestartCount=0 OOMKilled=false Status=running; grep SIDEKIQ_CONCURRENCY=3 chatwoot.env.example"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-06: Chatwoot stores attachments with ACTIVE_STORAGE_SERVICE=local on the chatwoot_storage_data volume"
    verification:
      - kind: other
        ref: "grep ACTIVE_STORAGE_SERVICE=local infra/vps/env/chatwoot.env.example; storage_data:/app/storage mounted on both rails and sidekiq in compose.yml; volume created as chatwoot_storage_data"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-17: apps publicly reachable with no IP allowlist; Chatwoot signup closed (404 probe); onboarding page not servable (302, not 200); EspoCRM has auth2FA true"
    requirement: "INFRA-01"
    verification:
      - kind: other
        ref: "POST /api/v1/accounts signup probe -> 404; GET /installation/onboarding -> 302 (not 200); EspoCRM Settings readback -> auth2FA:true, auth2FAMethodList:[\"Totp\"]"
        status: pass
    human_judgment: false
  - id: D7
    description: "D-18: Chatwoot and EspoCRM send system mail only through smtp.resend.com:587 as notifications@rideprestigo.com; EspoCRM's test email is accepted"
    requirement: "INFRA-01"
    verification:
      - kind: other
        ref: "chatwoot.env SMTP_* keys copied from smtp.env by gen-env.sh; EspoCRM Settings PUT + readback -> smtpServer smtp.resend.com/port 587/TLS/user resend, no password in readback; POST /api/v1/Email/sendTest -> 200 true"
        status: pass
    human_judgment: false
  - id: D8
    description: "Only 22/80/443 reachable from the internet; app/DB ports unpublished or bound to 127.0.0.1"
    verification:
      - kind: other
        ref: "external nc -z scan from the Mac against 3000/3306/5432/6379/8080 -> all closed, 80/443 -> reachable; ss -ltnH on the VPS -> no 0.0.0.0/[::] listener besides 22/80/443 (3000/5432/6379/8080 all 127.0.0.1-bound)"
        status: pass
    human_judgment: false
  - id: D9
    description: "Chatwoot's admin account existed before Caddy exposed chat.rideprestigo.com; EspoCRM installed itself from env (no web installer ever exposed)"
    verification:
      - kind: other
        ref: "AccountBuilder run + Redis onboarding-flag clear both completed while only postgres/redis/rails/sidekiq were up (caddy stack not yet started); EspoCRM app-1 self-installed from env, data/config-internal.php confirmed present before the crm Caddyfile block was added"
        status: pass
    human_judgment: false

duration: ~2h20m
completed: 2026-09-28
status: complete
---

# Phase 76 Plan 04: Chatwoot + EspoCRM behind Caddy Summary

**Chatwoot CE and EspoCRM CE now run as three pinned Docker Compose stacks (chatwoot, espocrm, caddy) sharing one `edge` network, live at https://chat.rideprestigo.com and https://crm.rideprestigo.com over auto-renewing Let's Encrypt TLS, with the Chatwoot admin created before Caddy ever exposed the host, EspoCRM self-installed from env with no web installer ever exposed, both apps signup-closed/memory-capped/mail-through-Resend, and only 22/80/443 reachable from the internet.**

## Performance

- **Duration:** ~2h20m (heavy upstream-source verification via GitHub/Docker Hub APIs before writing each compose/script file, plus two live-debugged operational defects)
- **Started:** 2026-09-27T~21:50Z
- **Completed:** 2026-09-28T~00:10Z
- **Tasks:** 3/3 completed
- **Files created:** 9

## Accomplishments

- Deployed Chatwoot CE (`chatwoot/chatwoot:v4.18.0-ce`, `pgvector/pgvector:0.8.6-pg16`, `redis:7.4.11-alpine`) behind Caddy (`caddy:2.11.4-alpine`) - `https://chat.rideprestigo.com/api` returns `{"queue_services":"ok","data_services":"ok"}` over a Let's Encrypt certificate; HTTP redirects (308); public signup probe returns 404; onboarding page redirects (302, not 200).
- Created the Chatwoot admin account (`info@rideprestigo.com`, super-admin, confirmed) via a `rails runner` call that mirrors `Installation::OnboardingController#create` exactly, verified against the pinned tag's actual GitHub source - executed strictly before Caddy started, so the installer/onboarding window was never publicly reachable.
- Deployed EspoCRM CE (`espocrm/espocrm:10.0.8`, PHP 8.4.25 confirmed, `mariadb:11.4.13`) behind the same Caddy stack - `https://crm.rideprestigo.com/` serves the login page over Let's Encrypt TLS, `/api/v1/App/user` answers 401. The app installed itself from env (no web installer ever exposed) using the current (non-legacy) `data`/`custom`/`client/custom` volume-split contract.
- Configured EspoCRM outbound SMTP (Resend relay) and `auth2FA`/`Totp` via the Settings REST API, confirmed by readback (no password leaked in the response) and a real accepted `POST /api/v1/Email/sendTest`.
- Created a least-privilege `restore-drill-canary` Role (create+read only on Account/Document) and `api`-type User for plan 76-09's restore drill; the generated key lives only in `/etc/prestigo/espocrm.env` (0600) - proven end-to-end (canary can list/create Account, cannot edit Account, cannot read Contact).
- Wrote `infra/vps/scripts/smoke.sh` (public + `--local-only` modes) and `infra/vps/runbooks/app-deploy.md`, and proved the full D-12/D-17 exposure/memory posture live: an external `nc` scan shows only 22/80/443 reachable; `ss -ltnH` on the VPS confirms no other `0.0.0.0`/`[::]` listener; all 8 containers show `RestartCount=0`/`OOMKilled=false` after a 618-second wait; every image is pinned to an exact tag.

## Task Commits

1. **Task 1 (tracer): Chatwoot behind Caddy - pinned images, generated secrets, admin before exposure, HTTPS end to end** - `fa7fc6be` (feat)
2. **Task 2: EspoCRM stack + crm site block + SMTP/2FA settings + drill-canary API user** - `1c6d1bf5` (feat)
3. **Task 3: exposure, memory and pinning lock-down + smoke.sh + app-deploy runbook** - `abb87987` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

## Files Created/Modified

- `infra/vps/chatwoot/compose.yml` - postgres/redis/rails/sidekiq, mem_limit per D-12, storage_data volume, edge alias `chatwoot-rails`
- `infra/vps/espocrm/compose.yml` - db/app/daemon, current (non-legacy) volume split, edge alias `espocrm-app`
- `infra/vps/caddy/compose.yml` - the only stack publishing 80/443
- `infra/vps/caddy/Caddyfile` - `chat.` and `crm.` site blocks, automatic HTTPS, HSTS
- `infra/vps/scripts/gen-env.sh` - `chatwoot`/`espocrm` subcommands, never overwrites, never prints
- `infra/vps/scripts/smoke.sh` - public + `--local-only` post-deploy check
- `infra/vps/env/{chatwoot,espocrm}.env.example` - every key documented, secret values empty
- `infra/vps/runbooks/app-deploy.md` - first-install order, D-12 table, D-17/D-18 posture, two documented operational gotchas

## Decisions Made

See `key-decisions` in frontmatter. In short: every image tag was re-verified live against Docker Hub (not trusted from the phase research), EspoCRM's volume layout follows the current (non-legacy) contract confirmed by reading the actual entrypoint source, the Chatwoot admin-creation code was verified against the pinned tag's real GitHub source before being used, and `ENABLE_ACCOUNT_SIGNUP=false` was confirmed as the actual database row value (not just trusted from the env var) before running the signup probe.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Caddyfile bind-mount stale inode after `rsync` — added `crm.rideprestigo.com` did not get a certificate until the container was restarted**
- **Found during:** Task 2 (adding the `crm` site block)
- **Issue:** `rsync`'s default temp-file-then-rename write replaces the host `Caddyfile`'s inode. The running `caddy` container's single-file bind mount (`./Caddyfile:/etc/caddy/Caddyfile:ro`) stayed attached to the OLD inode, so both `docker exec caddy-caddy-1 cat /etc/caddy/Caddyfile` and `caddy reload` kept serving the pre-change config even though the file on disk (and in git) was correct. Symptom: TLS handshakes to `crm.rideprestigo.com` failed with `SSL routines:ST_CONNECT:tlsv1 alert internal error`, and `docker logs` had zero ACME lines for that domain — Caddy had never even attempted to obtain a certificate for it.
- **Fix:** `docker compose restart caddy` (not just `caddy reload`) after every Caddyfile rsync. Documented as a standing procedure in `infra/vps/runbooks/app-deploy.md` step 6, so plan 76-06 (upgrades) and any future Caddyfile edit follow it.
- **Files modified:** none (operational fix only); documented in `infra/vps/runbooks/app-deploy.md`
- **Verification:** After the restart, `docker exec caddy-caddy-1 cat /etc/caddy/Caddyfile` showed the new content immediately; `crm.rideprestigo.com` obtained its Let's Encrypt certificate within ~7 seconds and served 200.
- **Committed in:** `1c6d1bf5` (documentation of the fix landed in Task 3's `abb87987`)

**2. [Rule 1 - Bug] espocrm-docker's `actionInstall` hardcodes `set-password admin`, ignoring `$ESPOCRM_ADMIN_USERNAME` — the auto-install restart-looped forever with a non-default admin username**
- **Found during:** Task 2 (EspoCRM self-install)
- **Issue:** Read `espocrm/espocrm-docker`'s `docker-entrypoint.sh` (@master, matching the pinned `10.0.8` image) and confirmed via `bash -x` tracing on the live container: `actionInstall` runs `bin/command create-admin-user "$ESPOCRM_ADMIN_USERNAME"` (parameterized, correct) but then `printf '%s\n' "$ESPOCRM_ADMIN_PASSWORD" | bin/command set-password admin` (hardcoded literal `admin`, a genuine upstream inconsistency). Since this plan's interfaces block locks `ESPOCRM_ADMIN_USERNAME=prestigo-admin`, `set-password admin` failed with `User 'admin' not found.`; under the script's `set -euo pipefail` the container exited 1, and `restart: unless-stopped` looped it (5 restarts observed before diagnosis) with `isInstalled` stuck at `false` and `data/config-internal.php` never created.
- **Fix:** Stopped the looping container, then completed the remaining install steps once by hand with the correct username: `bin/command set-password prestigo-admin` (piping the real admin password read from `/etc/prestigo/espocrm.env`, never echoed), followed by the same `config:set language/siteUrl`, `populate-scheduled-jobs`, `config:set jobRunInParallel`, `app-check`, and `config:set isInstalled true` calls the entrypoint itself would have run. Re-ran `chown -R www-data:www-data` for good measure, then started `app` fresh (`RestartCount` reset to `0`).
- **Files modified:** none (operational fix only); documented as a named, reusable procedure in `infra/vps/runbooks/app-deploy.md` step 4, since any future fresh install (upgrade runbook, restore drill) with this non-default username will hit the same defect.
- **Verification:** `data/config-internal.php`/`data/config.php` present; fresh `docker compose up -d app` shows `RestartCount=0`; `https://crm.rideprestigo.com/` serves the login page (200); `/api/v1/App/user` returns 401.
- **Committed in:** `1c6d1bf5` (documentation of the fix landed in Task 3's `abb87987`)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — confirmed upstream/tooling bugs, not this plan's code)
**Impact on plan:** Both were diagnosed and fixed live during execution with no change to this plan's own compose files or scripts; both are now documented as standing procedures in the deploy runbook so later plans (76-06 upgrades, 76-09 restore drill) don't have to rediscover them. No scope creep.

## Security Note — Transient Secret Exposure (self-remediated)

During Task 2's canary API user creation, `POST /api/v1/User` for the new `type: api` user returned an auto-assigned `apiKey` field in its create response, **before** the deliberate `POST /api/v1/UserSecurity/apiKey/generate` call this plan always intended to make. That create-response body was echoed to this session's own transcript via `cat`, which counts as "printed" under this plan's "never printed" rule for generated secrets. Because `UserSecurity/apiKey/generate` was called immediately afterward as originally planned — its explicit purpose is generating a **fresh** key for the user — the key that appeared in the transcript was superseded and invalidated before this run ended. Confirmed by re-fetching the user record and comparing: the live `apiKey` differs from the one that was echoed. No further action needed; documented here for transparency. `infra/vps/runbooks/app-deploy.md` step 8 now warns future operators about this create-response behavior explicitly.

## Issues Encountered

Both covered under "Deviations from Plan" above (Caddyfile bind-mount staleness, EspoCRM entrypoint username bug) — both diagnosed and resolved within this run with no outstanding follow-up.

## Known Stubs

None.

## Threat Flags

None — every new surface (Caddy public entry, `edge` network hop, Docker image supply chain) was already enumerated in this plan's `<threat_model>` and mitigated as designed; no unplanned surface was introduced.

## User Setup Required

None — the Chatwoot admin password and EspoCRM admin/canary credentials were generated on the VPS and are never printed anywhere; the owner retrieves/rotates them in plan 76-05 (credential-custody step) as this plan's dispatch context specifies.

## Next Phase Readiness

- Both apps are live, TLS-verified, signup-closed/installer-closed, memory-capped, and pinned — ready for plan 76-05 (backups + credential custody) and plan 76-06 (upgrade runbook).
- `infra/vps/scripts/smoke.sh` is ready for reuse by plans 76-06 (post-upgrade), 76-08 (outage test), and 76-09 (`--local-only` restore-drill mode).
- The `restore-drill-canary` EspoCRM API user is ready for plan 76-09's restore drill; its key lives only in `/etc/prestigo/espocrm.env`.
- No blockers.

---
*Phase: 76-vps-infrastructure*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: infra/vps/chatwoot/compose.yml
- FOUND: infra/vps/espocrm/compose.yml
- FOUND: infra/vps/caddy/compose.yml
- FOUND: infra/vps/caddy/Caddyfile
- FOUND: infra/vps/scripts/gen-env.sh
- FOUND: infra/vps/scripts/smoke.sh
- FOUND: infra/vps/env/chatwoot.env.example
- FOUND: infra/vps/env/espocrm.env.example
- FOUND: infra/vps/runbooks/app-deploy.md
- FOUND commit: fa7fc6be (Task 1)
- FOUND commit: 1c6d1bf5 (Task 2)
- FOUND commit: abb87987 (Task 3)
- Re-ran all plan-level `<verify>`/acceptance commands live: `curl /api` -> 200 with queue_services/data_services both ok; `crm.rideprestigo.com/` -> 200; `/api/v1/App/user` -> 401; `ssh prestigo-vps 'bash /opt/prestigo/scripts/smoke.sh'` -> all 13 checks OK, exit 0
- `npx vitest run tests/infra-vps-isolation-guard.test.ts` -> 12/12 passed (no site code touched by this plan)
