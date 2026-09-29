# Upgrade runbook (D-16, D-10, INFRA-04)

Governs bumping the pinned image tag of Chatwoot **or** EspoCRM (never both
in the same change — one app's tag per upgrade), and covers Docker Engine
upgrades separately below. See `infra/vps/runbooks/app-deploy.md` for the
routine-redeploy quick reference this runbook expands into a full
backup-first procedure with rollback.

**App images are never auto-pulled.** `unattended-upgrades` (plan 76-02)
only ever touches OS security packages and explicitly blacklists
`docker-ce*`/`containerd.io`/`docker-compose-plugin`; nothing on this host
ever pulls a new Chatwoot/EspoCRM/Caddy/restic image on its own. Every image
bump is a deliberate git commit, applied through this runbook.

## Preflight

1. Read the target version's **release notes** and **migration notes** on
   the upstream project (Chatwoot: `CHANGELOG.md` / GitHub releases;
   EspoCRM: the upgrade notes for the target version) — specifically look
   for breaking DB migrations, required env var changes, or a note that the
   image auto-upgrades an installed instance on container start (EspoCRM's
   image does this — confirm the target version's release notes don't
   describe an additional manual step beyond the normal container restart).
2. Pick the **exact new tag** by querying Docker Hub directly (not from
   memory/training data) — e.g.
   `curl -s "https://hub.docker.com/v2/repositories/chatwoot/chatwoot/tags/?page_size=100" | jq -r '.results[].name'`
   and choose the newest stable tag matching the project's own versioning
   convention (`vX.Y.Z-ce` for Chatwoot, `X.Y.Z` for EspoCRM). Never use
   `latest`.

## Procedure

**1. Fresh backup, note the snapshot id.**
```bash
ssh prestigo-vps 'sudo /opt/prestigo/scripts/backup.sh'
```
Record the `snapshot <id>` from the final log line — step 7's rollback path
needs it if migrations already ran before something goes wrong.

**2. Manual Hostinger snapshot (D-10) — coarse whole-host net.**
In hPanel: VPS -> Backups & Snapshots -> Snapshots -> Create snapshot. (Or,
if the owner has an active API token for this session, via the Hostinger VPS
API: `POST /virtual-machines/{id}/snapshot`.) Hostinger keeps **one**
snapshot slot per VM — taking a new one replaces the previous snapshot, so
this is always "the state right before this upgrade," never a history. This
is a coarse whole-VM net; restic + B2 (step 1) remains the primary,
granular recovery path.

**3. One git commit bumping exactly one app's tag.**
Edit only `infra/vps/chatwoot/compose.yml` **or**
`infra/vps/espocrm/compose.yml` (never both), bump the `image:` tag to the
exact version chosen in preflight, commit:
```bash
git add infra/vps/<app>/compose.yml
git commit -m "chore(76-06): bump <app> to <new-tag>"
```

**4. Clean-commit deploy.**
```bash
git status --porcelain infra/vps   # must be empty
rsync -a --delete infra/vps/ prestigo-vps:/opt/prestigo/
ssh prestigo-vps 'echo "'"$(git rev-parse HEAD)"'" | sudo tee /opt/prestigo/DEPLOYED_SHA'
```

**5. Pull and bring the new image up.**

*Chatwoot:* run migrations in a one-off container **before** `up -d`, so the
running `rails`/`sidekiq` containers never start against a schema the code
doesn't expect:
```bash
ssh prestigo-vps 'cd /opt/prestigo/chatwoot && sudo docker compose pull rails sidekiq'
ssh prestigo-vps 'cd /opt/prestigo/chatwoot && sudo docker compose run --rm --entrypoint docker/entrypoints/rails.sh rails bundle exec rails db:chatwoot_prepare'
ssh prestigo-vps 'cd /opt/prestigo/chatwoot && sudo docker compose up -d'
```

*EspoCRM:* `up -d` and watch the logs — the pinned image's entrypoint
detects an already-installed instance and runs its own upgrade path
automatically on container start (confirmed in this app's upstream
`docker-entrypoint.sh`; re-verify this behavior in the target version's
release notes per preflight step 1 before trusting it blind):
```bash
ssh prestigo-vps 'cd /opt/prestigo/espocrm && sudo docker compose pull app daemon'
ssh prestigo-vps 'cd /opt/prestigo/espocrm && sudo docker compose up -d'
ssh prestigo-vps 'sudo docker logs -f espocrm-app-1'
# watch for the upgrade routine to finish (no restart loop, no error), then Ctrl-C
```

**6. Smoke check must print only OK.**
```bash
ssh prestigo-vps 'bash /opt/prestigo/scripts/smoke.sh'
```
Any `FAIL` line stops the upgrade here — do not proceed to declare success;
go to step 7 (rollback).

**6b. Chatwoot config check after an upgrade (Chatwoot only).**
A new Chatwoot version can change defaults or drop a setting, so confirm the
configuration kept in `infra/chatwoot/` still matches the live instance. Run from
the owner Mac (uses `~/.config/prestigo/chatwoot-api.env`; see
`infra/chatwoot/README.md`):
```bash
node infra/chatwoot/sync.mjs --dry-run     # must end with: summary: create=0 update=0 (skipped only for inboxes not created yet)
node infra/chatwoot/inspect.mjs --status   # counts, Website settings (hmac_mandatory=true) and inbox presence must match the last known-good output
python3 scripts/qa/chat_widget_probe.py --click https://rideprestigo.com --locales en --pages /   # must exit 0
```
Any `update` in the dry run means the upgrade changed a managed setting: review
it, then apply with `node infra/chatwoot/sync.mjs` (git stays the source of
truth) and re-run the checks. A widget probe failure means the site widget is
broken for visitors: treat it like a failed smoke check and go to step 7.

**7. Rollback.**
- If the smoke check fails **before** any DB migration ran (Chatwoot: before
  `db:chatwoot_prepare`; EspoCRM: before the entrypoint's auto-upgrade
  touched the DB): revert the tag-bump commit and redeploy the previous tag
  (repeat steps 3-6 with the old tag). No data-level recovery needed.
- If migrations/auto-upgrade **already ran** and the app is broken: restore
  the database from the pre-upgrade snapshot recorded in step 1, using
  `restore.sh` (plan 08) against the live host, then redeploy the previous
  image tag as above.
- **Last resort** (restic restore also fails, or the whole host is
  compromised): roll back to the Hostinger snapshot taken in step 2. This
  loses any writes made between the snapshot and the rollback, so prefer the
  restic path whenever it's viable.

**8. Log the upgrade.**
Append a row to the table below (in this file) recording the result:

| Date | App | From | To | Duration | Result |
|---|---|---|---|---|---|
| _(none yet)_ | | | | | |

## Docker Engine upgrades

Docker Engine and the compose plugin are **manual only** — `bootstrap.sh`
(plan 76-02) blacklists `docker-ce*`/`containerd.io`/`docker-compose-plugin`
from `unattended-upgrades` specifically so a Docker Engine restart never
happens unattended (D-14) and never mid-upgrade of an app. Perform Docker
Engine upgrades:
- manually, `sudo apt update && sudo apt install --only-upgrade docker-ce docker-ce-cli containerd.io docker-compose-plugin`
- during a quiet hour (outside the 02:30 Prague backup window and outside
  business hours)
- followed immediately by `bash /opt/prestigo/scripts/smoke.sh` to confirm
  every container came back up after the Docker daemon restart a package
  upgrade triggers
