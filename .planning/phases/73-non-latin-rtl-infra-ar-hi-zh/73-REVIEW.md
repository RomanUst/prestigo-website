---
phase: 73-non-latin-rtl-infra-ar-hi-zh
reviewed: 2026-09-19T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - lib/content-interpolate.ts
  - components/Nav.tsx
  - components/TestimonialsCarousel.tsx
  - components/SiteChrome.tsx
  - app/globals.css
  - app/[locale]/routes/prague-berlin/page.tsx
  - app/[locale]/services/city-rides/page.tsx
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 73: Code Review Report

**Reviewed:** 2026-09-19
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

This is a post-gap-closure re-review of Phase 73 (non-Latin & RTL infra). `lib/content-interpolate.ts` is correct and well-scoped: `interpolate()` stays plain-string for metadata/JSON-LD, `interpolateBidi()` correctly wraps only substituted tokens in `<bdi>`, and there is no shared-regex `lastIndex` state leakage. `SiteChrome.tsx` and `city-rides/page.tsx` are clean — the city-rides price-callout fields that actually embed a `{price}` token in content (verified against `content/pages/ar/services/city-rides.json`) are correctly routed through `interpolateBidi`.

However, I found and **verified against the real Arabic content JSON** that the D-11/CR-02 bidi-isolation fix is not applied consistently on the route-page template (`prague-berlin/page.tsx`, representative of all ~29 sibling route pages): two fields that demonstrably contain embedded price tokens in `content/routes/ar/prague-berlin.json` (`openingParagraphs[0]` and `faqs[1].a`) are interpolated with the plain (non-bidi) `interpolate()` and rendered with zero `<bdi>` protection, while sibling fields with the same shape (hero intro, CTA heading, vehicle price, day-trip price) are correctly bidi-wrapped. This is the exact bug class the phase's "CR-02 DNT price bidi-isolation sweep" was meant to close, but it missed these two fields — so Arabic users will see this on the live prague-berlin page (and likely every other route page using the same paragraph/FAQ fields).

I also found the RTL letter-spacing reset in `globals.css` covers only `.label` and `.rdp-caption_label`, not the many Tailwind arbitrary-value tracking classes and inline `letterSpacing` styles used throughout `Nav.tsx`, and a pre-existing accessibility gap in the Nav account-dropdown (menu items stay keyboard-focusable while visually hidden).

## Warnings

### WR-01: Confirmed bidi-isolation gap — Arabic price tokens embedded in unprotected prose (D-11/CR-02 regression)

**File:** `app/[locale]/routes/prague-berlin/page.tsx:54,66,139-144,296`
**Issue:** `openingParagraphs` and `faqs[].a` are interpolated with the plain, non-bidi `interpolate()` helper and then rendered as raw strings with no `<bdi>` wrapping:

```ts
// line 54
const openingParagraphs = content.openingParagraphs.map((p) => interpolate(p, prices))
// line 66
const faqs = content.faqs.map((f) => ({ q: f.q, a: interpolate(f.a, prices) }))
```
```tsx
// line 139-144 — rendered raw
<p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
  {openingParagraphs[0]}
</p>
// line 296 — rendered raw
<p className="body-text text-[12px]" ...>{faq.a}</p>
```

I verified against the real content file `content/routes/ar/prague-berlin.json` that both fields **do** contain embedded `{ePrice}`/`{sPrice}`/`{vPrice}` tokens surrounded by Arabic RTL prose (and interspersed Latin vehicle-class names):

- `openingParagraphs[0]`: `"...تبدأ الأجرة الثابتة من €{ePrice} في سيارة Mercedes E-Class... تسافر في V-Class ابتداءً من €{vPrice}... وتتوفر S-Class ابتداءً من €{sPrice}..."` — three unprotected DNT price runs in one paragraph.
- `faqs[1].a`: `"أجرة ثابتة ابتداءً من €{ePrice} في Mercedes E-Class... و€{vPrice} في V-Class... أو €{sPrice} في S-Class..."` — three more.

This is precisely the bidi-scrambling risk (Unicode bidi algorithm reordering currency symbols/digits/Latin class names embedded in RTL text) that `interpolateBidi()` and the `<bdi>` pattern were built to prevent — and it is already correctly applied elsewhere on the very same page (`hero.intro` line 115, `cta.headingItalic` line 334, `vehicles[].price` line 193, `dayTrip.configurations[].price` line 237, and the `copper`-flagged highlight line 129). The fix was applied inconsistently — the paragraph/FAQ fields were missed by the CR-02 sweep.

Since every route page shares this same template shape and the same `interpolate(field, prices)` call pattern for `openingParagraphs`/`routeNarrative`/`faqs`, this gap almost certainly repeats across the other ~29 route pages wherever their content happens to embed a price token in these fields (confirmed present on at least prague-berlin; not exhaustively checked for the rest).

**Fix:** Switch these two fields (and any other paragraph/FAQ-shaped field that is interpolated with `prices`) to `interpolateBidi()`, matching the pattern already used for `hero.intro`:

```ts
const openingParagraphs = content.openingParagraphs.map((p) => interpolateBidi(p, prices))
const faqs = content.faqs.map((f) => ({ q: f.q, a: interpolateBidi(f.a, prices) }))
```
(Note `faqs` is also used to build the FAQPage JSON-LD `acceptedAnswer.text` — keep a **separate** plain-`interpolate()`-derived string for the JSON-LD `text` field, since a `ReactNode` cannot serialize into `JSON.stringify`. Do not swap the JSON-LD source.)

Recommend also auditing `routeNarrative.paragraphs`, `inclusions`, and `dayTrip.configurations[].body` across all locales/routes (not just `ar`/prague-berlin) for the same pattern, since the code passes the same `prices` dict into `interpolate()` for all of them uniformly — the split between bidi-safe and bidi-unsafe fields is currently a manual, per-field decision with no test or lint enforcing parity, so this class of bug can silently reappear whenever content is edited.

### WR-02: Account-dropdown menu items remain keyboard-focusable while visually hidden

**File:** `components/Nav.tsx:218-238, 239-267, 268-296, 299-332`
**Issue:** The dropdown panel (`#account-menu`) is hidden purely via `opacity: menuOpen ? 1 : 0` and `pointerEvents: menuOpen ? 'auto' : 'none'` (lines 234-235). Neither of these removes the panel's children from the keyboard tab order — the `role="menuitem"` `<Link>`s ("My trips", "Profile") and the sign-out `<button>` have no `tabIndex={-1}`, `aria-hidden`, `hidden`, or `inert` gating when `menuOpen` is `false`. A keyboard-only user tabbing through the page (without ever opening the dropdown) will tab into these invisible, non-interactive-looking elements, receive focus with no visible focus indicator context (the panel is `opacity: 0`), and be unable to tell where focus is. This fails WCAG 2.4.7 (focus visible in context) and creates a confusing keyboard trap-like experience.
**Fix:** Gate the interactive children on `menuOpen`, e.g. add `tabIndex={menuOpen ? 0 : -1}` to each `role="menuitem"` element (and the sign-out button), or conditionally render the panel contents only when `menuOpen` (keeping the outer wrapper mounted for the CSS transition), or add `inert={!menuOpen}` to the panel container.

### WR-03: RTL letter-spacing reset (FONT-01) covers only two selectors — most tracked UI text is unaffected

**File:** `app/globals.css:119-140`; consumed incompletely by `components/Nav.tsx:141,147,369,375,396,403,410` and `components/TestimonialsCarousel.tsx:20,38,44`
**Issue:** The reset:
```css
:lang(ar) .label, :lang(hi) .label { letter-spacing: normal; }
:lang(ar), :lang(hi) {
  --letter-spacing-label: normal;
  --letter-spacing-nav: normal;
  --letter-spacing-wide: normal;
  --letter-spacing-logo: normal;
}
```
only overrides the `.label` class and defines `--letter-spacing-*` custom properties that **no rule in the codebase currently consumes** (confirmed via grep — the only other `:lang(ar)`/`:lang(hi)` selector in `globals.css` is `.rdp-caption_label` at line 607-609). Meanwhile `Nav.tsx` applies positive letter-spacing to translated Arabic/Hindi text via Tailwind arbitrary-value classes that compile to literal `letter-spacing` declarations, e.g.:
- Desktop/mobile nav links: `tracking-[0.2em]` (lines 141, 369)
- "NEW" badge: `tracking-[0.14em]` (lines 147, 375)
- Mobile menu items / sign-out button: `tracking-[0.2em]` (lines 396, 403, 410)

and `TestimonialsCarousel.tsx` applies `tracking-[0.08em]` / `tracking-[0.1em]` to the reviewer name and "Google review" / source label (lines 20, 38, 44). None of these reference `var(--letter-spacing-*)`, so the reset has no effect on them. For `ar`/`hi` locales, this positive letter-spacing remains applied to translated copy in exactly the components this phase's own comment describes as breaking ("Positive letter-spacing... breaks Arabic's cursive/contextual letter-joining and visually fragments Devanagari conjuncts"). The comment's claim that the token reset means "any future consumer... inherits the reset too" is true only for consumers that don't already exist as of this review — current consumers bypass it entirely via Tailwind arbitrary values / inline styles.
**Fix:** Either (a) migrate the tracked classes in Nav/TestimonialsCarousel to use `var(--letter-spacing-nav|wide|label)` instead of literal `tracking-[...]` values so the existing reset takes effect, or (b) add explicit `:lang(ar) .font-body, :lang(hi) .font-body { letter-spacing: normal; }`-style coverage (or a broader `:lang(ar) [class*="tracking-"]` catch-all) so translated UI chrome text is covered, not just `.label` and the date-picker caption.

## Info

### IN-01: `highlights[].value` bidi-wrap decision is coupled to an unrelated styling flag

**File:** `app/[locale]/routes/prague-berlin/page.tsx:57-60, 129`
**Issue:** Whether a highlight's interpolated value gets wrapped in `<bdi>` is decided by the `copper` boolean (a color-styling flag, presumably meaning "this is the price highlight"), not by whether the value actually contains an interpolated price token:
```tsx
{(h as { copper?: boolean }).copper ? <bdi>{h.value}</bdi> : h.value}
```
For the current `ar` content this happens to be correct (the one highlight with an embedded `{ePrice}` token is also the one flagged `copper: true`), but the coupling is coincidental/implicit rather than derived. A future content edit that adds a price token to a non-`copper` highlight (or removes it from the `copper` one) would silently reintroduce the bidi bug with no code signal.
**Fix:** Derive the bidi-wrap decision from whether `interpolate`/`interpolateBidi` actually substituted a token (e.g. always call `interpolateBidi` for highlight values and drop the `copper`-based branch), rather than piggybacking on the color flag.

---

_Reviewed: 2026-09-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
