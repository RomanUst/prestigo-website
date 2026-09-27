# Phase 71: Content Externalization — Marketing & SEO Pages - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-06
**Phase:** 71-content-externalization-marketing-seo-pages
**Areas discussed:** Route content model, Catalog vs content boundary, Blog localization & fallback, Phase decomposition (71a/71b)

---

## Route content model — location

| Option | Description | Selected |
|--------|-------------|----------|
| content/routes/<locale>/<slug> | Per-route, per-locale file (.ts or .json), loaded by slug+locale with EN fallback; prices stay in lib/routes.ts; mirrors content/blog/<locale>/ | ✓ |
| Extend lib/routes.ts | Add body fields to Route type + locale variant; single central file but 626→huge, mixes locale-invariant data with prose | |
| MDX per route | Each route as MDX per locale; bodies are structured arrays, MDX complicates render/JSON-LD and byte-for-byte EN | |

**User's choice:** content/routes/<locale>/<slug>

## Route content model — file format

| Option | Description | Selected |
|--------|-------------|----------|
| JSON | .json + shared TS type RouteContent; easy to parse/diff for Phase 72 pipeline, clean content/code separation, no executable code | ✓ |
| Typed .ts | Exports a typed object; strict editor typing but harder for Phase 72 to parse/regenerate TS literals | |

**User's choice:** JSON

## Route content model — render approach

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal in-place replacement | Each page.tsx keeps its JSX; local consts replaced with getRouteContent(slug, locale); safest for byte-for-byte, minimal diff | ✓ |
| Single renderer | Shared <RoutePageBody content={...}/> for all 32 pages; DRY but any markup diff breaks byte-for-byte across 32 pages | |
| Decide later | Let researcher/planner assess markup uniformity | |

**User's choice:** Minimal in-place replacement

---

## Catalog vs content boundary — split rule

| Option | Description | Selected |
|--------|-------------|----------|
| By nature of text | Chrome = short reusable UI labels → messages/en.json; content model = prose, structural lists, FAQ, hero | ✓ |
| By length (word threshold) | Fixed >N-words / full-sentence threshold; simple but awkward on edge cases | |
| Whole page body → content | All page copy incl. minor headings → content model; catalog only for global chrome; fewer "where" decisions but duplicates shared labels | |

**User's choice:** By nature of text

## Catalog vs content boundary — non-route page body location

| Option | Description | Selected |
|--------|-------------|----------|
| content/pages/<locale>/<page>.json | Parallel to content/routes/<locale>/; single content-model pattern, same EN fallback & loader | ✓ |
| Split by type | Structural pages → JSON; text-only legal → MDX like blog; more flexible but two mechanisms | |
| Decide later | Researcher assesses actual page structure | |

**User's choice:** content/pages/<locale>/<page>.json

---

## Blog localization & fallback — untranslated post behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Render EN + canonical→EN | Show EN body under /{locale}/blog/<slug>, canonical points to EN; no duplicate indexation, content always available | ✓ |
| Hide untranslated | Non-localized posts absent from /{locale}/blog listing; clean language but empty blog on new locales | |
| EN post in listing | Listing shows EN posts inline (mixed language), click → EN body; max content but mixed language in list | |

**User's choice:** Render EN + canonical→EN

## Blog localization & fallback — legacy JSX_POSTS

| Option | Description | Selected |
|--------|-------------|----------|
| Keep EN-only JSX | 3 JSX posts stay as-is (EN-only, non-localizable), surfaced via EN fallback; zero byte-for-byte risk, minimal work | ✓ |
| Migrate to MDX | Move 3 JSX posts into content/blog/en/ as MDX; unified mechanism but byte-for-byte and 301/canonical risk | |
| Decide later | Researcher assesses migration complexity and SEO risk | |

**User's choice:** Keep EN-only JSX

---

## Phase decomposition (71a/71b)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep one phase, split by plans | One Phase 71, multiple PLAN.md (routes / marketing / blog), wave-based parallelization, single verify; easier to track | ✓ |
| Split 71a/71b | 71a = 32 route bodies (CNT-01); 71b = marketing/service/legal + blog (CNT-02/03); separate verify/ship but more overhead + ROADMAP edits | |
| Decide later | Planner assesses scope after research | |

**User's choice:** Keep one phase, split by plans

---

## Claude's Discretion

- JSON-LD / FAQPage / AggregateRating sourcing from the content model (keep rendered EN structured data unchanged).
- Exact RouteContent / page-content TS schema, loader/fallback helper signatures.
- Sitemap / hreflang / canonical wiring (unaffected for EN), per-plan file grouping and wave layout.

## Deferred Ideas

None — discussion stayed within phase scope. Actual RU/ES/FR/AR/HI/ZH translation is Phase 72.
