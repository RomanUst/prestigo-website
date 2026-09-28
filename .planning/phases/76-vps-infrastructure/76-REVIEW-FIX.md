---
phase: 76-vps-infrastructure
fixed_at: 2026-09-28T19:05:00Z
review_path: .planning/phases/76-vps-infrastructure/76-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 76: Code Review Fix Report

**Fixed at:** 2026-09-28T19:05:00Z
**Source review:** .planning/phases/76-vps-infrastructure/76-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 11 (CR-01..03, WR-01..08 — IN-01/IN-02 out of scope per `fix_scope: critical_warning`)
- Fixed: 11
- Skipped: 0

All fixes were deployed to the production VPS (`ssh prestigo-vps`) and verified live: both
hardened systemd services started successfully, `restore.sh`'s new production interlock was
proven to actually refuse `--drill` and `--full` on the live host, `smoke.sh` (13/13),
`tests/infra-vps-isolation-guard.test.ts` (24/24), and the extended `secret_gate_probe.sh` (6/6)
all pass. See "Verification environment" and "Notable discovery" below for one important
environmental correction made during verification.

## Fixed Issues

### CR-01: restore.sh has no production-host safety interlock for --drill/--full

**Files modified:** `infra/vps/scripts/restore.sh`, `infra/vps/runbooks/backup-restore.md`, `infra/vps/runbooks/restore-drill.md`
**Commit:** `6209b4d4`
**Applied fix:** Added the same hostname guard `drill-verify.sh` already uses. `--drill` is now
always refused when `hostname` is `prestigo-vps` (no override — disposable-host only). `--full`
is refused on `prestigo-vps` unless `--i-understand-this-overwrites-production` is also passed,
so a fresh replacement host (the normal disaster-recovery case) is never blocked while an
accidental invocation on the live host is. Documented in both restore runbooks.
**Live verification:** `sudo /opt/prestigo/scripts/restore.sh --drill --phase fetch` on production
printed `refusing --drill on hostname prestigo-vps (production) ...` and exited 1.
`sudo /opt/prestigo/scripts/restore.sh --full` (no override) printed `refusing --full on hostname
prestigo-vps (production) without --i-understand-this-overwrites-production ...` and exited 1.
Neither command touched any file or container. The override flag was **not** invoked, per
instructions.

### CR-02: restore.sh swallows the Postgres restore's exit code, then reports PASS regardless

**Files modified:** `infra/vps/scripts/restore.sh`
**Commit:** `8c2b85c7`
**Applied fix:** Replaced `docker exec ... pg_restore ... || true` with an explicit exit-code
check that prints a `FAIL start-chatwoot-db-restore-dump` line and exits 1 on any pg_restore
error, instead of silently continuing into `run_start()`'s remaining steps / `run_full()`'s final
`PASS full` line.
**Verification:** `bash -n` clean; logic re-read against the surrounding step_start/step_end
structure — the check now sits exactly where the swallowed error used to be, with an early
`exit 1` on failure. Not exercised live (would require an intentionally-corrupted dump on
production, which is out of scope for this session).

### CR-03: drill-verify.sh's set -e pitfall is unfixed everywhere except the one call site that broke in production

**Files modified:** `infra/vps/scripts/drill-verify.sh`
**Commit:** `e8d7865a`
**Applied fix:** Added a `try_sql` helper (wraps a `cw_psql`/`espo_sql` assignment in
`set +e`/`set -e`, converts a failure into a `sql-error-<VAR>` FAIL record instead of a hard
abort) and routed every remaining unguarded DB-touching assignment through it — the 9 Chatwoot
counts, 4 orphan checks, the display-id-sequence check, all 6 canary-lookup assignments, the 5
EspoCRM counts/checks, the 4 EspoCRM canary-lookup assignments, and the functional-insert block's
`CANARY_INBOX_ID`/`PREV_MAX_DID` lookups (two additional call sites beyond the ~15 the review
enumerated by line range, found by exhaustively grepping every remaining `cw_psql`/`espo_sql`
assignment after the listed ones were fixed). Also coerced empty (failed) count values to JSON
`null` in the final `jq -n --argjson` result assembly — without this, a failed `try_sql` call
leaving a count as `""` would make the JSON-assembly step itself abort under `set -e` (since `jq
--argjson` rejects an empty string as invalid JSON), defeating the whole fix's purpose. Also
applied the WR-01 `MYSQL_PWD`-via-env pattern to `espo_sql` while touching this function.
**Verification:** Isolated a minimal reproduction of the `try_sql` helper's control flow under
`set -Eeuo pipefail` and confirmed a failing DB call records a `FAIL` line and the script reaches
its end (`FAILED=1`, script exit 1, not an unexplained abort). `bash -n` clean.

### WR-01: secrets passed via docker exec -e VAR=value / curl -H "token" argv

**Files modified:** `infra/vps/scripts/backup.sh`, `infra/vps/scripts/restore.sh`, `infra/vps/scripts/seed-drill-canary.sh` (drill-verify.sh's `espo_sql` was fixed alongside CR-03)
**Commit:** `6b0ecb80`
**Applied fix:** `docker exec`: switched to `VAR="${value}" docker exec -e VAR ...` (no inline
value) so Docker forwards the secret from the `docker` client's own process environment instead
of embedding it in argv — matches `monitor.sh`'s existing `REDISCLI_AUTH` pattern. `curl`:
`seed-drill-canary.sh`'s Chatwoot bearer token and EspoCRM API key are now written into 0600 temp
files and passed via `-H @file`, removed by a new `EXIT` trap (`cleanup_seed_tmp_files`).
**Verification:** `bash -n` clean on all three files.

### WR-02: pre-commit's secret-shape regex doesn't cover Phase 76 VPS secret types

**Files modified:** `.husky/pre-commit`, `scripts/qa/secret_gate_probe.sh`
**Commit:** `70671b8a`
**Applied fix:** Added Backblaze B2 application key / UptimeRobot / Healthchecks shapes to
`SECRET_RE`. Added a second, independent check that derives the sensitive `KEY=` name list
directly from the five `infra/vps/env/*.env.example` files (any name containing
`PASSWORD`/`SECRET`/`_KEY`/`TOKEN` — 13 names) and blocks any added line elsewhere assigning one
of those names a real-shaped, non-empty value. A bare 64-hex-char heuristic (suggested as one
option in the review) was **not** added — `git grep` against the current HEAD tree found 4,419
matches (mostly `i18n/translation-manifest.json` SHA-256 checksums), which would have made the
hook fail on ordinary i18n work; the review's fix text explicitly gated this option on "ONLY if
they can be matched without false positives on the existing repo", so it was dropped in favor of
the explicit-KEY-name approach, refined to require the value's first character not be a
quote/slash/dollar/brace (excludes this repo's own `grep '^KEY='` / `awk '/^KEY=/'` /
`KEY=${var}` template idioms, verified zero false positives against the current HEAD tree with
both the old and refined pattern).
**Verification:** Extended `secret_gate_probe.sh` with 3 new probes (B2 key shape, a real-shaped
`POSTGRES_PASSWORD=` value in a non-.env `.md`, and a regression guard proving the `grep
'^KEY='`-style false positive stays allowed) — all secret shapes assembled at runtime from
fragments, never a literal in any tracked file. `sh scripts/qa/secret_gate_probe.sh` → 6/6
PROBEs pass (exit 0).

### WR-03: .gitignore's .env.example negation never matches anything

**Files modified:** `.gitignore`
**Commit:** `baecb425`
**Applied fix:** `!infra/vps/**/.env.example` → `!infra/vps/**/*.env.example`.
**Verification:** `git check-ignore infra/vps/env/backup.env` → matched, exit 0 (ignored).
`git check-ignore infra/vps/env/chatwoot.env.example` → no output, exit 1 (not ignored, i.e.
tracked). Also proved in an isolated scratch repo that under a hypothetically tightened
`*.env*` base rule, the *old* negation still failed to protect the examples (exit 0/ignored)
while the *new* negation correctly protects them (exit 1/not ignored) — this is the latent
regression the finding described.

### WR-04: systemd units have zero hardening directives

**Files modified:** `infra/vps/systemd/prestigo-backup.service`, `infra/vps/systemd/prestigo-monitor.service`
**Commit:** `c8ae49d6`
**Applied fix:** Added `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`, `ProtectHome=read-only`,
`ProtectClock`, `ProtectKernelLogs`, `ProtectKernelModules`, `ProtectKernelTunables`,
`ProtectControlGroups`, `RestrictSUIDSGID`, `LockPersonality` to both units. `ProtectSystem=full`
(rather than `strict`) was chosen deliberately: both scripts only ever *read* `/etc/prestigo` and
write under `/var`/`/run` (dump dir, lock file, mem-usage log, docker.sock) — `full` makes
`/usr`/`/boot`/`/etc` read-only without needing any `ReadWritePaths=` entries, which is lower-risk
than hand-enumerating every path `strict` would require.
**Live verification:** `systemd-analyze verify` on the production VPS reports zero warnings for
both units. `sudo systemctl start prestigo-backup.service` → `Result=success` (produced a real
restic snapshot). `sudo systemctl start prestigo-monitor.service` → `Result=success` (all 6
checks logged OK: disk_mem, kvm4_trigger, sidekiq, espocrm_internals, tls_expiry, apps_http).

### WR-05: backup.sh has no self-check against running on a non-production host

**Files modified:** `infra/vps/scripts/backup.sh`, `infra/vps/runbooks/host-bootstrap.md`
**Commit:** `14df4bc9`
**Applied fix:** Added a guard that refuses to run unless `hostname` is `prestigo-vps`, with an
`--i-understand-this-is-not-the-production-host` override for a deliberate manual run from a
non-standard host — mirrors `drill-verify.sh`'s existing convention and CR-01's override pattern.
**Live verification:** see "Notable discovery" below — this fix's live verification surfaced that
the production VPS's own `hostname` did not actually equal `prestigo-vps`, which would have made
this guard (and CR-01's, and drill-verify.sh's *pre-existing* one) permanently refuse/no-op in
reality. Corrected live (see below) and confirmed `sudo systemctl start prestigo-backup.service`
→ `Result=success` afterward.

### WR-06: contact_form_e2e.py never closes the results file

**Files modified:** `scripts/qa/contact_form_e2e.py`
**Commit:** `44f508a4`
**Applied fix:** `json.dump(result, open(RESULTS_PATH, "w", ...), ...)` → `with open(...) as f:
json.dump(result, f, ...)`.
**Verification:** `python3 -c "import ast; ast.parse(...)"` clean.

### WR-07: dns-zone-diff.sh silently treats a malformed input file as "no drift"

**Files modified:** `infra/vps/scripts/dns-zone-diff.sh`
**Commit:** `dea8e89c`
**Applied fix:** `flatten()` now checks the input file exists, lets `jq`'s own error reach
stderr, and checks `jq`'s exit status via `${PIPESTATUS[0]}` (the script has no `set -o
pipefail`, so testing the `jq | sort -u` pipeline directly would only ever see `sort`'s exit
status). Exits 2 with a distinct message on either failure instead of returning an empty tuple
set.
**Verification:** Ran all 4 scenarios locally: missing file → `exit=2` with a clear message;
invalid JSON → `exit=2`, jq's parse error printed; valid input with no drift → `added=0
removed=0`, `exit=0` (unchanged behavior); valid input with drift → correct `+`/`-` lines and
counts, `exit=0`. No-argument usage case still prints the usage line and `added=0 removed=0`,
`exit=0` (unchanged).

### WR-08: restore.sh has no ERR trap

**Files modified:** `infra/vps/scripts/restore.sh`
**Commit:** `482a1b6b`
**Applied fix:** Added `CURRENT_STEP_NAME` + `trap '... FAILED at step: ${CURRENT_STEP_NAME}' ERR`,
set inside `step_start()` itself (not at each of the ~15 call sites individually) so every
existing and future step is covered automatically.
**Verification:** Isolated repro under `set -Eeuo pipefail` confirmed the trap fires with the
correct step name and the script still exits non-zero afterward (normal `set -e` propagation).
`bash -n` clean.

## Skipped Issues

None — all 11 in-scope findings were fixed.

## Notable discovery (outside REVIEW.md's findings, surfaced by live verification)

While verifying CR-01 and WR-05 live on the production VPS, the guard code (and
`drill-verify.sh`'s **pre-existing** hostname guard) turned out to be non-functional in reality:
the production host's actual OS `hostname` was `srv2015189` (Hostinger's provider-assigned
default), never `prestigo-vps` — nothing in `bootstrap.sh` ever sets it, and `bootstrap.sh` is
shared verbatim with the disposable D-09 drill host, so it must never set it unconditionally
(that would make the drill host also report `prestigo-vps` and break `drill-verify.sh --drill`'s
own guard). `prestigo-vps` is only ever an SSH config `Host` alias, not the machine's real
hostname.

Deploying WR-05's guard as literally specified would have **broken the nightly backup timer
immediately** (the guard would refuse every run, since hostname never matched), and CR-01's
guard would have silently provided zero protection.

Corrected via `sudo hostnamectl set-hostname prestigo-vps` on the production VPS (a live,
reversible `sethostname()` call — no reboot, no service restart; confirmed via SSH that all 8
containers and both public health checks were unaffected before and after). Documented as a new,
production-only manual step in `infra/vps/runbooks/host-bootstrap.md` (commit `14df4bc9`),
including a caveat that this host's cloud-init has `preserve_hostname: false`, so a future reboot
could theoretically revert it — flagged as a follow-up for the user, not corrected in this
session (out of scope: changing boot-time cloud-init configuration was judged too consequential
to do unilaterally as part of an automated review-fix pass).

**Recommended follow-up for the user:** after any future reboot of the production VPS, confirm
`hostname` still prints `prestigo-vps` (`ssh prestigo-vps hostname`); if not, re-run the
`hostnamectl set-hostname prestigo-vps` command in `runbooks/host-bootstrap.md`, and consider
setting `preserve_hostname: true` in `/etc/cloud/cloud.cfg` to make it permanent.

## Verification environment

All syntax checks (`bash -n` / `python3 -c "import ast..."` / `sh -n`) ran locally in the
isolated git worktree. `systemd-analyze verify`, `systemctl start ...` (both services),
`restore.sh --verify-only`/`--drill`/`--full` refusal checks, and `smoke.sh` all ran **live on
the production VPS** (`ssh prestigo-vps`) after a full deploy (`rsync infra/vps/ →
/opt/prestigo/`, `DEPLOYED_SHA` written, changed systemd units copied to
`/etc/systemd/system/` + `daemon-reload`) at commit `482a1b6b` (this fix session's tip).
`tests/infra-vps-isolation-guard.test.ts` (24/24) ran in the main checkout (its scan scope —
`app/`, `components/`, `lib/`, `i18n/`, `middleware.ts` — is untouched by this session's changes,
so the main checkout and the worktree are equivalent for this specific test). `secret_gate_probe.sh`
(6/6) ran in the worktree (pure shell, no `node_modules` dependency).

**Reproducibility note:** the worktree at
`.claude/worktrees/rf-76-4728-1790591197` is removed by this agent's cleanup tail after this
report is written; the `tests/infra-vps-isolation-guard.test.ts` and `secret_gate_probe.sh`
results above are reproducible from `main` once these commits land there (the worktree branch is
fast-forward-merged into `main` as part of cleanup). The live-VPS verification results (systemd
services, `restore.sh` refusals, `smoke.sh`) are point-in-time and not re-derivable from either
tree without SSH access to `prestigo-vps`.

---

_Fixed: 2026-09-28T19:05:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
