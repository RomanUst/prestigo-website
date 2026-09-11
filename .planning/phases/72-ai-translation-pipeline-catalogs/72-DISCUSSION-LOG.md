# Phase 72: AI Translation Pipeline & Catalogs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-11
**Phase:** 72-ai-translation-pipeline-catalogs
**Areas discussed:** Translation engine, Idempotency & CI trigger, Glossary & tone, QA gate & output

---

## Translation engine

| Option | Description | Selected |
|--------|-------------|----------|
| Claude Sonnet | Cheaper, sufficient with strict glossary+DNT; selectively bump to Opus | |
| Claude Opus | Max tone/nuance quality, costlier/slower | ✓ |
| Hybrid | Sonnet for chrome strings, Opus for long marketing/SEO | |

**User's choice:** Claude Opus.

| Option | Description | Selected |
|--------|-------------|----------|
| Locally by you | `node scripts/...`, key from .env.local, like other project scripts | |
| CI / GitHub Action | Translation in pipeline on EN change; key in secrets | ✓ |
| You decide | Leave to researcher/planner | |

**User's choice:** CI / GitHub Action.
**Notes:** CI invocation is non-interactive → QA review must be asynchronous (PR-based), which shaped the QA-gate area below.

---

## Idempotency & CI trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Hash manifest | Per-key EN source hash sidecar; translate only where hash differs | ✓ |
| Git-diff EN | Compare EN sources to previous commit; fragile in CI/rebases | |
| EN snapshot | Store translated-EN copy, diff by text; duplicates data | |

**User's choice:** Hash manifest.

| Option | Description | Selected |
|--------|-------------|----------|
| Manual dispatch | workflow_dispatch, run on demand | |
| Auto on EN change | push to main touching EN sources triggers autotranslate | ✓ |
| — | | |

**User's choice:** Auto on EN change.
**Notes:** Auto-trigger is cost-safe because hash manifest re-translates only changed keys.

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve | Manual edits kept if EN source of that key unchanged | ✓ |
| Overwrite | AI is sole source; regenerate everything on re-run | |

**User's choice:** Preserve manual overrides.

---

## Glossary & tone

| Option | Description | Selected |
|--------|-------------|----------|
| Separate editable file | e.g. i18n/glossary.json — DNT + per-locale mapping + tone guide; pipeline reads it | ✓ |
| In the script | Hardcoded in i18n-translate.mjs | |

**User's choice:** Separate editable file.

| Option | Description | Selected |
|--------|-------------|----------|
| «Вы» (formal) | Respectful; premium standard | ✓ |
| «ты» (informal) | Closer/younger — atypical for premium | |

**User's choice:** RU → «Вы» (formal).

| Option | Description | Selected |
|--------|-------------|----------|
| European (España) | usted, European orthography/lexis | ✓ |
| Neutral international | No regional markers | |

**User's choice:** ES → European (España). FR → `vous` (locked as premium default alongside the question).

---

## QA gate & output

| Option | Description | Selected |
|--------|-------------|----------|
| Opens PR | CI commits to a branch + opens PR for owner review before prod merge | ✓ |
| Direct to content/ | Auto-commit to messages/content directly, no human review | |

**User's choice:** Opens PR.

| Option | Description | Selected |
|--------|-------------|----------|
| QA report + your spot-check | Pipeline QA report (sampling + DNT/completeness checks) + owner native-RU spot-check in PR | ✓ |
| Auto checks only | Machine gates only (keys present, no EN leak, DNT preserved) | |

**User's choice:** QA report + owner spot-check.

| Option | Description | Selected |
|--------|-------------|----------|
| MDX-aware translation | Translate frontmatter prose + markdown body, preserve JSX/code/links/keys | ✓ |
| Blog later | Only catalogs + route/page content this phase | |

**User's choice:** MDX-aware translation (blog in-scope; success criterion #3 requires content/blog/<locale>/).

---

## Claude's Discretion

- Exact Opus model ID + Anthropic SDK vs raw-fetch invocation (resolve via `claude-api` skill).
- Hash-manifest location/granularity/format.
- `i18n/glossary.json` schema.
- Prompt/batching strategy per surface type, token budgeting, retry handling.
- GitHub Actions workflow shape, path filters, secret naming, PR-open mechanics.
- QA report format/location and per-locale sampling breadth.
- Reconciliation of stale placeholder catalogs on first real run.

## Deferred Ideas

- AR/HI/ZH translation + non-Latin/RTL infra + fonts → Phase 73 (build pipeline locale-generic so 73 only adds locales/glossary entries).
- hreflang/metadata/sitemap/locale-switcher SEO wiring → Phase 74.
