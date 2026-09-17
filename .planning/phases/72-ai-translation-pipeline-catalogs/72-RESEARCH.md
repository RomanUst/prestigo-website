# Phase 72: AI Translation Pipeline & Catalogs - Research

**Researched:** 2026-09-12
**Domain:** LLM-powered i18n content pipeline (Anthropic Claude API, CI automation, MDX-aware translation)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The pipeline uses **Claude Opus** for all translations (owner chose maximum tone/nuance quality over cost). Exact model ID to be resolved by the researcher via the `claude-api` skill.
- **D-02:** The pipeline runs in **CI, auto-triggered on changes to the EN source** — a push to `main` that touches `messages/en.json` or `content/{routes,pages,blog}/en/**` kicks off translation. Not a locally-run script, not site runtime. Reversibility: costly — undo touches the GitHub Actions workflow, secret wiring (ANTHROPIC_API_KEY in repo secrets), and the trigger-path filters. Per-run Opus cost is bounded because only changed keys are translated (see D-03).
- **D-03 (implication):** Because invocation is non-interactive CI, the QA gate must be **asynchronous** — output lands in a PR for human review (see D-08), not an inline terminal prompt.
- **D-04:** Change detection uses a **per-key hash manifest** (sidecar file storing a hash of the EN source per key/unit). A key is re-translated only when its EN hash differs from the manifest. Deterministic, independent of git history. Reversibility: costly — the manifest format becomes the contract every re-run and the Phase 73 AR/HI/ZH extension depend on.
- **D-05:** **Manual translation edits are preserved.** If a key's EN source is unchanged, the pipeline does not overwrite the existing target value. Retranslation happens only for keys whose EN source changed.
- **D-06:** The brand glossary + do-not-translate list live in a **separate editable file** (`i18n/glossary.json`) that the owner can edit without touching pipeline code. It holds DNT terms, per-locale term mappings, and per-locale tone guidance. Reversibility: reversible — the file is data, additive to edit.
- **D-07:** Premium tone locked per locale:
  - **RU** → formal **«Вы»** (respectful address; standard for luxury chauffeur).
  - **ES** → **European Spanish (España)**, `usted` for premium tone, European orthography/lexis (not neutral-international, not LatAm).
  - **FR** → **`vous`** (premium default).
- **D-08:** CI **commits translations to a branch and opens a PR** — the owner reviews the diff before merge to prod. Direct auto-commit to `content/`/`messages/` was rejected. Reversibility: reversible — a workflow-config change.
- **D-09:** The **"QA sampling pass" artifact** = a pipeline-generated QA report (sampled keys/pages across RU/ES/FR + automated checks: all keys present, no English leakage in translated surfaces, DNT terms preserved verbatim) **plus the owner's manual spot-check** (owner is a native RU speaker) reviewed in the PR. Automated-only gating was rejected.
- **D-10:** Blog is translated **MDX-aware**: translate frontmatter prose fields (title/description) + the markdown body, while preserving JSX, code, links, and frontmatter keys. One unified pipeline handles catalogs + route/page JSON + blog MDX.

### Claude's Discretion

- Exact Opus model ID and Anthropic SDK/invocation approach (resolve via `claude-api` skill; no AI SDK is currently installed — the researcher decides `@anthropic-ai/sdk` vs raw fetch).
- Hash-manifest file location, granularity (per-leaf-key vs per-file), and format.
- `i18n/glossary.json` exact schema (DNT list shape, per-locale mapping/tone-guide structure).
- Prompt construction / batching strategy per surface type (short chrome strings vs long marketing prose vs MDX), token budgeting, and retry/failure handling.
- GitHub Actions workflow file shape, path-filter globs, secret naming, and PR-open mechanics.
- QA report format/location and which sampling breadth per locale.
- How the stale placeholder catalogs (`messages/{ru,es,fr}.json` are currently EN copies) are reconciled on first real run.

### Deferred Ideas (OUT OF SCOPE)

- **AR / HI / ZH translation** and non-Latin/RTL rendering + fonts — Phase 73 (RTL-01, FONT-01, TR-02 remainder). The pipeline should be built locale-generic so Phase 73 only adds locales + glossary/tone entries, not a rewrite.
- **hreflang / metadata / sitemap / locale switcher SEO wiring** — Phase 74 (SEO-01). Not touched here beyond keeping EN output unchanged.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TR-01 | A re-runnable AI translation pipeline (`scripts/i18n-translate.mjs`) with a locked brand glossary and a do-not-translate list (prices/numbers, "Prestigo", E/S/V-Class names, proper nouns), premium tone per locale. EN is the source of truth; re-runs are idempotent. | Standard Stack (`@anthropic-ai/sdk`, model ID), Architecture Patterns (hash manifest, glossary schema, prompt construction per surface type), Don't Hand-Roll, Common Pitfalls (ICU/rich-tag preservation, RU pluralization), Code Examples |
| TR-02 (RU/ES/FR portion) | Complete translations for `ru, es, fr` across every catalog and content file (AR/HI/ZH deferred to Phase 73). | Runtime State Inventory (placeholder-catalog reconciliation, stale-key drift), Architecture Patterns (CI trigger + PR flow), Validation Architecture (completeness/no-EN-leakage checks) |

</phase_requirements>

## Summary

This phase builds a single Node.js ESM script, `scripts/i18n-translate.mjs`, invoked exclusively from a new GitHub Actions workflow (this repo currently has **no `.github/workflows/` directory at all** — this is the first CI workflow in the project `[VERIFIED: repo root ls, 2026-09-12 — .github does not exist]`). The script reads `messages/en.json` (602 leaf keys across 14 namespaces `[VERIFIED: messages/en.json — top-level keys Booking, Nav, Hero, Footer, FeatureStrip, Services, Fleet, HowItWorks, Testimonials, CookieBanner, Errors, Auth, Account, RoutePage]`) plus the Phase 71 content model (`content/routes/en/*.json` — 30 files, `content/pages/en/*.json` + `content/pages/en/services/*.json` — 17 files, `content/blog/en/*.mdx` — 10 files `[VERIFIED: find/ls counts, 2026-09-12]`), calls Claude Opus once per translatable unit (or batched by surface type), and writes sibling `ru/es/fr` files next to each `en/` source, governed by `i18n/glossary.json` (new) and tracked by a hash-manifest sidecar (new) for idempotency.

The single highest-risk technical fact discovered this session: **the placeholder catalogs are already drifted, not just stale.** `messages/ru.json` (and es/fr/ar/hi/zh) have only 580 of the 602 EN leaf keys — 22 keys under `RoutePage.*` exist in `en.json` (modified 2026-09-07) but are **entirely absent** from every other locale file (last modified 2026-09-05) `[VERIFIED: messages/en.json, messages/ru.json — diff of flattened leaf-key sets, 22 missing keys under RoutePage.*, confirmed by direct byte comparison this session]`. The comment in `i18n/request.ts` claiming the locale files "ship as byte-identical EN-copy stub files" is now inaccurate — Phase 71 added `RoutePage` to `en.json` without updating the stubs. The hash-manifest design in this document handles this automatically (a missing manifest entry is treated identically to a changed-hash entry), but the planner must not assume "stale EN copy" means "structurally identical" — it does not.

**Primary recommendation:** Use `@anthropic-ai/sdk` (official TypeScript/JS SDK, works from plain `.mjs`) calling `claude-opus-5` with a cached system prompt (glossary + DNT + tone rules, one `cache_control: {type: "ephemeral"}` block) and per-unit user prompts; drive change detection off a flat `unitKey -> sha256(enValue)` manifest (no per-locale hashing needed — D-05's "unchanged EN → skip" rule is fully satisfied by a single hash per unit); commit output to a branch via `peter-evans/create-pull-request@v8` in the new workflow.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Translation invocation (Claude API calls) | CI / Build-time script | — | D-02 locks this to CI, never runtime or local dev — no user-facing latency, no client exposure of `ANTHROPIC_API_KEY` |
| Change detection (hash manifest) | CI / Build-time script | Git-tracked sidecar file | Must be git-history-independent (D-04) so it works identically in CI's shallow checkout and a human's full clone |
| Glossary / DNT / tone rules | Data file (`i18n/glossary.json`) | CI script (consumer) | D-06 requires the owner to edit rules without touching pipeline code — this is a data/config tier concern, not application logic |
| Translated content storage | Filesystem (`content/*/​<locale>/`, `messages/<locale>.json`) | Next.js build (reader) | Phase 71's content model already treats these as static, locale-partitioned files read at build/request time — the pipeline is a producer, not a new reader |
| PR review / QA gate | GitHub (PR UI) | Human (owner) | D-08/D-09 — async human gate is a GitHub-platform concern, not application code |
| Runtime rendering of translated strings | Next.js Server/Client Components (`next-intl`) | — | Unchanged by this phase — `i18n/request.ts` already resolves `messages/${locale}.json` and Phase 71's loaders already resolve `content/*/​<locale>/` with EN fallback; this phase only populates the files those readers expect |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | `^0.125.0` | Official Node/TS client for the Messages API — model calls, prompt caching, typed errors, retries | `[VERIFIED: npm registry — npm view @anthropic-ai/sdk version → 0.125.0, published 2026-09-10, 29.7M weekly downloads, repo github.com/anthropics/anthropic-sdk-typescript]`. Official SDK is the mandated output per the `claude-api` skill's "Output Requirement" — raw fetch is only for cURL/shell projects or languages with no SDK, neither applies here. |
| `gray-matter` | `^4.0.3` (already installed) | Parse/rebuild MDX frontmatter for blog translation | `[VERIFIED: package.json:30]` — already a project dependency, already used identically by `lib/blog.ts` (`[VERIFIED: lib/blog.ts:12,52]` — `import matter from "gray-matter"`) |
| `zod` | `^4.3.6` (already installed) | Validate `i18n/glossary.json` shape and manifest shape at script startup; optionally validate structured-output JSON from Claude for batched calls | `[VERIFIED: package.json:47]` — already a project dependency |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `peter-evans/create-pull-request@v8` (GitHub Action, not npm) | v8 | Commits translated files to a branch and opens the PR from within the workflow | `[CITED: github.com/peter-evans/create-pull-request]` — current major version confirmed via WebSearch 2026-09-12; actively maintained, this is the de-facto standard action for "commit + open PR" in GitHub Actions |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@anthropic-ai/sdk` | Raw `fetch` against `POST /v1/messages` | Raw fetch loses typed errors, automatic retries, and the SDK's cache-control helpers for no benefit — only justified for cURL/shell projects, not this Node/ESM script. Rejected per `claude-api` skill's Output Requirement. |
| Message Batches API (`client.messages.batches.create`) | Synchronous per-unit calls in a loop | Batches run async at 50% cost and are well-suited to ~600+ independent translation units, but add polling/lifecycle complexity for a first version and complicate the "open a PR after translation" CI step (workflow would need a second job to poll for batch completion). Recommended as a Phase-73-or-later cost optimization once real per-run costs are measured — not required for TR-01/TR-02's correctness. |
| `peter-evans/create-pull-request` | `gh pr create` via GitHub CLI directly in a bash step | Both work; the Action encapsulates the commit+push+PR-dedup logic (re-running on an existing open PR updates it rather than opening duplicates) which a hand-rolled `gh` script would have to reimplement — prefer the Action. |
| Full markdown AST parsing (`remark`/`unified`) for MDX body segmentation | Whole-document prompt + post-hoc structural verification (regex-based invariant checks) | An AST-per-paragraph translation loses cross-paragraph context and actively hurts quality on marketing prose (D-01 prioritizes quality over cost) — see Architecture Patterns, Pattern 4. |

**Installation:**
```bash
npm install @anthropic-ai/sdk
```

**Version verification:** `npm view @anthropic-ai/sdk version` → `0.125.0` (checked 2026-09-12). `npm view` alone does not confer `[VERIFIED]` status per the package-name provenance rule — see Package Legitimacy Audit below for the full disposition.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@anthropic-ai/sdk` | npm | Latest patch published 2026-09-10 (package itself is multi-year, actively released) | 29.7M/week | `github.com/anthropics/anthropic-sdk-typescript` | `[SUS]` (reason: `too-new` — flags the most recent patch's publish date, not the package's age) | **Approved, false positive** — same "too-new on latest patch" pattern the project already dispositioned for `next-intl` at Phase 68 (`[VERIFIED: .planning/STATE.md — "68-01: next-intl@4.14.2 exact pin approved via blocking-human package-legitimacy checkpoint ... [SUS] too-new signal dispositioned as false positive on latest patch date"]`). 29.7M weekly downloads and the official `anthropics` GitHub org are unambiguous legitimacy signals; the `[SUS]` fires purely because Anthropic ships frequent patch releases. |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `@anthropic-ai/sdk` — dispositioned as a false positive above (precedent-matched to the Phase 68 `next-intl` case), but the planner should still route the `npm install @anthropic-ai/sdk` step through a `checkpoint:human-verify` task per the package-legitimacy gate's standing rule for any `[SUS]` verdict, even a dispositioned one, since this is the first time this package enters the repo.

*No other new npm packages are required — `gray-matter` and `zod` are already installed (see Standard Stack).*

## Architecture Patterns

### System Architecture Diagram

```
 [Developer/AI]
      │  edits messages/en.json OR content/{routes,pages,blog}/en/**
      ▼
 [git push to main] ──────────────────────────────────────────┐
      │                                                       │
      ▼ (GitHub Actions trigger, path-filtered)                │ (no matching path → workflow skipped)
 ┌─────────────────────────────────────────────────────────┐  │
 │  Workflow: i18n-translate.yml                            │  │
 │                                                           │  │
 │  1. checkout (full, so manifest sidecar is read as-is)   │  │
 │  2. npm ci                                                │  │
 │  3. node scripts/i18n-translate.mjs                       │  │
 │       │                                                   │  │
 │       ├─ load i18n/glossary.json (DNT + tone + terms)     │  │
 │       ├─ load i18n/translation-manifest.json (or init)    │  │
 │       ├─ walk EN sources:                                 │  │
 │       │    messages/en.json      → flatten leaf keys      │  │
 │       │    content/routes/en/*.json → flatten leaf keys   │  │
 │       │    content/pages/en/**/*.json → flatten leaf keys │  │
 │       │    content/blog/en/*.mdx → frontmatter + body     │  │
 │       │                                                   │  │
 │       ├─ for each unit: sha256(EN value)                  │  │
 │       │    == manifest.hash?  → SKIP (D-05)                │  │
 │       │    != / missing        → TRANSLATE (D-04)          │  │
 │       │                                                   │  │
 │       ├─ [changed units] ──► Claude Opus (Messages API)    │  │
 │       │      system: cached glossary+DNT+tone (per locale) │  │
 │       │      user: EN unit + surface-type instructions     │  │
 │       │      ──► ru / es / fr translated values            │  │
 │       │                                                   │  │
 │       ├─ write messages/{ru,es,fr}.json                    │  │
 │       ├─ write content/routes/{ru,es,fr}/*.json             │  │
 │       ├─ write content/pages/{ru,es,fr}/**/*.json           │  │
 │       ├─ write content/blog/{ru,es,fr}/*.mdx                │  │
 │       ├─ update i18n/translation-manifest.json              │  │
 │       └─ generate QA-REPORT.md (completeness, no-EN-leak,   │  │
 │           DNT-preserved, sample diff)                       │  │
 │                                                           │  │
 │  4. peter-evans/create-pull-request@v8                    │  │
 │       commits changed files + manifest + QA report          │  │
 │       opens/updates PR against main                          │  │
 └─────────────────────────────────────────────────────────┘  │
      │                                                       │
      ▼                                                       │
 [PR opened] ──► [Owner reviews diff + QA report + RU spot-check] (D-08/D-09)
      │
      ▼
 [Merge to main] ──► Vercel prod auto-deploy (unchanged EN root; new ru/es/fr surfaces live)
                                                               │
 [EN unchanged, no path match] ───────────────────────────────┘
      (byte-for-byte EN discipline preserved, Phases 68-71)
```

### Recommended Project Structure

```
scripts/
└── i18n-translate.mjs        # entry point, invoked by CI only
i18n/
├── routing.ts                 # existing — locale list, unchanged
├── request.ts                 # existing — comment needs updating post-Phase-72
├── glossary.json              # NEW — DNT list, per-locale term map + tone guide (D-06)
└── translation-manifest.json  # NEW — hash sidecar, git-tracked (D-04)
.github/
└── workflows/
    └── i18n-translate.yml     # NEW — first workflow in the repo
messages/
├── en.json                    # unchanged (source of truth)
├── ru.json / es.json / fr.json   # REWRITTEN this phase (real translations)
└── ar.json / hi.json / zh.json   # untouched (Phase 73)
content/
├── routes/{ru,es,fr}/*.json      # NEW dirs — sibling to existing en/
├── pages/{ru,es,fr}/**/*.json    # NEW dirs — sibling to existing en/
└── blog/{ru,es,fr}/*.mdx         # NEW dirs — sibling to existing en/
```

### Pattern 1: Flat hash manifest keyed by unit path (D-04/D-05)

**What:** A single JSON sidecar mapping a stable `unitKey` string to the sha256 of the current EN value. No per-locale hash is needed — D-05's rule is exactly "unchanged EN → skip," which a single hash satisfies.

**When to use:** Every translatable unit in every source file type (catalog leaf key, content JSON leaf key, MDX frontmatter field, MDX body).

**Schema:**
```json
{
  "version": 1,
  "units": {
    "messages/en.json::Booking.entryBar.pickupLocationLabel": {
      "enHash": "sha256:1f3d...",
      "lastTranslatedAt": "2026-09-12T10:00:00Z"
    },
    "content/routes/en/prague-berlin.json::hero.intro": {
      "enHash": "sha256:9ac0...",
      "lastTranslatedAt": "2026-09-12T10:00:03Z"
    },
    "content/blog/en/luxury-chauffeur-service-prague-vip.mdx::frontmatter.title": {
      "enHash": "sha256:33bb...",
      "lastTranslatedAt": "2026-09-12T10:00:07Z"
    },
    "content/blog/en/luxury-chauffeur-service-prague-vip.mdx::body": {
      "enHash": "sha256:70ea...",
      "lastTranslatedAt": "2026-09-12T10:00:09Z"
    }
  }
}
```

**Unit-key convention:** `<relative-source-path>::<dot-path-within-file>`. For MDX, use `frontmatter.<field>` for each translatable frontmatter field and a single `body` unit for the whole markdown body (see Pattern 4 for why the body is not split per-paragraph).

**Algorithm (per run):**
1. Flatten every EN source into `{ unitKey, value }` pairs.
2. For each pair: `currentHash = sha256(value)`. If `manifest.units[unitKey]?.enHash === currentHash`, skip (D-05 — this also correctly preserves any manual edit a human made directly to `ru.json`/content files, since the pipeline never re-reads or re-derives from the target file, only from EN + the manifest).
3. Otherwise (hash differs, or `unitKey` absent from the manifest — this is what makes the missing-`RoutePage`-keys drift self-healing, see Runtime State Inventory), translate for `ru`, `es`, `fr` and write `manifest.units[unitKey] = { enHash: currentHash, lastTranslatedAt: now() }`.
4. Persist the manifest alongside the translated files in the same commit.

**Why this design over alternatives:** git-diff-based detection was explicitly rejected in CONTEXT (D-04) because CI checkouts and shallow clones make git history unreliable as a source of truth; a full-EN-snapshot-diff (storing a copy of the entire previous `en.json` to diff against) works but requires storing a second full copy of the source of truth redundantly — the hash is strictly smaller and equally deterministic.

### Pattern 2: `i18n/glossary.json` schema (D-06/D-07)

**What:** A single owner-editable data file separating DNT rules (structural, must-preserve-verbatim tokens) from linguistic tone/register guidance (instructions to the model, not verbatim substitutions) from optional fixed term mappings (a small controlled vocabulary the owner wants pinned, e.g. "chauffeur" → a specific Russian word, distinct from letting the model choose freely).

```json
{
  "doNotTranslate": {
    "brand": ["Prestigo", "PRESTIGO", "chelautotrans s.r.o."],
    "vehicleClasses": ["Mercedes-Benz", "E-Class", "S-Class", "V-Class"],
    "structural": {
      "note": "These are syntax the pipeline must never alter, not vocabulary. Preserve exact spelling, casing, and surrounding punctuation.",
      "icuVariablePattern": "\\{[a-zA-Z][a-zA-Z0-9]*(,\\s*(plural|select)[^}]*)?\\}",
      "richTextTags": ["highlight", "price", "privacy", "strong", "terms", "wa"],
      "pricePlaceholderPattern": "\\{[a-zA-Z]+Price\\}",
      "phoneNumbers": ["+420 725 986 855"],
      "domains": ["rideprestigo.com"]
    }
  },
  "placeNames": {
    "note": "Geographic place names ARE translated to the target language's standard exonym (e.g. Prague -> Прага in ru, Prague -> Praga in es), NOT added to doNotTranslate. See RESEARCH.md Open Question 1.",
    "policy": "use-standard-exonym"
  },
  "locales": {
    "ru": {
      "formality": "formal",
      "toneGuide": "Formal «Вы» address throughout — standard register for a premium chauffeur brand. Avoid unnecessary Latin-script loanwords where an established Russian term exists. No exclamation-heavy marketing tone.",
      "pluralCategories": ["one", "few", "many", "other"],
      "termMap": {}
    },
    "es": {
      "formality": "formal",
      "dialect": "es-ES",
      "toneGuide": "European Spanish (Spain). Use 'usted' throughout for a premium register. European orthography and lexis only — e.g. 'coche'/'aparcamiento', never LatAm equivalents like 'carro'/'parqueo'.",
      "pluralCategories": ["one", "other"],
      "termMap": {}
    },
    "fr": {
      "formality": "formal",
      "toneGuide": "'Vous' throughout, premium/understated register.",
      "pluralCategories": ["one", "other"],
      "termMap": {}
    }
  }
}
```

**`pluralCategories` field rationale:** see Common Pitfalls — Pitfall 2 (RU has 4 CLDR plural categories vs EN's 2).

### Pattern 3: Prompt construction per surface type

**What:** Three distinct prompt shapes, all sharing one cached system prompt (glossary + DNT + tone), differing only in the user-turn framing:

1. **Short chrome strings** (catalog leaf values, button labels, ~1-15 words): batch many units into a single structured-output call per locale (numbered list in, numbered JSON array out) — minimizes round-trips for ~600 short units. Use `output_config: {format: {...}}` / `client.messages.parse()`-style structured output so the response is a validated JSON array, not free text to re-parse.
2. **Long-form marketing prose** (route/page JSON body fields — `openingParagraphs`, `routeNarrative.paragraphs`, `chauffeurNarrative`, FAQ answers): one call per file per locale (not per field) so Claude sees the full page as context and keeps terminology/tone consistent across a single route page — small unit count (30 route files + 17 page files) makes this affordable even un-batched.
3. **MDX blog body**: one call per post per locale, whole-document, per Pattern 4 below.

**Example (short-string batch, structured output):**
```typescript
// Source: claude-api skill (typescript/claude-api/README.md), adapted
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-opus-5",
  max_tokens: 16000,
  system: [
    { type: "text", text: buildSystemPrompt(glossary, "ru"), cache_control: { type: "ephemeral" } },
  ],
  messages: [{
    role: "user",
    content: `Translate each numbered EN string to Russian. Return a JSON array of strings in the same order, same length. Preserve ICU variables like {amount}, rich-text tags like <price>...</price>, and any doNotTranslate terms EXACTLY as given.\n\n${units.map((u, i) => `${i + 1}. ${u.value}`).join("\n")}`,
  }],
});
```

**Cache economics:** the system prompt (glossary + DNT + tone, likely 1-3K tokens per locale) is identical across every one of the ~600+3+ calls for a given locale within a run — `cache_control: {type: "ephemeral"}` on that block turns every call after the first into a ~90% cheaper cache-read for the system-prompt tokens `[CITED: claude-api skill, shared/prompt-caching.md summary — "cache_read_input_tokens ... ~0.1x cost"]`.

### Pattern 4: MDX-aware translation — whole-document prompt + post-hoc structural verification

**What:** Rather than parsing the MDX body into an AST and translating node-by-node (which fragments context across paragraph boundaries and demonstrably hurts prose quality — D-01 explicitly prioritizes translation quality), send the entire markdown body as one prompt with explicit preservation instructions, then run automated structural-invariant checks on the output before it's considered valid.

**Frontmatter handling:** parse with `gray-matter` (already installed, already used by `lib/blog.ts`) to split `data` (frontmatter object) from `content` (markdown body). Translate only `data.title` and `data.description` as short strings (Pattern 3.1); leave `data.date`, `data.dateModified`, `data.coverImage`, `data.category`, `data.author` untouched (structural, not prose) — `[VERIFIED: lib/blog.ts:53 — required frontmatter fields are "title", "description", "date", "coverImage", "category", "author"]`. Rebuild the file with `matter.stringify({ ...data, title: translatedTitle, description: translatedDescription }, translatedBody)`.

**Body preservation instructions (system/user prompt addendum):**
> Preserve verbatim: all fenced code blocks (` ``` `), all markdown link syntax `[text](url)` — translate the visible link text but never the URL — all heading markers (`#`, `##`), all list/bullet markers, and any HTML/JSX tags. Translate only the prose between these structures.

**Post-hoc structural verification (regex-based, no new dependency):**
```javascript
function verifyMdxStructure(enBody, translatedBody) {
  const countFences = (s) => (s.match(/```/g) || []).length;
  const countLinks = (s) => (s.match(/\[[^\]]*\]\([^)]*\)/g) || []);
  const enLinks = countLinks(enBody).map((l) => l.match(/\(([^)]*)\)/)[1]);
  const trLinks = countLinks(translatedBody).map((l) => l.match(/\(([^)]*)\)/)[1]);
  return {
    fencesMatch: countFences(enBody) === countFences(translatedBody),
    linkCountMatch: enLinks.length === trLinks.length,
    urlsPreserved: enLinks.every((url) => trLinks.includes(url)),
    headingCountMatch:
      (enBody.match(/^#{1,6}\s/gm) || []).length === (translatedBody.match(/^#{1,6}\s/gm) || []).length,
  };
}
```
A failed check flags the unit in the QA report (D-09) for owner review rather than silently shipping a structurally-broken MDX file.

### Anti-Patterns to Avoid

- **Per-locale hash tracking in the manifest:** unnecessary complexity — D-05 only requires detecting EN-source change, and a single `enHash` per unit does that. Tracking a hash of the *translated* value too would only be needed if the pipeline itself needed to detect human edits to overwrite them, which D-05 explicitly says it should NOT do.
- **Translating MDX paragraph-by-paragraph via an AST walk:** loses cross-paragraph context, actively conflicts with D-01's quality priority. Verify structure post-hoc instead (Pattern 4).
- **Re-deriving translations from the current (possibly hand-edited) target file:** the pipeline must always translate from the EN source, never from a prior translated value — otherwise a single bad AI translation compounds across re-runs.
- **Treating "proper nouns" DNT literally for geography:** see Open Question 1 — city/country names should get standard target-language exonyms, not be frozen in English.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Calling the Messages API, retries, typed errors | A raw `fetch` wrapper with manual retry/backoff | `@anthropic-ai/sdk` | SDK ships typed exception classes (`RateLimitError`, `APIConnectionError`, etc.), default retry (408/409/429/5xx), and cache-control helpers — reimplementing this is pure risk for no benefit `[CITED: claude-api skill]` |
| Committing files + opening/updating a PR from CI | A bash script calling `git commit`/`git push`/`gh pr create` with manual dedup logic for re-runs | `peter-evans/create-pull-request@v8` | Handles the "PR already open, update it instead of duplicating" case, diff-based no-op when nothing changed, and branch naming conventions that a hand-rolled script would have to reimplement |
| MDX frontmatter parsing/serialization | A custom YAML-frontmatter regex splitter | `gray-matter` (already a dependency, already used identically by `lib/blog.ts`) | Already proven correct against this exact content shape; a second, slightly-different parser is a consistency risk |
| Locale-aware pluralization rules (RU's 4 categories) | Hardcoded English-shaped plural branches translated 1:1 | Instruct Claude explicitly (via `pluralCategories` in the glossary) to emit full CLDR-correct ICU plural syntax for the target locale, and validate the output has the expected category keys | Getting Slavic pluralization wrong is a well-known, easy-to-miss i18n bug class — see Common Pitfalls, Pitfall 2 |

**Key insight:** this phase's genuine novel logic is small (the manifest algorithm and the DNT/glossary instructions) — almost everything else (API calls, PR mechanics, MDX parsing) has a mature off-the-shelf tool already in the stack or one click away in the ecosystem.

## Runtime State Inventory

> Included because this phase performs a **data migration** — reconciling the stale/drifted placeholder catalogs (`messages/{ru,es,fr}.json`) into real translations — even though the phase is not a rename/refactor.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `messages/{ru,es,fr}.json` currently hold 580 of 602 EN leaf keys — 22 `RoutePage.*` keys added to `en.json` on 2026-09-07 were never propagated to the locale stubs (created 2026-09-05) `[VERIFIED: messages/en.json vs messages/ru.json — direct leaf-key-flatten diff performed this session, 22 keys missing, e.g. "RoutePage.heroCtaPrimary", "RoutePage.sectionLabels.theRoute", ... full list of 22 available in the diff]`. | Data migration, self-healing: the hash-manifest algorithm (Pattern 1, step 3) treats an absent `unitKey` identically to a changed hash, so the first pipeline run will translate and backfill these 22 keys along with every other unit — no special-case code needed, but the planner should NOT assume "unchanged EN → skip" covers these keys on the first run, because there is no prior manifest entry for them. |
| Live service config | None — this pipeline has no external service configuration outside git (no n8n/Datadog/Tailscale equivalents in scope). | None. |
| OS-registered state | None — CI-only invocation, no OS-level task registration. | None. |
| Secrets/env vars | `ANTHROPIC_API_KEY` does not exist anywhere in this repo yet `[VERIFIED: grep across repo for "ANTHROPIC_API_KEY" — zero matches outside this phase's own planning docs]`. This is a genuinely new secret, not a rename of an existing one. Must be added as a **GitHub Actions repository secret** (Settings → Secrets and variables → Actions), referenced in the workflow as `${{ secrets.ANTHROPIC_API_KEY }}` — this departs from the project's historical local-`.env.local` pattern (D-02, explicitly acknowledged in CONTEXT). | Code edit (new workflow env wiring) + a manual one-time step (owner adds the secret via GitHub UI or `gh secret set`) — the planner should add a `checkpoint:human-verify` or explicit manual-step task for this, since no agent in this sandbox can create repository secrets. |
| Build artifacts / installed packages | `package.json` has no `@anthropic-ai/sdk` entry yet; `.github/workflows/` does not exist. | Code edit: `npm install @anthropic-ai/sdk` (updates `package.json` + `package-lock.json`), create `.github/workflows/i18n-translate.yml`. Neither requires a data migration, only new files. |

**Comment accuracy note:** `i18n/request.ts` (`[VERIFIED: i18n/request.ts:6-9]` — *"the 6 other configured locales (ru/es/fr/ar/hi/zh) ship as byte-identical EN-copy stub files until Phase 72/73 translate them"*) is now factually wrong for `ru/es/fr` given the drift above — the comment should be updated as part of this phase's implementation, not left describing a state that no longer holds.

## Common Pitfalls

### Pitfall 1: Breaking ICU MessageFormat / next-intl rich-text syntax during translation

**What goes wrong:** Claude translates the variable name inside `{amount}` or the tag name inside `<price>...</price>`, or reorders/mismatches an opening and closing tag, producing a string that either throws at render time (`next-intl` fails to parse) or silently drops the interpolation.

**Why it happens:** These are plain-looking curly-brace and angle-bracket tokens embedded directly in otherwise-natural-language strings — an LLM asked to "translate this to Russian" has no inherent signal that `{amount}` and `<price>` are syntax, not vocabulary, unless told explicitly.

**Concrete tokens found in this codebase that must be preserved verbatim** `[VERIFIED: messages/en.json — grep for curly/angle-bracket patterns, quoted exactly as they appear]`:
- Simple ICU variables: `{amount}`, `{className}`, `{code}`, `{count}`, `{date}`, `{day}`, `{destination}`, `{email}`, `{hours}`, `{label}`, `{message}`, `{minutes}`, `{model}`, `{name}`, `{number}`, `{n}`, `{origin}`, `{percent}`, `{price}` (and content-side placeholders `{ePrice}`, `{sPrice}`, `{vPrice}`, `{businessPrice}`, `{firstClassHourly}`, `{hourlyFrom}`, `{vClassHourly}`, `{sClassAirport}`, `{vClassAirport}`, `{sClassFallback}`, `{vClassFallback}`, `{cheapestIntercity}`, `{airportFrom}`, `{from}`, plus route-name placeholders `{berlin}`, `{budapest}`, `{kutnaHora}`, `{munich}`, `{vienna}` `[VERIFIED: grep across content/*.json for curly-brace patterns]`).
- ICU plural syntax: `"{className} · {passengers, plural, one {# passenger} other {# passengers}}"` (line 264) and `"{count, plural, one {# hour} other {# hours}}"` (line 357) `[VERIFIED: messages/en.json:264,357, quoted verbatim]`.
- Rich-text tag names used with `t.rich()`: `<highlight>`, `<price>`, `<privacy>`, `<strong>`, `<terms>`, `<wa>` `[VERIFIED: messages/en.json — full grep for <tag> patterns, exhaustive list]`. Example: `"consentBody": "... <privacy>Privacy Policy</privacy> · <terms>Legal Notice</terms>"` `[VERIFIED: messages/en.json:567, quoted verbatim]`.

**How to avoid:** encode all of the above as `doNotTranslate.structural` patterns in `i18n/glossary.json` (Pattern 2) and give an explicit system-prompt instruction to preserve them; validate post-translation with a regex pass that every ICU-variable/tag token present in the EN source is present, unchanged, in the translated output (fail-closed: flag for QA report if a token is missing or a tag is unbalanced).

**Warning signs:** a translated string missing a `{variable}` that was in the EN source, or an odd number of `<tag>`/`</tag>` occurrences.

### Pitfall 2: Russian pluralization has 4 CLDR categories, not 2

**What goes wrong:** The EN source uses `{count, plural, one {...} other {...}}` (2 categories, correct for English). If Claude mechanically translates only the `one`/`other` branches into Russian and leaves the ICU structure otherwise untouched, the resulting string is grammatically wrong for Russian counts like 2-4 (`few`) and 5-20/25-30/etc (`many`) — native Russian speakers will immediately notice.

**Why it happens:** ICU MessageFormat supports locale-specific plural category sets, but a naive "translate the text between the braces" pass doesn't know it needs to *add* categories, not just translate existing ones.

**How to avoid:** instruct Claude explicitly (via the `pluralCategories` field in `i18n/glossary.json`, Pattern 2) to emit the full `one`/`few`/`many`/`other` category set for Russian plural constructs, and validate post-translation that every RU plural-format string contains all 4 category keywords. `es`/`fr` use the same 2-category set as English (`one`/`other`), so no expansion is needed for those locales.

**Warning signs:** a RU translated string with an ICU plural block containing only 2 category branches.

### Pitfall 3: Treating geographic proper nouns as strict do-not-translate

**What goes wrong:** The phase description's DNT list mentions "proper nouns" generically. If implemented literally, city/country names (Prague, Berlin, Vienna, Munich...) would be left in English inside Cyrillic RU prose, reading as jarring and unprofessional in a premium-brand context, and would miss the standard Russian/Spanish exonyms readers expect (Прага, Berlín/Praga).

**Why it happens:** "Proper nouns" is ambiguous between "brand/entity names that must never change" (Prestigo, Mercedes-Benz) and "place names," which are ordinary translation targets with well-established target-language forms.

**How to avoid:** split the glossary into `doNotTranslate` (brand + vehicle-class only) and a separate `placeNames` policy instructing standard-exonym translation (Pattern 2). Flagged in Open Questions below for owner confirmation since this narrows a locked-decision phrase.

### Pitfall 4: First-run manifest absence triggers a full-catalog translation, not an incremental one

**What goes wrong:** If the planner assumes the pipeline's "only translate changed keys" property holds from the very first run, the actual first invocation (no manifest exists yet) will translate all ~602 catalog keys + all 30 route files + all 17 page files + all 10 blog posts in one CI run — a much larger and more expensive single run than subsequent incremental runs.

**Why it happens:** the hash-manifest is empty on the first run by definition, so every unit reads as "changed" (Pattern 1, step 3).

**How to avoid:** budget the first run explicitly as a full-catalog translation (roughly 602 + ~30×15 content fields + ~17×10 content fields + 10×2 blog units — several thousand short-to-medium translation calls, or far fewer if batched per Pattern 3) rather than assuming incremental-only cost. This is also the intended mechanism for reconciling the stale placeholder catalogs (see Runtime State Inventory) — the first run IS the reconciliation.

**Warning signs:** underestimating first-run CI job duration/cost in the plan.

## Code Examples

### Manifest-driven change detection (Node, ESM)

```javascript
// scripts/i18n-translate.mjs — core idempotency loop
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

### Anthropic SDK call with cached system prompt

```typescript
// Source: claude-api skill (typescript/claude-api/README.md, Prompt Caching section), adapted
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

async function translateBatch(units, locale, glossary) {
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: [
      {
        type: "text",
        text: buildSystemPrompt(glossary, locale),
        cache_control: { type: "ephemeral" }, // reused across every call this run
      },
    ],
    messages: [{ role: "user", content: buildBatchPrompt(units) }],
  });
  // response.usage.cache_read_input_tokens > 0 on every call after the first
  // confirms the cache is being hit (claude-api skill, "Verifying Cache Hits")
  return parseTranslatedBatch(response, units.length);
}
```

### MDX frontmatter round-trip (gray-matter, matches `lib/blog.ts` usage)

```javascript
// Source: pattern matches lib/blog.ts's existing gray-matter usage (verified this session)
import matter from "gray-matter";
import fs from "node:fs";

const raw = fs.readFileSync(enPath, "utf-8");
const { data, content } = matter(raw);
// translate data.title, data.description (short-string path) and content (body path)
const translatedData = { ...data, title: translatedTitle, description: translatedDescription };
const output = matter.stringify(translatedData, translatedBody);
fs.writeFileSync(localizedPath, output);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `thinking: {type: "enabled", budget_tokens: N}` for extended reasoning | `thinking: {type: "adaptive"}` (or omit — adaptive is Opus 5's default) | Deprecated on Opus 4.6/4.7/4.8, `budget_tokens` returns 400 on Opus 5 `[CITED: claude-api skill]` | Not directly load-bearing for this phase (translation is not a hard-reasoning task and can run at low/medium `output_config.effort`), but the planner should not write code using `budget_tokens` against `claude-opus-5` |
| Manual assistant-message prefill to force output shape | `output_config: {format: {...}}` structured outputs / `client.messages.parse()` | Prefill returns a 400 on Opus 5 `[CITED: claude-api skill]` | Directly relevant to Pattern 3's batched short-string translation — use structured output, not prefill, to force a JSON-array response |

**Deprecated/outdated:**
- `output_format` top-level parameter: superseded by `output_config: {format: {...}}` `[CITED: claude-api skill]`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Splitting the phase description's "proper nouns" DNT category into brand-only DNT + standard-exonym place names is the correct interpretation, rather than freezing all proper nouns (including cities) in English. | Common Pitfalls — Pitfall 3; Architecture Patterns — Pattern 2 | If wrong, RU/ES/FR content would read with English city names embedded in translated prose — a visible quality defect, but easy to fix by flipping the `placeNames` policy in `i18n/glossary.json` since it's a data file, not code (D-06's whole point). |
| A2 | A single call per route/page JSON file (not per field) for long-form prose gives Claude enough context for tone/terminology consistency without exceeding practical prompt size, and is affordable at only ~47 files. | Architecture Patterns — Pattern 3 | If per-file calls prove too large/unwieldy in practice, fall back to per-section calls (still larger than per-leaf-key) — a batching-granularity tuning issue, not a correctness issue. |
| A3 | The Message Batches API is not needed for a correct v1 pipeline (only as a later cost optimization). | Standard Stack — Alternatives Considered | If per-run cost turns out much higher than expected on the full first-run catalog (Pitfall 4), Batches becomes worth adopting sooner — this is a cost, not correctness, risk. |
| A4 | `peter-evans/create-pull-request@v8` handles "PR already open → update, don't duplicate" correctly for repeated pushes to the same source branch as CI re-runs. | Standard Stack; Don't Hand-Roll | Based on the action's documented behavior (not independently executed against a live PR in this session) — if it duplicates, the planner should add an explicit `if: existing PR` guard step. |

**If this table is empty:** N/A — see entries above; all four should be surfaced to the owner during discuss/plan review since A1 narrows a phrase in a locked decision (D's DNT description) and A3/A4 affect CI cost and PR ergonomics respectively.

## Open Questions

1. **Does "proper nouns" in the DNT list mean geographic place names too, or only brand/entity names?**
   - What we know: the phase description lists DNT items as "prices/numbers, 'Prestigo', E-/S-/V-Class names, proper nouns" — the first three items are unambiguous; "proper nouns" alone is broad enough to include city/country names.
   - What's unclear: whether the owner intends city names to stay in English (unusual for a premium multilingual brand) or receive standard target-language exonyms (the normal translation practice).
   - Recommendation: implement the standard-exonym behavior (Assumption A1) as the default in `i18n/glossary.json`, since it's a data file the owner can flip without a code change — surface this explicitly at the next discuss/plan checkpoint rather than blocking on it.

2. **First-run CI job duration/cost for the full-catalog translation (Pitfall 4) is unmeasured.**
   - What we know: roughly 602 catalog keys + ~30 route files + ~17 page files + ~11 blog posts (including the stray file, see below) need first-run translation across 3 locales — several thousand translation units if unbatched, far fewer Claude API calls if batched per Pattern 3.
   - What's unclear: real wall-clock time and dollar cost until a first run is executed — GitHub Actions has a default job timeout (6 hours) that is very unlikely to be hit, but per-run Opus cost should be estimated during planning (rough order of magnitude: `~610K input glossary+source tokens × $5/M + comparable output tokens × $25/M` scaled by batching factor).
   - Recommendation: the planner should size Wave 1 to run and observe a real first-run cost/duration before assuming a specific batching granularity is "good enough" — treat Pattern 3's batching choices as tunable, not fixed.

3. **The stray blog file `content/blog/prague-christmas-markets-chauffeur-2026.mdx` must move to `content/blog/en/` before translation.**
   - What we know: `[VERIFIED: ls content/blog/*.mdx → content/blog/prague-christmas-markets-chauffeur-2026.mdx present at BLOG_ROOT, sibling to the en/ subdirectory, confirmed this session]`. `lib/blog.ts`'s `contentDirFor()`/`getMDXPosts()` only reads from `content/blog/<locale>/` (`[VERIFIED: lib/blog.ts:37-41]`), so this stray file is currently invisible to the blog aggregator entirely (not rendered on the EN site either) — it predates this phase's discovery and is not caused by anything in Phase 72.
   - What's unclear: nothing — this is a clear pre-existing bug, just outside this phase's original description until CONTEXT flagged it.
   - Recommendation: a `git mv content/blog/prague-christmas-markets-chauffeur-2026.mdx content/blog/en/prague-christmas-markets-chauffeur-2026.mdx` task should run BEFORE the translation pipeline's first execution (Wave 0), otherwise this post is silently excluded from RU/ES/FR translation and remains excluded from the EN blog listing too.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `scripts/i18n-translate.mjs`, GitHub Actions runner | ✓ (local) | `>=24.0.0` per `package.json:6` `[VERIFIED: package.json:5-7]` | — |
| `@anthropic-ai/sdk` | Translation calls | ✗ (not yet installed) | — | `npm install @anthropic-ai/sdk` — no fallback needed, trivial install |
| `ANTHROPIC_API_KEY` | Every Claude API call | ✗ (does not exist in this repo yet, local or CI) | — | Must be provisioned as a GitHub Actions repository secret by the owner (manual, cannot be automated from this sandbox) — **blocking, no code fallback** |
| `.github/workflows/` directory | D-02's CI trigger | ✗ (directory does not exist) | — | Created by this phase — no fallback needed, this IS the deliverable |
| GitHub CLI / repo push access for testing the workflow | Verifying the workflow fires correctly | Unknown in this sandbox (no network egress to GitHub Actions verification implied by local tooling) | — | Verification of the live CI trigger firing correctly is a human/live-environment step — flag in Validation Architecture below |

**Missing dependencies with no fallback:**
- `ANTHROPIC_API_KEY` as a repository secret — this blocks any live pipeline execution (local test runs can use a personal key via `.env.local`, but D-02 explicitly locks CI + repo secret as the production invocation path).

**Missing dependencies with fallback:**
- `@anthropic-ai/sdk` — trivial `npm install`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.1` `[VERIFIED: package.json:74]` |
| Config file | `vitest.config.ts` (jsdom environment, `next-intl` inlined for SSR-safe test imports) `[VERIFIED: vitest.config.ts]` |
| Quick run command | `npx vitest run tests/i18n-translate-manifest.test.ts` (new test file, Wave 0 gap below) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TR-01 | Manifest hash comparison correctly skips unchanged-EN units and flags changed/missing units | unit | `npx vitest run tests/i18n-translate-manifest.test.ts` | ❌ Wave 0 |
| TR-01 | Glossary DNT tokens (ICU variables, rich-text tags, brand terms) survive a round-trip through the structural-verification helper unmodified | unit | `npx vitest run tests/i18n-translate-dnt.test.ts` | ❌ Wave 0 |
| TR-01 | MDX frontmatter round-trip via `gray-matter` preserves non-prose fields (`date`, `coverImage`, `category`, `author`) byte-for-byte | unit | `npx vitest run tests/i18n-translate-mdx.test.ts` | ❌ Wave 0 |
| TR-02 | Post-run, every locale (`ru`/`es`/`fr`) catalog has exactly the same leaf-key set as `en.json` (no missing, no extra) | integration/smoke | `npx vitest run tests/i18n-completeness.test.ts` (or a standalone node script run in CI as a QA-report step) | ❌ Wave 0 |
| TR-02 | No literal EN string leaks into a `ru/es/fr` translated surface for units whose hash indicates they were processed by the pipeline | integration | Part of the QA-report generation step (D-09) — script-level check, not a Vitest unit test, since it needs the real translated corpus | ❌ Wave 0 (build the QA-report generator itself) |
| TR-01 | EN source files (`messages/en.json`, `content/**/en/**`) are byte-for-byte unchanged after a pipeline run | smoke | `git diff --exit-code -- messages/en.json content/routes/en content/pages/en content/blog/en` in CI, post-run, pre-commit-step | ❌ Wave 0 (add as an explicit CI assertion step, not just a Vitest test — this must run against the actual CI checkout) |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/i18n-translate-*.test.ts` (fast, no live API calls — all unit tests should mock the Anthropic SDK client)
- **Per wave merge:** `npx vitest run` (full suite) + a dry-run of `scripts/i18n-translate.mjs` against a small fixture EN corpus (not the real 602-key catalog) to keep CI cost near zero during development
- **Phase gate:** full suite green before `/gsd-verify-work`; a real (small-cost) live run against the actual repo, gated behind the PR review (D-08/D-09), is the final phase-level validation — not a Vitest test, an actual CI execution

### Wave 0 Gaps

- [ ] `tests/i18n-translate-manifest.test.ts` — covers TR-01 hash-comparison logic (pure function, no API calls, easy to unit test in isolation from `scripts/i18n-translate.mjs`)
- [ ] `tests/i18n-translate-dnt.test.ts` — covers TR-01 DNT/ICU/rich-text preservation verification helper
- [ ] `tests/i18n-translate-mdx.test.ts` — covers TR-01 MDX frontmatter round-trip
- [ ] `tests/i18n-completeness.test.ts` — covers TR-02 key-completeness check (or implement as a plain node assertion script invoked by the QA-report step, whichever the planner decides is more idiomatic given no test file currently exercises `messages/*.json` directly)
- [ ] Mock setup for `@anthropic-ai/sdk` in tests — the manifest/DNT/MDX unit tests above must never call the real API; the planner should specify a mock `Anthropic` client or dependency-inject the client into the translation function so unit tests can substitute a stub (existing `tests/setup.ts` pattern conventions apply, per `[VERIFIED: vitest.config.ts:9]` `setupFiles: ['./tests/setup.ts']`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | no | This phase has no user-facing auth surface — it's a CI script |
| V3 Session Management | no | N/A |
| V4 Access Control | yes | `ANTHROPIC_API_KEY` must be scoped as a GitHub Actions repo secret, never exposed in logs, never committed to `.env.local` in a way that risks accidental commit (project's existing `.gitignore` already excludes `.env*`, `[VERIFIED: .gitignore]`) |
| V5 Input Validation | yes | Validate `i18n/glossary.json` shape at script startup with `zod` (already installed) — a malformed glossary should fail the CI job loudly, not silently translate with missing DNT rules |
| V6 Cryptography | yes (narrow) | `sha256` for the hash manifest is a non-cryptographic integrity/change-detection use (not a security boundary) — Node's built-in `node:crypto` `createHash('sha256')` is sufficient and is what's used in Code Examples; no external crypto library needed |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Secret leakage via CI logs (accidentally logging the API key or full request/response bodies containing it) | Information Disclosure | Never `console.log` the client config or raw request headers; the Anthropic SDK does not echo the API key in responses by default — audit any custom logging added to the script |
| Prompt injection via translatable content (an EN source string crafted to make Claude ignore system instructions and, e.g., emit content outside the DNT rules) | Tampering | Low risk here since EN source content is owner-authored, not third-party user input — but the DNT/structural-verification post-hoc checks (Pitfall 1/2 validators) act as a defense-in-depth backstop regardless of *why* a translated unit deviates from the rules |
| Supply-chain risk on the newly-added `@anthropic-ai/sdk` dependency | Tampering | Addressed via the Package Legitimacy Audit above — pin an exact version in `package.json` (not a loose `^` range) per the project's Phase 68 precedent for new externally-sourced dependencies, and route the install through a `checkpoint:human-verify` task |
| Malformed/adversarial `i18n/glossary.json` (owner typo breaks JSON, or a future contributor injects a bad regex causing catastrophic backtracking) | Denial of Service (CI) | Validate with `zod` at startup (V5 above); keep DNT regex patterns simple/anchored (the patterns proposed in Pattern 2 are all simple bounded-length token matches, not open-ended nested quantifiers) |

## Sources

### Primary (HIGH confidence)

- `claude-api` skill (bundled, self-loaded this session) — Opus model ID (`claude-opus-5`), pricing ($5/$25 per MTok), 1M context window, prompt caching mechanics, `@anthropic-ai/sdk` TypeScript usage, structured outputs, Message Batches, cost-optimization guidance
- `messages/en.json`, `messages/ru.json` — read and diffed directly this session (leaf-key flatten comparison, 602 vs 580 keys, 22 missing `RoutePage.*` keys)
- `i18n/routing.ts`, `i18n/request.ts`, `lib/routes.ts`, `lib/blog.ts` — read directly this session
- `content/routes/en/prague-berlin.json`, `content/pages/en/home.json`, `content/pages/en/faq.json`, `content/pages/en/services/airport-transfer.json`, `content/blog/en/luxury-chauffeur-service-prague-vip.mdx` — read directly this session for real content shapes/placeholder conventions
- `package.json`, `.gitignore`, `vitest.config.ts`, `.husky/pre-commit` — read directly this session
- `gsd-tools query package-legitimacy check --ecosystem npm @anthropic-ai/sdk` — tool-executed this session, returned `SUS`/`too-new` (dispositioned as false positive against Phase 68 precedent)
- `npm view @anthropic-ai/sdk version` — tool-executed this session, `0.125.0`

### Secondary (MEDIUM confidence)

- WebSearch: "peter-evans create-pull-request GitHub Action current maintained version" — confirmed v8 as current major version, actively maintained `[CITED: github.com/peter-evans/create-pull-request]`

### Tertiary (LOW confidence)

- None — every claim in this document is either tool-verified this session or cited to the `claude-api` skill/an official repo.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — model ID and pricing came from the `claude-api` skill's live-cached table (self-described as cached 2026-06-24, but this is the authoritative in-session source per skill instructions, and the SDK version was independently confirmed via `npm view`)
- Architecture: HIGH — hash-manifest and glossary designs are derived directly from the locked D-04/D-05/D-06/D-07 decisions plus concrete, verified content shapes (real placeholder tokens, real ICU/rich-text syntax read from the actual `messages/en.json`)
- Pitfalls: HIGH — every pitfall in this document is grounded in a specific, quoted, verified string or file from this repo, not a generic i18n concern

**Research date:** 2026-09-12
**Valid until:** 30 days (stable domain — Anthropic model pricing/IDs can shift faster; re-verify the model ID via the `claude-api` skill immediately before `/gsd-plan-phase` if more than ~2 weeks have elapsed since this research)
