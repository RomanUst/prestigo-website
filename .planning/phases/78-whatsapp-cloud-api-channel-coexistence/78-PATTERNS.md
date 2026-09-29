# Phase 78: WhatsApp Cloud API Channel (Dedicated Number) - Pattern Map

**Mapped:** 2026-09-29
**Files analyzed:** 40 (new + modified, grouped)
**Analogs found:** 38 / 40 (all analog paths verified git-tracked via `git ls-files`)

Never read `.env.local`. Never write the old personal digits (`725 986 855`) into any tracked file outside `.planning/` after the switch plan (guard test B). In this file the number is only quoted as a literal in excerpts of the CURRENT code.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `infra/chatwoot/lib/graph.mjs` (NEW) | utility (API client) | request-response | `infra/chatwoot/lib/client.mjs` | exact |
| `infra/chatwoot/whatsapp-templates.mjs` (NEW) | CLI script | batch / idempotent sync | `infra/chatwoot/sync.mjs` (+ `telegram/set-bot-profile.mjs` for CLI shape) | role-match |
| `infra/chatwoot/whatsapp-templates/*.json` (NEW, 8) | config | transform | `infra/chatwoot/canned-responses/*.json` | exact |
| `infra/chatwoot/whatsapp-webhook-probe.mjs` (NEW, optional) | CLI script | request-response | `infra/chatwoot/telegram/set-bot-profile.mjs` | role-match |
| `infra/chatwoot/inboxes.json` (EDIT) | config | CRUD | itself, `managed[]` Telegram entry | exact |
| `infra/chatwoot/labels.json` (EDIT) | config | CRUD | itself, `ch-telegram` line | exact |
| `infra/chatwoot/automation-rules.json` (EDIT) | config | event-driven | itself, `channelRules` + `labelRouting[].optional` | exact |
| `infra/chatwoot/sync.mjs` (EDIT) | service (sync) | CRUD | itself (`syncInboxes`, `syncAutomation`) | exact |
| `infra/chatwoot/inspect.mjs` (EDIT) | CLI | request-response | itself (`--status`, `runInspect`, `parseArgs`) | exact |
| `tests/chatwoot-sync.test.ts`, `chatwoot-inspect.test.ts`, `chatwoot-config.test.ts` (EDIT) | test | request-response | themselves (fake `fetchImpl`) | exact |
| `tests/whatsapp-templates.test.ts` (NEW) | test | batch | `tests/chatwoot-sync.test.ts` | role-match |
| `.husky/pre-commit` (EDIT) | config (hook) | batch | itself, `SECRET_RE` line | exact |
| `scripts/qa/secret_gate_probe.sh` (EDIT) | test script | batch | itself, `run_probe` cases | exact |
| `infra/vps/env/whatsapp-meta.env.example` (NEW) | config | n/a | `infra/vps/env/chatwoot-integration.env.example` | exact |
| `infra/vps/runbooks/whatsapp.md` (NEW) | doc | n/a | `infra/vps/runbooks/chatwoot-channels.md` | role-match |
| `infra/vps/runbooks/chatwoot-channels.md` (EDIT) | doc | n/a | itself | exact |
| `lib/contact-channels.ts` (EDIT) | utility (constants) | transform | itself | exact |
| `lib/jsonld.ts`, `app/[locale]/page.tsx` (EDIT) | service (JSON-LD) | transform | themselves | exact |
| `lib/email.ts` (EDIT, 5 spots) | service | transform | itself | exact |
| `lib/llms-content.ts` (EDIT, 4 spots) | service | transform | itself | exact |
| `components/Footer.tsx`, `HeroWhatsApp.tsx`, `ContactForm.tsx`, `booking/steps/Step2DateTime.tsx` (EDIT) | component | request-response | themselves | exact |
| `app/[locale]/contact/page.tsx`, `privacy/page.tsx` (EDIT) | component (page) | request-response | themselves | exact |
| `content/pages/{7 locales}/{book,faq,routes,services,privacy}.json` (EDIT, 34 files) | config (content) | transform | themselves (scripted exact-string replace) | exact |
| `i18n/glossary.json` (EDIT) | config | transform | itself, `phoneNumbers` DNT list | exact |
| `i18n/translation-manifest.json` + `.planning/phases/78-.../freeze/78-number-switch.freeze` (NEW) | config | batch | `scripts/i18n-freeze-manifest.mjs` freeze-file protocol | exact |
| `tests/business-number-guard.test.ts` (NEW) | test (repo guard) | batch (source reading) | `tests/infra-vps-isolation-guard.test.ts` | exact |
| `tests/telegram-bot-profile.test.ts`, `book-page-render`, `routes-hub-render`, `contact-form` tests (EDIT) | test | request-response | themselves | exact |
| `tests/__snapshots__/{book-page,multi-day-page,route-page,routes-hub}-render.test.tsx.snap` (REGEN) | test snapshot | transform | `tests/route-page-render.test.tsx` normalizer | exact |

## Pattern Assignments

### Half 1: Chatwoot / Meta infra

#### `infra/chatwoot/lib/graph.mjs` (NEW; utility, request-response)

**Analog:** `infra/chatwoot/lib/client.mjs`. Mirror it: named error classes, `parseEnvFile` reuse (import it), env-then-file token load, redactor, `redirect: 'error'`, 30 s `AbortSignal.timeout`, `fetchImpl` injection.

Env-file load with fallback (client.mjs lines 24-27, 68-86):
```js
export const DEFAULT_ENV_FILE = path.join(os.homedir(), '.config', 'prestigo', 'chatwoot-api.env')
const KEYS = ['CHATWOOT_API_TOKEN', 'CHATWOOT_BASE_URL', 'CHATWOOT_ACCOUNT_ID']
export function loadChatwootConfig({ env = process.env, filePath = DEFAULT_ENV_FILE, readFile } = {}) {
  const values = {}
  for (const key of KEYS) if (env[key]) values[key] = env[key]
  if (KEYS.some((k) => !values[k])) {
    const reader = readFile ?? ((p) => (existsSync(p) ? readFileSync(p, 'utf8') : null))
    const text = reader(filePath)
    if (text) { const parsed = parseEnvFile(text); for (const key of KEYS) if (!values[key] && parsed[key]) values[key] = parsed[key] }
  }
  const missing = KEYS.filter((k) => !values[k])
  if (missing.length) throw new ChatwootConfigError(`Missing ${missing.join(', ')} - ...`)
```
For graph.mjs use `~/.config/prestigo/meta-whatsapp.env`, keys `META_SYSTEM_USER_TOKEN`, `META_WABA_ID` (optional `META_GRAPH_VERSION`). Token is never a CLI argument.

Redactor + request core (lines 108-167). Copy, and add redaction of `Authorization`/`access_token` echoes:
```js
function makeRedactor(token) {
  return (text) => {
    let out = String(text ?? '')
    if (token) out = out.split(token).join('[redacted]')
    out = out.replace(/("(?:hmac_token|access_token|api_access_token)"\s*:\s*")[^"]*(")/g, '$1[redacted]$2')
    return out.length > MAX_BODY_CHARS ? `${out.slice(0, MAX_BODY_CHARS)}...` : out
  }
}
res = await fetchImpl(resolveUrl(apiPath), { method, headers: {...}, body,
  redirect: 'error', signal: AbortSignal.timeout(timeoutMs) })
...
if (!res.ok) throw new ChatwootApiError(method, apiPath, res.status, redact(text))
```
Difference: Graph auth is `Authorization: Bearer <token>` (standard header), not the hyphenated `api-access-token` workaround (client.mjs lines 12-18 apply to Chatwoot only). Timeout error branch (lines 150-158) copies unchanged.

#### `infra/chatwoot/whatsapp-templates.mjs` (NEW; CLI, batch idempotent)

**Analog:** `infra/chatwoot/sync.mjs` (output contract + planner) with CLI skeleton from `sync.mjs` lines 750-792.

Reuse, import from `./sync.mjs`: `planCollection`, `subsetEqual` (lines 46, 65). Do not re-implement.

CLI skeleton (sync.mjs 754-792):
```js
export function parseArgs(argv) {
  const opts = { dryRun: false, only: [] }
  for (...) {
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--only') { const value = argv[++i]; if (!value) throw new ChatwootConfigError('--only needs ...'); ... }
    else throw new ChatwootConfigError(`Unknown argument: ${arg}`)
  }
}
async function main(argv) {
  try { ... } catch (err) {
    if (err instanceof ChatwootApiError) { console.error(`API error: ${err.message}`); process.exit(2) }
    if (err instanceof ChatwootConfigError) { console.error(`Config error: ${err.message}`); process.exit(1) }
    console.error(`Sync failed: ...`); process.exit(2)
  }
}
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) { await main(process.argv.slice(2)) }
```
Exit codes 0 ok / 1 config or validation / 2 API. Flags: `--dry-run`, `--status`, `--only <key>`, `--allow-edit`. Never delete (Meta blocks the name for 30 days). Key by `name|language`. Second run prints `create=0`. Import `pathToFileURL`/`realpathSync` idiom also in `telegram/set-bot-profile.mjs` lines 1-30 (the `--dry-run` = no token read, no network mode is the precedent to copy: dry-run should still list the plan; if it needs the existing list it reads with the read-only client, see `readOnlyClient` at sync.mjs line 222).

#### `infra/chatwoot/whatsapp-templates/*.json` (NEW; config)

**Analog:** `infra/chatwoot/canned-responses/time-change.json` (7-locale `responses` map, one file per topic, `sourceScript`, placeholders):
```json
{ "topic": "time-change", "sourceScript": "send-time-change-email.mjs",
  "placeholders": ["[BOOKING_REF]", "[DATE]", "[OLD_TIME]", "[NEW_TIME]"],
  "responses": { "en": "Hi {{contact.first_name}}, ...", "ru": "...", "zh": "..." } }
```
Template files use the shape from RESEARCH Pattern 2 (`key`, `name`, `category`, `variables`, `buttons`, `sourceCanned`, `locales`). Deviations to remember: named variables `{{first_name}}` (Meta), not `{{contact.first_name}}` or `[BOOKING_REF]`; site locale `zh` maps to Meta `zh_CN`. Price-free: `infra/chatwoot/**` is covered by the currency gate (`scripts/qa/chatwoot_price_gate.mjs`). Existing sources for wording: `canned-responses/{time-change,vehicle-change,payment-help,review-request,login-help}.json`.

#### `infra/chatwoot/inboxes.json` / `labels.json` / `automation-rules.json` (EDIT)

Add a `managed` entry (Telegram precedent, resolved by `channel_type`; `buildInboxRefs` sync.mjs 288-297):
```json
{ "name": "Telegram", "channel_type": "Channel::Telegram", "settings": { "enable_auto_assignment": false } }
```
becomes additionally
```json
{ "name": "WhatsApp", "channel_type": "Channel::Whatsapp", "settings": { "enable_auto_assignment": false, "greeting_enabled": false, "csat_survey_enabled": false, "working_hours_enabled": false } }
```
Label line to copy (labels.json): `{ "title": "ch-telegram", "description": "Conversation channel: Telegram bot", "color": "#0F1D2C", "show_on_sidebar": true }` -> `ch-whatsapp`, plus `wa-window-closing` (topic style colour `#BFA06A`).
Channel rule (automation-rules.json line 6): `{ "name": "channel: telegram", "inbox": "Telegram", "label": "ch-telegram", "team": "Bookings" }` -> `channel: whatsapp` / `ch-whatsapp`.
Window rules: `optional: true` precedent is `labelRouting` entry `"optional": true`; sync.mjs 672-679 skips on 4xx:
```js
if (want.optional && err instanceof ChatwootApiError && err.status >= 400 && err.status < 500) {
  ctx.log(`  skipped: ${want.name} (unsupported on this version)`); counts.skipped++
} else throw err
```
Note `expandAutomationRules` (sync.mjs 134-195) whitelists rule fields; `execution_delay` support must be added there (RESEARCH says extend sync for `execution_delay`). Note the `body()` helper at line 666 strips only `optional`.

#### `infra/chatwoot/sync.mjs` (EDIT)

Gap: `ensureOwnerInboxMember` (lines 530-537) is only called for the Website inbox (lines 571, 587). Extend the managed loop (lines 602-618) to call it for WhatsApp:
```js
async function ensureOwnerInboxMember(ctx, inboxId, ownerId) {
  if (inboxId <= 0) return false
  const current = unwrapList(await ctx.client.request('GET', `/inbox_members/${inboxId}`), 'members')
  const ids = current.map((u) => u.id)
  if (ids.includes(ownerId)) return false
  await ctx.mutate('POST', '/inbox_members', { inbox_id: inboxId, user_ids: [...ids, ownerId] })
  return true
}
```
Managed loop patch pattern (lines 605-618): `fields = Object.keys(entry.settings).filter(k => !subsetEqual(entry.settings[k], have[k]))` then `ctx.mutate('PATCH', ...)`. Keep the "missing inbox -> `skipped`" behaviour (owner creates the channel). Do not print `provider_config` (the inbox payload contains `api_key`/`app_secret` to admin tokens).

#### `infra/chatwoot/inspect.mjs` (EDIT; add `--whatsapp`)

Analog: itself. Mode registration in `parseArgs` (lines 310-345, "Use exactly one of --status, --activity, --report, --contact, --print"): add `--whatsapp` to the mode list and the error strings. Read-only gatherers follow `gatherStatus(client, { configDir })` (line 192); output via `formatReport`/`out`. Exit codes: 0 ok, 1 expectation failed, 2 API/config. Must print only booleans derived from key presence (for example `signature_secret_configured`), never `provider_config` values; unit-test that (RESEARCH Pattern 3). `SECRET_KINDS`/`printSecret` (lines 32, 144) is the only secret-emitting path; do not add WhatsApp secrets to it.

#### Tests (Chatwoot)

Analog: `tests/chatwoot-sync.test.ts`. Imports (lines 7-16) and the fake server style (line 62 `const fetchImpl = async (url: string, init: any = {}) => {...}` returning `{ state, requests, fetchImpl }`; client built at line 213 with `createChatwootClient({ baseUrl: BASE, token: FAKE_TOKEN, accountId: '1', fetchImpl: fake.fetchImpl as any })`). Client-hardening tests at lines 323-380 (redirect, timeout, redaction) are the template for `graph.mjs` tests. Extend `runSync inboxes` (line 491) and `runSync automation` (line 545) blocks for WhatsApp and `execution_delay`. `tests/chatwoot-config.test.ts` validates JSON config shape and price-free wording: extend to the templates directory.

#### `.husky/pre-commit` (EDIT; security work, commit with `security:` prefix)

Add Meta token shape to `SECRET_RE` (line 66 of the hook, single-line alternation ending `...|hcw_[A-Za-z0-9_-]{16,}`): append `|EAA[A-Za-z0-9]{40,}`. Name-based `KEY=value` protection for `META_SYSTEM_USER_TOKEN`, `META_APP_SECRET` is automatic from the new env example (`INFRA_SECRET_KEY_NAMES=$(grep -hoE '^[A-Z_][A-Z0-9_]*=' infra/vps/env/*.env.example ...)` matching `PASSWORD|SECRET|_KEY|TOKEN`). The WhatsApp PIN is NOT covered; never add `..._PIN=` to the example.

#### `scripts/qa/secret_gate_probe.sh` (EDIT)

Copy a `run_probe` case, for example (lines 68-69 of the current file, the vendor-shaped secret case):
```sh
printf '#!/usr/bin/env sh\n%s\n' "$SECRET_LINE" > "$PROBE_DIR/probe-secret.sh"
run_probe "secret-line" "$PROBE_DIR/probe-secret.sh" "block" "ERROR: Possible secret"
```
Build the fake token from concatenated parts (the script itself is scanned by the hook, so never spell a full `EAA...` token literally). Add cases: `meta-token` (block), `meta-env-key-value` (block, needle `ERROR: Possible infra/vps secret`), `meta-env-example` (allow; empty values).

#### `infra/vps/env/whatsapp-meta.env.example` (NEW)

Analog: `infra/vps/env/chatwoot-integration.env.example`. Header comment convention (names and custody notes, every value empty, custody file `~/.config/prestigo/meta-whatsapp.env` mode 600), then per-variable comment + `NAME=`:
```
# Bot token of the Telegram bot ... Revoke with BotFather /revoke.
TELEGRAM_CHAT_BOT_TOKEN=
```
Variables: `META_SYSTEM_USER_TOKEN=`, `META_APP_SECRET=`, `META_WABA_ID=`, `META_GRAPH_VERSION=`. No PIN.

#### `infra/vps/runbooks/whatsapp.md` (NEW) and `chatwoot-channels.md` (EDIT)

Analog: `infra/vps/runbooks/chatwoot-channels.md` (channel inventory table, "WhatsApp is not a Chatwoot inbox yet" line to remove). Place pricing in the runbook, NOT under `infra/chatwoot/` (currency gate). Do not spell the former personal number; refer to "the owner's former number". Include: owner steps 1-8 (RESEARCH Pattern 1), D-20 topics, D-24 listing checklist (incl. untracked root scripts `send-*.mjs`, `generate_invoice_*.py`), transition auto-reply end date.

### Half 2: WA-04 site number switch

#### `lib/contact-channels.ts` (EDIT)

Current entire relevant content (lines 10-14):
```ts
export const WHATSAPP_CHAT_URL = 'https://wa.me/420725986855'
export const TELEGRAM_BOT_USERNAME = 'PrestigoChauffeurBot'
export const TELEGRAM_CHAT_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`
```
Constraints: plain constants, no `process.env`, no `chat.rideprestigo.com` (enforced by `tests/telegram-bot-profile.test.ts` lines 197-203). Derived-constant design is in RESEARCH Pattern 6 (`BUSINESS_PHONE_E164`, `_DIGITS`, `_DISPLAY`, `_SCHEMA_HYPHEN`, `BUSINESS_TEL_URL`, `WHATSAPP_CHAT_URL`, `whatsappUrlWithText`). Two-commit sequencing: (1) refactor with the current value, all snapshots byte-identical; (2) flip the single value after D-06 passes. The file is imported by client components (HeroWhatsApp is `'use client'`), so it must stay free of server-only imports.

#### JSX surfaces (Footer, HeroWhatsApp, Step2DateTime, ContactForm, contact/privacy pages)

Replace literals with imports (`import { WHATSAPP_CHAT_URL, BUSINESS_TEL_URL, BUSINESS_PHONE_DISPLAY, whatsappUrlWithText } from '@/lib/contact-channels'`). Current shapes:
- `components/HeroWhatsApp.tsx:10`: `href="https://wa.me/420725986855?text=Hello%20PRESTIGO%2C%20I%20would%20like%20to%20book%20a%20transfer."` -> `href={whatsappUrlWithText('Hello PRESTIGO, I would like to book a transfer.')}` (`encodeURIComponent` yields the identical string, so the snapshot stays unchanged).
- `components/Footer.tsx:126-133`: `href="tel:+420725986855"` + text `+420 725 986 855`; `href="https://wa.me/420725986855"`.
- `app/[locale]/contact/page.tsx`: line 50 `const WHATSAPP_NUMBER = '420725986855'`, line 101 wa.me template, lines 127-128 tel + display.
- `app/[locale]/privacy/page.tsx:108` `tel:+420725986855`; `components/booking/steps/Step2DateTime.tsx:308` wa.me with text; `components/ContactForm.tsx:203` `placeholder="+420 725 986 855"`.
Rule: no `€` literals (pre-commit), keep `rel="noopener noreferrer"` and existing `trackMetaEvent` handlers untouched.

#### `lib/jsonld.ts` + `app/[locale]/page.tsx`

`lib/jsonld.ts:37` `telephone: '+420725986855'` and `app/[locale]/page.tsx:89` same -> `BUSINESS_PHONE_E164`; `page.tsx:153` `telephone: '+420-725-986-855'` (contactPoint) -> `BUSINESS_PHONE_SCHEMA_HYPHEN` (do not change the format in the refactor commit). Golden JSON-LD snapshots must keep normalizing `priceValidUntil`.

#### `lib/email.ts` (5 spots: 275, 1090, 1222, 1372, 1746) and `lib/llms-content.ts` (107, 203, 233, 271)

Current email footer form (line 275): `...contact us at info@rideprestigo.com or +420 725 986 855</div>`. Replace with one module-level const `${BUSINESS_PHONE_DISPLAY}` interpolated into the template string. Same for llms builders. `app/llms.txt/route.ts` (ISR 3600) follows the constant automatically. HTML-entity rule: use UTF-8, no `&ccaron;`-style entities.

#### `content/pages/{ar,en,es,fr,hi,ru,zh}/*.json` (34 files) and `i18n/glossary.json`

Keep literals (RESEARCH recommends; do not tokenize `{phone}`). Scripted exact-string replace of `+420 725 986 855` at switch time (Latin digits in all locales; JSON key order and formatting preserved: do a string replace on file text, not parse+stringify). `i18n/glossary.json:10` `"phoneNumbers": ["+420 725 986 855"]` (DNT list) must be updated in the same commit.

#### `i18n/translation-manifest.json` + freeze file

Analog: `scripts/i18n-freeze-manifest.mjs` (header lines 1-40). Freeze-file format: one pattern per line, `<sourceKey>` or `<sourceKey>::<dotPrefix>`, `#` comments. Run `node scripts/i18n-freeze-manifest.mjs --dir .planning/phases/78-whatsapp-cloud-api-channel-coexistence/freeze` then `--verify`. It refuses units whose locale value is byte-identical to EN unless DNT or numeric (update the glossary first). Existing precedent dir: `.planning/phases/75-e2e-verification-launch/freeze/*.freeze`. Never run `scripts/i18n-translate.mjs --dry-run` on the repo tree.

#### `tests/business-number-guard.test.ts` (NEW)

**Analog:** `tests/infra-vps-isolation-guard.test.ts` (source-reading repo guard). Copy its skeleton:
```ts
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
const REPO_ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['app', 'components', 'lib', 'i18n']
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const SCAN_FLOOR = 250   // "scanned at least N files" floor so an empty walk cannot pass vacuously
```
Adaptations: enumerate `git ls-files` (tracked only, via `execFileSync`) rather than a directory walk; exclude `.planning/`, the guard file itself, and snapshots for assertion B; build the old-number needle from parts (`['725','986','855']`) so the guard never spells it; keep a scan-count floor. Assertion A (consistency) lands with the refactor commit; assertion B (no old number, each locale JSON holds `BUSINESS_PHONE_DISPLAY`) lands with the switch plan. Header docstring convention: cite phase and decision id (D-22).

#### Existing tests that hold the number literal (EDIT)

- `tests/telegram-bot-profile.test.ts:190-195`: replace `expect(WHATSAPP_CHAT_URL).toBe('https://wa.me/420725986855')` and `expect(hero).toContain('wa.me/420725986855')` with assertions on the constant (`toBe(\`https://wa.me/${BUSINESS_PHONE_DIGITS}\`)`; hero should now be checked for `whatsappUrlWithText` / `WHATSAPP_CHAT_URL` usage, since the literal leaves the file). Keep lines 197-203 (no env, no VPS host).
- `tests/book-page-render.test.tsx:44`, `tests/routes-hub-render.test.tsx:49` (`DNT_TOKENS` contain `'+420 725 986 855'`) and `tests/contact-form.test.tsx:131` (`getByText('+420 725 986 855')`): import `BUSINESS_PHONE_DISPLAY`.
- Snapshots: regenerate the 4 `.snap` files with `npx vitest run <files> -u` at the switch commit only; review that the diff contains only phone lines. Date-normalizer to preserve (`tests/route-page-render.test.tsx` lines 148-154):
```ts
const html = container.innerHTML.replace(/("priceValidUntil":")\d{4}-\d{2}-\d{2}(")/g, "$1<DYNAMIC>$2");
```

## Shared Patterns

### Secret custody and redaction
**Source:** `infra/chatwoot/lib/client.mjs` (lines 7-11, 108-118) + `infra/chatwoot/telegram/set-bot-profile.mjs` header. Token from env or `~/.config/prestigo/*.env` (mode 600), never argv, never printed, error messages hold no config values, `redirect: 'error'`, 30 s timeout.
**Apply to:** `graph.mjs`, `whatsapp-templates.mjs`, `whatsapp-webhook-probe.mjs`, `inspect.mjs --whatsapp`.

### Idempotent config-as-code CLI
**Source:** `infra/chatwoot/sync.mjs` (`planCollection`, `subsetEqual`, `--dry-run`, per-item log lines create/update/unchanged/skipped, summary, exit 0/1/2, `isMainModule` guard so tests import without running).
**Apply to:** `whatsapp-templates.mjs`, sync extensions.

### Price-free guard for infra/chatwoot
**Source:** `.husky/pre-commit` lines 20-42 + `scripts/qa/chatwoot_price_gate.mjs`. Staged blobs under `infra/chatwoot/**` are scanned for currency symbols and localized currency words. **Apply to:** template JSONs, `whatsapp-templates.mjs`, `inboxes.json`. Pricing text belongs in `infra/vps/runbooks/whatsapp.md`.

### Test harness for infra scripts
**Source:** `tests/chatwoot-sync.test.ts` (fake `fetchImpl`, no network, `FAKE_TOKEN`, assert token never appears in output). **Apply to:** all new `.mjs` scripts and their tests.

### VPS isolation guard must stay green
**Source:** `tests/infra-vps-isolation-guard.test.ts`. Site code under `app/ components/ lib/ i18n/` must not name `chat.rideprestigo.com`/`crm.`, `CHATWOOT_*`/`ESPOCRM_*` env names, or import chatwoot packages. `lib/contact-channels.ts` gets only the phone constants; the WhatsApp Graph/Meta code stays under `infra/`.

### Security commits
Hook and probe changes are security work: run `npx vitest run` on affected tests plus `sh scripts/qa/secret_gate_probe.sh`, commit with `security:` prefix.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `infra/chatwoot/lib/graph.mjs` Graph paging + `Bearer` auth | utility | request-response | No existing Meta Graph client in `infra/`; use `client.mjs` structure. Ad-account Graph usage, if any, lives in `lib/` (not scanned; not an infra analog). |
| `whatsapp-webhook-probe.mjs` HMAC signing (`X-Hub-Signature-256`) | CLI | request-response | No HMAC-sign-and-POST script exists; take Node `crypto.createHmac('sha256', secret)` from RESEARCH Code Examples. |

## Metadata

**Analog search scope:** `infra/chatwoot/`, `infra/vps/{env,runbooks}`, `.husky/`, `scripts/qa/`, `scripts/i18n-freeze-manifest.mjs`, `lib/`, `components/`, `app/[locale]/`, `tests/`.
**Files scanned:** about 45 (targeted reads plus `git grep` inventory: 20 non-content files and 34 content JSON files contain the number).
**Tracked check:** `git ls-files` confirmed for all named analogs (sync.mjs, lib/client.mjs, inspect.mjs, all json configs, canned-responses, telegram/set-bot-profile.mjs, tests/chatwoot-*.test.ts, tests/infra-vps-isolation-guard.test.ts, tests/route-page-render.test.tsx, .husky/pre-commit, secret_gate_probe.sh, env example, runbooks, i18n files, freeze script).
**Pattern extraction date:** 2026-09-29
