# Restore drill runbook (D-09) — temporary Hetzner host

Covers the full D-09 restore drill: prove that a total loss of the
production Hostinger VPS is recoverable using **only** this runbook, the
`infra/vps/` config committed in git, and the Backblaze B2 bucket — nothing
that exists solely on the production host. The drill host is **hourly-billed
and destroyed at the end of the same session.**

This runbook is written to be followed on its own, without the executing
agent (or operator) already knowing anything about the production VPS beyond
what is documented here and in `infra/vps/README.md`.

## Prerequisites (owner-provided, gathered before starting)

- A **Hetzner Cloud project** with an API token scoped to that project only
  (Hetzner Cloud Console → Project → Security → API Tokens → Generate,
  Read+Write). Hold the token only in a shell variable for the duration of
  this drill — never write it to a file, commit, or paste it into a
  transcript.
- The owner's **password manager "Prestigo VPS backup.env" secure note**
  (created in Plan 76-05's owner custody step) — copy its full contents into
  a local file `/tmp/drill-backup.env` on the Mac just before step 4 below,
  and delete that local file again immediately after it is copied onto the
  drill host. **Never use the production host's own `/etc/prestigo/backup.env`
  for this drill** — the whole point of the drill is proving recovery works
  without anything that lives only on the VPS being lost.
- The **Mac's current public IPv4** (`curl -s https://api.ipify.org`) — the
  drill host's firewall allows inbound SSH from this address only.
- 2FA / password-manager access for logging into Chatwoot and EspoCRM as the
  owner, for the final browser-verification step.

## Step 1 — create the SSH key object

```bash
HETZNER_TOKEN='...'   # shell variable only, never written to a file
curl -s -X POST -H "Authorization: Bearer ${HETZNER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"prestigo-restore-drill-$(date +%Y%m%d)\",\"public_key\":\"$(cat ~/.ssh/prestigo_vps_ed25519.pub)\"}" \
  "https://api.hetzner.cloud/v1/ssh_keys"
```
Record the returned `id` as `SSH_KEY_ID`.

## Step 2 — create the firewall (inbound 22 from the Mac only, no outbound rules yet)

```bash
MAC_IP=$(curl -s https://api.ipify.org)
curl -s -X POST -H "Authorization: Bearer ${HETZNER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"prestigo-restore-drill\",\"rules\":[{\"direction\":\"in\",\"protocol\":\"tcp\",\"port\":\"22\",\"source_ips\":[\"${MAC_IP}/32\"]}]}" \
  "https://api.hetzner.cloud/v1/firewalls"
```
Record the returned `id` as `FIREWALL_ID`. **No outbound rule exists yet** —
Hetzner Cloud firewalls switch to deny-all-other-outbound as soon as one
outbound rule is added (see Step 6); until then, default outbound is open,
which is fine — nothing sensitive runs yet.

## Step 3 — create the server

EU location, cheapest x86 server type with at least 8 GB RAM (check current
Hetzner offerings — `cx32` or equivalent at the time of the drill), Ubuntu
24.04, labeled `purpose=prestigo-restore-drill` so it can be found and
confirmed torn down later:

```bash
curl -s -X POST -H "Authorization: Bearer ${HETZNER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"prestigo-restore-drill\",\"server_type\":\"cx32\",\"image\":\"ubuntu-24.04\",\"location\":\"fsn1\",\"ssh_keys\":[${SSH_KEY_ID}],\"firewalls\":[{\"firewall\":${FIREWALL_ID}}],\"labels\":{\"purpose\":\"prestigo-restore-drill\"}}" \
  "https://api.hetzner.cloud/v1/servers"
```
Record the returned server `id` as `DRILL_SERVER_ID` and its public IPv4 as
`DRILL_IP`. Wait for `status: running` (poll `GET /v1/servers/{id}`).

## Step 4 — bootstrap, deploy, place the password-manager backup.env

```bash
# Bootstrap the fresh host exactly like a fresh production host (host-bootstrap.md)
scp infra/vps/scripts/bootstrap.sh ~/.ssh/prestigo_vps_ed25519.pub \
  root@${DRILL_IP}:/root/
ssh root@${DRILL_IP} \
  'chmod +x /root/bootstrap.sh && DEPLOY_PUBKEY_FILE=/root/prestigo_vps_ed25519.pub bash /root/bootstrap.sh'

# Add a temporary alias, then deploy infra/vps at the committed SHA
cat >> ~/.ssh/config <<EOF

Host prestigo-drill
    HostName ${DRILL_IP}
    User deploy
    IdentityFile ~/.ssh/prestigo_vps_ed25519
    IdentitiesOnly yes
EOF

git status --porcelain infra/vps   # must be empty — deploy from a clean commit
rsync -a --delete infra/vps/ prestigo-drill:/opt/prestigo/
ssh prestigo-drill 'echo "'"$(git rev-parse HEAD)"'" | sudo tee /opt/prestigo/DEPLOYED_SHA'

# Place the OWNER'S PASSWORD-MANAGER COPY of backup.env — never the
# production copy. Paste the secure note's contents into /tmp/drill-backup.env
# on the Mac first, then:
scp /tmp/drill-backup.env prestigo-drill:/tmp/backup.env
ssh prestigo-drill 'sudo install -m 0600 -o root -g root /tmp/backup.env /etc/prestigo/backup.env && rm -f /tmp/backup.env'
rm -f /tmp/drill-backup.env
```

## Step 5 — fetch phase

```bash
ssh prestigo-drill 'sudo bash /opt/prestigo/scripts/restore.sh --drill --phase fetch'
```
This restores the latest snapshot into a staging directory, installs the
restored env files into `/etc/prestigo` with the D-09 drill URL overrides
(`FRONTEND_URL=http://localhost:13000`, `ESPOCRM_SITE_URL=http://localhost:18080`
— drill host copies only, never touching production), places the dumps, and
pulls the pinned Chatwoot/EspoCRM images. Record this step's duration from
its `--- fetch ... done in Ns ---` log lines into the Drill log below.

## Step 6 — lock egress before starting anything

Add the outbound firewall rule (this is what flips the firewall to
deny-all-other-outbound — no other outbound rule exists at this point):

```bash
curl -s -X POST -H "Authorization: Bearer ${HETZNER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"rules":[{"direction":"in","protocol":"tcp","port":"22","source_ips":["'"${MAC_IP}"'/32"]},{"direction":"out","protocol":"icmp","destination_ips":["127.0.0.1/32"]}]}' \
  "https://api.hetzner.cloud/v1/firewalls/${FIREWALL_ID}/actions/set_rules"
```

Second layer, on the host itself — a `DOCKER-USER` iptables rule dropping new
outbound connections from container bridge networks (Docker's own rules run
*before* the cloud firewall reaches the host's bridge traffic in some
configurations, so this is a genuine second layer, not a duplicate):

```bash
ssh prestigo-drill 'sudo iptables -I DOCKER-USER -m state --state NEW -j DROP'
```

**Verify egress is blocked from both places before continuing:**

```bash
# From the host itself
ssh prestigo-drill 'curl -m 5 -o /dev/null -w "%{http_code}\n" https://example.com || echo BLOCKED'
# From inside a container (once containers exist in Step 7, re-check with:)
ssh prestigo-drill 'sudo docker exec chatwoot-rails-1 wget -q -T 5 -O /dev/null https://example.com && echo LEAK || echo BLOCKED'
```
Both must print `BLOCKED` (or a non-2xx/timeout). **Do not proceed to Step 7
until both checks confirm egress is blocked** — `restore.sh --drill --phase
start` also refuses to start any app container until it re-proves this
itself (belt + suspenders, D-09).

## Step 7 — start phase

```bash
ssh prestigo-drill 'sudo bash /opt/prestigo/scripts/restore.sh --drill --phase start'
```
Restores the DB dumps, copies volume contents, and starts **only** Chatwoot
`rails` and EspoCRM `app` — Sidekiq and the EspoCRM daemon are never started
in drill mode, so the restored instance never polls a mailbox or sends mail.
Caddy is not started and no systemd timers are installed on the drill host.
Record this step's duration into the Drill log.

## Step 8 — D-09 integrity check + smoke

```bash
ssh prestigo-drill 'sudo bash /opt/prestigo/scripts/drill-verify.sh --drill \
  --baseline-file /var/backups/prestigo/dumps/drill-baseline.json'
ssh prestigo-drill 'bash /opt/prestigo/scripts/smoke.sh --local-only'
```
`drill-verify.sh --drill` re-runs every `--baseline` check, refuses to run on
hostname `prestigo-vps` (a safety net against ever running this destructive
functional-insert test on production), proves every count is at or above the
baseline snapshot's counts, confirms the canary IDs match the baseline
exactly, performs one functional conversation insert-then-destroy (proving
the `conv_dpid_seq_ACCOUNTID` trigger produces the correct next `display_id`
on the restored data), and re-confirms egress is blocked. `smoke.sh
--local-only` hits the app containers over `127.0.0.1` directly (no Caddy on
this host). Record every check's OK/FAIL result in the Drill log.

## Step 9 — owner browser verification

```bash
ssh -L 13000:127.0.0.1:3000 -L 18080:127.0.0.1:8080 prestigo-drill
```
Leave this tunnel open and have the owner, in their own browser:
- visit `http://localhost:13000` and log into Chatwoot with the
  password-manager credentials (+ 2FA if enrolled) — confirm the canary
  conversation "Restore drill canary" is visible with its attachment
  openable.
- visit `http://localhost:18080` and log into EspoCRM with the
  password-manager credentials (+ 2FA) — confirm the "Restore Drill Canary"
  Account and its linked Document are visible and the file downloads.

Record the owner's confirmation (or any issue) in the Drill log.

## Step 10 — teardown

```bash
curl -s -X DELETE -H "Authorization: Bearer ${HETZNER_TOKEN}" \
  "https://api.hetzner.cloud/v1/servers/${DRILL_SERVER_ID}"
curl -s -X DELETE -H "Authorization: Bearer ${HETZNER_TOKEN}" \
  "https://api.hetzner.cloud/v1/firewalls/${FIREWALL_ID}"
curl -s -X DELETE -H "Authorization: Bearer ${HETZNER_TOKEN}" \
  "https://api.hetzner.cloud/v1/ssh_keys/${SSH_KEY_ID}"

# Confirm nothing with the drill label survives:
curl -s -H "Authorization: Bearer ${HETZNER_TOKEN}" \
  "https://api.hetzner.cloud/v1/servers?label_selector=purpose=prestigo-restore-drill" \
  | jq -r '.servers | length'
# Expect: 0

sed -i '/Host prestigo-drill/,+4d' ~/.ssh/config
unset HETZNER_TOKEN MAC_IP SSH_KEY_ID FIREWALL_ID DRILL_SERVER_ID DRILL_IP
```

## What to record for each drill

- Date, snapshot id restored (from `restore.sh`'s `resolved snapshot:` log
  line), the `restore.sh --drill --phase fetch`/`--phase start` per-step
  durations, total elapsed time from Step 1 to a browser-confirmed login in
  Step 9, every `drill-verify.sh --drill` check's OK/FAIL result, and any
  deviation encountered + how it was fixed (so the next drill doesn't
  rediscover the same issue).
- Confirm Step 10's teardown check returned `0` before closing out the
  drill — an un-torn-down host keeps billing hourly and is itself a stray
  secret-bearing asset.

## Drill log

Most recent completed drill: **2026-09-28** (owner-approved, host torn down — see row and finalization notes below).

| Date | Snapshot ID | fetch duration | start duration | Total time to restored | D-09 checks | Deviations / fixes |
|------|-------------|-----------------|-----------------|-------------------------|-------------|---------------------|
| 2026-09-28 | `79f1c6f8` (host `prestigo-vps`, resolved by `restore.sh --drill --phase fetch`) | 45s total — resolve-snapshot 6s, restic-restore-staging 6s, install-env-files 0s, apply-drill-url-overrides 0s, place-dumps 0s, pull-images 28s | 36s total — egress-gate 5s, create-volumes-copy-data 0s, start-chatwoot-db-restore-dump 12s, start-espocrm-db-import 13s, start-app-services 2s | ~12 min (server created 09:25:39Z → tunnel confirmed serving both apps ~09:37:20Z; excludes Task 1's Hetzner sign-up which was already done) | `drill-verify.sh --drill` 30/30 OK after the fix below (egress blocked from host+container, functional insert display_id correct on a re-imported pristine dump, both canary checksums match, all counts >= baseline, canary IDs match baseline); `smoke.sh --local-only` 8/8 OK after the fix below; `docker ps` on the drill host showed only `chatwoot-{postgres,redis,rails}-1` + `espocrm-{db,app}-1` — no `chatwoot-sidekiq-1`, no `espocrm-daemon-1` | 2 fixes found live, both committed as `fix(76-09)`: (1) `drill-verify.sh`'s functional-insert Ruby snippet created a `Conversation` without a `ContactInbox`, which Chatwoot validates as required — this silently killed the whole script under `set -e` with no FAIL line (stderr was redirected to suppress Sidekiq-client noise); fixed by finding/creating the `ContactInbox` first and wrapping the `docker exec` in `set +e`/`set -e` so a future regression here always reports FAIL instead of an unexplained early exit. (2) `smoke.sh --local-only` checked for `chatwoot-sidekiq-1`/`espocrm-daemon-1` as required-running, but D-09 deliberately never starts those in drill mode — always-FAIL by design, not a defect; fixed to only check them (plus Caddy) outside `--local-only`. |

### 2026-09-28 drill — owner sign-off and teardown

- **Owner login (Task 3, D-09):** Chatwoot at `localhost:13000` — owner logged
  in with password-manager credentials (no 2FA enrolled in this Chatwoot CE
  v4.18 install), opened Inboxes → "Restore drill canary" → the resolved
  conversation, and downloaded `canary.txt`. EspoCRM at `localhost:18080` —
  the owner's first two login attempts failed with a generic credentials
  error (mistyped password, no password-manager autofill on `localhost`);
  Claude verified the restored `prestigo-admin` password hash and
  `passwordSalt` fingerprint were byte-identical to production before the
  retry, confirming this was not a restore defect. The owner then logged in
  successfully as `prestigo-admin` (EspoCRM `auth_log_record` shows success
  at `09:56:10Z` and `09:56:45Z`, including TOTP), opened Accounts →
  "Restore Drill Canary" → Documents, downloaded the canary file, and
  replied "готово" approving the drill. **Operational note for the next
  drill:** paste EspoCRM credentials from the password manager rather than
  typing them — `localhost` gets no browser autofill.
- **Teardown (Task 4):** Hetzner API calls issued `2026-09-28T10:00:13Z`.
  Server `167796745` (`prestigo-restore-drill`, `2.28.135.178`) deleted
  first, then firewall `11694338`, then SSH key `130609093`. Post-teardown
  listing confirmed zero servers, zero firewalls and zero SSH keys remain in
  the project (both the drill label/name filter and an unfiltered
  project-wide listing returned empty). Local cleanup: removed the
  `Host prestigo-drill` block from `~/.ssh/config`, removed the drill host's
  key from `~/.ssh/known_hosts`, deleted
  `.planning/phases/76-vps-infrastructure/evidence/drill-host-ip.txt`; no
  drill secrets (backup.env copies, tokens) remain on the Mac.
- **Total wall-clock:** server created `09:25:39Z` → deleted `10:00:13Z` =
  **~34.5 minutes** of billed host time (excludes Task 1's one-time Hetzner
  sign-up, already done before this drill).
- **Approximate cost:** the exact server_type chosen during Task 2's
  provisioning wasn't captured in the Drill log columns, and the server is
  now deleted so its type can't be re-queried; `GET /v1/server_types` at
  teardown time (same day, same pricing epoch) shows the selection rule's
  cheapest x86 type with ≥8 GB RAM in `fsn1` is `cx33` at €0.016456/hr
  gross — 0.576 h × €0.016456/hr ≈ **€0.0095**. Even the most expensive
  plausible candidate in that ≥8 GB x86 tier (`ccx13`, €0.0834/hr) would put
  this drill at ≈ €0.048. Either way, well under €0.05 for the whole drill.
- **Next drill:** repeat before the next major Chatwoot/EspoCRM upgrade and
  at least quarterly, per this runbook's intent — next scheduled check-in no
  later than **2026-12-28**.
- **Reminder:** the owner should revoke the Hetzner Cloud API token used for
  this drill now that teardown is verified complete (it was scoped to the
  dedicated `prestigo-restore-drill` project only).
