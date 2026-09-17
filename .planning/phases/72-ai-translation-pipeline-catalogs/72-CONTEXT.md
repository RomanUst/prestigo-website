# Phase 72: AI Translation Pipeline & Catalogs - Context

**Gathered:** 2026-09-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a re-runnable, **AI-only** translation pipeline (`scripts/i18n-translate.mjs`) that reads the English source of truth — `messages/en.json` (602 leaf keys) plus the Phase 71 locale-aware content model (`content/routes/en/<slug>.json`, `content/pages/en/<page>.json`, `content/blog/en/*.mdx`) — and generates **RU, ES, FR** catalogs and localized content. Governed by a locked brand glossary and a do-not-translate list (prices/numbers, "Prestigo", E-/S-/V-Class names, proper nouns), with a premium tone tuned per locale. English stays the single source of truth; re-runs are idempotent (unchanged EN → no diff; only added/changed source keys re-translated). A QA sampling pass across the three locales is recorded.

**Out of scope (deferred to Phase 73):** AR/HI/ZH generation and non-Latin/RTL rendering. Those locales continue to render English via fallback.

</domain>

<decisions>
## Implementation Decisions

### Translation engine & invocation
- **D-01:** The pipeline uses **Claude Opus** for all translations (owner chose maximum tone/nuance quality over cost). Exact model ID to be resolved by the researcher via the `claude-api` skill.
- **D-02:** The pipeline runs in **CI, auto-triggered on changes to the EN source** — a push to `main` that touches `messages/en.json` or `content/{routes,pages,blog}/en/**` kicks off translation. Not a locally-run script, not site runtime. — **Reversibility:** costly — undo touches the GitHub Actions workflow, secret wiring (ANTHROPIC_API_KEY in repo secrets), and the trigger-path filters. Per-run Opus cost is bounded because only changed keys are translated (see D-03).
- **D-03 (implication):** Because invocation is non-interactive CI, the QA gate must be **asynchronous** — output lands in a PR for human review (see D-08), not an inline terminal prompt.

### Idempotency & change detection
- **D-04:** Change detection uses a **per-key hash manifest** (sidecar file storing a hash of the EN source per key/unit). A key is re-translated only when its EN hash differs from the manifest. Deterministic, independent of git history (chosen over git-diff and full-EN-snapshot). — **Reversibility:** costly — the manifest format becomes the contract every re-run and the Phase 73 AR/HI/ZH extension depend on.
- **D-05:** **Manual translation edits are preserved.** If a key's EN source is unchanged, the pipeline does not overwrite the existing target value — a hand-edited `ru.json` string survives re-runs. Retranslation happens only for keys whose EN source changed. (The hash manifest naturally implements this: unchanged EN hash → key skipped.)

### Glossary, DNT list & per-locale tone
- **D-06:** The brand glossary + do-not-translate list live in a **separate editable file** (e.g. `i18n/glossary.json`) that the owner can edit without touching pipeline code. It holds DNT terms, per-locale term mappings, and per-locale tone guidance. The pipeline reads it. — **Reversibility:** reversible — the file is data, additive to edit.
- **D-07:** Premium tone locked per locale:
  - **RU** → formal **«Вы»** (respectful address; standard for luxury chauffeur).
  - **ES** → **European Spanish (España)**, `usted` for premium tone, European orthography/lexis (not neutral-international, not LatAm).
  - **FR** → **`vous`** (premium default).

### QA gate & output flow
- **D-08:** CI **commits translations to a branch and opens a PR** — the owner reviews the diff before merge to prod. The PR is the human quality gate; direct auto-commit to `content/`/`messages/` was rejected. — **Reversibility:** reversible — a workflow-config change.
- **D-09:** The **"QA sampling pass" artifact** = a pipeline-generated QA report (sampled keys/pages across RU/ES/FR + automated checks: all keys present, no English leakage in translated surfaces, DNT terms preserved verbatim) **plus the owner's manual spot-check** (owner is a native RU speaker) reviewed in the PR. Automated-only gating was rejected.
- **D-10:** Blog is translated **MDX-aware**: translate frontmatter prose fields (title/description) + the markdown body, while preserving JSX, code, links, and frontmatter keys. One unified pipeline handles catalogs + route/page JSON + blog MDX. (Success criterion #3 requires `content/blog/<locale>/`, so blog is in-scope this phase, not deferred.)

### Claude's Discretion
- Exact Opus model ID and Anthropic SDK/invocation approach (resolve via `claude-api` skill; no AI SDK is currently installed — the researcher decides `@anthropic-ai/sdk` vs raw fetch).
- Hash-manifest file location, granularity (per-leaf-key vs per-file), and format.
- `i18n/glossary.json` exact schema (DNT list shape, per-locale mapping/tone-guide structure).
- Prompt construction / batching strategy per surface type (short chrome strings vs long marketing prose vs MDX), token budgeting, and retry/failure handling.
- GitHub Actions workflow file shape, path-filter globs, secret naming, and PR-open mechanics.
- QA report format/location and which sampling breadth per locale.
- How the stale placeholder catalogs (`messages/{ru,es,fr}.json` are currently EN copies) are reconciled on first real run.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 72: AI Translation Pipeline & Catalogs" — goal + 4 success criteria (idempotent re-run, glossary/DNT enforced, complete RU/ES/FR catalogs+content, subpaths render with no EN leakage while EN root stays byte-for-byte unchanged; AR/HI/ZH still render EN).
- `.planning/REQUIREMENTS.md` — TR-01 (re-runnable AI pipeline + glossary + DNT + premium tone; EN source of truth; idempotent), TR-02 (complete translations; RU/ES/FR portion belongs to this phase).

### Content model this pipeline reads/writes (from Phase 71 — LOCKED)
- `.planning/phases/71-content-externalization-marketing-seo-pages/71-CONTEXT.md` — the locale-aware content model: `content/routes/<locale>/<slug>.json`, `content/pages/<locale>/<page>.json`, `content/blog/<locale>/*.mdx`, `messages/<locale>.json`; EN-fallback loaders; JSON chosen specifically so this pipeline can machine-read/diff bodies.
- `messages/en.json` — source catalog (602 leaf keys) + Phase 69/70 namespace/key convention.
- `lib/routes.ts` — locale-invariant route data (prices/distances stay here — NOT translated; they are DNT by nature).
- `lib/blog.ts` — blog aggregator (locale-aware `CONTENT_DIR`, gray-matter MDX + `JSX_POSTS`); the 3 legacy JSX posts stay EN-only.

### Established i18n patterns (dependencies)
- `.planning/phases/70-string-externalization-booking-account/70-PATTERNS.md` — Phase 69/70 next-intl conventions (used only to understand catalog structure; this phase generates content, does not re-wire consumers).

### Model / API guidance
- `claude-api` skill (loadable) — Opus model IDs, SDK usage, token counting. **MUST** load before choosing the model ID / invocation approach.

### Codebase maps (context)
- `.planning/codebase/STRUCTURE.md`, `.planning/codebase/CONVENTIONS.md` — repo layout and script conventions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The Phase 71 content model + EN-fallback loaders are the read/write target — the pipeline writes sibling `<locale>/` dirs next to the existing `en/` dirs.
- `messages/en.json` structure is the catalog schema to mirror per locale.

### Established Patterns
- **Byte-for-byte EN discipline** (Phases 68–71): EN is the source; the pipeline must never mutate EN outputs. Adding `ru/es/fr` files must not change EN rendering or the EN root URLs.
- Project convention: secret-bearing scripts historically run locally (`.env.local` sandbox-restricted) — this phase deliberately departs to **CI + repo secret** for the API key (D-02); the researcher should confirm the ANTHROPIC_API_KEY secret path.

### Integration Points
- Writes: `messages/{ru,es,fr}.json`, `content/routes/{ru,es,fr}/*.json`, `content/pages/{ru,es,fr}/*.json`, `content/blog/{ru,es,fr}/*.mdx`.
- Reads: `messages/en.json`, `content/*/en/**`, `i18n/glossary.json` (new).
- New: `scripts/i18n-translate.mjs`, hash-manifest sidecar, `i18n/glossary.json`, a GitHub Actions workflow, a QA-report artifact.
- **Placeholder catalogs to reconcile:** `messages/{ru,es,fr,ar,hi,zh}.json` currently exist as **stale EN copies** (kept for a green 0-MISSING_MESSAGE build). RU/ES/FR get replaced with real translations this phase; AR/HI/ZH stay as EN placeholders (Phase 73).

</code_context>

<specifics>
## Specific Ideas

- Owner explicitly prioritized **translation quality (Opus)** over cost.
- Per-locale linguistic register is a locked brand decision: RU «Вы», ES European `usted`, FR `vous` — the glossary/tone-guide must encode these.
- The PR-based review + owner RU spot-check is the intended human gate; the pipeline should make the diff easy to review (e.g. clean per-key/per-file output).
- **Stray file to relocate (planner note):** `content/blog/prague-christmas-markets-chauffeur-2026.mdx` sits at the `content/blog/` root — it should live under `content/blog/en/` before translation so the locale-aware loader and pipeline see it consistently.

</specifics>

<deferred>
## Deferred Ideas

- **AR / HI / ZH translation** and non-Latin/RTL rendering + fonts — Phase 73 (RTL-01, FONT-01, TR-02 remainder). The pipeline should be built locale-generic so Phase 73 only adds locales + glossary/tone entries, not a rewrite.
- **hreflang / metadata / sitemap / locale switcher SEO wiring** — Phase 74 (SEO-01). Not touched here beyond keeping EN output unchanged.

</deferred>

---

*Phase: 72-ai-translation-pipeline-catalogs*
*Context gathered: 2026-09-11*
