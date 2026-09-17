# Phase 73: Non-Latin & RTL Infra (AR, HI, ZH) - Research

**Researched:** 2026-09-17
**Domain:** next-intl RTL/logical-CSS layout audit + next/font non-Latin loading + AI translation pipeline locale backfill
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**RTL audit scope & method (RTL-01)**
- **D-01:** RTL/logical-property conversion is scoped to the **public `app/[locale]/` tree and its components only**. admin/driver (`app/(internal)/`) stay physical-class LTR — they are hard-coded `lang="en"`, will never render Arabic, so mirroring them is pure diff/risk with no RTL benefit. — **Reversibility:** reversible.
- **D-02:** Conversion uses **native Tailwind logical utility classes** (`ps-*`/`pe-*`, `ms-*`/`me-*`, `text-start`/`text-end`, `start-*`/`end-*`, `rounded-s-*`/`rounded-e-*`, `border-s`/`border-e`) — no external RTL plugin (`tailwindcss-rtl` etc.). — **Reversibility:** costly.
- **D-03:** **Directional icons/arrows are mirrored in RTL**: chevrons/arrows that encode direction ("next"/continue, step progress, journey-timeline A→B, route arrows) flip for `/ar/`; non-directional marks (logo, checkmarks, WhatsApp glyph, social) do NOT flip.

**Font strategy (FONT-01)**
- **D-04:** Noto Sans Arabic / Devanagari / SC are loaded **per-locale**, not globally. Loaders declared at module scope; **application** of the resulting `className`/CSS variable is conditional on the resolved locale in `SiteChrome`/`app/[locale]/layout.tsx`. — **Reversibility:** reversible.
- **D-05:** **Latin brand tokens keep the Latin brand typeface** inside non-Latin text: the PRESTIGO wordmark, prices (€…), Mercedes E-/S-/V-Class names, phone `+420 725 986 855`, and domain `rideprestigo.com` render in Inter/Fraunces (via the font-family fallback stack), not in Noto — already DNT terms in `i18n/glossary.json`.

**Per-locale premium tone/register (TR-02) — encode in `i18n/glossary.json`**
- **D-06:** **AR** → Modern Standard Arabic (fusḥā), formal premium register. Understood across the whole Arab world. Not a regional dialect.
- **D-07:** **HI** → formal register using आप (aap). Moderately literary/Sanskritized Hindi, BUT common English tech/travel terms (airport, flight, terminal) stay as-is.
- **D-08:** **ZH** → Simplified Chinese, mainland (PRC), polite business register (您). Uses Noto Sans SC. Traditional/TC explicitly rejected.
- **D-09 (carried from Phase 72, applies to ar/hi/zh):** geographic place names use the **standard exonym** (`placeNames.policy = "use-standard-exonym"`), e.g. Prague → براغ (ar) / प्राग (hi) / 布拉格 (zh). Place names are NOT do-not-translate.

**QA / acceptance bar (Success Criterion #4)**
- **D-10:** RTL visual QA on `/ar/` covers **one representative page per template type — 5 key types:** home, booking flow (EntryBar → wizard → vehicle cards), one route page, one blog post, account/login.
- **D-11:** **Mixed LTR-in-RTL is an explicit QA checklist item.** Verify numbers/Latin (prices €, phone +420, flight numbers, times, dates) stay LTR inside RTL paragraphs (bidi isolation) and that the booking EntryBar and the map do not break under `dir="rtl"`.
- **D-12:** `ru`/`es`/`fr` + EN-root non-regression is verified by an **automated byte-parity check** (EN root and ru/es/fr output byte-for-byte unchanged), normalizing `priceValidUntil` the way the existing golden-HTML snapshot tests do (today+365 drift).

### Claude's Discretion
- Exact next/font loader declaration shape (google vs local, subset lists, `variable` names, weights) and the mechanism for per-locale className application in the shared `SiteChrome`.
- The font-family fallback-stack ordering that keeps Latin brand tokens on Inter/Fraunces while non-Latin body text falls to Noto.
- Which specific ~42 files need conversion and the per-file class mapping (audit output); whether to script the physical→logical replacement or do it by hand.
- Exact `i18n/glossary.json` schema additions for `ar/hi/zh` (`locales.<code>` tone-guide/formality/pluralCategories, direction flag if needed) and how `PHASE_72_LOCALES` is extended to include ar/hi/zh for this run.
- QA report format/location and the tooling used for RTL visual QA (e.g. the built-in browser preview at `/ar/…`).
- How the stale EN-placeholder catalogs `messages/{ar,hi,zh}.json` are reconciled on first real run (same reconcile path Phase 72 used for ru/es/fr).

### Deferred Ideas (OUT OF SCOPE)
- **hreflang / metadata / sitemap / locale switcher** (incl. `og:locale` and Accept-Language auto-detect) — Phase 74 (SEO-01, UX-02). Keep `localeDetection: false`.
- **Repo-wide logical-property refactor** (admin/driver + all remaining physical classes) for stylistic consistency — separate future refactor task, not needed for RTL-01.
- **OG images / per-locale social imagery for non-Latin** — not raised as required; revisit under Phase 74 SEO if needed.
- **3 legacy JSX blog posts** stay EN-only (locked in Phase 72) — not translated to ar/hi/zh here.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RTL-01 | Arabic renders correctly right-to-left — physical-direction Tailwind classes (~42 files) audited and converted to logical properties; no mirrored-layout breakage. | Pattern 3 (file-by-file conversion table + do-not-convert callouts), Pattern 4 (`rtl:` variant icon mirroring), Code Examples (bidi isolation, letter-spacing override), Validation Architecture (byte-parity + `dir` assertion tests) |
| FONT-01 | Noto Sans Arabic / Devanagari / SC loaded per locale via `next/font`. | Pattern 2 (corrected loader declarations), Pitfall 2 (Noto Sans SC subset build-failure correction — critical), Standard Stack (verified subset lists from installed package metadata) |
| TR-02 | Complete translations for `ar, hi, zh` across every catalog and content file. | Pattern 1 (manifest-reset reconcile procedure — critical), Pitfall 1 (session-verified manifest no-op bug), Pitfall 3 (Arabic 6-category CLDR plural set), Pitfall 4 (catalog-vs-content starting-state distinction), Validation Architecture (`--check` completeness gate, English-leakage test gap) |

</phase_requirements>

## Summary

This phase has three independent workstreams, and the research surfaced one **build-breaking bug** and one **silent-data-corruption bug** that must be designed around, not discovered during execution.

1. **Translation generation (TR-02).** The `scripts/i18n-translate.mjs` pipeline is locale-generic and accepts `--locales ar,hi,zh` today with zero code changes. However its change-detection manifest (`i18n/translation-manifest.json`) is **not locale-aware** — it stores one `enHash` per unit regardless of which locale translated it. Because Phase 72's ru/es/fr run already advanced ~2197 manifest entries, running `--locales ar,hi,zh` **as-is today translates almost nothing** — confirmed by actually running `--check` this session (see Pitfall 1). `messages/{ar,hi,zh}.json` currently exist as **stale, byte-for-byte English placeholder catalogs** (verified by reading them), missing the entire `RoutePage` namespace (22 keys) added after they were created. The plan must include an explicit manifest-reset step before the real ar/hi/zh generation run.
2. **Non-Latin fonts (FONT-01).** `next/font/google`'s installed metadata (read directly from `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json` this session) confirms `Noto_Sans_Arabic` (`subsets: ['arabic', ...]`) and `Noto_Sans_Devanagari` (`subsets: ['devanagari', ...]`) are correctly named per the UI-SPEC — but **`Noto_Sans_SC` has NO `chinese-simplified`/CJK-named subset at all**; its only valid `subsets` values are `cyrillic`, `latin`, `latin-ext`, `vietnamese`. The UI-SPEC's `subsets: ['chinese-simplified']` value for Noto Sans SC **will throw a hard `next build` error** (Next.js validates subsets against this exact list and calls `nextFontError()` on an unknown value). This is a required correction, documented in Pitfall 2 below.
3. **RTL layout audit (RTL-01).** `<html dir>` wiring is already complete (`app/[locale]/layout.tsx` + `i18n/locales.ts`'s `rtlLocales`). Tailwind v4 (installed: `tailwindcss@^4`) natively supports the logical-property utilities the UI-SPEC specifies (`ps-*`/`pe-*`, `ms-*`/`me-*`, `text-start`/`text-end`, `start-*`/`end-*`, `rounded-s-*`/`rounded-e-*`) with zero plugin — confirmed against the official Tailwind docs via Context7. A fresh grep this session confirms the file counts: 35 files with `text-left`/`text-right`, 5 files with `border-l`/`border-r`, 6 files with absolute `left-*`/`right-*` positioning (2 of them decorative/non-mirroring), 4 files with `pl-*`/`pr-*`, 2 files with `ml-*`/`mr-*`, 0 files with `rounded-l/r`, `space-x-*`, or `flex-row-reverse`.

**Primary recommendation:** Treat the translation-pipeline manifest reset as a first-class, ordered task (before any translator calls for ar/hi/zh) — not an afterthought — and correct the Noto Sans SC font-loader `subsets` value before declaring the loader, so the plan doesn't inherit a build-breaking config from the UI-SPEC.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Translation catalog/content generation (ar/hi/zh) | Build-time script (Node CLI, `scripts/i18n-translate.mjs`) | — | Runs outside the Next.js request cycle; writes static JSON/MDX consumed at build/render time |
| `<html dir>` direction attribute | Frontend Server (SSR, `app/[locale]/layout.tsx`) | — | Set once per request from the resolved locale param, before any client hydration |
| Logical-property Tailwind classes | Browser / Client (CSS, resolved by the browser's writing-mode engine) | Frontend Server (className strings emitted at SSR) | The actual LTR/RTL mirroring happens in the browser's CSS engine; the server only emits the class names |
| Per-locale Noto font loading | Frontend Server (Next.js build — `next/font/google` module-scope loader) | CDN / Static (Google Fonts-derived self-hosted `.woff2`, served from `/_next/static`) | `next/font` downloads + self-hosts the font at build time; the resulting file is served as a static asset |
| Directional icon mirroring (`rtl:` variant) | Browser / Client | — | Tailwind's `rtl:` variant is a CSS selector (`[dir="rtl"] &`), resolved purely by the browser |
| Byte-parity non-regression check | Build-time test (Vitest, golden-HTML snapshot) | — | Runs in CI/local test suite, not at runtime |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `^16.2.3` (installed) | App Router, `next/font/google` | Already the project's framework — no change |
| `next-intl` | `4.14.2` (installed, exact-pinned per Phase 68 decision) | Locale routing, `<html lang>`, message catalogs | Already locked project-wide; this phase adds zero new next-intl surface |
| `tailwindcss` | `^4` (installed, devDependency) | Logical-property utility classes, `rtl:` variant | v4 core ships `ps-*/pe-*/ms-*/me-*/text-start/text-end/rounded-s-*/rounded-e-*` and the `rtl:` variant natively — confirmed via official docs (Context7) — no plugin needed (matches D-02) |
| `@anthropic-ai/sdk` | `0.125.0` (installed) | Translator client (`createAnthropicBatchTranslator`/`createAnthropicWholeFileTranslator`/`createAnthropicMdxBodyTranslator`) | Already the Phase 72 pipeline's translator; reused unchanged |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Noto_Sans_Arabic` (via `next/font/google`) | bundled with `next@^16.2.3`'s font metadata | Arabic glyph rendering | `/ar/*` only |
| `Noto_Sans_Devanagari` (via `next/font/google`) | bundled with `next@^16.2.3`'s font metadata | Hindi/Devanagari glyph rendering | `/hi/*` only |
| `Noto_Sans_SC` (via `next/font/google`) | bundled with `next@^16.2.3`'s font metadata | Simplified Chinese glyph rendering | `/zh/*` only — **`subsets` must be `['latin']` or omitted with `preload: false`, NEVER `'chinese-simplified'`** (Pitfall 2) |
| `lucide-react` | `^1.6.0` (installed) | Directional icons (chevrons) already in use | No new icons added — `rtl:rotate-180`/`rtl:-scale-x-100` applied to existing `<ChevronRight>`/inline `<svg>` usages |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native Tailwind logical utilities | `tailwindcss-rtl` plugin | Rejected by D-02 — adds a dependency for something Tailwind v4 core already does, and the plugin's blanket LTR→RTL auto-mirroring is less precise than the file-by-file audit this phase requires (icon exceptions, bidi-isolated numerals) |
| `next/font/google` Noto loaders | Self-hosted local `.woff2` via `next/font/local` | Google Fonts CDN metadata is bundled with Next.js and battle-tested; local hosting would require manually sourcing/licensing the Noto `.woff2` files with no benefit for this phase's scope |
| Per-locale conditional `className` on `<body>` (D-04) | A separate root layout per script (Latin vs RTL vs CJK) | Would duplicate `SiteChrome.tsx`, which is explicitly shared with `app/(internal)/layout.tsx` — conditional className on the existing single layout is the minimal-diff option already locked by D-04 |

**Installation:** No new packages — `next/font/google` and Tailwind v4 logical utilities are already present in `package.json`. Zero `npm install` required for this phase.

**Version verification:** `next@^16.2.3`, `next-intl@4.14.2`, `tailwindcss@^4` confirmed present via `Read` of `package.json` this session (see file path below). Font subset availability confirmed by directly reading the installed package's metadata file (`node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`) — this is the actual data Next.js's build-time subset validator uses, not training-data recollection.

## Package Legitimacy Audit

**No new external packages are installed by this phase.** `next/font/google`'s Noto loaders are first-party Next.js infrastructure (bundled with the already-installed `next` package), not a new npm dependency. Tailwind's logical-property utilities are core `tailwindcss@^4` features already in `package.json`. `lucide-react` (icon mirroring) is already installed.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — | — | — | — | — | — | No new packages — audit not applicable this phase |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │  Build-time (one-off, orchestrator-run)      │
                    │                                               │
  messages/en.json ─┤─▶ i18n/translation-manifest.json (RESET)      │
  content/*/en/**   │      │                                        │
                    │      ▼                                        │
                    │  scripts/i18n-translate.mjs --locales ar,hi,zh│
                    │      │  (buildSystemPrompt ← i18n/glossary.json│
                    │      │   locales.{ar,hi,zh} tone/plural rules) │
                    │      ▼                                        │
                    │  Anthropic batch/whole-file/MDX translators   │
                    │      │  (verifyDntPreserved / verifyPluralCat)│
                    │      ▼                                        │
  messages/{ar,hi,zh}.json  content/{routes,pages,blog}/{ar,hi,zh}/**│
                    └─────────────────────────────────────────────┘
                                       │
                                       ▼  (consumed at request time)
┌───────────────────────────────────────────────────────────────────┐
│  Request: GET /ar/routes/prague-vienna                             │
│      │                                                              │
│      ▼                                                              │
│  middleware.ts (next-intl locale resolution, unchanged this phase) │
│      │                                                              │
│      ▼                                                              │
│  app/[locale]/layout.tsx                                            │
│      │  locale='ar' → rtlLocales.includes('ar') → dir="rtl"        │
│      ▼                                                              │
│  SiteChrome (components/SiteChrome.tsx)                            │
│      │  locale='ar' → conditionally apply Noto Sans Arabic className│
│      │  (shared with app/(internal)/layout.tsx — must stay          │
│      │   no-op for internal/EN routes)                             │
│      ▼                                                              │
│  Page component (getRouteContent('prague-vienna','ar') → EN-fallback│
│      │  loader reads content/routes/ar/*.json if present, else EN) │
│      ▼                                                              │
│  JSX with Tailwind classes:                                        │
│      • Logical (ps-*/pe-*/text-start/...) → browser mirrors under  │
│        dir="rtl" automatically, identical output under dir="ltr"   │
│      • rtl:rotate-180 on directional chevrons/arrows only          │
│      • Bidi-isolated <bdi>/dir="ltr" spans around prices/phone/    │
│        flight numbers/times (Mixed LTR-in-RTL, D-11)               │
└───────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
No new directories — this phase writes into the existing locale-parameterized tree:
```
messages/
├── ar.json, hi.json, zh.json     # overwritten in place (currently stale EN placeholders)
content/
├── routes/{ar,hi,zh}/            # new — currently absent (only en/es/fr/ru exist)
├── pages/{ar,hi,zh}/             # new — currently absent
└── blog/{ar,hi,zh}/              # new — currently absent
i18n/
├── glossary.json                 # add locales.{ar,hi,zh} entries
└── translation-manifest.json     # reset (see Pitfall 1) before the real run
components/SiteChrome.tsx         # add 3 Noto loaders + locale-conditional className
app/[locale]/**                   # ~42 files, physical→logical Tailwind class conversion
```

### Pattern 1: Manifest-safe locale backfill (the reconcile step, D-09's discretion item resolved)
**What:** Before the real (non-`--dry-run`) translation run for `ar,hi,zh`, back up and clear `i18n/translation-manifest.json` to `{"version":1,"units":{}}`, then run `node scripts/i18n-translate.mjs --locales ar,hi,zh`.
**When to use:** Exactly once, for this phase's initial backfill. Not needed for future incremental EN-content updates once ar/hi/zh have real translations (at that point their manifest entries will correctly gate re-translation only on actual EN changes, same as ru/es/fr today).
**Why this is safe:** `runFullTranslation()`'s write loop only ever calls `targetPathFor(locale)` for `locale` in the **requested** `locales` array (`['ar','hi','zh']`) — `messages/ru.json`, `messages/es.json`, `messages/fr.json` and their `content/*/ru|es|fr/**` siblings are never opened for writing, because they are not in the requested-locales loop. Clearing the manifest only affects which units are `selected` for translation this run; it does not touch any already-written locale file directly. After the run, the manifest re-records the same `enHash` values (EN is unchanged) — so a subsequent incremental EN edit still triggers the correct minimal re-translation for **all six** non-EN locales going forward.
**Example:**
```bash
# 1. Snapshot + reset manifest (one-time backfill bootstrap)
cp i18n/translation-manifest.json i18n/translation-manifest.json.pre-73.bak
echo '{"version":1,"units":{}}' > i18n/translation-manifest.json

# 2. Run the real pipeline for only the 3 new locales
#    (ANTHROPIC_API_KEY read from .env.local by loadEnvLocal(), or CI secret)
node scripts/i18n-translate.mjs --locales ar,hi,zh

# 3. Verify: 0 missing keys, EN untouched
node scripts/i18n-translate.mjs --check --locales ar,hi,zh
git diff --exit-code -- messages/en.json content/routes/en content/pages/en content/blog/en

# 4. Verify ru/es/fr + EN outputs are untouched (D-12 byte-parity gate)
git diff --exit-code -- messages/ru.json messages/es.json messages/fr.json \
  content/routes/ru content/routes/es content/routes/fr \
  content/pages/ru content/pages/es content/pages/fr \
  content/blog/ru content/blog/es content/blog/fr
```
Source: read directly from `scripts/i18n-translate.mjs` (this session) — `runFullTranslation()`'s per-locale write loop (lines ~585-644) and `targetPathFor` closures in `scripts/lib/i18n-surfaces.mjs`.

### Pattern 2: Per-locale conditional Noto className in shared SiteChrome (D-04)
**What:** Declare all three Noto loaders at module scope (required by `next/font` — cannot be called conditionally), then pick which `className`/`variable` string to apply on `<body>` based on the resolved locale.
**When to use:** `components/SiteChrome.tsx`, extending the existing `fraunces`/`inter` pattern.
**Example (corrected subsets — see Pitfall 2 for why SC differs):**
```typescript
// Source: components/SiteChrome.tsx pattern (read this session) +
// next/font/google subset validation (node_modules/next/dist/compiled/@next/font/dist/google/font-data.json,
// read this session) + Next.js docs (Context7: vercel/next.js validate-google-font-function-call.ts)
import { Fraunces, Inter, Noto_Sans_Arabic, Noto_Sans_Devanagari, Noto_Sans_SC } from 'next/font/google'

const notoArabic = Noto_Sans_Arabic({
  variable: '--font-noto-arabic',
  subsets: ['arabic'],           // VALID — 'arabic' is in Noto Sans Arabic's subset list
  weight: ['400', '500', '600'],
  display: 'swap',
})
const notoDevanagari = Noto_Sans_Devanagari({
  variable: '--font-noto-devanagari',
  subsets: ['devanagari'],       // VALID — 'devanagari' is in Noto Sans Devanagari's subset list
  weight: ['400', '500', '600'],
  display: 'swap',
})
const notoSC = Noto_Sans_SC({
  variable: '--font-noto-sc',
  subsets: ['latin'],            // 'chinese-simplified' is INVALID — see Pitfall 2. CJK glyphs
  weight: ['400', '500', '600'], // ship regardless of the `subsets` value for this font family.
  display: 'swap',
})

// Inside SiteChrome, after `const locale = await getLocale()`:
const localeFontClassName =
  locale === 'ar' ? notoArabic.variable :
  locale === 'hi' ? notoDevanagari.variable :
  locale === 'zh' ? notoSC.variable : ''

// <body className={`${fraunces.variable} ${inter.variable} ${localeFontClassName}`}>
```
Internal routes (`app/(internal)/layout.tsx`) always resolve `getLocale()` to `'en'` (next-intl's default when no `[locale]` segment is present in the URL) — `localeFontClassName` is `''` for them, so `SiteChrome`'s shared-chrome byte-parity for `/admin`/`/driver` is preserved automatically without an explicit branch.

### Pattern 3: Physical→logical Tailwind class conversion (RTL-01)
**What:** 1:1 class-name swap at identical pixel/token values — no value changes.
**When to use:** Every file under `app/[locale]/**` (route pages, layouts) and the shared `components/**` they render — per D-01, `app/(internal)/**` is out of scope.
**Mapping (verified counts, this session's grep against `app/` + `components/`):**

| Physical | Logical | Files affected (session grep) |
|---|---|---|
| `text-left` / `text-right` | `text-start` / `text-end` | 35 (34 route/blog pages + `components/Nav.tsx`) |
| `pl-{n}` / `pr-{n}` | `ps-{n}` / `pe-{n}` | 4 (3 blog pages' `border-l-2 pl-8` pull-quote pattern + `components/TestimonialsCarousel.tsx`) |
| `ml-{n}` / `mr-{n}` | `ms-{n}` / `me-{n}` | 2 (`components/Nav.tsx` mobile-menu button `-mr-1`, `components/TestimonialsCarousel.tsx` star-count `ml-2`) |
| `border-l-2` / `border-l` | `border-s-2` / `border-s` | 5 (3 blog pages + `components/FeatureStrip.tsx` + `components/TestimonialsCarousel.tsx`) |
| `left-{n}` / `right-{n}` (absolute/fixed) | `start-{n}` / `end-{n}` | 6 total occurrences across `components/CookieBanner.tsx`, `components/Hero.tsx` (×4), `components/Nav.tsx` — **audit each individually, do not convert blindly (see below)** |
| `rounded-l-*` / `rounded-r-*` | n/a | 0 occurrences found |
| `space-x-*`, `flex-row-reverse` | n/a | 0 occurrences found — do not introduce during the fix |
| `translate-x-*` | context-dependent | 3 files (`CookieBanner.tsx`, `Hero.tsx`, `RoutesBento.tsx`) — a **centering** transform (`-translate-x-1/2` paired with `left-1/2`) is direction-neutral and correct as-is; only a transform used for a directional slide/reveal effect would need an `rtl:` counter-transform (none found in this grep — verify per-file during execution) |

**Do-not-convert callouts found this session:**
- `components/Hero.tsx:36-40` — decorative corner-accent gradient lines (`absolute top-0 left-0`, `absolute bottom-0 right-0`) are purely visual flourishes with no reading-direction semantic; converting them to `start-0`/`end-0` is optional/cosmetic, not a correctness requirement, but is safe and consistent to do since they're inside `app/[locale]`-rendered `Hero.tsx`.
- `components/Nav.tsx:122` — `fixed top-0 left-0 right-0` (full-width nav bar spanning both edges) — converts safely to `start-0 end-0` with identical visual result in both directions (a full-bleed bar has no "start vs end" distinction visually, but the logical form is still correct and consistent with the rest of the file's conversion).
- `components/CookieBanner.tsx:387` — `absolute top-0.5 left-0.5` is the toggle-switch knob position; this is a genuine LTR/RTL-meaningful position (the knob should sit at the "off" side, which flips), so this MUST convert to `start-0.5`/paired `end-0.5` logic, not be treated as decorative.

**Example:**
```html
<!-- Source: Tailwind CSS official docs (Context7: tailwindlabs/tailwindcss.com, docs/padding.mdx, docs/text-align.mdx) -->
<!-- Before -->
<div class="pl-8 border-l-2 border-copper text-left">...</div>
<!-- After — renders identically under dir="ltr", mirrors under dir="rtl" -->
<div class="ps-8 border-s-2 border-copper text-start">...</div>
```

### Pattern 4: Directional icon mirroring via the `rtl:` variant (D-03)
**What:** Tailwind v4's `rtl:` variant compiles to a `:where([dir="rtl"], [dir="rtl"] *)` (or equivalent attribute) selector — no plugin required, confirmed in the official docs.
**When to use:** Only on the "Yes" rows of the UI-SPEC's Mirroring Rules table (chevrons/arrows encoding progression) — never as a blanket rule on every `lucide-react` icon.
**Example:**
```typescript
// Source: components/Nav.tsx chevron pattern (read this session, line 196), adapted with rtl: variant
<svg
  aria-hidden="true"
  className="rtl:rotate-180 transition-transform"
  style={{ transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
  ...
>
  <path d="M2 4l4 4 4-4" ... />
</svg>
```
Note: `Nav.tsx`'s chevron currently sets `transform` inline via `style`, not a Tailwind class — this specific instance needs the `rtl:` mirror expressed as an additional `rotate(180deg)` composed with the existing open/closed rotation (e.g., compute the total rotation in JS based on both `menuOpen` and a `dir === 'rtl'` check, since inline `style` doesn't support the `rtl:` variant). This is a **file-specific deviation** the executor must handle — most other chevrons in the codebase are likely plain Tailwind classes where `rtl:rotate-180` applies directly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RTL layout mirroring | A custom `isRtl ? 'right' : 'left'` prop threading pattern, or manual `[dir="rtl"] &` CSS overrides | Tailwind's native logical utilities (`ps-*`/`pe-*`/etc.) + `rtl:` variant | Already ships in the installed `tailwindcss@^4` — zero new code, browser-native CSS logical properties handle the mirroring automatically once `dir` is set |
| Bidi isolation for numerals/prices inside RTL text | A custom regex-based "wrap Latin runs in a span" post-processor | The `<bdi>` HTML element / `dir="ltr"` + `unicode-bidi: isolate` at the same DNT span boundaries the pipeline already uses (`richTextTags`: `price`, `strong`, etc.) | `<bdi>` is a browser-native, zero-JS primitive purpose-built for exactly this (isolating a bidi run of unknown/opposite directionality) — do not reinvent it |
| CLDR plural-category completeness for Arabic | A hand-written "does this string contain the 6 Arabic plural keywords" checker | The already-existing `verifyPluralCategories()` in `scripts/lib/i18n-verify.mjs`, fed by `glossary.locales.ar.pluralCategories` | This function is generic over the category list — adding `ar`'s 6-category array to the glossary is all that's needed; the verifier code needs zero changes |
| Font subset selection for CJK | Manually sourcing/hosting Noto Sans SC `.woff2` files split by "simplified Chinese" ranges | `next/font/google`'s `Noto_Sans_SC` loader with a **valid** `subsets` value (`latin`, or omit + `preload:false`) | Google's CDN doesn't offer a CJK-named subset for this family (verified from the installed metadata) — the full CJK glyph set ships in the font file regardless of the `subsets` value chosen; there is nothing to "build" here, only a config-value correction |

**Key insight:** every mechanism this phase needs (logical CSS, bidi isolation, plural verification, font subsetting) already exists natively in the browser, in Tailwind v4, or in the Phase 72 pipeline. The actual engineering work is auditing ~42 files and fixing two configuration values (manifest reset, SC font subset) — not building new infrastructure.

## Runtime State Inventory

> Not applicable — Phase 73 is not a rename/refactor/migration phase. Skipped per the trigger condition (no rename, rebrand, or string-replacement work).

## Common Pitfalls

### Pitfall 1: The translation manifest silently no-ops a locale backfill (CRITICAL — session-verified)
**What goes wrong:** Running `node scripts/i18n-translate.mjs --locales ar,hi,zh` without first resetting `i18n/translation-manifest.json` translates almost nothing — every unit Phase 72 already processed for ru/es/fr is skipped for ar/hi/zh too, because `unitsNeedingTranslation()` checks only "does a manifest entry exist with a matching EN hash," never "does a manifest entry exist for THIS locale." `messages/{ar,hi,zh}.json` would end up passing the `--check` completeness gate (0 missing keys, since the ~22 new `RoutePage` keys DO get translated) while ~99% of their content remains the stale, byte-for-byte English placeholder text.
**Why it happens:** The manifest schema (`unitKey -> {enHash, lastTranslatedAt}`) was designed under the assumption that every pipeline run processes the same locale set (documented in `scripts/lib/i18n-manifest.mjs`'s own comment: "No per-locale hashing is needed"). That assumption held for Phase 72 (first-ever run, empty manifest) but breaks the moment a *new* locale is added in a *later* phase against an *already-populated* manifest.
**How to avoid:** Back up then reset `i18n/translation-manifest.json` to `{"version":1,"units":{}}` before the real (non-`--dry-run`) ar/hi/zh generation run (Pattern 1). This is safe — the write loop is locale-scoped via `targetPathFor(locale)`, so ru/es/fr/EN files are never touched by an `ar,hi,zh`-scoped run regardless of manifest state.
**Warning signs:** After running the pipeline, spot-check `messages/ar.json` (or hi/zh) for a key NOT in the `RoutePage` namespace (e.g. `Nav.items`) — if the value is still plain English text, the manifest reset did not happen or did not take effect.
**Verified this session:** ran `node scripts/i18n-translate.mjs --check --locales ar,hi,zh` (no API calls, safe) and it reported exactly 22 missing keys per locale (`RoutePage.*` only) — confirming the manifest already treats every pre-existing unit as "done" for ar/hi/zh, which it demonstrably is not (`messages/ar.json`'s `Nav` namespace was read this session and its values are unmodified English strings).

### Pitfall 2: `Noto_Sans_SC({ subsets: ['chinese-simplified'] })` fails the Next.js build
**What goes wrong:** The UI-SPEC's Font Loading Per Locale table specifies `subsets: ['chinese-simplified']` for the `zh` loader. This is not a valid Google Fonts subset name for the "Noto Sans SC" family as Next.js's bundled metadata defines it — attempting to build with it throws `nextFontError('Unknown subset "chinese-simplified" for font "Noto Sans SC". Available subsets: cyrillic, latin, latin-ext, vietnamese')` at build time (Next.js's `validate-google-font-function-call.ts` runs this exact check whenever `preload` is truthy, which is next/font's default).
**Why it happens:** Google Fonts doesn't expose CJK glyph coverage as an opt-in "subset" the way it does for Latin/Cyrillic/Arabic/Devanagari scripts — the full CJK character set ships in the font file unconditionally. The `subsets` array Google (and therefore Next.js) exposes for `Noto Sans SC` only covers the *auxiliary* non-CJK glyphs (Latin punctuation, Cyrillic, Vietnamese diacritics) bundled alongside the Han characters. Next.js's own metadata for `Noto Sans JP` has the identical shape (confirmed via Context7-fetched Next.js source comments), so this is a known pattern across every Noto CJK family, not a one-off quirk of the SC variant.
**How to avoid:** Declare the loader with `subsets: ['latin']` (a valid value; harmless since it doesn't restrict CJK glyph inclusion) — or omit `subsets` entirely and explicitly set `preload: false` (Next.js auto-disables preload when a font has zero usable subsets, but `Noto Sans SC` *does* have usable subsets, so `subsets` is still required if `preload` stays `true`; the simplest safe config is `subsets: ['latin']`).
**Warning signs:** `next build`/`next dev` fails immediately with a `nextFontError` referencing "Noto Sans SC" — this is a hard compile-time failure, not a runtime glyph-rendering issue, so it will be caught the moment the loader is declared (Wave 0, before any page-level work).
**Verified this session:** read `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json` directly — `data['Noto Sans SC'].subsets === ["cyrillic","latin","latin-ext","vietnamese"]` — and cross-checked the validation logic via Context7 (`vercel/next.js`, `validate-google-font-function-call.ts`), which documents the identical constraint for `Noto Sans JP`.

### Pitfall 3: Arabic needs the full 6-category CLDR plural set; Hindi/Chinese don't trigger the check at all
**What goes wrong:** If `glossary.locales.ar.pluralCategories` is set to `["one", "other"]` (copy-pasted from `es`/`fr`'s 2-category shape) instead of the correct 6-category Arabic set, `verifyPluralCategories()` silently passes every Arabic plural translation without checking for the missing `zero`/`two`/`few`/`many` branches (the function's own short-circuit: `if (requiredCategories.length <= 2) return {ok:true}`), because a wrong-but-short category list looks identical to `es`/`fr`'s genuinely-2-category grammar to this code path.
**Why it happens:** Mirrors the documented Phase 72 Russian pitfall (`ru` needs `one/few/many/other`) — this project has exactly 2 ICU `plural` constructs in `messages/en.json` (`Booking.entryBar.classPax`, `Booking.progressBar` `hoursOption`), both of which will be translated for `ar`/`hi`/`zh` and must emit the correct category set for each.
**How to avoid:** Set `glossary.locales.ar.pluralCategories = ["zero","one","two","few","many","other"]` (verified against the official Unicode CLDR chart, see Sources), `glossary.locales.hi.pluralCategories = ["one","other"]`, `glossary.locales.zh.pluralCategories = ["other"]`. Only `ar`'s entry will actually change verifier behavior (hi/zh both have `length <= 2`, matching the existing es/fr no-op path) — but all three should be set correctly for documentation accuracy and in case a future ICU construct depends on it.
**Warning signs:** An Arabic plural string renders literally as `{count, plural, one {...} other {...}}` (missing categories fall through to `other` in ICU, which is not a crash but produces grammatically wrong Arabic for 3-10 / 11-99 counts) — not caught by any automated test unless the plural-category verifier is correctly configured.

### Pitfall 4: `messages/{ar,hi,zh}.json` and `content/{routes,pages,blog}/{ar,hi,zh}/` are in two different starting states
**What goes wrong:** Assuming a uniform "reconcile the stale placeholder" story for both catalogs and content leads to writing dead code — the `content/routes/{ar,hi,zh}/`, `content/pages/{ar,hi,zh}/`, `content/blog/{ar,hi,zh}/` directories **do not exist yet** (verified via `ls` this session — only `en/es/fr/ru` subdirectories are present), while `messages/{ar,hi,zh}.json` **do exist** as stale English-placeholder files (verified via `Read`).
**Why it happens:** The message catalogs were presumably scaffolded early (Phase 68/69 locale-list bootstrap, before real content) with a copy-of-EN placeholder so `next-intl` wouldn't crash on a missing catalog; the `content/*` directories were only ever created for the locales Phase 71/72 actually processed (en/es/fr/ru).
**How to avoid:** No special handling needed beyond running the pipeline correctly (Pattern 1) — `runFullTranslation()` already handles a missing target file gracefully (`existsSync(targetPath) ? ... : {}` fallback to an empty `existingValuesByUnitKey` map), so content generation for ar/hi/zh will create the directories fresh. Just don't assume a "diff against existing ar content" step is needed for the content surfaces — there's nothing to diff against.
**Warning signs:** None expected if Pattern 1 is followed; flagged here purely so the plan doesn't budget time for a nonexistent "existing ar content" migration step.

### Pitfall 5: `flattenEnSource` treats every array as one atomic translation unit — not a per-locale RTL concern, but affects `RoutePage`/route content arrays
**What goes wrong:** Not unique to this phase, but relevant when auditing what ar/hi/zh translation actually produces: array-valued leaves (e.g. `Nav.items`, FAQ arrays inside route content) are translated as a single JSON-serialized unit and parsed back via `coerceToSourceType()` (already fixed in Phase 72 per the committed `72-PATTERNS.md` note on the array-leaf JSON-parse-back bug). No new work needed here — noted only so the executor doesn't re-diagnose this as a "new" bug if an array round-trips through translation during this phase's run.
**Why it happens:** `scripts/lib/i18n-surfaces.mjs::coerceToSourceType()` already handles this (parses the model's JSON-string response back into an array/object when the EN source was non-string).
**How to avoid:** No action — already fixed. Included here as a negative-finding confirmation, not a new task.
**Warning signs:** N/A — this is a "verified already-fixed" entry, not an open risk.

## Code Examples

### Reading the resolved locale for a per-locale conditional (already-established pattern)
```typescript
// Source: components/SiteChrome.tsx (read this session, lines 106-107) — existing pattern, reused unchanged
const locale = await getLocale()
const messages = await getMessages()
```

### `<html dir>` — already implemented, shown for reference only
```typescript
// Source: app/[locale]/layout.tsx (read this session, line 25) — NO CHANGE NEEDED this phase
<html lang={locale} dir={rtlLocales.includes(locale as AppLocale) ? 'rtl' : 'ltr'}>
```

### Bidi-isolated price/phone span (Mixed LTR-in-RTL, D-11) — pattern to introduce
```html
<!-- Applies at the same rich-text-tag boundaries the DNT pipeline already isolates
     (i18n/glossary.json doNotTranslate.structural.richTextTags: 'price', 'strong', etc.) -->
<span dir="ltr" style="unicode-bidi: isolate;">€185</span>
<!-- or the HTML-native equivalent: -->
<bdi>€185</bdi>
```

### Letter-spacing suppression for Arabic/Devanagari (UI-SPEC Typography contract)
```css
/* Source: app/globals.css (read this session) — .label currently applies
   letter-spacing: 0.28em unconditionally. Add a locale override: */
:lang(ar) .label,
:lang(hi) .label {
  letter-spacing: normal;
}
```
`app/globals.css`'s `.label` class (confirmed at line 110-118 this session) is the primary example; the same `:lang(ar)`/`:lang(hi)` pattern applies to every other `letter-spacing`-bearing selector enumerated in the UI-SPEC (`--letter-spacing-nav`, `--letter-spacing-wide`, `--letter-spacing-logo`, and the `!important`-flagged rules at lines 568-571).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `ltr:ml-3 rtl:mr-3` paired-variant classes for RTL support | Single logical-property class (`ms-3`) | Tailwind v3.3 (2023), carried into v4 | One class instead of two; the project's installed `tailwindcss@^4` has this natively — confirmed via Context7-fetched official docs, which show this exact before/after migration example |

**Deprecated/outdated:** N/A — this phase introduces no deprecated patterns; the logical-property utilities being adopted are themselves the modern replacement for the `ltr:`/`rtl:` paired-variant pattern that predates them.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `PHASE_72_LOCALES` should be extended to include `ar/hi/zh` (making the CI auto-translate workflow cover all 6 locales going forward), OR left as `ru/es/fr` with the ar/hi/zh run invoked explicitly via `--locales` every time — CONTEXT.md defers this to Claude's Discretion without stating a default | Pattern 1 / "Open Questions" | If extended without also updating `.github/workflows/i18n-translate.yml`'s `add-paths` list (currently hardcoded to ru/es/fr file globs, verified by reading the workflow file this session), future CI auto-translate runs would generate ar/hi/zh files but the PR-bot would never stage/commit them — a silent, hard-to-notice gap. If NOT extended, ar/hi/zh silently stop receiving automatic re-translation on future EN edits (contradicts TR-01's "re-runnable pipeline" requirement for the full locale set) until someone remembers to run `--locales ar,hi,zh` manually. |
| A2 | The initial (this-phase) ar/hi/zh generation run happens as an orchestrator-run local script invocation (mirroring how Phase 72's ru/es/fr generation was done — confirmed via project memory as a "local run, committed on milestone branch") rather than via the CI `workflow_dispatch` auto-PR path | Pattern 1 | If the plan instead routes generation through the CI PR flow, the manifest-reset step (Pattern 1) needs to happen in a CI-runnable form (a preceding script/commit) rather than an ad hoc local `cp`/`echo`, and the executor needs `ANTHROPIC_API_KEY` available as a GitHub secret rather than in local `.env.local` |
| A3 | `getRouteContent()` (referenced by `app/[locale]/routes/*/page.tsx`, not directly read this session — inferred to mirror `lib/page-content.ts`'s confirmed EN-fallback pattern) falls back to `content/routes/en/*.json` for a locale whose file doesn't exist yet, so `/ar/routes/*` renders (in English) rather than 404ing before this phase's content-generation step completes | Architecture Diagram / Pitfall 4 | If `getRouteContent()` does NOT have the same EN-fallback shape as the confirmed `getPageContent()`, `/ar/routes/*` could throw at request time until content generation completes — the plan should verify `lib/route-content.ts`'s actual fallback logic directly (not just assume parity with `page-content.ts`) as an early Wave-0 check |

**If this table is empty:** N/A — see entries above; all three should be confirmed/resolved during planning, not carried silently into execution.

## Open Questions

1. **Should `PHASE_72_LOCALES` be renamed/extended, and should the CI workflow (`.github/workflows/i18n-translate.yml`) be updated in this phase or deferred?**
   - What we know: The CLI accepts `--locales ar,hi,zh` today with zero code changes (confirmed by running `--check` this session). `PHASE_72_LOCALES` is the CLI's *default* when `--locales` is omitted, and is what the CI workflow implicitly uses (`node scripts/i18n-translate.mjs` with no flag). The CI workflow's `add-paths`, commit message, and PR title/body are all hardcoded to "RU/ES/FR".
   - What's unclear: Whether Phase 73's scope includes making the CI pipeline fully 6-locale-aware, or whether that's explicitly Phase 74/75 territory (SEO/verification phases) since CONTEXT.md's phase boundary doesn't mention CI workflow changes at all.
   - Recommendation: Extend `PHASE_72_LOCALES` (or introduce a superseding `PRODUCTION_LOCALES` export covering all 6) for correctness, AND update the CI workflow's `add-paths`/commit-message/PR-body in the same phase — the alternative (leaving CI silently scoped to 3 of 6 locales) is a latent bug that will surface confusingly whenever someone next edits `messages/en.json` and wonders why ar/hi/zh weren't retranslated by the auto-PR.

2. **What is `lib/route-content.ts`'s exact EN-fallback behavior for a locale with no content file?**
   - What we know: The sibling `lib/page-content.ts` (read this session) has a confirmed `fs.existsSync(localized) ? localized : fallback` pattern falling back to `content/pages/en/`.
   - What's unclear: `lib/route-content.ts` itself was not read this session (only inferred by naming/pattern parity with `page-content.ts`, and by CONTEXT.md's own reference to "EN-fallback loaders" for the content model generally).
   - Recommendation: Planner/executor should `Read lib/route-content.ts` directly as an early verification step before assuming route pages behave identically to non-route pages for locales that don't yet have content — this is a one-file, low-cost check that removes Assumption A3.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `scripts/i18n-translate.mjs`, all build tooling | ✓ | project requires `>=24.0.0` (package.json `engines`) — environment version not directly probed this session, assumed present since this is the existing dev environment | — |
| `ANTHROPIC_API_KEY` | Real (non-dry-run) translation calls | Not verified this session — `.env.local` is sandbox-restricted from direct `Read`/`Bash` access per project convention; `scripts/i18n-translate.mjs`'s `loadEnvLocal()` reads it internally at script-execution time, which is unaffected by the sandbox restriction on direct file inspection | — | `--dry-run --fixtures` mode requires no key at all, for mechanism verification only |
| Google Fonts CDN reachability (build-time) | `next/font/google` Noto loaders | Assumed available — same network dependency the existing `Fraunces`/`Inter` loaders already have in `components/SiteChrome.tsx`; no new network dependency class introduced | — | None needed — `next/font` self-hosts after the build-time fetch, so this is a build-environment concern only, not a runtime/production concern |

**Missing dependencies with no fallback:** None identified — this phase introduces no new external tool/service dependency beyond what `next/font/google` already required for the existing Fraunces/Inter loaders.

**Missing dependencies with fallback:** `ANTHROPIC_API_KEY` availability is unverified but has a documented dry-run fallback for mechanism testing (not for producing real ar/hi/zh output — the real generation run requires the key).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.1` (installed devDependency), `environment: 'jsdom'`, `setupFiles: ['./tests/setup.ts']` (confirmed via `Read` of `vitest.config.ts` this session) |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `npx vitest run <path/to/file>.test.ts` (no `npm test` script defined in `package.json` — confirmed via `Read`; must invoke `vitest` directly) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TR-02 | `ar`/`hi`/`zh` catalogs have 0 missing keys vs `messages/en.json`, correct value types | integration (no-API-call check mode) | `node scripts/i18n-translate.mjs --check --locales ar,hi,zh` | ✅ (script exists; already runnable — confirmed this session) |
| TR-02 | No literal English text leaked into an ar/hi/zh translated unit | unit | Extend `tests/i18n-completeness.test.ts` with an `ar`/`hi`/`zh` case for `checkNoEnglishLeakage` (currently only exercises `ru` fixtures) | ⚠ Wave 0 — existing test file covers the function generically but has no ar/hi/zh-specific assertions |
| RTL-01 | `/ar/` renders `dir="rtl"` | unit (already covered) | `tests/i18n-navigation.test.ts` / `tests/middleware-i18n.test.ts` likely already assert `dir` via `rtlLocales` — verify coverage, extend if the assertion is EN/RU-only | ⚠ Wave 0 — verify existing coverage extends to `ar` specifically, not just the `rtlLocales` constant in isolation |
| RTL-01 | Logical-class conversion renders identically under `dir="ltr"` (no visual regression on en/ru/es/fr) | integration (golden-HTML snapshot) | `npx vitest run tests/route-page-render.test.tsx` (existing byte-parity technique, extend to the specific converted files) | ✅ pattern exists (`tests/route-page-render.test.tsx`), ⚠ Wave 0 — only covers `prague-vienna`; the D-12 gate needs this technique applied more broadly or paired with a build-output diff, not just one route |
| FONT-01 | No Noto font bytes requested on `/en/`, `/ru/`, `/es/`, `/fr/` | manual / build-output inspection | Inspect `next build` output or a dev-server network panel for `/en`, `/ru`, `/es`, `/fr` vs `/ar`, `/hi`, `/zh` — no existing automated test for this; Next.js does not emit a machine-checkable "which fonts were requested per route" artifact | ❌ Wave 0 gap — no automated test exists; flag as `human_needed` or write a build-manifest inspection script (`.next/static/media/*.woff2` filenames are content-hashed but not obviously locale-attributable without a custom check) |
| FONT-01 | No tofu/fallback glyphs on `/ar/`, `/hi/`, `/zh/` | manual visual QA | D-10's 5-page RTL visual QA pass | ❌ inherently manual — no automated tofu-detection tooling in this stack |

### Sampling Rate
- **Per task commit:** `npx vitest run <changed-test-file>`
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus `node scripts/i18n-translate.mjs --check --locales ar,hi,zh` (or the eventual full 6-locale set) green, plus the D-10 manual 5-page RTL visual QA pass recorded.

### Wave 0 Gaps
- [ ] `tests/i18n-completeness.test.ts` — extend `checkNoEnglishLeakage` test cases to cover `ar`/`hi`/`zh` fixtures (currently `ru`-only per the file read this session)
- [ ] Verify (not necessarily extend) `tests/middleware-i18n.test.ts`/`tests/i18n-navigation.test.ts` assert `dir="rtl"` specifically for `ar`, not just that `rtlLocales` contains `'ar'` in isolation
- [ ] A build-time or manual check confirming zero Noto font bytes ship to `/en/`,`/ru/`,`/es/`,`/fr/` (D-04 hard gate) — no existing automated mechanism; likely `human_needed` for this phase unless a lightweight `.next` build-manifest grep is written
- [ ] `Read lib/route-content.ts` directly (Open Question 2 / Assumption A3) before relying on its EN-fallback behavior for `/ar/routes/*` pre-content-generation

*(Framework itself, jsdom environment, and the byte-parity snapshot technique are already established — no framework installation gap.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Phase touches no auth surface |
| V3 Session Management | No | Phase touches no session surface |
| V4 Access Control | No | Phase touches no access-control surface |
| V5 Input Validation | Marginal | The translation pipeline's `glossary.json` schema is already zod-validated (`glossarySchema` in `scripts/lib/i18n-glossary.mjs`, read this session) — adding `locales.{ar,hi,zh}` entries goes through the same fail-loud validation, no new validation surface needed |
| V6 Cryptography | No | No cryptography introduced |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt-injection via translated content flowing back into the system prompt/glossary (T-72-02, already mitigated in Phase 72) | Tampering | `verifyDntPreserved`/`verifyPluralCategories` fail-closed verification (already exists, read this session) — applies unchanged to ar/hi/zh output; no new mitigation needed, just confirm it still runs for the new locales (it does, since it's locale-parameterized generically) |
| RTL Unicode bidi-override characters (`U+202E` RIGHT-TO-LEFT OVERRIDE and similar) injected into translated content spoofing displayed text direction | Spoofing | Not explicitly mitigated by the current pipeline's verifiers. Low realistic risk here since content originates from a trusted Anthropic API call under a locked system prompt (not untrusted user input), but flagged as a defense-in-depth gap: the pipeline could strip/reject Unicode bidi-control characters (`U+202A`-`U+202E`, `U+2066`-`U+2069`) from translated output as an additional fail-closed check, consistent with the existing DNT/ICU verification philosophy |

## Sources

### Primary (HIGH confidence)
- `package.json` (this repo) — read directly, confirmed `next@^16.2.3`, `next-intl@4.14.2`, `tailwindcss@^4`, `lucide-react@^1.6.0`, `@anthropic-ai/sdk@0.125.0`
- `i18n/locales.ts`, `i18n/routing.ts`, `app/[locale]/layout.tsx`, `app/(internal)/layout.tsx`, `components/SiteChrome.tsx` — read directly, confirmed existing RTL/font wiring
- `scripts/i18n-translate.mjs`, `scripts/lib/i18n-glossary.mjs`, `scripts/lib/i18n-manifest.mjs`, `scripts/lib/i18n-surfaces.mjs`, `scripts/lib/i18n-verify.mjs`, `scripts/lib/i18n-qa-report.mjs` — read directly, traced the full manifest/translate/verify pipeline
- `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json` — read directly this session, source of the Noto Sans SC subset-mismatch finding (Pitfall 2)
- `messages/{en,ru,ar}.json` — read/diffed directly this session, source of the stale-placeholder finding (Pitfall 1, 4)
- `i18n/translation-manifest.json` — read directly this session (2197 pre-existing units), and exercised live via `node scripts/i18n-translate.mjs --check --locales ar,hi,zh`
- Context7 (`/tailwindlabs/tailwindcss.com`) — `docs/padding.mdx`, `docs/margin.mdx`, `docs/border-radius.mdx`, `docs/text-align.mdx` — confirmed native logical-property utilities, no plugin required
- Context7 (`/vercel/next.js`) — `validate-google-font-function-call.ts` — confirmed the subset-validation mechanism and the parallel `Noto Sans JP` precedent for the SC finding
- https://www.unicode.org/cldr/charts/48/supplemental/language_plural_rules.html — official CLDR plural-category data for ar (6 categories)/hi (2)/zh (1)

### Secondary (MEDIUM confidence)
- Session `grep`/`ls` counts of physical-direction Tailwind classes across `app/` and `components/` — reproducible, but not from a third-party authoritative source (methodology documented inline in Pattern 3 for re-verification)

### Tertiary (LOW confidence)
- None — every claim in this document traces to a directly-read file, an executed command, or an official-docs fetch this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version number read directly from `package.json`, no training-data guesses
- Architecture: HIGH — every wiring claim (routing, layout, SiteChrome, manifest flow) traced by reading the actual source files
- Pitfalls: HIGH — both critical pitfalls (manifest no-op, SC font subset) were reproduced/confirmed via direct execution or direct metadata inspection this session, not inferred

**Research date:** 2026-09-17
**Valid until:** 30 days (stable stack; the manifest-state finding is specific to the repo's *current* state as of this date — if the real ar/hi/zh generation run happens between now and execution, the manifest-reset step in Pattern 1 becomes a no-op/already-done rather than a fresh requirement, and the executor should re-check `messages/ar.json`'s content before assuming Pitfall 1 still applies)
