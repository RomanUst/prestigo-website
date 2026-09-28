---
phase: 76-vps-infrastructure
reviewed: 2026-09-28T00:00:00Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - .gitignore
  - .husky/pre-commit
  - infra/vps/caddy/Caddyfile
  - infra/vps/caddy/compose.yml
  - infra/vps/chatwoot/compose.yml
  - infra/vps/espocrm/compose.yml
  - infra/vps/env/backup.env.example
  - infra/vps/env/chatwoot.env.example
  - infra/vps/env/espocrm.env.example
  - infra/vps/env/monitor.env.example
  - infra/vps/env/smtp.env.example
  - infra/vps/monitoring/monitors.json
  - infra/vps/scripts/backup.sh
  - infra/vps/scripts/bootstrap.sh
  - infra/vps/scripts/dns-zone-diff.sh
  - infra/vps/scripts/drill-verify.sh
  - infra/vps/scripts/gen-env.sh
  - infra/vps/scripts/monitor.sh
  - infra/vps/scripts/provision-monitors.sh
  - infra/vps/scripts/restic.sh
  - infra/vps/scripts/restore.sh
  - infra/vps/scripts/seed-drill-canary.sh
  - infra/vps/scripts/smoke.sh
  - infra/vps/systemd/prestigo-backup.service
  - infra/vps/systemd/prestigo-backup.timer
  - infra/vps/systemd/prestigo-monitor.service
  - infra/vps/systemd/prestigo-monitor.timer
  - scripts/qa/contact_form_e2e.py
  - scripts/qa/secret_gate_probe.sh
  - tests/infra-vps-isolation-guard.test.ts
findings:
  critical: 3
  warning: 8
  info: 2
  total: 13
status: issues_found
---

# Phase 76: Code Review Report

**Reviewed:** 2026-09-28T00:00:00Z
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

## Summary

Reviewed the Phase 76 VPS infrastructure-as-code (Caddy/Chatwoot/EspoCRM compose
stacks, bootstrap/backup/restore/monitor/drill scripts, systemd units, env
templates, and the two supporting guard tests). Compose exposure is correctly
scoped (only Caddy publishes 80/443; every app port is loopback-bound), the
Docker apt key is pinned and verified by fingerprint, and the isolation-guard
test (`tests/infra-vps-isolation-guard.test.ts`) is a genuinely solid piece of
static analysis with good fixture coverage.

However, three issues in the destructive-operation path are serious enough to
block: `restore.sh` has no equivalent of `drill-verify.sh`'s "refuse to run on
hostname `prestigo-vps`" guard, so `--drill`/`--full` can be invoked directly
against the live production host with no safety interlock beyond an egress
check that only applies to non-`--full` `--phase start`; its Postgres restore
step silently discards `pg_restore`'s exit code (`|| true`) and the script
still prints `PASS full` regardless, meaning a failed disaster-recovery restore
can be reported as a success; and `drill-verify.sh` documents, in its own
comments, the exact `set -e`-kills-the-whole-script pitfall that broke a live
D-09 drill run — but only patched the one call site it personally hit, leaving
roughly fifteen other equally-shaped command substitutions in the same script
exposed to the identical failure mode, with the added consequence that a
partial abort produces **zero** diagnostic JSON output (the result object is
only assembled at the very end).

Several secret-hygiene, git-hygiene, and hardening gaps round out the warnings
below — most notably those four scripts (plus `seed-drill-canary.sh`) passing
MariaDB/Chatwoot/EspoCRM credentials through `docker exec -e VAR=value` /
`curl -H "...token..."` command-line arguments (visible via `ps aux` for the
duration of the call), when the safer pattern (`-e VAR` without an inline
value, letting Docker read it from the caller's own environment) is already
used correctly elsewhere in this same phase (`monitor.sh`'s `REDISCLI_AUTH`,
`restic.sh`'s `--env-file`) — proving this is an inconsistency, not a gap in
technique.

## Critical Issues

### CR-01: restore.sh has no production-host safety interlock for --drill/--full

**File:** `infra/vps/scripts/restore.sh:41-414`
**Issue:** `drill-verify.sh` explicitly refuses to run in `--drill` mode when
`$(hostname)` is `prestigo-vps` (drill-verify.sh:72-77), with a comment
explaining this exists specifically to stop a drill from touching production.
`restore.sh` — the script that actually overwrites `/etc/prestigo/*.env` and
restores database dumps — has **no such check anywhere** for either
`--drill --phase fetch` or `--full`. Concretely:

- `run_fetch()` (restore.sh:231-297) unconditionally does
  `install -m 0600 -o root -g root "${etc_src}/${f}" "/etc/prestigo/${f}"`
  for `chatwoot.env`/`espocrm.env`/`smtp.env`/`monitor.env` (lines 251-261),
  and for `--drill` (`apply_overrides=true`) it then rewrites
  `FRONTEND_URL` and `ESPOCRM_SITE_URL` to `http://localhost:13000` /
  `http://localhost:18080` (lines 264-276). If `--drill --phase fetch` is run
  by mistake directly on `prestigo-vps` (e.g. wrong terminal/SSH session —
  entirely plausible since the runbook requires the operator to manually copy
  `backup.env` onto the drill host first, so both hosts have working restic
  credentials at the same time), this silently corrupts the **live**
  Chatwoot/EspoCRM config with unreachable localhost URLs, breaking invite
  links, webhooks, and the CRM site URL in production — before any container
  is touched.
- `run_start()` (restore.sh:302-383) does have an `egress-gate` check
  (lines 306-317) that refuses to proceed unless outbound egress is blocked —
  but that check is skipped entirely when `full_mode=true` (line 306), and
  even for the drill path it only protects `--phase start`, not
  `--phase fetch`.
- `run_full()` (restore.sh:388-399) calls `run_fetch false` (no overrides)
  then `run_start true` (egress-gate skipped), then restores both databases
  (`pg_restore --clean --if-exists`, `mariadb -u root espocrm < dump`) and
  starts every service. Nothing stops `sudo bash restore.sh --full` from being
  run on the actual current production host instead of "a replacement host" —
  it is purely a documentation convention (see the header comment,
  restore.sh:28-33), never enforced in code.

**Fix:** Add the same hostname guard `drill-verify.sh` already has, applied to
every mode that mutates `/etc/prestigo` or a database — e.g. at the top of
`run_fetch()`/`run_start()`/`run_full()`:
```bash
if [ "${MODE}" != "full" ] && [ "$(hostname)" = "prestigo-vps" ]; then
  echo "[restore] refusing --${MODE} on hostname prestigo-vps (production) — this mode is disposable-host only" >&2
  exit 1
fi
```
and for `--full`, require an explicit opt-in flag (e.g. `--full --i-know-this-is-destructive`) or an interactive confirmation prompt before the database-restore steps run, so an accidental invocation on the live host cannot proceed silently.

### CR-02: restore.sh swallows the Postgres restore's exit code, then reports PASS regardless

**File:** `infra/vps/scripts/restore.sh:352`
**Issue:**
```bash
docker exec -i chatwoot-postgres-1 pg_restore -U postgres -d chatwoot_production --clean --if-exists < /var/backups/prestigo/dumps/chatwoot.dump || true
log "restored chatwoot.dump into chatwoot_production"
```
The `|| true` discards `pg_restore`'s exit status entirely. If the restore
fails for any real reason (corrupt dump, connection drop mid-stream, disk
full, permission error), the script logs a success line and continues into
`run_start()`'s remaining steps, and — for `--full` — `run_full()` ends by
printing `log "PASS full: disaster-recovery restore complete..."`
(restore.sh:398) with no verification step in between (unlike the `--drill`
flow, which is checked separately via `drill-verify.sh --drill` in the
runbook). In an actual disaster-recovery scenario this is the single most
consequential place for a script to lie about success: the operator has no
automated signal that the data did not come back.
**Fix:** Capture and check the exit code, and fail loudly (or at minimum flag
it in the final PASS/FAIL summary) instead of swallowing it:
```bash
if ! docker exec -i chatwoot-postgres-1 pg_restore -U postgres -d chatwoot_production --clean --if-exists < /var/backups/prestigo/dumps/chatwoot.dump; then
  echo "[restore] FAIL start-chatwoot-db-restore-dump: pg_restore reported errors — inspect output above before trusting this restore" >&2
  exit 1
fi
```
(If some warnings from `pg_restore` are expected/benign, filter for the
specific tolerable messages rather than discarding the exit code wholesale.)

### CR-03: drill-verify.sh's own documented `set -e` pitfall is unfixed everywhere except the one call site that broke in production

**File:** `infra/vps/scripts/drill-verify.sh:111-230` (and others)
**Issue:** The script's own comment at lines 306-314 explains, in detail, that
a plain `VAR=$(docker exec ...)` assignment under `set -Eeuo pipefail`
(drill-verify.sh:25) aborts the **entire script** the instant that command
fails — with no `FAIL` line printed, because the JSON result object is only
assembled at the very end (lines 365-417) — and that this exact failure mode
silently killed the whole D-09 drill run the first time it happened live. The
fix applied there was to wrap just that one block in `set +e` / `set -e`
(lines 315, 329).

But nearly every other check in the same script makes the identical class of
unguarded assignment against `cw_psql`/`espo_sql` (both of which shell out to
`docker exec`, and can fail for the same transient reasons — a stopped
container, a connection reset, a lock):
- lines 111-119 (`CW_ACCOUNTS` … `CW_BLOBS`)
- lines 125, 128, 131, 134 (`ORPHAN_CONV` … `ORPHAN_ASA`)
- lines 140-147 (`SEQ_BAD`)
- line 153, 160-168 (Chatwoot canary lookups)
- lines 204-211 (`ESPO_ACCOUNT_CNT` … `ESPO_DOC_MISSING_ATT`)
- lines 216-225 (EspoCRM canary lookups)

A transient failure in any one of these (which is exactly the class of error
this script exists to be resilient against, since it runs nightly inside
`backup.sh`'s pre-dump hook) reproduces the same silent-abort bug the team
already hit once — except now spread across ~15 call sites instead of the one
that got noticed and fixed. Because the JSON result is assembled only at the
end, a partial abort here produces **no output file at all** under `--out`,
which is a regression from the script's stated purpose (one OK/FAIL line per
check, always).
**Fix:** Either wrap each DB-touching assignment the same way the functional
insert already is (`set +e` / capture / `set -e`), or — more robustly — write
a small helper that runs a command substitution without letting a failure
trip the script's `set -e`, and route every `cw_psql`/`espo_sql` call through
it, converting failure into a `FAIL` record instead of a hard abort:
```bash
try_sql() {  # try_sql VARNAME 'sql' cw_psql|espo_sql
  local __var="$1" __sql="$2" __fn="$3" __val
  set +e; __val=$("${__fn}" "${__sql}"); local __rc=$?; set -e
  if [ "${__rc}" -ne 0 ]; then record "sql-error-${__var}" FAIL "docker exec exit=${__rc}"; __val=""; fi
  printf -v "${__var}" '%s' "${__val}"
}
```

## Warnings

### WR-01: Secrets passed via `docker exec -e VAR=value` / `curl -H "token"` argv, inconsistent with the safer pattern already used elsewhere in this phase

**File:** `infra/vps/scripts/backup.sh:127`, `infra/vps/scripts/drill-verify.sh:103-105`, `infra/vps/scripts/restore.sh:363-365`, `infra/vps/scripts/seed-drill-canary.sh:83,101,119,133,137,156,163,176,184,206,224-225`
**Issue:** All four scripts do
```bash
ESPOCRM_ROOT_PW=$(grep '^MARIADB_ROOT_PASSWORD=' /etc/prestigo/espocrm.env | cut -d= -f2-)
docker exec -e MYSQL_PWD="${ESPOCRM_ROOT_PW}" espocrm-db-1 mariadb-dump ...
```
and `seed-drill-canary.sh` additionally builds `curl -H "api_access_token: ${CW_TOKEN}"` / `curl -H "X-Api-Key: ${ESPO_KEY}"` headers with the secret interpolated directly into the argument string. In both cases the secret value becomes a literal argv element of the `docker`/`curl` process and is visible to anyone able to run `ps auxww` (or read `/proc/<pid>/cmdline`) for the duration of the call — on this host that's `root`/`deploy` only, but it directly contradicts this phase's own stated secret-hygiene bar ("never printed", `gen-env.sh` header comment) and is avoidable.

`monitor.sh:182,188` already demonstrates the correct pattern in this same
phase:
```bash
members=$(REDISCLI_AUTH="${redis_pw}" docker exec -e REDISCLI_AUTH chatwoot-redis-1 redis-cli SMEMBERS processes ...)
```
`-e REDISCLI_AUTH` (no `=value`) tells the Docker CLI to forward the value
from its own process environment — the secret never appears in `docker`'s
argv. `restic.sh:31` uses the equivalent `--env-file` approach for the same
reason.
**Fix:** Apply the same pattern everywhere a DB password or API token is
passed to `docker exec`/`curl`:
```bash
MYSQL_PWD="${ESPOCRM_ROOT_PW}" docker exec -e MYSQL_PWD espocrm-db-1 mariadb-dump ...
```
For `curl`, use `--header @-` fed from a heredoc/pipe, or `-K -` with a config
file passed on stdin, instead of interpolating the token into a `-H` argument.

### WR-02: .husky/pre-commit's secret-shape regex doesn't cover any of the new Phase 76 VPS secret types

**File:** `.husky/pre-commit:36`
**Issue:** `infra/vps/README.md` states the existing pre-commit hook "already
covers this directory with zero modification needed." That's true for the
primary defense (any staged path ending `.env`, other than `.example`, is
blocked outright — verified correct). But the *secondary* defense —
`SECRET_RE`, which scans added line content in any tracked file for
secret-shaped strings — only recognizes vendor-prefixed formats from the
site's existing integrations (`sk_live_`, `sk_test_`, `rk_live_`, `whsec_`,
`re_..._...`, `sk-ant-`, `AIza`, JWT-like, PEM headers). None of the secret
types this phase introduces have a recognizable prefix: `openssl rand -hex
32/64` passwords (`POSTGRES_PASSWORD`, `REDIS_PASSWORD`,
`MARIADB_ROOT_PASSWORD`, `SECRET_KEY_BASE`, `RESTIC_PASSWORD`,
`ESPOCRM_ADMIN_PASSWORD`), Backblaze B2 `AWS_ACCESS_KEY_ID`/
`AWS_SECRET_ACCESS_KEY`, `UPTIMEROBOT_API_KEY`, `HEALTHCHECKS_API_KEY`. If any
of these values were ever pasted into a *non*-`.env` tracked file (a runbook
`.md`, a one-off script, a chat-pasted snippet committed by accident), this
hook would not catch it — the file-path block is the only thing standing
between a real secret and a commit for these types.
**Fix:** Add a generic high-entropy-hex/base64 heuristic (e.g. a bare
32/48/64-hex-char run, or a `KEY=`/`PASSWORD=`/`TOKEN=` line whose value is
≥20 chars of `[A-Za-z0-9+/=]` with no spaces) scoped to `infra/vps/` paths, or
maintain an explicit list of the `KEY=` names from the five `*.env.example`
files and block any *non*-`.example` file where one of those names is
followed by a non-empty value.

### WR-03: .gitignore's `.env.example` negation never matches anything

**File:** `.gitignore:24`
**Issue:**
```
infra/vps/**/*.env
infra/vps/**/.env.*
!infra/vps/**/.env.example
```
The negation pattern `.env.example` (no leading wildcard) only matches a
basename that is *literally* `.env.example`. Every real example file in this
repo is named `<service>.env.example` (`chatwoot.env.example`,
`backup.env.example`, etc.) — none is named `.env.example`. Separately,
neither `*.env` (requires the name to *end* in `.env`) nor `.env.*` (requires
the name to *start* with `.env.`) matches `chatwoot.env.example` either, so
the example files were never going to be ignored by the two preceding rules
in the first place. The negation on line 24 is therefore dead: it happens to
produce the intended result (examples stay tracked) purely because the rules
above it don't match those filenames, not because the allowlist logic works.
If the `*.env` pattern is ever tightened (e.g. to `*.env*` to also catch
`.env.local`-style variants under `infra/vps/`), the examples would start
being silently ignored again, since the negation still wouldn't match.
**Fix:**
```
!infra/vps/**/*.env.example
```

### WR-04: systemd units have zero hardening directives

**File:** `infra/vps/systemd/prestigo-backup.service`, `infra/vps/systemd/prestigo-monitor.service`
**Issue:** Both `[Service]` blocks contain only `Type`, `ExecStart`, and
timing/niceness settings — no `ProtectSystem=`, `ProtectHome=`,
`PrivateTmp=`, `ProtectKernelTunables=`, `ProtectKernelModules=`,
`RestrictSUIDSGID=`, `NoNewPrivileges=`, or `ReadWritePaths=` scoping.  Both
services necessarily run as root (they call `docker`, read `/etc/prestigo`,
write `/var/backups/prestigo` and `/var/log/prestigo`), so full sandboxing
isn't available, but the standard belt-and-suspenders directives that don't
conflict with those requirements (e.g. `ProtectHome=read-only`,
`ProtectClock=yes`, `ProtectKernelLogs=yes`, `RestrictSUIDSGID=yes`,
`ProtectControlGroups=yes`, `LockPersonality=yes`) are simply absent.
**Fix:** Add the non-conflicting hardening directives to both service files,
e.g.:
```ini
[Service]
...
ProtectHome=read-only
ProtectClock=yes
ProtectKernelLogs=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
LockPersonality=yes
```

### WR-05: backup.sh has no self-check against running on a non-production host, despite the documented drill workflow placing valid restic credentials there

**File:** `infra/vps/scripts/backup.sh:1-184`, `infra/vps/scripts/restic.sh:32`
**Issue:** `restic.sh` hardcodes `--hostname prestigo-vps` on every invocation
(line 32) regardless of the machine it actually runs on, and `backup.sh`
hardcodes `--host prestigo-vps --tag nightly` when creating a snapshot (line
157) and when pruning (line 165-166). The D-09 drill runbook requires copying
the real `/etc/prestigo/backup.env` (with live B2 credentials) onto a
disposable drill host so `restore.sh --phase fetch` can pull a snapshot
(restore.sh:235-236 explicitly requires this file). If `backup.sh` is ever
run by mistake on that same drill host (which now has working restic
credentials for the production repository), it will push a new snapshot
tagged `nightly`/hostname `prestigo-vps` into the **same production B2
repository**, indistinguishable from a genuine nightly backup, and the
following `restic forget --prune` invocation (production or drill-triggered)
would fold it into the same retention rotation — with no code-level signal
that anything unusual happened.
**Fix:** Add a lightweight guard in `backup.sh` (mirroring
`drill-verify.sh`'s pattern), e.g. refuse to run unless `$(hostname)` equals
`prestigo-vps`, or (safer, since a drill host could itself be named
`prestigo-vps` by accident) check for a sentinel file only present on the real
production host (e.g. `/etc/prestigo/.production-host`) created once by
`bootstrap.sh`'s `host_layout` section.

### WR-06: contact_form_e2e.py never closes the results file

**File:** `scripts/qa/contact_form_e2e.py:144`
**Issue:**
```python
json.dump(result, open(RESULTS_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
```
`open(...)` here has no assigned variable and is never closed — a resource
leak, and specifically the anti-pattern called out for Python review ("missing
`with` for file operations"). In CPython the file is *usually* closed
promptly by refcounting, but that's an implementation detail, not a
guarantee, and it also means a write error/exception inside `json.dump`
leaves the handle open indefinitely for the life of the process.
**Fix:**
```python
with open(RESULTS_PATH, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=1)
```

### WR-07: dns-zone-diff.sh silently treats a malformed input file as "no drift"

**File:** `infra/vps/scripts/dns-zone-diff.sh:30-33`
**Issue:**
```bash
flatten() {
  jq -r '.[] | .name as $n | .type as $t | (.records // [])[] | "\($n)|\($t)|\(.content)"' "$1" 2>/dev/null | sort -u
}
```
If `$1` doesn't exist, isn't valid JSON, or doesn't match the expected shape,
`jq`'s error is discarded (`2>/dev/null`) and `flatten` returns an empty
string. Both `BEFORE_TUPLES` and `AFTER_TUPLES` being empty (e.g. because
someone passed the wrong file path for one of the two snapshots) produces
`added=0 removed=0` — the same output as "the zone genuinely didn't change" —
with no way for a caller to distinguish a parse failure from a real
zero-diff result. Given the script's own comment says callers assert only on
the printed `added=`/`removed=` counts (line 16-18), a parse failure here is
silently indistinguishable from "the DNS zone is unchanged," which is exactly
the wrong failure mode for a script whose job is to catch unintended DNS
drift.
**Fix:** Check `jq`'s exit status per file and fail loudly (non-zero exit,
distinct message) before computing the diff, e.g.:
```bash
flatten() {
  jq -r '...' "$1" || { echo "dns-zone-diff: failed to parse $1" >&2; exit 2; }
}
```

### WR-08: restore.sh has no ERR trap, unlike backup.sh/drill-verify.sh in the same phase

**File:** `infra/vps/scripts/restore.sh:41-414`
**Issue:** `backup.sh` (lines 84-90) and `bootstrap.sh` (line 24) both install
a `trap ... ERR` that logs which step was in progress when a command failed.
`restore.sh` has `set -Eeuo pipefail` but no `ERR` trap at all (only
`run_verify_only()` installs an `EXIT` trap, and that's scoped to rehearsal
directory cleanup, not failure reporting). If any step in `run_fetch`/
`run_start`/`run_full` fails, the operator gets bash's default (often
terse/unclear) error output with no `step_start`/`step_end`-consistent "FAILED
at step: X" line, which matters most exactly when this script is being run
under drill-log or disaster-recovery time pressure.
**Fix:** Add the same pattern used in `backup.sh`:
```bash
CURRENT_STEP_NAME="startup"
trap 'echo "[restore] FAILED at step: ${CURRENT_STEP_NAME}" >&2' ERR
```
and set `CURRENT_STEP_NAME` alongside each `step_start` call.

## Info

### IN-01: Redundant exception type in contact_form_e2e.py

**File:** `scripts/qa/contact_form_e2e.py:134`
**Issue:** `except (PWTimeout, Exception) as e:` — `PWTimeout` is a subclass
of `Exception`, so including it in the tuple is a no-op; `except Exception`
alone catches identically. As written it implies to a reader that `PWTimeout`
is handled specially, which it is not.
**Fix:** `except Exception as e:  # noqa: BLE001 -- QA script: never crash mid-run`

### IN-02: EspoCRM daemon can start before the app container finishes readiness setup

**File:** `infra/vps/espocrm/compose.yml:59-70`
**Issue:** `app` (lines 39-57) has no `healthcheck:` block, so `daemon`'s
`depends_on: - app` (line 65, short form) only waits for the `app` container
to *start*, not to finish EspoCRM's own entrypoint readiness work. `db` (by
contrast) does define a healthcheck and `app` correctly waits on
`condition: service_healthy` for it (lines 44-45) — the same pattern isn't
extended to `app` itself for `daemon`'s benefit.
**Fix:** Add a healthcheck to `app` (e.g. `curl -f http://localhost/` or an
EspoCRM-specific readiness endpoint) and change `daemon`'s dependency to
`condition: service_healthy`.

---

_Reviewed: 2026-09-28T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
