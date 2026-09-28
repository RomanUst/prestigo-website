# Phase 76: VPS Infrastructure - Pattern Map

**Mapped:** 2026-09-27
**Files analyzed:** 13
**Analogs found:** 6 / 13 (7 are genuinely new infra-as-code with no in-repo analog — expected for this phase; RESEARCH.md Code Examples cover their shape instead)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `tests/infra-vps-isolation-guard.test.ts` | test | transform (source-read + regex assert) | `tests/rtl-backstop.test.ts` | exact |
| `tests/infra-vps-isolation-guard.test.ts` (matcher-regex sub-pattern) | test | request-response (URL/path matching) | `tests/middleware-matcher.test.ts` | role-match |
| `.husky/pre-commit` (verify it fires on `infra/vps/.env`) | config/guard | event-driven (git hook) | `.husky/pre-commit` (itself, modify-in-place only if scan needs widening) | exact — no change expected |
| `infra/vps/.env.example` | config | file-I/O | `.env.example` (repo root) | role-match |
| `infra/vps/scripts/backup.sh` | utility (shell script) | batch (nightly dump→snapshot→ping) | `lib/qstash.ts` (closest in-repo "fire-and-forget external call with guard + logged failure" pattern, despite language mismatch) | partial |
| `infra/vps/scripts/check-disk-mem.sh` | utility (shell script) | event-driven (cron→conditional ping) | `lib/qstash.ts` (guard-then-call shape only) | partial |
| `infra/vps/scripts/check-sidekiq.sh` | utility (shell script) | event-driven | `lib/qstash.ts` (guard-then-call shape only) | partial |
| `infra/vps/scripts/check-tls-expiry.sh` | utility (shell script) | event-driven | `lib/qstash.ts` (guard-then-call shape only) | partial |
| `infra/vps/scripts/bootstrap.sh` | utility (shell script) | batch (idempotent provisioning) | none | no analog |
| `infra/vps/docker-compose.*.yml` | config | request-response (container networking) | none | no analog |
| `infra/vps/Caddyfile` | config | request-response (reverse proxy) | none | no analog |
| `infra/vps/runbooks/*.md` | documentation | — | none | no analog |
| DNS API call script/session command (`chat`/`crm` A records) | utility (one-off script/session command) | request-response (GET-then-PUT) | `~/.claude/.../memory/project_dns_setup.md` documented pattern (memory file, not repo code) | exact (pattern, not code) |

## Pattern Assignments

### `tests/infra-vps-isolation-guard.test.ts` (test, source-reading guard)

**Analog:** `/Users/romanustyugov/Desktop/Prestigo/tests/rtl-backstop.test.ts` (exact structural match — this repo's established "source-reading vitest backstop" convention)

**Imports pattern** (lines 1-3):
```typescript
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
```

**Helper pattern** (lines 17-19) — reuse verbatim, this is the exact helper the new test needs:
```typescript
function read(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf-8')
}
```

**Core pattern — one `describe` block per concern, plain regex assertions** (lines 21-38 shape):
```typescript
describe('RTL backstop — Nav.tsx chevron + dropdown inset (CR-01 / WR-01)', () => {
  const src = read('components/Nav.tsx')

  it('does not contain an RTL-mirror addend on the account-menu chevron (CR-01)', () => {
    expect(src).not.toMatch(/isRtl/)
  })
})
```
For the new guard test, replace the single-file `read()` call with a small recursive `fs.readdirSync` walk over `app/`, `lib/`, and a direct read of `middleware.ts` (no new `glob` dependency — confirmed `package.json` has no `glob` entry; RESEARCH.md Assumption A3 flags this as the planner's call, and this repo's own convention in `rtl-backstop.test.ts` is zero-dependency `fs`/`path` only, so hand-roll the walk to match). Use `it.each(files)` in the same shape as `tests/middleware-matcher.test.ts` lines 20-30 for the per-file assertion loop:
```typescript
it.each(files)('%s does not reference the VPS subdomains', (file) => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf-8')
  expect(src).not.toMatch(/chat\.rideprestigo\.com|crm\.rideprestigo\.com/)
})
```

**Doc-comment convention** (lines 5-16 of `rtl-backstop.test.ts`) — copy the block-comment style explaining *why* this is source-level only, not a live render:
```typescript
/**
 * Phase 76, D-19(b) — repo guard: no synchronous site code path (app/, lib/,
 * middleware) may call chat.rideprestigo.com or crm.rideprestigo.com. This
 * is a source-reading assertion only (no browser, no live render) — it
 * proves the CODE never wires a synchronous VPS dependency into the public
 * site's request path. The runtime half (real outage test, D-19a) stays a
 * human-verify step documented in the phase runbook.
 */
```

---

### `infra/vps/scripts/*.sh` (utility, event-driven/batch)

**No shell-script analog exists in this repo** (only `.husky/pre-commit`, a POSIX `sh` git hook, and Node `.mjs` scripts under `scripts/`). Nearest conceptual analog for the "guard, then fire-and-forget external call, log/report failure, never crash the caller" shape is `lib/qstash.ts`.

**Analog:** `/Users/romanustyugov/Desktop/Prestigo/lib/qstash.ts`

**Guard-then-call shape to mirror** (lines 3-14, 22-38):
```typescript
// Lazy/guarded external client — checks required env, warns/logs, never throws
if (!process.env.QSTASH_TOKEN) {
  console.warn('[qstash] QSTASH_TOKEN is not set — reminders will not be scheduled')
}
...
// Threshold guard before the external call
if (twoHoursBefore - now < margin) {
  return // skip silently
}
```
Translate to shell for each `infra/vps/scripts/check-*.sh`: check the local condition (disk %, memory, Sidekiq PID, cert `checkend`) → on healthy, `curl` the Healthchecks.io success URL; on breach, `curl .../fail` and `exit 1`; never let the script crash the cron/systemd-timer silently. Use RESEARCH.md's own verified command syntax (Pattern 2 and Pattern 3 in 76-RESEARCH.md, lines 273-310) as the primary source for exact `restic`/`curl`/`openssl` syntax — that research was already cross-checked against restic's official docs this session, so treat it as ground truth for script bodies; `lib/qstash.ts` only supplies the *guard/fire-and-forget/never-throw* shape convention this repo already follows.

**Error handling convention to carry over** (lib/qstash.ts lines 36-39 region): log the specific failure reason to stderr/console before returning/exiting non-zero, so a human reading `journalctl`/cron mail later can diagnose it — matches this repo's `console.error('[qstash] ...')` style, ported to `echo "[backup] ..." >&2`.

---

### `infra/vps/.env.example` (config, file-I/O)

**Analog:** `/Users/romanustyugov/Desktop/Prestigo/.env.example` (repo root)

Use the same convention: every real secret name present with an empty or placeholder value, comments above each var explaining its source/purpose, and the file staged normally (never `.env` itself). This is exactly what `.husky/pre-commit`'s `ENV_FILES` check (below) expects and permits — `.env.example|sample|template` suffixes are the only `.env*` names excluded from the block.

---

## Shared Patterns

### Secret-scan gate (applies to every file under `infra/vps/`)
**Source:** `/Users/romanustyugov/Desktop/Prestigo/.husky/pre-commit` (full file read this session — 51 lines, unmodified expected)
**Apply to:** every new file under `infra/vps/`, especially `.env.example`, backup scripts, and runbooks that might paste example credentials.

Two independent checks already cover `infra/vps/` with zero modification needed:
```sh
# 1. Blocks any staged .env* file except .example/.sample/.template
ENV_FILES=$(git diff --cached --name-only --diff-filter=ACMR \
  | grep -E '(^|/)\.env' \
  | grep -vE '\.env\.(example|sample|template)$' \
  || true)

# 2. Blocks added lines matching live-credential shapes (Stripe, Resend,
#    Anthropic, Google, Supabase JWT, private keys) anywhere in the diff
SECRET_RE='sk_live_[0-9A-Za-z]{10,}|sk_test_[0-9A-Za-z]{20,}|rk_live_[0-9A-Za-z]{10,}|whsec_[A-Za-z0-9]{20,}|re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{10,}|sk-ant-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|eyJhbGciOi[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}|BEGIN [A-Z ]*PRIVATE KEY'
```
**Action for the planner:** add a task to stage a dummy `infra/vps/.env` with a fake `sk_live_...`-shaped value and confirm the commit is rejected, before relying on this gate for real secrets (RESEARCH.md's own Security Domain table flags this as an explicit verification step — "verify it fires on a test file under `infra/vps/` before relying on it"). This does not require modifying `.husky/pre-commit` — the existing regexes already match by path/content, not by directory allowlist.

### Source-reading vitest guard convention
**Source:** `/Users/romanustyugov/Desktop/Prestigo/tests/rtl-backstop.test.ts`, `/Users/romanustyugov/Desktop/Prestigo/tests/middleware-matcher.test.ts`
**Apply to:** `tests/infra-vps-isolation-guard.test.ts` only (the one code file this phase adds to the Next.js app tree).

Both existing files establish: no browser, no live render, no network — `fs.readFileSync` + regex `expect().toMatch()/.not.toMatch()`, one `describe` per concern, doc-comment stating explicitly what the test does and does NOT prove (the "does not prove X, that's a human-verify step" framing is a strong repo convention — copy it verbatim in intent for the D-19(a)/D-19(b) split).

### Fire-and-forget guarded external call
**Source:** `/Users/romanustyugov/Desktop/Prestigo/lib/qstash.ts`
**Apply to:** all four `infra/vps/scripts/check-*.sh` and `backup.sh` (conceptually, ported to shell) — check preconditions, never let a missing/failed dependency crash silently, log a clear diagnostic string, and only report success after the real work succeeded (mirrors `lib/qstash.ts`'s "ping only after everything else succeeded" pattern, which is also literally what D-03 locks for the Healthchecks.io ping timing).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `infra/vps/docker-compose.chatwoot.yml`, `docker-compose.espocrm.yml`, `docker-compose.caddy.yml` | config | request-response | No Docker/Compose files exist anywhere in this repo (Vercel-deployed Next.js app has no containers) — use RESEARCH.md Architecture Patterns (Pattern 1, lines 258-271 of 76-RESEARCH.md) and the official Chatwoot/EspoCRM production Compose files as the source instead |
| `infra/vps/Caddyfile` | config | request-response | No reverse-proxy config exists in-repo (Vercel's edge replaces this role for the main site) — use RESEARCH.md's verified Caddyfile shape (76-RESEARCH.md lines 262-271) |
| `infra/vps/scripts/bootstrap.sh` | utility | batch | No idempotent host-provisioning script exists in-repo — use RESEARCH.md's "Installation" shape (76-RESEARCH.md lines 150-160) and standard `ufw`/`fail2ban`/`unattended-upgrades` idempotent-install conventions |
| `infra/vps/runbooks/*.md` | documentation | — | No runbook-style ops docs exist in-repo (closest is user's own memory files, which are not repo-tracked) — structure freely per CONTEXT.md's "Runbook structure and file names inside `infra/vps/` [is] Claude's discretion" |
| `infra/vps/systemd/*.timer` or crontab entries | config | event-driven | No systemd-timer or crontab files exist in-repo — standard `systemd-timer`/cron syntax from RESEARCH.md, no project-specific convention to match |

## Metadata

**Analog search scope:** `tests/`, `.husky/`, `lib/`, `scripts/`, repo root (`.env.example`)
**Files scanned:** `tests/rtl-backstop.test.ts` (full), `tests/middleware-matcher.test.ts` (full), `.husky/pre-commit` (full, 51 lines), `lib/qstash.ts` (first 40 lines), `package.json` (grepped for `glob`), repo root `.env*` listing
**Pattern extraction date:** 2026-09-27
**Tracked-source gate:** All analog paths above confirmed via `git ls-files` this session — `.husky/pre-commit`, `lib/qstash.ts`, `tests/middleware-matcher.test.ts`, `tests/rtl-backstop.test.ts` all printed as tracked. No gitignored mirror paths involved (no `.gsd/capabilities/` mirrors exist for this repo's tracked tree).
