# Phase 80: EspoCRM Deployment + Core Entities - Pattern Map

**Mapped:** 2026-10-11
**Files analyzed:** 27 new/modified
**Analogs found:** 25 / 27 (2 without analog: overlay JSON, backfill/seed data tools are role-match only)

All analog paths below were verified git-tracked (`git ls-files`). No mirror paths used.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `infra/espocrm/lib/client.mjs` | utility (API client) | request-response | `infra/chatwoot/lib/client.mjs` | exact |
| `infra/espocrm/sync.mjs` | service (config-as-code) | CRUD, read-then-diff | `infra/chatwoot/sync.mjs` | exact |
| `infra/espocrm/lib/enum-merge.mjs` | utility (pure) | transform | `subsetEqual` / `planCollection` in `infra/chatwoot/sync.mjs` | role-match |
| `infra/espocrm/lib/booking-map.mjs` | utility (pure) | transform | `expandAutomationRules` / `resolveRefs` (pure exported helpers) in chatwoot `sync.mjs` | role-match |
| `infra/espocrm/lib/candidates.mjs` | utility (pure) | transform | same | role-match |
| `infra/espocrm/backfill.mjs` | service (CLI, batch) | batch, dry-run | `infra/chatwoot/sync.mjs` (`runSync`, `readOnlyClient`, `parseArgs`, `main`) | role-match |
| `infra/espocrm/account-candidates.mjs` | CLI | batch/transform | `infra/chatwoot/inspect.mjs` (read-only, counts-only output) | role-match |
| `infra/espocrm/seed-accounts.mjs` | CLI | CRUD | chatwoot `sync.mjs` `syncLabels` | role-match |
| `infra/espocrm/verify-acl.mjs` | CLI (live probe) | request-response | `infra/chatwoot/inspect.mjs` (exit 0/1/2 contract) | role-match |
| `infra/espocrm/entities.json`, `fields.json`, `enums.json`, `roles.json`, `settings.json`, `layouts/*.json` | config | declarative | `infra/chatwoot/teams.json`, `labels.json`, `custom-attributes.json` | role-match |
| `infra/espocrm/overlay/CBooking.entityDefs.json` | config (metadata overlay) | one-time VPS | none (pattern from EspoCRM core `User.json`, see RESEARCH Pattern 5) | no analog |
| `infra/espocrm/README.md` | docs | n/a | `infra/chatwoot/README.md` | exact |
| `infra/vps/runbooks/crm-operators.md` | runbook | n/a | `infra/vps/runbooks/whatsapp.md`, `chatwoot-channels.md` | exact |
| `tests/espocrm-sync.test.ts` (+ optional `tests/helpers/fake-espocrm.ts`) | test | fake API | `tests/chatwoot-sync.test.ts` | exact |
| `tests/espocrm-backfill.test.ts` | test | fake API + fixtures | `tests/chatwoot-sync.test.ts` | role-match |
| `tests/espocrm-candidates.test.ts` | test | pure | `tests/chatwoot-config.test.ts` (pure fn + config invariants) | role-match |
| `tests/espocrm-roles.test.ts` | test | config invariants | `tests/chatwoot-config.test.ts` | exact |
| `tests/crm-runbook.test.ts` | test | doc guard | `tests/whatsapp-runbook.test.ts` | exact |
| `tests/infra-vps-isolation-guard.test.ts` | test (unchanged, must stay green) | source scan | itself | n/a |
| `components/admin/BookingsTable.tsx` (D-18, modify) | component | request-response | itself, lines 1052-1081, 1242-1264 | exact |
| `tests/BookingsTable.test.tsx` (D-18, extend) | test | component | itself (lines 587-700 horizon tests) | exact |
| `.gitignore` (add `infra/espocrm/.work/`) | config | n/a | `.gitignore` lines 18-24 (`infra/vps/**/*.env`) | exact |

## Pattern Assignments

### `infra/espocrm/lib/client.mjs` (utility, request-response)

**Analog:** `infra/chatwoot/lib/client.mjs` (189 lines). Copy structure; change auth.

**Env loading, no secrets in argv** (lines 21-27, 59-108): `parseEnvFile`, `loadXConfig({env, filePath, readFile})` reading `KEYS` from env first, then `~/.config/prestigo/espocrm-api.env`; throws `XConfigError` on missing key, non-https URL. Keys per RESEARCH Pattern 1: `ESPOCRM_BASE_URL`, `ESPOCRM_API_KEY` (data identity), `ESPOCRM_ADMIN_USER`, `ESPOCRM_ADMIN_PASSWORD` (config identity). Per D-17 files are `~/.config/prestigo/espocrm-*.env` (mode 600); make the identity (admin vs apikey) a parameter so each key group is only required for its own mode.

```js
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
export const DEFAULT_ENV_FILE = path.join(os.homedir(), '.config', 'prestigo', 'chatwoot-api.env')
export class ChatwootConfigError extends Error { constructor(message){ super(message); this.name='ChatwootConfigError' } }
export class ChatwootApiError extends Error {
  constructor(method, apiPath, status, body) {
    super(`${method} ${apiPath} -> ${status}${body ? ` ${body}` : ''}`)
    ...
```

**Redactor + error class** (lines 110-125): `makeRedactor(token)` splits the secret out of echoed bodies and truncates to 300 chars. Redact API key, password, and the token from `GET /App/user`.

**Core send with timeout and no redirects** (lines 150-175):
```js
res = await fetchImpl(resolveUrl(apiPath), {
  method,
  headers: { [AUTH_HEADER]: token, Accept: 'application/json', ...headers },
  body,
  redirect: 'error',                  // header must not leave the instance
  signal: AbortSignal.timeout(timeoutMs),
})
...
const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
throw new ChatwootApiError(method, apiPath, 0, timedOut ? `request timed out after ${timeoutMs} ms` : redact(...))
...
if (!res.ok) throw new ChatwootApiError(method, apiPath, res.status, redact(text))
```
**Deviations for EspoCRM:** headers are `X-Api-Key` (apikey mode) or `Espo-Authorization: base64(user:token)` after a single `GET /App/user` Basic exchange (admin mode); timeout 120_000 for admin calls (chatwoot uses 30_000); base path `/api/v1`; strictly sequential requests; on 401 throw immediately, never retry (EspoCRM IP ban, D-17). Return `{request(method, path, body)}` like chatwoot's client object.

---

### `infra/espocrm/sync.mjs` (service, read-then-diff CRUD)

**Analog:** `infra/chatwoot/sync.mjs` (918 lines).

**Header comment/output contract** (lines 1-34): usage line, resource order, per-resource line `<resource>: create=N update=N unchanged=N skipped=N deleted=N`, `summary: create=N update=N skipped=N`, exit codes 0 ok / 1 config / 2 API. Second run must print `create=0 update=0` for every resource (phase gate).

**Imports/paths** (lines 29-43):
```js
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')
export const RESOURCE_ORDER = ['account', 'labels', 'teams', ...]   // EspoCRM: settings, entities, links, fields, enums, layouts, roles, tabs
```

**Pure helpers to copy verbatim** (export for tests): `planCollection({desired, existing, keyOf, differs})` (lines 51-60) and `subsetEqual(want, have)` (lines 70-86; extra server keys ignored, arrays of `{name}` matched by name). RESEARCH Pattern 2 says to use `subsetEqual` against `GET /Metadata/action/get?key=...`.

**Context + dry-run guard** (lines 283-346): `readOnlyClient(client)` throws on any non-GET; `makeContext` exposes `mutate()` that no-ops when `dryRun`, `read(...parts)` for JSON, `list()`. Copy as is.
```js
function readOnlyClient(client) {
  return { ...client, request(method, apiPath, body) {
    if (method !== 'GET') throw new Error(`dry-run refused ${method} ${apiPath}`)
    return client.request(method, apiPath, body) } }
}
```

**Per-resource handler shape** (lines 384-413, `syncLabels`): desired from JSON, existing from API, `planCollection`, loop `[create]`/`[update]` log lines, `ctx.mutate(...)`, `counts.unchanged = plan.unchanged.length`. Use for entities, links, fields, roles (roles match by `name`, `PUT /Role/:id`).

**Driver and CLI** (lines 832-918): `runSync({client, only, dryRun, log, configDir})` validates `--only`, iterates `RESOURCE_ORDER`, totals; `parseArgs(argv)`; `main` maps `ApiError` to exit 2, `ConfigError` to exit 1; `isMainModule` guard via `import.meta.url === pathToFileURL(process.argv[1]).href`. Copy.

**EspoCRM-specific (not in analog; take from RESEARCH Patterns 2-5):** `C` prefix for custom entities (`CBooking`, `CPartnerRate`), lowercase `c` prefix for fields on stock scopes, enum merge (never delete owner-added values; D-20 `retire` only unused stock values; keep stored `Closed Won`/`Closed Lost`), `settings.json` subset-merge (never overwrite SMTP/2FA keys), Booking read-only through role ACL not `readOnly:true`.

---

### `infra/espocrm/lib/enum-merge.mjs`, `booking-map.mjs`, `candidates.mjs` (pure transforms)

**Analog:** exported pure helpers in `infra/chatwoot/sync.mjs` (`planCollection`, `subsetEqual`, `resolveRefs`, `expandAutomationRules`, `isValidWindowDelay`) which are imported directly by tests. Pattern: no I/O, named exports, tested with plain inputs. Core snippets are in RESEARCH (Pattern 3 `mergeEnumOptions`, Code Examples `normalizeEmail`, `isAbandonedCheckout`, Pattern 6 SQL, Pattern 7 free-mail list).

Project-specific facts to pin: `lib/currency.ts` lines 1-2 `EUR_TO_CZK_RATE = 25`, `CZK_TO_EUR_RATE = 0.04`, `czkToEur = Math.round(czk * 0.04)`; add a vitest that reads `lib/currency.ts` and asserts the duplicated constants. Enum values verbatim from `supabase/migrations/053_unpaid_booking_status.sql` (status), `039_gnet_bookings.sql` (booking_source), `types/booking.ts` (`VehicleClass`, `TripType`).

---

### `infra/espocrm/backfill.mjs`, `seed-accounts.mjs`, `account-candidates.mjs`, `verify-acl.mjs` (CLI)

**Analog (structure):** `infra/chatwoot/sync.mjs` CLI section (lines 875-918) and `infra/chatwoot/inspect.mjs` (header lines 1-30: read-only, prints ids/counts/booleans only, never names/emails/bodies, exit 0/1/2).

Copy: `parseArgs` throwing `ConfigError` on unknown arguments, `--dry-run` via `readOnlyClient`, `isMainModule` guard, counts-only logging (`contacts: create=N unchanged=N`, `bookings: create=N update=N unchanged=N`, `excluded_abandoned=N`). Backfill uses the `apikey` identity of the client; seed only creates entries with `confirm:true` (D-14); canary Account "Restore Drill Canary" excluded everywhere. PII work files go to `infra/espocrm/.work/` (git-ignored).

---

### JSON config (`entities.json`, `fields.json`, `enums.json`, `roles.json`, `settings.json`)

**Analog:** `infra/chatwoot/teams.json` — flat, human-diffable, top-level array under a resource key:
```json
{ "teams": [
  { "name": "Bookings", "description": "...", "allow_auto_assign": false, "members": ["@owner"] },
  { "name": "B2B", "description": "...", "allow_auto_assign": false, "members": ["@owner"] } ] }
```
Note team names are `Bookings` / `B2B` (capitalised), not lowercase as in D-15 text. Tag every commercial field in `fields.json` with `"commercial": true` so `roles.json` Dispatcher `fieldData` can be validated/generated from it (RESEARCH Pattern 8).

---

### `tests/espocrm-sync.test.ts` (test, fake API)

**Analog:** `tests/chatwoot-sync.test.ts` (925 lines).

**Header and imports** (lines 1-31): `// @vitest-environment node` (default env is jsdom), `/* eslint-disable @typescript-eslint/no-explicit-any */`, import client + `runSync` + pure helpers from `../infra/...`.

**Fake API** (lines 32-231): `createFakeChatwoot(options)` with in-memory state, `requests` log, 401 on wrong token header, JSON `Response` objects, `fetchImpl` passed to the client. Build `createFakeEspoCRM` the same way: metadata map, admin-only enforcement (API user gets 403 on `/Admin/*`, `/EntityManager/*`, `/Role`), `X-Api-Key` check.

**Helpers** (lines 232-259): `makeClient(fake)`, `collectLog()`, `sync(fake, opts)` returning log lines.

**Client tests to mirror** (lines 381-428): header assertion, `redirect === 'error'` and `signal instanceof AbortSignal`, stalled request rejects with `ApiError` matching `/timed out/`, error message never contains the secret. Add: 401 aborts without retry (one request only).

**Idempotency tracer** (lines 469-506):
```ts
const first = await sync(fake, { only: ['labels'] })
expect(first).toContain('labels: create=13 update=0 unchanged=0 skipped=0 deleted=0')
const second = await sync(fake, { only: ['labels'] })
expect(second).toContain('labels: create=0 update=0 unchanged=13 skipped=0 deleted=0')
```
plus drift-update test, operator-made items untouched (use for owner-added enum values / renamed labels surviving), `--dry-run` issues only GET, unknown `--only` rejected.

---

### `tests/espocrm-roles.test.ts`, `tests/espocrm-candidates.test.ts` (config invariants)

**Analog:** `tests/chatwoot-config.test.ts` — reads JSON from `process.cwd()/infra/chatwoot`, pure `findForbiddenContent(text)` checks, `it.each` over entries. Invariants required by RESEARCH Validation: Dispatcher has `Opportunity: false`, `CPartnerRate: false`, every `commercial:true` field hidden; CBooking create/edit/delete `no` for both human roles; Sync writer is the only non-admin writer; stage list has 7 labels and keeps `Closed Won`/`Closed Lost`.

---

### `infra/vps/runbooks/crm-operators.md` + `tests/crm-runbook.test.ts`

**Analog:** `infra/vps/runbooks/whatsapp.md` and `tests/whatsapp-runbook.test.ts`.

Guard test pattern (lines 1-70, 93-139): `RUNBOOK_REL` constant, `fs.readFileSync`, `parseSections()` that ignores headings inside ``` fences, `REQUIRED_HEADINGS` array:
```ts
it.each(REQUIRED_HEADINGS)('has "%s" exactly once', (h) => { expect(parsed.all.filter(s => s.heading === h)).toHaveLength(1) })
it.each(REQUIRED_HEADINGS)('"%s" is followed by a non-empty, non-heading line', ...)
it('lists the required headings in the specified order', ...)
it('names the recovery and operating tools it depends on', () => { for (const needle of [...]) expect(text, `runbook must mention ${needle}`).toContain(needle) })
```
Needles for this phase: `sync.mjs`, `backfill.mjs`, `verify-acl.mjs`, `--dry-run`, `espocrm-api.env`, `Personal Email Account`, `roman@rideprestigo.com`, `Skip` filter, `fetchSince`, `Dispatcher`, `Sales manager`, teams `Bookings` / `B2B`. Add negative assertions (no secret patterns, never "Group Email Account" as the chosen path). Also see `infra/vps/runbooks/chatwoot-channels.md` lines 80-91 (never use info@, bookings@, roman@ as an agent email) which the new runbook must cite.

---

### `components/admin/BookingsTable.tsx` (D-18, modify) and `tests/BookingsTable.test.tsx`

**Analog:** the file itself. `BookingsTable` has no `useSearchParams`; `search` is `useState('')` (line 1061), `horizon` is `useState<string>(defaultHorizon)` (line 1073), `debouncedSearch` seeds `''` (line 1081). Fetch builder (lines 1256-1272) sends `search` and `horizon`; `/api/admin/bookings` accepts `search` (route.ts line 233) and the `admin_search_bookings` RPC matches `b.booking_reference ILIKE` (migration 054 line ~78), so no API change is needed.

**Change shape:** read `?search=` once on mount (initialize `search`, `debouncedSearch` and force `horizon` to `'all'` when present). Constraints:
- `app/(internal)/admin/(dashboard)/bookings/page.tsx` lines 28-48 gate the mount until settings load, so initial-state seeding (`useState(() => ...)`) works on first render; keep that gate intact.
- Existing tests assert `horizon=future` on default render and that the segmented control never PATCHes settings (tests lines 587-700); the deep-link path must not alter those. Add tests next to them: with `?search=PRG-...` the first fetch URL contains `search=PRG-...` and `horizon=all`; without it behaviour is unchanged.
- No new user-visible strings (CLAUDE.md i18n rule). Admin routes are non-localised.
- Do not add any `crm.rideprestigo.com` or `ESPOCRM_*` reference here (isolation guard). The CRM-side link (`adminLink` field, built as `https://rideprestigo.com/admin/bookings?search=<ref>`) is built in `infra/espocrm/lib/booking-map.mjs`.
- Treat `search` param as untrusted input: it only flows to the existing server-side sanitised search, plus length-cap it.

---

### `.gitignore`

Existing pattern (lines 18-24):
```
# Phase 76 infra/vps secrets ...
infra/vps/**/*.env
infra/vps/**/.env.*
!infra/vps/**/*.env.example
```
Add `infra/espocrm/.work/` and `infra/espocrm/**/*.env`.

## Shared Patterns

### Secrets and logging
**Source:** `infra/chatwoot/lib/client.mjs` (env-or-file, never argv; redactor), `infra/chatwoot/inspect.mjs` header (counts/booleans only).
**Apply to:** all `infra/espocrm/*.mjs`. Never read `.env.local`. Supabase data comes from an MCP-produced `.work/export.json` (default) or an owner-created key file.

### Dry-run and idempotency contract
**Source:** `infra/chatwoot/sync.mjs` `readOnlyClient` (lines 283-293), `formatCounts`, `planCollection`.
**Apply to:** sync, backfill, seed. Second run must report zero creates/updates.

### Exit codes
**Source:** `infra/chatwoot/sync.mjs` `main` (lines 896-913): `ApiError` to 2, `ConfigError` to 1, other to 2.

### Test environment
**Source:** `tests/chatwoot-sync.test.ts` line 1 `// @vitest-environment node`, fake-fetch injection via `fetchImpl`, no network, fake secrets like `tok_SECRET_...` asserted absent from errors/logs.

### Isolation guard
**Source:** `tests/infra-vps-isolation-guard.test.ts` lines 20-45: scans `app`, `components`, `lib`, `i18n`, `middleware.ts`, `next.config.ts`, `vercel.json` for `(chat|crm).rideprestigo.com`, `CHATWOOT_*`/`ESPOCRM_*` names and chatwoot/espocrm package imports. **Apply to:** every file this phase touches under those directories (only the D-18 admin change qualifies, and it must stay clean). Keep `tests/` and `infra/espocrm/` as the only homes for EspoCRM code.

### Runbook guard
**Source:** `tests/whatsapp-runbook.test.ts` (headings once, in order, non-empty, tool names mentioned, no secrets/PII).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `infra/espocrm/overlay/CBooking.entityDefs.json` | metadata overlay | one-time VPS apply + rebuild | No metadata overlay exists in repo. Use RESEARCH Pattern 5 JSON (`indexes.supabaseBookingIdDeleteId` unique on `[supabaseBookingId, deleteId]`, `deleteId: true`); commands go in the runbook (see `infra/vps/runbooks/upgrade.md` and `app-deploy.md` for how SSH/compose-exec steps are written; owner runs with allow-rules). |
| Supabase export/backfill reader | data loader | batch read | Repo has no script that reads Supabase from `infra/`; closest are ops scripts at repo root (`send-invoice-tltgo.mjs`, etc.), which are untracked and should not be copied. Use RESEARCH Pattern 6 SQL. |

## Metadata

**Analog search scope:** `infra/chatwoot/`, `infra/vps/runbooks/`, `tests/` (chatwoot-*, whatsapp-runbook, infra-vps-isolation-guard, BookingsTable), `components/admin/`, `app/(internal)/admin/(dashboard)/bookings/`, `.gitignore`.
**Files scanned:** ~15 read in full or in targeted ranges.
**Pattern extraction date:** 2026-10-11
