# Phase 71: Content Externalization — Marketing & SEO Pages - Context

**Gathered:** 2026-09-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Move all long-form and structured page bodies across the public site — Home long-form sections, the 8 service pages, about/faq/contact/corporate, the legal pages, the 29–30 route-page bodies (inclusions, day-trip configs, whyBook, FAQ, hero copy), and the blog — out of hardcoded JSX/inline literals into a **locale-aware content model**. UI-chrome-style strings continue to use the `messages/en.json` catalog under the Phase 69/70 next-intl convention. English output stays **byte-for-byte unchanged** (English is the source). **No translation of other locales happens in this phase** (that is Phase 72) — non-EN subpaths render English content correctly via fallback.

This is the largest content restructure of the milestone. It is kept as a **single Phase 71**, split across multiple PLAN.md files, not into 71a/71b.

</domain>

<decisions>
## Implementation Decisions

### Route-page content model (CNT-01)
- **D-01:** The 32 route-page bodies move to per-locale JSON files at `content/routes/<locale>/<slug>.json`, keyed by route slug, with a shared TypeScript type `RouteContent`. A loader resolves by slug + active locale with **English fallback**. — **Reversibility:** costly — undo would touch the loader plus all 32 route `page.tsx` consumers and the Phase 72 translation pipeline that reads this layout.
- **D-02:** Locale-invariant data (prices, distances, duration, tier, metadata title) **stays in `lib/routes.ts`** — it is not moved into the content model. Only locale-varying prose/structured bodies move.
- **D-03:** File format is **JSON** (not typed `.ts` modules), chosen so the re-runnable Phase 72 AI translation pipeline can machine-read and diff the bodies cleanly, and so no executable code lives in the content layer. A shared TS type validates shape at the loader boundary.
- **D-04:** Each route `page.tsx` keeps its existing JSX markup; only the local `const inclusions / dayTripConfigurations / whyBook / faq / hero` literals are replaced with `getRouteContent(slug, locale)` reads. **Minimal in-place replacement** — no shared `<RoutePageBody>` renderer — to protect byte-for-byte English output and minimize markup diff. — **Reversibility:** reversible — per-page local change.

### Catalog vs content boundary (CNT-02)
- **D-05:** The split rule is **by nature of the text**, not a word-count threshold: chrome = short, reusable UI labels (buttons, nav, form labels, micro-headings) → `messages/en.json`; long-form = prose/marketing paragraphs, structural lists with full sentences, FAQ, hero copy → the content model.
- **D-06:** Long-form bodies of non-route pages (Home sections, 8 service pages, about/faq/contact/corporate, legal) live at `content/pages/<locale>/<page>.json` — a **parallel pattern to `content/routes/<locale>/`**, same EN-fallback loader and single mental model. — **Reversibility:** costly — same reasoning as D-01 (loader + consumers + Phase 72).

### Blog localization & fallback (CNT-03)
- **D-07:** Blog relocates to `content/blog/<locale>/`. When a localized post does not exist, `/{locale}/blog/<slug>` **renders the English body with `canonical → EN`** (no duplicate-indexation of untranslated content).
- **D-08:** The 3 legacy `JSX_POSTS` (colocated JSX blog pages, not MDX) **stay EN-only as-is**; the listing surfaces them through the English fallback. No migration to MDX — zero byte-for-byte risk and no 301/canonical churn.

### Phase decomposition
- **D-09:** **Do not split into 71a/71b.** Keep one Phase 71, broken into several PLAN.md files (e.g. routes / marketing+service+legal / blog) with wave-based parallelization in execute-phase, and a single verify.

### Claude's Discretion
- JSON-LD / FAQPage / AggregateRating sourcing: route/service pages currently build structured data from body content (e.g. FAQ). The researcher/planner decides how the content model feeds JSON-LD while keeping the rendered EN structured data unchanged.
- The exact `RouteContent` / page-content TypeScript schema shape, the loader/fallback helper signatures, sitemap/hreflang/canonical wiring (must remain unaffected for EN), and per-plan file grouping and wave layout.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 71: Content Externalization — Marketing & SEO Pages" — goal, 4 success criteria (byte-for-byte EN, indexable/noindex split preserved, sitemap/canonical/structured-data unaffected).
- `.planning/REQUIREMENTS.md` — CNT-01 (route bodies), CNT-02 (marketing/service/legal), CNT-03 (blog per-locale).

### Established i18n patterns (dependencies)
- `.planning/phases/70-string-externalization-booking-account/70-PATTERNS.md` — Phase 69/70 next-intl patterns: Client `useTranslations`, Server `getTranslations`, `@/i18n/routing` Link/navigation, single-source label maps.
- `messages/en.json` — the chrome-string catalog and namespace/key convention (Phase 69/70) that chrome strings continue to use.
- `i18n/routing` — locale-aware navigation/routing source (Phase 68).

### Existing content sources to restructure
- `lib/routes.ts` — central route data layer (prices/distances stay here; note the header comment: per-route `page.tsx` currently owns its own body content — that is exactly what moves).
- `lib/blog.ts` — blog aggregator: reads `content/blog/*.mdx` via gray-matter + `JSX_POSTS` registry (the 3 legacy JSX articles); `CONTENT_DIR` must become locale-aware.
- `app/[locale]/routes/<slug>/page.tsx` (×32) — hardcoded `inclusions` / `dayTripConfigurations` / `whyBook` / FAQ / hero + JSON-LD.
- `app/[locale]/services/` — 8 service pages (airport-transfer, city-rides, concierge, corporate-accounts, group-transfers, intercity-routes, vip-events, + hub `page.tsx`).
- `content/blog/*.mdx` — existing English MDX posts to relocate under `content/blog/en/`.

### Codebase maps (context)
- `.planning/codebase/STRUCTURE.md`, `.planning/codebase/CONVENTIONS.md` — repo layout and conventions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/routes.ts` `ROUTES` array + `Route` type — stays as the locale-invariant data source; extend the loader to compose it with `content/routes/<locale>/<slug>.json`.
- `lib/blog.ts` gray-matter MDX reader + `JSX_POSTS` merge — extend `CONTENT_DIR` to `content/blog/<locale>/` with EN fallback; JSX_POSTS untouched.
- Phase 69/70 next-intl wiring (`useTranslations`/`getTranslations`, `@/i18n/routing`) — reused verbatim for any chrome strings encountered while externalizing these pages.

### Established Patterns
- Byte-for-byte EN discipline from Phases 68–70 (English is the source; visual + existing tests must stay green).
- Content-model mental model is deliberately uniform: `content/routes/<locale>/`, `content/pages/<locale>/`, `content/blog/<locale>/` — all JSON (routes/pages) / MDX (blog) with the same slug+locale → EN-fallback resolution.

### Integration Points
- Route `page.tsx` files consume `getRouteContent(slug, locale)` in place of local literals.
- Non-route pages consume `content/pages/<locale>/<page>.json` via the parallel loader.
- `/blog` listing and `/blog/[slug]` render active locale, EN fallback with `canonical → EN`.
- Sitemap (`app/sitemap.ts`), canonical URLs, FAQPage/AggregateRating JSON-LD, and route SEO metadata must be unaffected for EN and the indexable/noindex route split preserved.

</code_context>

<specifics>
## Specific Ideas

- Format choice (JSON over `.ts`) is explicitly motivated by the Phase 72 re-runnable AI translation pipeline needing machine-readable, diffable content.
- Blog untranslated-post behavior explicitly: render EN body under the locale subpath, `canonical → EN` (chosen over hiding the post or a mixed-language listing).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Actual translation of RU/ES/FR/AR/HI/ZH content is Phase 72; no non-EN content is authored here.)

</deferred>

---

*Phase: 71-content-externalization-marketing-seo-pages*
*Context gathered: 2026-09-06*
