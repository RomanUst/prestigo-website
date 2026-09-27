# Phase 72: AI Translation Pipeline & Catalogs - Pattern Map

**Mapped:** 2026-09-12
**Files analyzed:** 9 (new) + 2 (write-targets, schema mirrors) + 1 (move)
**Analogs found:** 7 / 9 (no analog: GitHub Actions workflow — first in repo; QA-report artifact — no prior report-generator in repo)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/i18n-translate.mjs` | utility (CLI/CI script) | batch/transform | `scripts/indexnow-submit.mjs` (structure/CLI conventions) + `scripts/get-business-location.mjs` (.env.local parsing, external API call) | role-match (composite) |
| `i18n/glossary.json` | config (data file) | — | none in repo (new data-config category) — nearest sibling is `i18n/routing.ts` (single-source i18n config, but code not data) | partial-match |
| `i18n/translation-manifest.json` (hash-manifest sidecar) | config/state | event-driven (idempotency ledger) | none — genuinely novel; structure fully specified in RESEARCH.md Pattern 1 | no analog |
| `.github/workflows/i18n-translate.yml` | config (CI) | event-driven | none — first workflow in repo | no analog |
| QA-report artifact (e.g. `i18n/QA-REPORT.md`) | utility output | batch/transform | none — nearest conceptual sibling is `scripts/indexnow-submit.mjs`'s console-log summary style | no analog |
| `messages/{ru,es,fr}.json` (write target) | model/data (i18n catalog) | CRUD (overwrite-in-place) | `messages/en.json` (schema to mirror exactly) | exact (schema) |
| `content/routes/{ru,es,fr}/*.json` (write target) | model/data | CRUD | `content/routes/en/prague-berlin.json` (schema to mirror) | exact (schema) |
| `content/pages/{ru,es,fr}/**/*.json` (write target) | model/data | CRUD | `content/pages/en/*.json`, `content/pages/en/services/*.json` | exact (schema) |
| `content/blog/{ru,es,fr}/*.mdx` (write target) | model/data (MDX) | CRUD + transform | `content/blog/en/*.mdx` (frontmatter shape) + `lib/blog.ts` (gray-matter round-trip usage) | exact (schema) / role-match (parser) |
| stray-file move: `content/blog/prague-christmas-markets-chauffeur-2026.mdx` → `content/blog/en/` | migration (git mv) | file-I/O | n/a — mechanical `git mv` | n/a |

## Pattern Assignments

### `scripts/i18n-translate.mjs` (utility, batch/transform, CI-invoked)

**Analog A — CLI script shape/structure:** `scripts/indexnow-submit.mjs`

**Header/usage-comment pattern** (lines 1-13):
```javascript
#!/usr/bin/env node
/**
 * Post-deploy IndexNow submission.
 *
 * Run after every production deployment to notify Bing/Yandex of updated URLs.
 * ...
 *
 * Usage:
 *   node scripts/indexnow-submit.mjs
 */
```
Copy this shape for `i18n-translate.mjs`: a top-of-file doc comment stating what triggers it (CI push touching `messages/en.json` or `content/{routes,pages,blog}/en/**`), what it does, and how to invoke it manually for local dry-runs.

**`main()` + top-level `.catch()` exit pattern** (lines 54-80):
```javascript
async function main() {
  console.log(`Submitting ${URLS.length} URLs to IndexNow…`)
  const res = await fetch(ENDPOINT, { ... })
  if (res.status === 200 || res.status === 202) {
    console.log(`✓ IndexNow accepted — HTTP ${res.status}`)
  } else {
    const body = await res.text().catch(() => '')
    console.error(`✗ IndexNow returned HTTP ${res.status}: ${body}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('IndexNow submit failed:', err)
  process.exit(1)
})
```
Copy directly: wrap the whole pipeline in an async `main()`, use `✓`/`✗` console markers for step-level success/failure (matches existing project console-output convention), and `process.exit(1)` on top-level failure so the CI job fails loudly.

**Analog B — `.env.local` parsing for local/dry-run invocation:** `scripts/get-business-location.mjs` lines 4-18
```javascript
import { readFileSync } from 'fs'
try {
  const envFile = readFileSync('.env.local', 'utf8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) process.env[key] = val
  }
} catch { /* .env.local not found, rely on shell env */ }
```
Use this exact pattern so a developer can run `node scripts/i18n-translate.mjs` locally with `ANTHROPIC_API_KEY` in `.env.local`, while CI relies purely on `process.env.ANTHROPIC_API_KEY` (repo secret) — no dependency on `dotenv`, matches the project's no-added-dependency convention for env loading (`[VERIFIED: get-business-location.mjs:4-18]`).

**Fail-loud env-var guard pattern** (`get-business-location.mjs` lines 20-25):
```javascript
const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN } = process.env
if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET || !GOOGLE_OAUTH_REFRESH_TOKEN) {
  console.error('Missing env vars: ...')
  process.exit(1)
}
```
Apply identically for `ANTHROPIC_API_KEY` at the top of `i18n-translate.mjs`.

**Manifest-driven change detection (novel logic — no repo analog, use verbatim from RESEARCH.md Code Examples):**
```javascript
import { createHash } from "node:crypto";

function sha256(value) {
  return "sha256:" + createHash("sha256").update(value, "utf8").digest("hex");
}

function unitsNeedingTranslation(enUnits, manifest) {
  return enUnits.filter(({ unitKey, value }) => {
    const currentHash = sha256(typeof value === "string" ? value : JSON.stringify(value));
    const recorded = manifest.units[unitKey];
    return !recorded || recorded.enHash !== currentHash; // D-04/D-05
  });
}
```

**Anthropic SDK call pattern (novel — from claude-api skill via RESEARCH.md, no repo precedent since this is the first Claude-API-consuming script):**
```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const response = await client.messages.create({
  model: "claude-opus-5",
  max_tokens: 16000,
  system: [{ type: "text", text: buildSystemPrompt(glossary, locale), cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: buildBatchPrompt(units) }],
});
```

**MDX frontmatter round-trip (analog: `lib/blog.ts` lines 12, 43-76 — same `gray-matter` usage, read-only reference; write side is new but must match required-field set):**
```javascript
import matter from "gray-matter";
import fs from "node:fs";

const raw = fs.readFileSync(enPath, "utf-8");
const { data, content } = matter(raw);
const translatedData = { ...data, title: translatedTitle, description: translatedDescription };
const output = matter.stringify(translatedData, translatedBody);
fs.writeFileSync(localizedPath, output);
```
`lib/blog.ts:53` enumerates the required frontmatter fields the writer must preserve untouched: `["title", "description", "date", "coverImage", "category", "author"]` (+ optional `dateModified`) — only `title`/`description` are translated; the rest must be copied byte-for-byte from the EN frontmatter.

**Error handling:** Neither analog script uses try/catch per-unit (both are single-operation scripts); for `i18n-translate.mjs`, wrap each per-unit/per-file translation call in its own try/catch so one failed unit doesn't abort the whole run — log failures and continue, then surface them in the QA report (no direct repo analog for this partial-failure aggregation; follows the `indexnow-submit.mjs` "log + `process.exit(1)` only at the very end" philosophy but scoped per-unit, not per-run).

---

### `i18n/glossary.json` (config/data)

**No direct analog.** Closest sibling in spirit is `i18n/routing.ts` (single canonical i18n config file, read by multiple consumers) — but that file is TypeScript code, not editable JSON data, per D-06's explicit requirement that the owner edit this without touching pipeline code. Use the exact schema specified in RESEARCH.md Architecture Patterns — Pattern 2 (`doNotTranslate.brand`, `doNotTranslate.vehicleClasses`, `doNotTranslate.structural.{icuVariablePattern,richTextTags,pricePlaceholderPattern,phoneNumbers,domains}`, `placeNames.policy`, `locales.{ru,es,fr}.{formality,toneGuide,pluralCategories,termMap}`). Validate at script startup with `zod` (already a dependency — `package.json`, confirmed installed) so a malformed glossary fails the CI job loudly (V5 in RESEARCH.md Security Domain).

**DNT tokens to encode verbatim** (sourced from `messages/en.json`, confirmed present in this session's Read):
- ICU/ellipsis variables seen directly, e.g. `messages/en.json` uses no `{amount}` in the excerpt read here, but the RESEARCH.md's exhaustive grep list (`{amount}`, `{className}`, `{count}`, etc.) is the authoritative source — copy that list into `doNotTranslate.structural`.
- Brand/vehicle terms: `"Prestigo"`, `"PRESTIGO"`, `"Mercedes"`, `"E-Class"`, `"S-Class"`, `"V-Class"` — confirmed present in `content/routes/en/prague-berlin.json` (`"Mercedes E-Class"`, `"€{ePrice}"`, `"€{vPrice}"`, `"€{sPrice}"` — read this session, lines 3-9) — these placeholder tokens (`{ePrice}`, `{vPrice}`, `{sPrice}`) must be added to `doNotTranslate.structural.pricePlaceholderPattern`.

---

### `i18n/translation-manifest.json` (state sidecar)

**No analog — novel file.** Schema and algorithm fully specified in RESEARCH.md (Architecture Patterns — Pattern 1). Key structural decision already locked: flat map `unitKey -> { enHash, lastTranslatedAt }`, `unitKey` convention `<relative-source-path>::<dot-path-within-file>` (e.g. `messages/en.json::Booking.entryBar.pickupLocationLabel`, `content/blog/en/<slug>.mdx::frontmatter.title`, `content/blog/en/<slug>.mdx::body`). Git-tracked (committed alongside translated files in the same PR, per D-08's workflow).

---

### `.github/workflows/i18n-translate.yml` (CI config)

**No analog — first workflow in this repo** (`[VERIFIED: repo root — .github does not exist]`). No existing YAML CI convention to mirror. Build from RESEARCH.md's System Architecture Diagram: checkout (full clone — manifest sidecar needs to be read as committed, not derived from git history), `npm ci`, `node scripts/i18n-translate.mjs`, then `peter-evans/create-pull-request@v8` to commit+push+open/update PR. Trigger: `on: push: branches: [main], paths: ['messages/en.json', 'content/routes/en/**', 'content/pages/en/**', 'content/blog/en/**']`. Secret: `ANTHROPIC_API_KEY` referenced as `${{ secrets.ANTHROPIC_API_KEY }}` — must be provisioned by the owner manually (RESEARCH.md Runtime State Inventory — no agent can create repo secrets).

---

### QA-report artifact

**No analog — no prior report-generator script in the repo.** Nearest stylistic reference is `indexnow-submit.mjs`'s terse console-status convention (`✓`/`✗` markers), but the QA report is a persisted Markdown/JSON artifact, not console output. Build per RESEARCH.md D-09: sampled keys/pages across RU/ES/FR + automated checks (key-completeness vs `en.json`, no-EN-leakage, DNT-terms-preserved-verbatim, MDX structural-invariant checks per Pattern 4's `verifyMdxStructure` regex helper). Commit it alongside translated files in the same PR (`peter-evans/create-pull-request@v8` picks up any new/changed tracked file).

---

### `messages/{ru,es,fr}.json` (write target — catalog)

**Analog:** `messages/en.json` — the exact schema to mirror. Top-level namespaces confirmed present (read this session, lines 1-40): `Booking.entryBar.*`, `Booking.validation.*`, `Booking.step1.*`, and RESEARCH.md confirms 14 total namespaces (`Booking, Nav, Hero, Footer, FeatureStrip, Services, Fleet, HowItWorks, Testimonials, CookieBanner, Errors, Auth, Account, RoutePage`). The writer must produce **structurally identical** JSON (same keys, same nesting) with only leaf string values translated — this is the completeness check the QA report must run (RESEARCH.md TR-02 test map: "every locale catalog has exactly the same leaf-key set as `en.json`").

**Known drift to reconcile (do not assume old `ru/es/fr.json` are structurally complete):** 22 `RoutePage.*` keys exist in `en.json` but are absent from `ru.json` (confirmed by RESEARCH.md's direct diff) — the hash-manifest's "missing unitKey = translate" rule (Pattern 1 step 3) handles this automatically on first run.

---

### `content/routes/{ru,es,fr}/*.json` (write target)

**Analog:** `content/routes/en/prague-berlin.json` — schema to mirror exactly (`hero.{label,headlineLine1,headlineItalic,intro}`, `openingParagraphs[]`, `routeNarrative.{headingLine1,headingItalic,paragraphs[]}`, `includedLabel`, `includedIntro`, `inclusions[]`, confirmed by direct read this session lines 1-30). Long-form prose fields (`openingParagraphs`, `routeNarrative.paragraphs`, `inclusions`) should be translated with one whole-file call per locale (RESEARCH.md Pattern 3.2) — not per-leaf-key — so Claude retains cross-field tone/terminology consistency across a single route page. Price placeholders (`{ePrice}`, `{sPrice}`, `{vPrice}`) and vehicle-class names (`Mercedes E-Class`, `V-Class`, `S-Class`) inside the prose must survive verbatim per the DNT rules.

---

### `content/pages/{ru,es,fr}/**/*.json` (write target)

**Analog:** `content/pages/en/*.json` (about, blog, contact, corporate, data-deletion, etc.) and `content/pages/en/services/*.json` (nested subdirectory — confirmed present this session via `ls`). Same schema-mirroring + whole-file-per-locale translation approach as routes. Note the `services/` subdirectory nesting must be replicated under each locale (`content/pages/ru/services/*.json`, etc.) — the writer's path-construction logic must walk the EN tree recursively, not assume a flat directory.

---

### `content/blog/{ru,es,fr}/*.mdx` (write target)

**Analog:** `content/blog/en/*.mdx` (confirmed 5+ files present: `beyond-transport-luxury-chauffeur-service-prague.mdx`, `karlovy-vary-film-festival-2026-vip-transfer.mdx`, `luxury-chauffeur-service-prague-vip.mdx`, `prague-airport-arrivals-guide.mdx`, `prague-airport-meet-and-greet.mdx`) + `lib/blog.ts` for the required-frontmatter contract. Frontmatter fields `title`/`description` are translated (short-string path); `date`, `coverImage`, `category`, `author`, `dateModified` are copied verbatim (structural, per `lib/blog.ts:53` required-field list). Body is translated whole-document (RESEARCH.md Pattern 4) with post-hoc structural verification (`verifyMdxStructure` — checks fenced-code-block count, link count/URL-preservation, heading count match) before being considered valid; a failed check is flagged in the QA report, not silently shipped.

**Stray file to relocate BEFORE first pipeline run:** `content/blog/prague-christmas-markets-chauffeur-2026.mdx` sits at `content/blog/` root, not under `content/blog/en/` — it is invisible to `lib/blog.ts`'s `getMDXPosts()` (which only reads `content/blog/<locale>/`, confirmed lines 37-41) and thus invisible to this pipeline too unless moved first. Mechanical fix: `git mv content/blog/prague-christmas-markets-chauffeur-2026.mdx content/blog/en/prague-christmas-markets-chauffeur-2026.mdx` as a Wave 0 task, before any translation call.

---

## Shared Patterns

### Env-var loading for local/dry-run invocation
**Source:** `scripts/get-business-location.mjs` lines 4-18 (`.env.local` manual parse, no `dotenv` dependency) + lines 20-25 (fail-loud missing-var guard)
**Apply to:** `scripts/i18n-translate.mjs` — enables local dry-runs against a personal `ANTHROPIC_API_KEY` while CI uses the repo secret exclusively.

### CLI script structure (doc-comment header, `main()` + top-level catch, `✓`/`✗` console markers, `process.exit(1)` on failure)
**Source:** `scripts/indexnow-submit.mjs` (full file, 81 lines)
**Apply to:** `scripts/i18n-translate.mjs` top-level control flow.

### gray-matter frontmatter parse/round-trip
**Source:** `lib/blog.ts` lines 12 (`import matter from "gray-matter"`), 43-76 (`getMDXPosts` — parse + required-field validation)
**Apply to:** the MDX-translation branch of `scripts/i18n-translate.mjs` (read side identical to `lib/blog.ts`; write side is new but must emit the same required-field set).

### i18n locale-list single-source-of-truth
**Source:** `i18n/routing.ts` line 18 (`export const locales = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const`)
**Apply to:** `scripts/i18n-translate.mjs` should import `routing.locales` (filtered to `['ru','es','fr']` per this phase's scope) rather than hardcoding a duplicate locale array — matches the project's "single canonical source" convention already established for this exact list.

### Hash-based idempotency (novel, no repo precedent — apply RESEARCH.md Pattern 1 verbatim)
**Source:** RESEARCH.md Code Examples — "Manifest-driven change detection"
**Apply to:** `scripts/i18n-translate.mjs` core loop; `i18n/translation-manifest.json` schema.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `i18n/glossary.json` | config | — | No prior owner-editable data-config file of this shape exists; nearest sibling (`i18n/routing.ts`) is code, not data. Use RESEARCH.md Pattern 2 schema directly. |
| `i18n/translation-manifest.json` | state sidecar | event-driven | Genuinely novel idempotency mechanism, no repo precedent. Use RESEARCH.md Pattern 1 schema directly. |
| `.github/workflows/i18n-translate.yml` | CI config | event-driven | First GitHub Actions workflow in the repo — no existing YAML convention to mirror. Use RESEARCH.md's System Architecture Diagram directly. |
| QA-report artifact | utility output | batch/transform | No prior report-generator in the repo. Use RESEARCH.md D-09 spec directly. |

## Metadata

**Analog search scope:** `scripts/`, repo-root `*.mjs`, `i18n/`, `lib/blog.ts`, `messages/en.json`, `content/routes/en/`, `content/pages/en/`, `content/blog/en/`, `package.json`, `tests/setup.ts`
**Files scanned:** ~20 (directory listings + 7 full/partial reads)
**Pattern extraction date:** 2026-09-12
