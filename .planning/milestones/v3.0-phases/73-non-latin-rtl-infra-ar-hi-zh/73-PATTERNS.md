# Phase 73: Non-Latin & RTL Infra (AR, HI, ZH) - Pattern Map

**Mapped:** 2026-09-17
**Files analyzed:** ~50 (3 config/glossary files, `SiteChrome.tsx`, ~42 physical-class files, 1 manifest reset op, 2 test files)
**Analogs found:** 5 / 5 (this phase is >90% "extend an existing file in place" — analogs are the files themselves at earlier state, not separate files)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `i18n/glossary.json` (add `locales.ar/hi/zh`) | config | transform (data-driven pipeline input) | same file, `locales.ru/es/fr` entries | exact — same file, same schema, new keys |
| `scripts/lib/i18n-glossary.mjs` (`PHASE_72_LOCALES`) | utility/config | batch | same file, line 24 | exact — one-line extension |
| `i18n/translation-manifest.json` (reset before run) | config | batch | Phase 72's original bootstrap (empty `{"version":1,"units":{}}`) | exact — documented in RESEARCH.md Pattern 1 |
| `components/SiteChrome.tsx` (add 3 Noto loaders + locale-conditional className) | provider/layout | request-response | same file, existing `fraunces`/`inter` `next/font/google` declarations (lines 18-33) + body className (line 126) | exact — same file, same next/font convention |
| `app/globals.css` (`.label` / tracking overrides for `:lang(ar)`/`:lang(hi)`) | config (CSS) | transform | same file, `.label` rule (~line 110-118) + tracking vars (~568-571) | exact — additive `:lang()` override rules |
| ~42 files under `app/[locale]/**` + `components/**` (physical→logical Tailwind classes) | component/route | request-response | see representative analogs below | role-match, per-file 1:1 class swap |
| `components/Nav.tsx` (chevron `rtl:` mirror, inline `style` rotation) | component | request-response | same file, line 196 chevron `<svg>` (inline `style` rotation — needs special handling per Pattern 4) | exact file, needs bespoke fix |
| `tests/i18n-completeness.test.ts` (extend `checkNoEnglishLeakage` for ar/hi/zh) | test | batch | same file, existing `ru` fixture case | exact — same file, add fixture cases |
| `tests/middleware-i18n.test.ts` / `tests/i18n-navigation.test.ts` (verify `dir="rtl"` assertion covers `ar`) | test | request-response | same files, existing locale assertions | exact — verify/extend |
| `tests/route-page-render.test.tsx` (byte-parity extension for D-12) | test | batch (golden-HTML snapshot) | same file, existing `prague-vienna` snapshot | exact — extend coverage |

## Pattern Assignments

### `i18n/glossary.json` — add `locales.ar`, `locales.hi`, `locales.zh`

**Analog:** same file, `locales.ru`/`locales.es`/`locales.fr` (lines 18-38, read this session)

**Existing shape to copy exactly:**
```json
"ru": {
  "formality": "formal",
  "toneGuide": "Formal «Вы» address throughout — standard register for a premium chauffeur brand. Avoid unnecessary Latin-script loanwords where an established Russian term exists. No exclamation-heavy marketing tone.",
  "pluralCategories": ["one", "few", "many", "other"],
  "termMap": {}
},
"es": {
  "formality": "formal",
  "dialect": "es-ES",
  "toneGuide": "...",
  "pluralCategories": ["one", "other"],
  "termMap": {}
}
```

**New entries to add** (values locked by CONTEXT.md D-06/07/08 and RESEARCH.md Pitfall 3 — CLDR category lists):
```json
"ar": {
  "formality": "formal",
  "dialect": "fusha (Modern Standard Arabic)",
  "toneGuide": "Modern Standard Arabic (fusḥā), formal premium register — understood across the whole Arab world, not a regional dialect. Standard register for luxury brands.",
  "pluralCategories": ["zero", "one", "two", "few", "many", "other"],
  "termMap": {}
},
"hi": {
  "formality": "formal",
  "toneGuide": "Formal register using आप (aap). Moderately literary/Sanskritized Hindi, but common English tech/travel terms (airport, flight, terminal) stay as-is — natural for the urban target audience.",
  "pluralCategories": ["one", "other"],
  "termMap": {}
},
"zh": {
  "formality": "formal",
  "dialect": "zh-Hans (Simplified, mainland/PRC)",
  "toneGuide": "Simplified Chinese, mainland (PRC), polite business register (您). Traditional/TC explicitly rejected.",
  "pluralCategories": ["other"],
  "termMap": {}
}
```
**Critical:** do NOT copy-paste `es`/`fr`'s 2-category `pluralCategories` for `ar` — RESEARCH.md Pitfall 3 documents that `verifyPluralCategories()` silently no-ops on any ≤2-category list, so a wrong-but-short Arabic list passes verification while producing grammatically broken plurals.

---

### `scripts/lib/i18n-glossary.mjs` — `PHASE_72_LOCALES` (line 24)

**Analog:** same file, current line.

**Current:**
```javascript
export const PHASE_72_LOCALES = allLocales.filter((l) => l === 'ru' || l === 'es' || l === 'fr')
```
**Pattern to follow (extend, don't rename unless a follow-up decision is made — see RESEARCH.md Open Question 1):**
```javascript
export const PHASE_72_LOCALES = allLocales.filter(
  (l) => l === 'ru' || l === 'es' || l === 'fr' || l === 'ar' || l === 'hi' || l === 'zh'
)
```
Note: this constant is also the CI workflow's implicit default locale set (`.github/workflows/i18n-translate.yml`) — extending it affects future auto-PR runs, not just this phase's manual invocation. Flag for planner: confirm in-scope per Open Question 1 before extending, or invoke this phase's run via explicit `--locales ar,hi,zh` CLI flag without touching the constant (both are valid per CONTEXT.md's "Claude's Discretion").

---

### `i18n/translation-manifest.json` — reset before real run

**Analog:** RESEARCH.md Pattern 1 (verified this session via live `--check` run).

```bash
cp i18n/translation-manifest.json i18n/translation-manifest.json.pre-73.bak
echo '{"version":1,"units":{}}' > i18n/translation-manifest.json
node scripts/i18n-translate.mjs --locales ar,hi,zh
node scripts/i18n-translate.mjs --check --locales ar,hi,zh
```
This step is a **hard prerequisite** — skipping it means `messages/{ar,hi,zh}.json` pass the completeness gate while remaining ~99% stale English placeholder text (Pitfall 1, session-verified).

---

### `components/SiteChrome.tsx` — add 3 Noto loaders + locale-conditional className

**Analog:** same file, `fraunces`/`inter` declarations (lines 18-33) and `<body>` className (line 126) — read in full this session.

**Imports pattern** (line 2, extend):
```typescript
import { Fraunces, Inter, Noto_Sans_Arabic, Noto_Sans_Devanagari, Noto_Sans_SC } from 'next/font/google'
```

**Loader declaration pattern** (copy exact shape of `fraunces`/`inter` — module scope, `variable`, `subsets`, `display: 'swap'`):
```typescript
const notoArabic = Noto_Sans_Arabic({
  variable: '--font-noto-arabic',
  subsets: ['arabic'],
  weight: ['400', '500', '600'],
  display: 'swap',
})
const notoDevanagari = Noto_Sans_Devanagari({
  variable: '--font-noto-devanagari',
  subsets: ['devanagari'],
  weight: ['400', '500', '600'],
  display: 'swap',
})
const notoSC = Noto_Sans_SC({
  variable: '--font-noto-sc',
  subsets: ['latin'],   // CORRECTED — 'chinese-simplified' is NOT a valid subset name
  weight: ['400', '500', '600'],
  display: 'swap',
})
```
**CRITICAL correction vs UI-SPEC:** UI-SPEC's Font Loading table (line 76) says `subsets: ['chinese-simplified']` for `zh` — this throws a hard `nextFontError` at build time (RESEARCH.md Pitfall 2, verified against installed `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`: `Noto Sans SC`'s only valid subsets are `cyrillic, latin, latin-ext, vietnamese`). The planner must flag this as a locked correction to the UI-SPEC, not implement the UI-SPEC's literal value.

**Body className pattern** (line 126, existing):
```typescript
<body className={`${fraunces.variable} ${inter.variable}`}>
```
**Extend to (D-04, locale-conditional):**
```typescript
const localeFontClassName =
  locale === 'ar' ? notoArabic.variable :
  locale === 'hi' ? notoDevanagari.variable :
  locale === 'zh' ? notoSC.variable : ''

<body className={`${fraunces.variable} ${inter.variable} ${localeFontClassName}`}>
```
`locale` is already read at line 106 (`const locale = await getLocale()`) — no new read needed. Because `app/(internal)/layout.tsx` shares this same `SiteChrome` and always resolves `getLocale()` to `'en'` (no `[locale]` segment), `localeFontClassName` is `''` there automatically — internal chrome byte-parity is preserved with zero extra branching.

---

### `app/globals.css` — `:lang(ar)`/`:lang(hi)` tracking overrides

**Analog:** same file, `.label` rule (~line 110-118, read this session per RESEARCH.md Code Examples).

**Existing:**
```css
.label {
  font-size: 11px;
  letter-spacing: 0.28em;
  ...
}
```
**Pattern to add (additive, do not modify the base rule):**
```css
:lang(ar) .label,
:lang(hi) .label {
  letter-spacing: normal;
}
```
Apply the identical `:lang(ar)`/`:lang(hi)` override pattern to every other `letter-spacing`-bearing selector the UI-SPEC enumerates (`--letter-spacing-nav`, `--letter-spacing-wide`, `--letter-spacing-logo`, and the `!important`-flagged rules the UI-SPEC cites at lines 568-571 of `globals.css`). `zh` gets no override (CJK tracking is not broken by positive values per UI-SPEC Typography section).

---

### Representative physical→logical Tailwind conversions (RTL-01, ~42 files)

**Analog set** (5 files read this session, each representing a distinct conversion shape):

**1. `components/Nav.tsx`** (fixed nav bar edges + chevron + mobile-menu button + text-align)
```
Line 122: className={`fixed top-0 left-0 right-0 z-50 ...`}
  → fixed top-0 start-0 end-0 z-50 ...
Line 341: className="... p-3 -mr-1 min-h-[44px] min-w-[44px]"
  → ... p-3 -me-1 min-h-[44px] min-w-[44px]
Line 406: className="... text-left bg-transparent border-none cursor-pointer"
  → ... text-start bg-transparent border-none cursor-pointer
Line ~196: chevron <svg> uses inline style="transform: rotate(...)" driven by JS,
  NOT a Tailwind class — cannot use the `rtl:` variant directly. Needs a JS-computed
  rotation that also factors dir==='rtl' (Pattern 4 in RESEARCH.md), e.g.:
  const isRtl = locale === 'ar'
  style={{ transform: `rotate(${(menuOpen ? 180 : 0) + (isRtl ? 180 : 0)}deg)` }}
```

**2. `components/Hero.tsx`** (decorative absolute corners — optional/cosmetic convert; centering transform — do NOT convert)
```
Line 36-37: absolute top-0 left-0 ...   → absolute top-0 start-0 ...  (decorative, safe/optional)
Line 40:    absolute bottom-0 right-0 ...  → absolute bottom-0 end-0 ...  (decorative, safe/optional)
Line 96:    absolute bottom-8 left-1/2 -translate-x-1/2 ...
  → DO NOT CONVERT left-1/2/-translate-x-1/2 — this is a centering pair
    (paired left-1/2 + -translate-x-1/2 is direction-neutral), converting only
    left-1/2 to start-1/2 while leaving -translate-x-1/2 unchanged would be correct
    and safe, but changing the transform itself would break centering.
```

**3. `components/CookieBanner.tsx`** (toggle-switch knob — genuine RTL-meaningful position, MUST convert)
```
Line 387: className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-offwhite shadow transition-transform ${...}`}
  → absolute top-0.5 start-0.5 w-5 h-5 rounded-full bg-offwhite shadow transition-transform ${...}
  This is the toggle "off" position — MUST mirror under dir="rtl" (not decorative).
```

**4. `components/TestimonialsCarousel.tsx`** (margin + border-left pull-quote pattern)
```
Line 20: className="... ml-2" style={{ color: 'var(--copper)' }}
  → ... ms-2  style={{ color: 'var(--copper)' }}
Line 33: className="border-l-2 border-anthracite-light pl-6 py-2 max-w-3xl mx-auto"
  → border-s-2 border-anthracite-light ps-6 py-2 max-w-3xl mx-auto
```

**5. `components/FeatureStrip.tsx`** (responsive border-left divider)
```
Line 28: i > 0 ? 'lg:border-l lg:border-anthracite-light' : ''
  → i > 0 ? 'lg:border-s lg:border-anthracite-light' : ''
```

**6. Blog pull-quote pattern (3 blog pages, e.g. `app/[locale]/blog/prague-airport-to-city-center/page.tsx`)**
```
Line 499: className="border-l-2 border-copper pl-8 py-2"
  → border-s-2 border-copper ps-8 py-2
Line 528: className="w-full text-left"  (table)
  → w-full text-start
```

**7. Route pages `text-right` (e.g. `app/[locale]/routes/prague-vienna/page.tsx:315`)**
```
Line 315: <div className="text-right">
  → <div className="text-end">
```
This exact `text-left`/`text-right` pattern repeats across all ~19 `app/[locale]/routes/*/page.tsx` files and 3 blog pages found by the session grep (`grep -rln 'text-left\|text-right' app/ components/`) — apply the identical 1:1 swap (`text-left`→`text-start`, `text-right`→`text-end`) per file; no other logic changes.

**General conversion table (from RESEARCH.md Pattern 3 / UI-SPEC, verified counts this session):**
| Physical | Logical |
|---|---|
| `text-left` / `text-right` | `text-start` / `text-end` |
| `pl-{n}` / `pr-{n}` | `ps-{n}` / `pe-{n}` |
| `ml-{n}` / `mr-{n}` | `ms-{n}` / `me-{n}` |
| `border-l` / `border-l-{n}` | `border-s` / `border-s-{n}` |
| `border-r` / `border-r-{n}` | `border-e` / `border-e-{n}` |
| `left-{n}` / `right-{n}` (absolute/fixed) | `start-{n}` / `end-{n}` — **audit each occurrence individually**; decorative/non-mirroring positions (Hero.tsx corners, Nav.tsx full-bleed bar) are optional-but-safe to convert, RTL-meaningful positions (CookieBanner.tsx toggle knob) MUST convert |
| `rounded-l-*` / `rounded-r-*` | n/a — 0 occurrences found |
| `space-x-*`, `flex-row-reverse` | n/a — 0 occurrences found, do not introduce |

---

### Chevron/arrow `rtl:` mirroring (D-03)

**Analog:** `components/Nav.tsx` chevron pattern, adapted per RESEARCH.md Pattern 4.

**For plain Tailwind-class chevrons (most instances):**
```typescript
<svg aria-hidden="true" className="rtl:rotate-180 transition-transform" ...>
  <path d="M2 4l4 4 4-4" ... />
</svg>
```
**For `Nav.tsx`'s specific inline-`style`-driven chevron (deviation — see conversion example above):** the `rtl:` variant doesn't apply to inline `style` — compute the combined rotation in JS instead.

**Apply `rtl:rotate-180` (or `rtl:-scale-x-100`) ONLY to:** wizard step/progress arrows, journey-timeline A→B icons, route-arrow UI chrome (not the map geography itself). **Never** to: logo, checkmarks, WhatsApp glyph, social icons, star ratings, non-directional `lucide-react` icons (`UserRound`, `Car`, `ShieldCheck`, `Clock`) — per UI-SPEC Mirroring Rules table.

---

### `tests/i18n-completeness.test.ts` — extend for ar/hi/zh

**Analog:** same file, existing `ru`-only `checkNoEnglishLeakage` fixture case (per RESEARCH.md Wave 0 Gaps).

Pattern: duplicate the existing `ru` test case structure with `ar`/`hi`/`zh` fixture inputs — no new test infrastructure, just additional parameterized cases following the same shape.

---

### `tests/route-page-render.test.tsx` — byte-parity extension (D-12)

**Analog:** same file, existing golden-HTML snapshot for `prague-vienna`, which already normalizes `priceValidUntil` (today+365, from `lib/jsonld.ts`) per the project's documented byte-parity date-drift convention.

Extend or add sibling snapshot assertions confirming `en`/`ru`/`es`/`fr` output is byte-for-byte unchanged after the RTL class conversion and font changes — reuse the identical `priceValidUntil` normalization already in place, do not invent a new date-handling approach.

## Shared Patterns

### `next/font/google` module-scope declaration (D-04)
**Source:** `components/SiteChrome.tsx` lines 18-33 (existing `fraunces`/`inter`)
**Apply to:** all 3 new Noto loaders — same shape (`variable`, `subsets`, `weight`, `display: 'swap'`), loaders MUST stay at module scope (cannot be called conditionally); only the resulting `className`/`variable` **application** is locale-conditional.

### `:lang()` CSS override for non-Latin tracking
**Source:** `app/globals.css` `.label` rule + UI-SPEC Typography section
**Apply to:** every `letter-spacing`-bearing selector site-wide (`.label`, `--letter-spacing-nav`, `--letter-spacing-wide`, `--letter-spacing-logo`) — additive `:lang(ar)`/`:lang(hi)` rules only, never modify the base Latin rule.

### Bidi isolation for Latin tokens inside RTL text (D-11)
**Source:** RESEARCH.md Code Examples, applied at existing DNT rich-text-tag boundaries (`i18n/glossary.json` → `doNotTranslate.structural.richTextTags`: `price`, `strong`, etc.)
```html
<span dir="ltr" style="unicode-bidi: isolate;">€185</span>
<!-- or -->
<bdi>€185</bdi>
```
**Apply to:** prices, phone (`+420 725 986 855`), flight numbers, times — wherever these already-isolated DNT tokens render inside `/ar/` translated paragraphs. Do not invent a new parsing pass — wrap at the same call sites the rich-text tags already use.

### Manifest-safe locale backfill (one-time bootstrap)
**Source:** RESEARCH.md Pattern 1, session-verified live against `i18n/translation-manifest.json` (2197 pre-existing units)
**Apply to:** the single ar/hi/zh generation run this phase performs — reset manifest, run pipeline, verify via `--check`, verify ru/es/fr/EN untouched via `git diff --exit-code`.

### Byte-parity non-regression gate (D-12)
**Source:** existing golden-HTML snapshot pattern (`tests/route-page-render.test.tsx`), `priceValidUntil` normalization from `lib/jsonld.ts`
**Apply to:** every plan/task in this phase that touches `app/[locale]/**`, `components/**`, or `SiteChrome.tsx` — must not change en/ru/es/fr output.

## No Analog Found

None — every file in scope is either an in-place extension of an existing file (glossary, manifest, SiteChrome, globals.css) or a straightforward 1:1 class-name swap on an existing file (the ~42 RTL conversion targets), for which the "analog" is the file's own current state plus the conversion table above. No genuinely new file is created by this phase except `content/{routes,pages,blog}/{ar,hi,zh}/**` and `messages/{ar,hi,zh}.json` output, which are pipeline-generated artifacts (not hand-authored code) governed entirely by `scripts/i18n-translate.mjs` + `i18n/glossary.json`, already covered under "Manifest-safe locale backfill" above.

## Metadata

**Analog search scope:** `components/`, `app/[locale]/**`, `i18n/`, `scripts/lib/`, `app/globals.css`, `tests/` (session `grep`/`Read` against the live repo, cross-checked against RESEARCH.md's own session-verified counts)
**Files scanned:** `SiteChrome.tsx`, `app/[locale]/layout.tsx`, `i18n/locales.ts`, `i18n/glossary.json`, `scripts/lib/i18n-glossary.mjs`, `Nav.tsx`, `Hero.tsx`, `CookieBanner.tsx`, `TestimonialsCarousel.tsx`, `FeatureStrip.tsx`, one blog page, one route page — plus repo-wide grep for `text-left|text-right|left-|right-|ml-|mr-|pl-|pr-|border-l|border-r`
**Pattern extraction date:** 2026-09-17
