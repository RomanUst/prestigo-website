# Phase 73: Non-Latin & RTL Infra (AR, HI, ZH) - Context

**Gathered:** 2026-09-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the three non-Latin locales — Arabic (`ar`), Hindi (`hi`), Chinese (`zh`) — render correctly with real translations, proper non-Latin fonts, and (for Arabic) a correct right-to-left layout.

Three workstreams:
1. **Translation generation** — re-run the (already locale-generic) Phase 72 pipeline `scripts/i18n-translate.mjs --locales ar,hi,zh` to produce complete `messages/{ar,hi,zh}.json` catalogs + localized content (`content/routes/<locale>/`, `content/pages/<locale>/`, `content/blog/<locale>/`), replacing the current stale EN placeholder catalogs. Adds `ar/hi/zh` entries to `i18n/glossary.json` (tone/register + placeName exonym coverage); does **not** rewrite the pipeline.
2. **Non-Latin fonts** — load Noto Sans Arabic / Devanagari / SC per locale via `next/font`.
3. **RTL layout** — audit ~42 files of physical-direction Tailwind classes across the **public `app/[locale]/` tree only** and convert to logical properties so `/ar/` mirrors without breakage. The `<html dir>` / `rtlLocales` wiring already exists (`app/[locale]/layout.tsx`, `i18n/locales.ts`).

**Out of scope:** admin/driver panels (`app/(internal)/`, hard-coded EN + LTR — untouched); hreflang / metadata / sitemap / locale-switcher SEO (Phase 74); any change to `en`/`ru`/`es`/`fr` output (must stay byte-for-byte unchanged); rewriting the Phase 72 translation engine.

</domain>

<decisions>
## Implementation Decisions

### RTL audit scope & method (RTL-01)
- **D-01:** RTL/logical-property conversion is scoped to the **public `app/[locale]/` tree and its components only**. admin/driver (`app/(internal)/`) stay physical-class LTR — they are hard-coded `lang="en"`, will never render Arabic, so mirroring them is pure diff/risk with no RTL benefit. (Owner deferred to recommendation.) — **Reversibility:** reversible — a later repo-wide logical-property refactor for consistency is a separate, additive task.
- **D-02:** Conversion uses **native Tailwind logical utility classes** (`ps-*`/`pe-*`, `ms-*`/`me-*`, `text-start`/`text-end`, `start-*`/`end-*`, `rounded-s-*`/`rounded-e-*`, `border-s`/`border-e`) — no external RTL plugin (`tailwindcss-rtl` etc.). Keeps zero new deps, a readable diff, and full control over edge cases. — **Reversibility:** costly — the converted classes become the layout contract across ~42 files.
- **D-03:** **Directional icons/arrows are mirrored in RTL**: chevrons/arrows that encode direction ("next"/continue, step progress, journey-timeline A→B, route arrows) flip for `/ar/`; non-directional marks (logo, checkmarks, WhatsApp glyph, social) do NOT flip.

### Font strategy (FONT-01)
- **D-04:** Noto Sans Arabic / Devanagari / SC are loaded **per-locale**, not globally — `/ar` applies Noto Arabic, `/hi` Devanagari, `/zh` SC. The heavy CJK (SC) font is not shipped to EN/RU/ES/FR/AR/HI pages. Better LCP/weight budget. next/font loaders must still be declared at module scope; per-locale selection is by conditionally applying the font's `className`/`variable` on `<body>` (or equivalent) based on the resolved locale in `SiteChrome`/`app/[locale]/layout.tsx`. — **Reversibility:** reversible — swapping to global loading is a small layout change.
- **D-05:** **Latin brand tokens keep the Latin brand typeface** inside non-Latin text: the PRESTIGO wordmark, prices (€…), Mercedes E-/S-/V-Class names, phone `+420 725 986 855`, and domain `rideprestigo.com` render in Inter/Fraunces (via the font-family fallback stack), not in Noto — brand looks identical across all locales. (These are already the DNT terms in `i18n/glossary.json`.)

### Per-locale premium tone/register (TR-02) — encode in `i18n/glossary.json`
- **D-06:** **AR** → **Modern Standard Arabic (fusḥā), formal premium register.** Understood across the whole Arab world (Gulf travellers), standard for luxury brands. Not a regional dialect.
- **D-07:** **HI** → **formal register using आप (aap).** Moderately literary/Sanskritized Hindi, BUT common English tech/travel terms (airport, flight, terminal) stay as-is — natural for the urban target audience; do not force pure-Sanskrit loanword replacement.
- **D-08:** **ZH** → **Simplified Chinese, mainland (PRC), polite business register (您).** Uses Noto Sans SC (matches the roadmap "SC"). Traditional/TC explicitly rejected.
- **D-09 (carried from Phase 72, applies to ar/hi/zh):** geographic place names use the **standard exonym** (`placeNames.policy = "use-standard-exonym"`), e.g. Prague → براغ (ar) / प्राग (hi) / 布拉格 (zh). Place names are NOT do-not-translate.

### QA / acceptance bar (Success Criterion #4)
- **D-10:** RTL visual QA on `/ar/` covers **one representative page per template type — 5 key types:** home, booking flow (EntryBar → wizard → vehicle cards), one route page, one blog post, account/login. Covers every layout without QA-ing all 60+ pages.
- **D-11:** **Mixed LTR-in-RTL is an explicit QA checklist item.** Verify numbers/Latin (prices €, phone +420, flight numbers, times, dates) stay LTR inside RTL paragraphs (bidi isolation) and that the booking EntryBar and the map do not break under `dir="rtl"`.
- **D-12:** `ru`/`es`/`fr` + EN-root non-regression is verified by an **automated byte-parity check** (EN root and ru/es/fr output byte-for-byte unchanged), normalizing `priceValidUntil` the way the existing golden-HTML snapshot tests do (today+365 drift — see the byte-parity memory). Objective and repeatable, not just a manual spot-check.

### Claude's Discretion
- Exact next/font loader declaration shape (google vs local, subset lists, `variable` names, weights) and the mechanism for per-locale className application in the shared `SiteChrome`.
- The font-family fallback-stack ordering that keeps Latin brand tokens on Inter/Fraunces while non-Latin body text falls to Noto.
- Which specific ~42 files need conversion and the per-file class mapping (audit output); whether to script the physical→logical replacement or do it by hand.
- Exact `i18n/glossary.json` schema additions for `ar/hi/zh` (`locales.<code>` tone-guide/formality/pluralCategories, direction flag if needed) and how `PHASE_72_LOCALES` is extended to include ar/hi/zh for this run.
- QA report format/location and the tooling used for RTL visual QA (e.g. the built-in browser preview at `/ar/…`).
- How the stale EN-placeholder catalogs `messages/{ar,hi,zh}.json` are reconciled on first real run (same reconcile path Phase 72 used for ru/es/fr).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 73: Non-Latin & RTL Infra (AR, HI, ZH)" — goal + 4 success criteria (complete ar/hi/zh catalogs+content; `/ar/` RTL via logical properties; Noto fonts per locale; ru/es/fr + EN unchanged, QA recorded).
- `.planning/REQUIREMENTS.md` — RTL-01 (Arabic RTL, ~42 files physical→logical, no mirrored breakage), FONT-01 (Noto Arabic/Devanagari/SC via next/font), TR-02 (complete ar/hi/zh translations — the remainder after Phase 72's ru/es/fr).

### Translation pipeline & content model (LOCKED — reuse, don't rewrite)
- `.planning/phases/72-ai-translation-pipeline-catalogs/72-CONTEXT.md` — the pipeline is locale-generic; Phase 73 adds locales + glossary entries only. Engine (Opus), CI→PR flow, per-key hash-manifest idempotency, manual-edit preservation, MDX-aware blog translation all locked there.
- `scripts/i18n-translate.mjs` — the re-runnable pipeline; `--locales ar,hi,zh` drives this phase's generation. `PHASE_72_LOCALES` in `scripts/lib/i18n-glossary.mjs:24` currently filters to ru/es/fr — must be extended for ar/hi/zh.
- `scripts/lib/i18n-glossary.mjs` — `buildSystemPrompt`, `loadGlossary`, `PHASE_72_LOCALES`, placeName exonym enforcement (`placeNames.policy`).
- `i18n/glossary.json` — DNT list (brand/vehicle/structural), `placeNames` (exonym policy), `locales.{ru,es,fr}` tone guides. Add `locales.{ar,hi,zh}` per D-06/07/08.
- `.planning/phases/71-content-externalization-marketing-seo-pages/71-CONTEXT.md` — locale-aware content model (`content/routes|pages|blog/<locale>/`, `messages/<locale>.json`) + EN-fallback loaders.

### i18n routing / RTL / font wiring (existing infra to extend)
- `i18n/locales.ts` — `locales` already includes `ar/hi/zh`; `rtlLocales = ['ar']` already set.
- `i18n/routing.ts` — next-intl routing config; `localePrefix: 'as-needed'`, `localeDetection: false` (do not flip — Phase 74).
- `app/[locale]/layout.tsx` — already sets `<html lang={locale} dir={rtl?'rtl':'ltr'}>`.
- `components/SiteChrome.tsx` — shared chrome; declares `Fraunces`/`Inter` via next/font and applies `variable`s on `<body>`. This is where per-locale Noto className application lands (D-04). Note: shared with `app/(internal)/layout.tsx` (EN/LTR) — must not regress internal chrome.

### Established patterns / gotchas
- `.planning/phases/70-string-externalization-booking-account/70-PATTERNS.md` — next-intl catalog/consumer conventions.
- `.planning/codebase/STRUCTURE.md`, `.planning/codebase/CONVENTIONS.md` — repo layout + script conventions.
- Byte-parity snapshot date-drift: golden-HTML tests normalize `priceValidUntil` (today+365 from `lib/jsonld.ts`); the D-12 byte-parity check must do the same.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 72 pipeline + hash-manifest + glossary loader are directly reused — this phase adds locales, not code paths. `--locales ar,hi,zh` is the invocation.
- `<html dir>` + `rtlLocales` + full 7-locale `locales` list already wired — RTL attribute plumbing is done; work is the CSS/logical-class audit, not the direction attribute.
- `i18n/glossary.json` already has the `locales.<code>` tone-guide shape (ru/es/fr) and DNT terms covering the Latin brand tokens (D-05) — extend, don't invent.

### Established Patterns
- **Byte-for-byte EN/ru/es/fr discipline** (Phases 68–72): adding ar/hi/zh must not change any existing-locale or EN-root output (D-12 enforces this automatically).
- **Native Tailwind logical utilities** are the chosen RTL mechanism (D-02) — no plugin.
- Rough audit signal: ~45 files use physical-direction classes; `text-left`/`text-right` in ~35 files, `left-/right-` absolute positioning in ~4. `space-x-`/`flex-row-reverse` = 0 (nothing to convert there). Scope to `app/[locale]/` + components per D-01.

### Integration Points
- Writes: `messages/{ar,hi,zh}.json`, `content/{routes,pages,blog}/{ar,hi,zh}/**`, `i18n/glossary.json` (locale entries), converted `app/[locale]/**` + component files, next/font Noto declarations in/around `components/SiteChrome.tsx`.
- Reads: `messages/en.json`, `content/*/en/**`, `i18n/glossary.json`.
- Placeholder reconcile: `messages/{ar,hi,zh}.json` currently exist as stale EN copies — replaced with real translations this phase (same reconcile Phase 72 used for ru/es/fr).

</code_context>

<specifics>
## Specific Ideas

- Owner deferred the RTL-audit scope decision to the recommendation; the "public `[locale]` tree only" boundary is a deliberate risk-reduction choice, not an oversight.
- Brand consistency is a priority: the PRESTIGO wordmark, prices, and Mercedes class names must look identical (Latin brand font) across every locale, including inside RTL/non-Latin pages.
- Directional-icon mirroring matters for authentic Arabic UX (the "next" arrow must point the right way for an RTL reader).

</specifics>

<deferred>
## Deferred Ideas

- **hreflang / metadata / sitemap / locale switcher** (incl. `og:locale` and Accept-Language auto-detect) — Phase 74 (SEO-01, UX-02). Keep `localeDetection: false`.
- **Repo-wide logical-property refactor** (admin/driver + all remaining physical classes) for stylistic consistency — separate future refactor task, not needed for RTL-01.
- **OG images / per-locale social imagery for non-Latin** — not raised as required; revisit under Phase 74 SEO if needed.
- **3 legacy JSX blog posts** stay EN-only (locked in Phase 72) — not translated to ar/hi/zh here.

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 73-non-latin-rtl-infra-ar-hi-zh*
*Context gathered: 2026-09-17*
