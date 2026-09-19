---
phase: 73-non-latin-rtl-infra-ar-hi-zh
reviewed: 2026-09-19T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - components/CookieBanner.tsx
  - components/FeatureStrip.tsx
  - components/Hero.tsx
  - components/HowItWorks.tsx
  - components/Nav.tsx
  - components/SiteChrome.tsx
  - components/TestimonialsCarousel.tsx
  - app/globals.css
  - i18n/glossary.json
  - scripts/lib/i18n-glossary.mjs
  - .github/workflows/i18n-translate.yml
  - app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx
  - app/[locale]/blog/prague-airport-to-city-center/page.tsx
  - app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx
  - app/[locale]/routes/prague-berlin/page.tsx
  - app/[locale]/services/city-rides/page.tsx
findings:
  critical: 2
  warning: 5
  info: 0
  total: 7
status: issues_found
---

# Phase 73: Code Review Report

**Reviewed:** 2026-09-19
**Depth:** standard
**Files Reviewed:** 16 (12 unique, 3 blog pages + route/service page treated individually)
**Status:** issues_found

## Summary

Reviewed the RTL/logical-property infra for Phase 73 (ar/hi/zh): the physical→logical Tailwind swaps
(`text-start`, `border-s`, `ms/me`, `start/end`) are applied correctly and consistently everywhere they
appear in the reviewed files — `Hero.tsx`, `FeatureStrip.tsx`, `HowItWorks.tsx`, `TestimonialsCarousel.tsx`,
and most of `Nav.tsx` show no residual physical-direction Tailwind utilities. The CookieBanner toggle knob
correctly mirrors its "on" position using `rtl:` variants in a way that keeps the semantic (on = toward the
reading end) consistent in both directions.

However, two BLOCKER-level defects were found that directly undermine the phase's two most novel pieces of
work — the JS-computed chevron mirror and the DNT price bidi-isolation pattern:

1. The `Nav.tsx` account-menu chevron's JS-computed "RTL mirror" rotates a shape that has no left-right
   asymmetry to correct for, and as implemented it **inverts the open/closed visual state for the `ar`
   locale** — the chevron shows "open" while the menu is closed and vice versa.
2. The bidi-isolation pattern (`<bdi>` around DNT price tokens, D-11) was applied to `Hero.tsx` and to three
   **static, English-only, un-translated blog pages** where it has essentially no effect, but was **not
   applied at all** to `app/[locale]/routes/prague-berlin/page.tsx` or
   `app/[locale]/services/city-rides/page.tsx` — the two files in this review set that actually render
   AI-translated Arabic (RTL) content with interpolated prices. This is exactly backwards: the files that
   need the isolation don't have it, and two of the three files that have it don't need it.

Several smaller RTL/logical-property residuals were also found in `app/globals.css` and `Nav.tsx`'s dropdown
panel, plus one untranslated string and one un-mirrored keyboard-navigation direction. See details below.

## Critical Issues

### CR-01: Account-menu chevron "RTL mirror" inverts open/closed state for `ar`

**File:** `components/Nav.tsx:197-216`
**Issue:**
The chevron SVG path is `M2 4l4 4 4-4` inside a `viewBox="0 0 12 12"` — a downward-pointing "V" that is
horizontally symmetric about `x=6`. A shape that is horizontally symmetric has nothing to mirror for RTL:
flipping it left-right (`scaleX(-1)`) produces a pixel-identical result. The code instead adds a flat
`+180deg` whenever the locale is `ar`, on top of the existing open/closed rotation:

```tsx
transform: `rotate(${(menuOpen ? 180 : 0) + (isRtl ? 180 : 0)}deg)`,
```

Walking through the four states:
- LTR, closed: `0deg` → chevron points down (correct — closed)
- LTR, open: `180deg` → chevron points up (correct — open)
- **RTL, closed: `0 + 180 = 180deg` → chevron points up, even though the menu is closed**
- **RTL, open: `180 + 180 = 360deg ≡ 0deg` → chevron points down, even though the menu is open**

For `ar` users the chevron's visual open/closed indicator is exactly backwards. This is not a hypothetical
edge case — it fires on every render of the signed-in account menu for the `ar` locale.

**Fix:** Drop the RTL branch entirely — this chevron never needed mirroring:
```tsx
transform: `rotate(${menuOpen ? 180 : 0}deg)`,
transition: 'transform 0.2s ease',
```
If a chevron genuinely needs an RTL mirror (e.g. an asymmetric arrow used for pagination/back-navigation),
use `scaleX(-1)` conditioned on `isRtl`, not an extra `180deg` rotation, since rotation and horizontal-mirror
are only equivalent for shapes that are also vertically symmetric.

### CR-02: DNT price bidi-isolation (`<bdi>`, D-11) missing from the two pages that actually render translated RTL price text

**File:** `app/[locale]/routes/prague-berlin/page.tsx:115,129,193,237,334`; `app/[locale]/services/city-rides/page.tsx:138,150-154`
**Issue:**
`Hero.tsx` documents and implements the correct pattern: wrap only the interpolated price token in `<bdi>`
so it stays LTR/un-reversed inside surrounding RTL (`ar`) copy (`components/Hero.tsx:83-88`). The three
static blog pages in this review set also got `<bdi>` treatment around their price CTAs — but those pages
are hardcoded English JSX with no `useTranslations`/content-catalog call, so they render identical English
text under every locale segment (`/ar/blog/...`, `/hi/blog/...`, etc.) and are never actually bidi-mixed.

`prague-berlin/page.tsx` and `city-rides/page.tsx`, by contrast, pull genuinely translated content via
`getRouteContent(locale)` / `getPageContent(..., locale)` and interpolate live prices into it via
`interpolate(content.X, prices)` — e.g.:
```tsx
<p className="font-display font-light text-[42px] md:text-[52px] text-offwhite">€{businessHourly}<span className="text-[24px]">/hr</span></p>
{vClassLine}   {/* interpolate(content.priceCallout.vClassLine, { vClassHourly }) — a full translated sentence with an embedded price */}
{v.price}      {/* interpolate(v.price, prices) — vehicle price */}
{c.price}      {/* interpolate(c.price, prices) — day-trip price */}
{interpolate(content.cta.headingItalic, prices)}  {/* rendered inside <span className="display-italic">, not <bdi> */}
```
None of these price render sites are wrapped in `<bdi>`. These are exactly the pages that ship real Arabic
(RTL) sentences with an embedded LTR price/number run — the scenario D-11 exists to protect. Price ranges,
`/hr` suffixes, and en-dash-joined figures are the classic case where the Unicode bidi algorithm can visually
reorder digits/punctuation when embedded in RTL text without an isolate.

**Fix:** Apply the same `<bdi>` wrap used in `Hero.tsx` at each interpolated-price render site in these
files (and audit the other ~29 route pages / remaining service pages for the same gap, since `prague-berlin`
was called out as "the representative sample" for the mechanical swap but evidently not for this pattern):
```tsx
<p className="...">€<bdi>{businessHourly}</bdi><span className="text-[24px]">/hr</span></p>
```
For the sentence-level fields (`vClassLine`, `firstClassLine`, `v.price`, `c.price`, `headingItalic`), either
have `interpolate()` itself emit a `<bdi>`-wrapped span around the substituted price token (preferred, fixes
every call site in one place), or restructure these fields as rich-text templates with a `price` tag the way
`Hero.tsx`'s message does.

## Warnings

### WR-01: Account-menu dropdown panel uses physical `right: 0` instead of a logical inset

**File:** `components/Nav.tsx:220-240` (specifically `right: 0` at line 227)
**Issue:** The same component correctly computes `isRtl` for the chevron, but the dropdown panel itself is
positioned with a hardcoded physical `right: 0` inline style rather than a logical inset
(`insetInlineEnd: 0`) or an `isRtl`-conditioned value. In `ar`, the panel keeps anchoring to the physical
right edge of its trigger wrapper instead of mirroring to the "end" edge, inconsistent with the rest of the
component's RTL awareness.
**Fix:**
```tsx
style={{
  position: 'absolute',
  insetInlineEnd: 0,
  top: '100%',
  ...
}}
```

### WR-02: Residual physical-direction CSS left unconverted in `app/globals.css`

**File:** `app/globals.css`
**Issue:** Several rules still use physical `left`/`right`/`text-align: left` instead of the logical
equivalents used elsewhere in this same file (e.g. the `:lang(ar), :lang(hi)` letter-spacing reset block
shows the file is otherwise RTL-aware):
- `.skip-link { left: 1rem; ... }` (line 555) — the focus-visible skip-to-content link stays pinned to the
  physical left in `ar`, instead of the reading-start side.
- `.rdp-nav { position: absolute !important; top: -4px; right: 0; ... }` (line 579) — booking calendar's
  prev/next nav buttons stay pinned to the physical right regardless of locale.
- `.rdp-month_caption { ...; text-align: left; }` (line 588) — calendar caption stays left-aligned in `ar`.
- `.cta-text { ...; transform-origin: left center; ... }` (line 308) — hover zoom on CTA text links always
  grows from the physical left.
**Fix:** Convert to logical equivalents: `inset-inline-start` for `.skip-link`/`.rdp-nav`, `text-align: start`
for `.rdp-month_caption`, and either drop `transform-origin: left center` in favor of the default (`50% 50%`)
or make it `:dir(rtl)`-conditional if the left-anchored zoom is intentional for LTR only.

### WR-03: Testimonial carousel arrow-key navigation not adapted for RTL reading direction

**File:** `components/TestimonialsCarousel.tsx:76-84`
**Issue:**
```tsx
if (e.key === 'ArrowRight') { goTo(activeIndex + 1) }
else if (e.key === 'ArrowLeft') { goTo(activeIndex - 1) }
```
`ArrowRight` always advances to the next slide and `ArrowLeft` always goes back, with no `isRtl` branch. In
right-to-left interfaces the conventional (and more accessible) mapping swaps this so the physical arrow key
matches the visual "forward" direction of the mirrored carousel, mirroring the RTL-awareness already present
elsewhere in this phase (e.g. `Nav.tsx`'s — currently buggy, see CR-01 — attempt at chevron mirroring).
**Fix:**
```tsx
const locale = useLocale()
const isRtl = locale === 'ar'
const onKeyDown = (e) => {
  if (e.key === 'ArrowRight') { e.preventDefault(); goTo(activeIndex + (isRtl ? -1 : 1)) }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(activeIndex + (isRtl ? 1 : -1)) }
}
```

### WR-04: `SiteChrome.tsx` skip-to-content link is hardcoded English in every locale

**File:** `components/SiteChrome.tsx:170-172`
**Issue:**
```tsx
<a href="#main-content" className="skip-link btn-primary">
  Skip to content
</a>
```
Every other user-facing string in this file (and in the components it wraps) goes through
`useTranslations`/`NextIntlClientProvider`, but this accessibility skip-link is a raw literal and renders as
"Skip to content" under `/ar`, `/hi`, `/zh`, `/ru`, `/es`, and `/fr` alike. It's a small, easily-fixed gap,
but it's the one piece of chrome in this file that didn't get the i18n treatment the rest of the milestone is
built around, and it's specifically an accessibility-facing string (assistive-tech users are the audience
most likely to notice it stayed in English).
**Fix:** Route it through a message, e.g. `t('skipToContent')` sourced from a small shared/global namespace,
consistent with how `Nav`/`CookieBanner`/etc. pull their strings.

### WR-05: Inconsistent `<bdi>` scope in the static blog CTAs — wraps full sentences, not just the DNT token

**File:** `app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx:488`; `app/[locale]/blog/prague-airport-to-city-center/page.tsx:599`; `app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx:541`
**Issue:** Per `Hero.tsx`'s own D-11 comment and the glossary's `richTextTags`/`pricePlaceholderPattern`
definitions, `<bdi>` is meant to isolate only the DNT price token, not surrounding translatable prose. These
three CTA headings instead wrap the whole closing line, including plain English words, e.g.:
```tsx
<bdi className="display-italic">€69 fixed, chauffeur inside Arrivals.</bdi>
```
This is currently harmless (these pages are English-only regardless of locale segment — see CR-02), but it's
an inconsistent application of the documented pattern and would become a real bidi-scoping bug the moment any
of this copy is ever localized or reused in a component that does render mixed-direction content, since
wrapping a whole sentence in an isolate is a materially different operation from isolating just the numeral
run.
**Fix:** Narrow the wrap to just the price token, matching `Hero.tsx`:
```tsx
Skip the taxi rank entirely. <br />
<bdi style={{ color: 'var(--copper-pale)' }}>€69 fixed</bdi>. Chauffeur inside Arrivals.
```

---

_Reviewed: 2026-09-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
