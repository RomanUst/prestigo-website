# App deploy runbook (Chatwoot + EspoCRM + Caddy)

Covers first install and routine redeploy of the three Compose stacks in
`infra/vps/{chatwoot,espocrm,caddy}/`. See `infra/vps/README.md` for the
host contract (ssh alias, `/opt/prestigo`, `/etc/prestigo`, the `edge`
Docker network) this runbook builds on.

## First install order

Run these in order. Do not start Caddy before the Chatwoot admin exists —
every minute between DNS going live and Caddy starting is a window where
nothing is served yet, which is safer than exposing an unclaimed installer
(T-76-13).

1. **Clean commit, then deploy the files:**
   ```bash
   git status --porcelain infra/vps   # must be empty
   rsync -a --delete infra/vps/ prestigo-vps:/opt/prestigo/
   ssh prestigo-vps 'echo "'"$(git rev-parse HEAD)"'" | sudo tee /opt/prestigo/DEPLOYED_SHA'
   ```

2. **Chatwoot:**
   ```bash
   ssh prestigo-vps 'sudo bash /opt/prestigo/scripts/gen-env.sh chatwoot'
   ssh prestigo-vps 'sudo docker compose -f /opt/prestigo/chatwoot/compose.yml config -q'
   ssh prestigo-vps 'cd /opt/prestigo/chatwoot && sudo docker compose up -d postgres redis'
   # wait for both healthy, then:
   ssh prestigo-vps 'cd /opt/prestigo/chatwoot && sudo docker compose run --rm --entrypoint docker/entrypoints/rails.sh rails bundle exec rails db:chatwoot_prepare'
   ssh prestigo-vps 'cd /opt/prestigo/chatwoot && sudo docker compose up -d rails sidekiq'
   ```
   `db:chatwoot_prepare` on a genuinely fresh DB loads the schema, runs
   `db:seed` (which sets the Redis `CHATWOOT_INSTALLATION_ONBOARDING` flag in
   production) and migrates. `config/installation_config.yml`'s own default
   already writes `ENABLE_ACCOUNT_SIGNUP=false` into `installation_configs`
   the first time `db:migrate` runs — the env var is defense-in-depth, not
   the sole gate. Confirmed once already (2026-09-27) by reading
   `installation_configs.serialized_value` directly.

3. **Chatwoot admin, BEFORE Caddy starts (T-76-13):** mirror
   `Installation::OnboardingController#create` via `rails runner`, passing
   the admin email/password through the container's own environment (never
   the Mac's shell history, never printed):
   ```bash
   ssh prestigo-vps bash -s <<'REMOTE'
   ADMIN_PW="$(openssl rand -base64 18 | tr -d '=+/')A1!"
   cd /opt/prestigo/chatwoot
   sudo docker compose exec -T -e ADMIN_EMAIL="info@rideprestigo.com" -e ADMIN_PASSWORD="${ADMIN_PW}" rails bundle exec rails runner - <<'RUBY'
   user, account = AccountBuilder.new(
     account_name: 'Prestigo',
     user_full_name: 'Prestigo Admin',
     email: ENV.fetch('ADMIN_EMAIL'),
     user_password: ENV.fetch('ADMIN_PASSWORD'),
     super_admin: true,
     confirmed: true
   ).perform
   Redis::Alfred.delete(Redis::Alfred::CHATWOOT_INSTALLATION_ONBOARDING)
   RUBY
   unset ADMIN_PW
   REMOTE
   ```
   The generated password is never echoed anywhere and is not persisted by
   this script — the owner resets it via Chatwoot's own "forgot password"
   flow (through the Resend relay) during the plan 76-05 credential-custody
   step. `GET /installation/onboarding` already redirects (302) once the
   Redis flag is cleared/absent — no separate step needed.

4. **EspoCRM:**
   ```bash
   ssh prestigo-vps 'sudo bash /opt/prestigo/scripts/gen-env.sh espocrm'
   ssh prestigo-vps 'sudo docker compose -f /opt/prestigo/espocrm/compose.yml config -q'
   ssh prestigo-vps 'cd /opt/prestigo/espocrm && sudo docker compose up -d db'
   # wait for db healthy, then:
   ssh prestigo-vps 'cd /opt/prestigo/espocrm && sudo docker compose up -d app'
   ```
   The image installs itself from env on first boot (`docker-entrypoint.sh`
   `actionInstall`) - no web installer is ever exposed.

   **Known upstream defect (espocrm/espocrm-docker, confirmed 2026-09-27):**
   `actionInstall` hardcodes `bin/command set-password admin` regardless of
   `$ESPOCRM_ADMIN_USERNAME`. Since this contract uses
   `ESPOCRM_ADMIN_USERNAME=prestigo-admin` (not the default `admin`),
   `set-password admin` fails with `User 'admin' not found.` under
   `set -euo pipefail`, so the container exits 1 and `restart: unless-stopped`
   loops it forever with `isInstalled` stuck at `false`. Symptom: the `app`
   container's `docker logs` show only `info: Running "install" action.`
   repeated, `RestartCount` climbing, and `data/config-internal.php`/
   `data/config.php` never appear. Fix (idempotent - safe to run whether or
   not the loop happened): stop `app`, then complete the remaining install
   steps once by hand, substituting the real admin username:
   ```bash
   ssh prestigo-vps 'cd /opt/prestigo/espocrm && sudo docker compose stop app'
   ssh prestigo-vps bash -s <<'REMOTE'
   set -euo pipefail
   cd /opt/prestigo/espocrm
   ADMIN_PW=$(sudo awk -F= '/^ESPOCRM_ADMIN_PASSWORD=/{print substr($0, index($0,"=")+1)}' /etc/prestigo/espocrm.env)
   printf '%s\n' "$ADMIN_PW" | sudo docker compose run --rm --entrypoint bash app -c "bin/command set-password prestigo-admin"
   sudo docker compose run --rm --entrypoint bash app -c "
     bin/command config:set 'language' 'en_US'
     bin/command config:set 'siteUrl' 'https://crm.rideprestigo.com'
     bin/command populate-scheduled-jobs
     bin/command config:set 'jobRunInParallel' 'true' --type=bool
     bin/command app-check
     bin/command config:set 'isInstalled' 'true' --type=bool
     chown -R www-data:www-data ./data ./custom ./client/custom
   "
   unset ADMIN_PW
   REMOTE
   ssh prestigo-vps 'cd /opt/prestigo/espocrm && sudo docker compose up -d app'
   ```
   Verify `data/config-internal.php` exists (via `docker compose exec app ls data/`)
   and `RestartCount` is `0` on the fresh `up -d app` before continuing.

5. **Confirm the app installed itself** (`data/config-internal.php` exists
   in the `app_data` volume) **before** adding the `crm` block - then bring
   up the daemon (app must already be ready, or `docker-daemon.sh`'s
   `exitIfNotReady` will exit-and-restart-loop while waiting, inflating
   `RestartCount` for no reason):
   ```bash
   ssh prestigo-vps 'cd /opt/prestigo/espocrm && sudo docker compose up -d daemon'
   ```

6. **Caddy last.** The `crm.rideprestigo.com` block is already in the
   committed `Caddyfile` by this point (Task 2 added it) - rsync + restart:
   ```bash
   rsync -a --delete infra/vps/ prestigo-vps:/opt/prestigo/
   ssh prestigo-vps 'cd /opt/prestigo/caddy && sudo docker compose up -d'
   ```
   **Bind-mount pitfall (confirmed 2026-09-27):** the Caddyfile is bind-mounted
   as a single file (`./Caddyfile:/etc/caddy/Caddyfile:ro`). `rsync`'s default
   temp-file-then-rename write swaps the host file's inode; a running
   container's bind mount stays attached to the OLD (now-unlinked) inode, so
   `docker exec caddy-caddy-1 cat /etc/caddy/Caddyfile` (and `caddy reload`,
   which re-reads that same stale fd) keep serving the PRE-change config even
   though the file on disk is correct. Symptom: TLS handshakes to a
   newly-added site block fail (`SSL routines:ST_CONNECT:tlsv1 alert internal
   error`) because Caddy never even attempted to obtain a certificate for it
   (`docker logs` has no ACME lines for that domain at all). **Fix: after
   every Caddyfile change, `docker compose restart caddy` - not just
   `caddy reload`** - so the container re-opens the bind mount against the
   new inode. `caddy reload` alone is fine when nothing outside the
   container-visible file content changed (e.g. re-running with an identical
   Caddyfile), but is not a safe substitute for a restart whenever `rsync`
   put a new inode under the same path.

7. **Settings API (SMTP, 2FA)** - run under `sudo` on the VPS so the admin
   password/SMTP password never leave the shell:
   ```bash
   ssh prestigo-vps bash -s <<'REMOTE'
   set -euo pipefail
   ADMIN_PW=$(sudo awk -F= '/^ESPOCRM_ADMIN_PASSWORD=/{print substr($0, index($0,"=")+1)}' /etc/prestigo/espocrm.env)
   SMTP_PW=$(sudo awk -F= '/^RESEND_SMTP_PASSWORD=/{print substr($0, index($0,"=")+1)}' /etc/prestigo/smtp.env)
   AUTH=$(printf '%s' "prestigo-admin:${ADMIN_PW}" | base64 -w0)
   curl -s -X PUT "http://127.0.0.1:8080/api/v1/Settings" \
     -H "Espo-Authorization: ${AUTH}" -H "Content-Type: application/json" \
     -d "{\"outboundEmailIsShared\":true,\"smtpServer\":\"smtp.resend.com\",\"smtpPort\":587,\"smtpAuth\":true,\"smtpSecurity\":\"TLS\",\"smtpUsername\":\"resend\",\"smtpPassword\":\"${SMTP_PW}\",\"outboundEmailFromAddress\":\"notifications@rideprestigo.com\",\"outboundEmailFromName\":\"Prestigo\",\"auth2FA\":true,\"auth2FAMethodList\":[\"Totp\"]}"
   # Send a real test email through the same relay (POST /api/v1/Email/sendTest):
   curl -s -X POST "http://127.0.0.1:8080/api/v1/Email/sendTest" \
     -H "Espo-Authorization: ${AUTH}" -H "Content-Type: application/json" \
     -d "{\"server\":\"smtp.resend.com\",\"port\":587,\"auth\":true,\"username\":\"resend\",\"password\":\"${SMTP_PW}\",\"authMechanism\":\"login\",\"security\":\"TLS\",\"fromAddress\":\"notifications@rideprestigo.com\",\"fromName\":\"Prestigo\",\"emailAddress\":\"info@rideprestigo.com\"}"
   unset ADMIN_PW SMTP_PW AUTH
   REMOTE
   ```

8. **Canary API user (D-09, for plan 76-09's restore drill):** create the
   `Restore drill canary` Role (create+read only on `Account`/`Document`,
   everything else implicitly `no`), an `api`-type User with
   `authMethod: ApiKey` linked to that role, generate its key via
   `POST /api/v1/UserSecurity/apiKey/generate`, and write it into
   `ESPOCRM_CANARY_API_KEY` in `/etc/prestigo/espocrm.env` - **never let the
   generated key appear in a `curl`/`cat` echoed to a terminal you don't
   control.** EspoCRM's own `POST /api/v1/User` create response for a
   type=`api` user already includes an auto-assigned `apiKey` field before
   you ever call the generate endpoint - if that create response is echoed
   anywhere, treat the key as compromised and immediately call
   `POST /api/v1/UserSecurity/apiKey/generate` again (or delete + recreate
   the user) to rotate it before writing anything to disk.

9. **Run the smoke check:**
   ```bash
   ssh prestigo-vps 'bash /opt/prestigo/scripts/smoke.sh'
   ```

## Routine redeploy (pinned-version upgrade)

1. Clean commit bumping the image tag(s) in the relevant `compose.yml`.
2. `rsync -a --delete infra/vps/ prestigo-vps:/opt/prestigo/` then write
   `DEPLOYED_SHA` (same as step 1 above).
3. Per stack: `docker compose -f /opt/prestigo/<stack>/compose.yml up -d`
   (pulls the new pinned tag, recreates only the changed containers).
4. If the Caddyfile changed: `docker compose restart caddy` (see the
   bind-mount pitfall in step 6 above - `up -d` alone is fine here since it
   recreates the container and picks up a fresh bind mount, but a
   config-only edit with no image change needs the explicit restart).
5. `bash scripts/smoke.sh` on the VPS.
6. See `infra/vps/runbooks/upgrade.md` (plan 76-06) for the full
   backup -> snapshot -> pull/up -> migrate -> smoke -> rollback procedure.

## Where each secret lives

| Secret | Path | Mode |
|---|---|---|
| Chatwoot `SECRET_KEY_BASE`, Postgres/Redis passwords, SMTP creds | `/etc/prestigo/chatwoot.env` | `600 root:root` |
| EspoCRM MariaDB/admin passwords, canary API key | `/etc/prestigo/espocrm.env` | `600 root:root` |
| Resend SMTP relay credentials (source for both apps) | `/etc/prestigo/smtp.env` | `600 root:root` |
| Backblaze B2 / restic credentials | `/etc/prestigo/backup.env` | `600 root:root` |

All four are generated on the VPS by `scripts/gen-env.sh` (or, for
`smtp.env`/`backup.env`, hand-installed in plan 76-03) and never leave it -
`.env.example` files under `infra/vps/env/` document every key with an
empty value, never a real one.

## D-12 memory budget (mem_limit table + baseline)

| Service | `mem_limit` | Baseline RSS after ~10 min idle (2026-09-27) |
|---|---|---|
| chatwoot rails | 1536m | see `docker stats` snapshot below |
| chatwoot sidekiq | 1024m | " |
| chatwoot postgres | 1536m | " |
| chatwoot redis | 384m | " |
| espocrm app | 768m | " |
| espocrm daemon | 384m | " |
| espocrm mariadb (db) | 1024m | " |
| caddy | 128m | " |

`free -m` and `docker stats --no-stream` snapshots are recorded in
`76-04-SUMMARY.md` (D-12 section) rather than duplicated here - re-capture
them after any real channel traffic exists (Phase 77+) and update the
runbook's upgrade trigger below if usage climbs.

**Upgrade trigger (D-12/D-11):** move to Hostinger KVM 4 when RAM stays
above 80% for more than a week, or when a second operator is onboarded.

## Exposure posture (D-17)

The apps stay **publicly reachable, no IP allowlist** - Chatwoot must
receive Meta/WhatsApp webhooks and serve the widget (Phase 77+), and
EspoCRM must be reachable from Vercel (Phase 81). Only Caddy publishes
80/443; every app/DB port is bound to `127.0.0.1` or lives only on the
`edge`/stack-private Docker network (Docker's own iptables rules bypass
`ufw`, so binding to loopback is the real control, not the firewall).
Confirmed by an external `nc` port scan (Task 3) - only 22/80/443 reachable
from off-host.

Signup/installer posture: Chatwoot public signup is closed
(`ENABLE_ACCOUNT_SIGNUP=false`, both via env and the installation_configs
row `config/installation_config.yml` writes by default) and the onboarding
web UI redirects once the admin exists; EspoCRM has no web installer at all
(installs itself from env). `fail2ban` on SSH (plan 76-02) is the other
half of the D-17 posture. EspoCRM's `auth2FA`/`auth2FAMethodList: ["Totp"]`
settings are enabled; owner enrolment happens in plan 76-05.

## D-18 mail posture

Both apps send system/notification mail **only** through
`smtp.resend.com:587` (STARTTLS, user `resend`) as
`notifications@rideprestigo.com` - never a local MTA, never direct-to-MX
from the VPS IP. Credentials are copied from `/etc/prestigo/smtp.env` by
`gen-env.sh` (Chatwoot) or the `PUT /api/v1/Settings` call above (EspoCRM) -
both proven end-to-end (a live Chatwoot SMTP config and EspoCRM's own
`/api/v1/Email/sendTest`).

## EspoCRM websocket container - intentionally omitted

The official `espocrm-websocket` service (real-time push in the EspoCRM UI)
is not deployed. It is pure RAM cost on an 8 GB host with no channel
traffic yet configured (Phase 80+ is the actual CRM entity/pipeline work);
add it later if live-update UX becomes a real requirement, following the
same `edge`-network / `127.0.0.1` publish pattern as `app`.
