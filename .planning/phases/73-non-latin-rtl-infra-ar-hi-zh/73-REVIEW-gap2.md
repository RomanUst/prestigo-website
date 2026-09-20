---
phase: 73-non-latin-rtl-infra-ar-hi-zh
reviewed: 2026-09-20T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - app/[locale]/routes/prague-vienna/page.tsx
  - app/[locale]/routes/prague-berlin/page.tsx
  - tests/route-page-render.test.tsx
  - tests/rtl-backstop.test.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 73: Code Review Report (gap-closure cycle 2 — plans 73-13 / 73-14)

**Reviewed:** 2026-09-20
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the 73-13/73-14 bidi-isolation swap on `prague-vienna` and `prague-berlin`
(`openingParagraphs`, `routeNarrative.paragraphs`, and the FAQ render site moved from
`interpolate()` to `interpolateBidi()`/`aBidi`) plus the two test files that back it.

**The core invariant holds in both files under review:** the FAQPage JSON-LD
`acceptedAnswer.text` field is fed exclusively by `f.a` — the plain, `interpolate()`-derived
string — in every code path I traced. Nowhere does `f.aBidi` (or any other
`interpolateBidi()`-produced `ReactNode`) reach the `pageSchema` object that gets
`JSON.stringify`'d into the `<script type="application/ld+json">` tag. I independently
verified `buildRouteJsonLd()` (`lib/jsonld.ts`) never touches `route.slug`/prose fields that
could carry a `ReactNode`, and confirmed via `git show 45ef534` that the diff is exactly the
minimal three-call-site swap described in the commit message — no stray edits. I also
traced `interpolateBidi()` itself (`lib/content-interpolate.ts`) line by line; its
token-substitution regex and `<bdi>` wrapping are correct, and its own unit tests
(`lib/content-interpolate.test.tsx`) cover the substitution/no-substitution/multi-token
cases directly with `renderToStaticMarkup`.

The `tests/rtl-backstop.test.ts` GAP-2 strengthening genuinely improves on the prior
file-level grep: the new assertions anchor on the field-qualified LHS
(`content.openingParagraphs.map((p) => interpolateBidi(p, prices))`) and explicitly assert
the *old* plain-`interpolate()` form is absent at that exact call site, which is a real
improvement over "does `<bdi>` appear anywhere in the file." It remains a source-text regex
match rather than an AST-verified call-site check, and only `prague-vienna`/`prague-berlin`
get a genuine live-render proof (`route-page-render.test.tsx`) of `<bdi>` actually appearing
in DOM output and the JSON-LD staying `<bdi>`-free; the other 28 sibling route pages rely on
the regex backstop alone for this specific invariant. That tradeoff is explicitly
acknowledged in the test file's own comments, so I'm not flagging it as a defect, just
noting the coverage boundary.

I found no BLOCKER-level defects in the four files reviewed. I found one real (if latent)
correctness inconsistency in the `chauffeurNarrative` field handling, one pre-existing
security-adjacent gap that is visible verbatim in both files under review, and two
lower-severity test-quality notes.

## Warnings

### WR-01: `chauffeurNarrative` interpolation is applied on `prague-vienna` but nowhere else in the fleet — silent token leak if content ever adds a price token there

**File:** `app/[locale]/routes/prague-vienna/page.tsx:61` (precompute) and `:254-261` (render)
**File:** `app/[locale]/routes/prague-berlin/page.tsx:258-264` (render, no precompute)

**Issue:** `prague-vienna` uniquely precomputes
`const chauffeurNarrative = content.chauffeurNarrative.map((p) => interpolate(p, prices))`
and renders `{chauffeurNarrative[i]}`. `prague-berlin` — and, per a repo-wide grep I ran
across all 30 `app/[locale]/routes/*/page.tsx` files, every other sibling route page —
renders `{content.chauffeurNarrative[i]}` directly, with **no interpolation call at all**.
`RouteContent.chauffeurNarrative` (`lib/route-content.ts`) is typed as `string[]` with the
exact same free-text shape as `openingParagraphs`/`routeNarrative.paragraphs` — nothing in
the loader or the type prevents a future content edit from embedding a `{ePrice}`-style
token in this field, the same way it does in the fields this gap-closure cycle just fixed.
I checked all 7 locales' `content/routes/*/prague-berlin.json` and `prague-vienna.json`
`chauffeurNarrative` arrays — none currently contain a `{`-token, so there is no active
production defect today. But if a future translation/content pass ever adds one here (a
plausible edit, since this field already discusses schedule/comfort details adjacent to
pricing), 29 of 30 route pages would render the literal string `{ePrice}` instead of
substituting the price, while only `prague-vienna` would substitute it (and even there,
via plain `interpolate()`, not `interpolateBidi()`, so it would still render un-isolated on
`/ar/`). This is exactly the class of defect this phase exists to close, left unaddressed
on an adjacent field.

**Fix:** Either standardize `chauffeurNarrative` on the same `interpolateBidi()` pattern used
for `openingParagraphs`/`routeNarrative.paragraphs` across all 30 route pages (for
consistency and to close the latent gap), or explicitly document/enforce (e.g. a content
schema/lint check) that `chauffeurNarrative` must never contain a `{token}`, so the omission
is a deliberate policy rather than an accident of the original refactor.

### WR-02: `JSON.stringify(pageSchema)` fed to `dangerouslySetInnerHTML` without `<` escaping — pre-existing, but present verbatim in both reviewed files

**File:** `app/[locale]/routes/prague-vienna/page.tsx:102`
**File:** `app/[locale]/routes/prague-berlin/page.tsx:106`

**Issue:** `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />`
does not escape `<` (e.g. `</script>`) in any string value embedded in `pageSchema` —
including `f.a` (FAQ answer, AI-translated per-locale content) and `f.q` (FAQ question).
Standard practice for JSON-in-`<script>` is to escape `<` as `<` (or at minimum
`</script>` sequences) before writing to `dangerouslySetInnerHTML`, because a literal
`</script>` inside the JSON string closes the script element early and lets anything after
it be parsed as HTML/script in the page. This is not introduced by 73-13/73-14 — it's the
pre-existing pattern across the whole route/service page fleet — but it is present verbatim
in the two files under review, the content it serializes is AI-translated across 7 locales
(a pipeline that could in principle introduce an unexpected `<` sequence in translated
prose), and it directly touches the exact `pageSchema`/FAQ object this review was asked to
verify for JSON-LD safety. Exploitability requires the offending string to originate from a
committed content file rather than live user input, so this is not an actively exploitable
request-time XSS, but it is a real defense-in-depth gap worth closing.

**Fix:**
```ts
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema).replace(/</g, '\\u003c') }}
/>
```
Ideally centralize this in a small `toJsonLdScript(schema)` helper in `lib/jsonld.ts` so the
escaping isn't repeated (and isn't skippable) at 30+ call sites.

### WR-03: `route-page-render.test.tsx`'s shared `getRoutePrice` mock hardcodes `slug`/`fromLabel`/`toLabel` for `prague-vienna`, reused unchanged for `prague-berlin` assertions

**File:** `tests/route-page-render.test.tsx:77-91`

**Issue:** The single module-level `getRoutePriceMock` always resolves to
`{ slug: "prague-vienna", fromLabel: "Prague", toLabel: "Vienna", ... }` regardless of the
slug argument passed in. This mock backs all four `describe` blocks in the file, including
the two added for `PragueBerlinPage` (`CR-02 backstop` and `73-14 Group 3 re-check`). Because
`buildRouteJsonLd()` happens to source its URLs from the `slug` parameter (not
`route.slug`) but sources `name`/`description` from `route.fromLabel`/`route.toLabel`, the
Berlin tests currently render a JSON-LD `Service.name`/`description` that says "Prague to
Vienna" while testing `PragueBerlinPage`. This doesn't undermine the specific `<bdi>`/plain-
string assertions those tests make (which don't touch `fromLabel`/`toLabel`), but it's a
landmine: any future assertion added to those `describe` blocks that checks Service naming
would silently validate against wrong data.

**Fix:** Make the mock slug-aware, e.g.
`vi.fn(async (slug: string) => ({ slug, fromLabel: 'Prague', toLabel: slug === 'prague-berlin' ? 'Berlin' : 'Vienna', ... }))`,
or split into two distinct mocked fixtures per page under test.

## Info

### IN-01: `rtl-backstop.test.ts` per-slug FAQ carve-out check is a source-text substring match, not an AST/call-site check

**File:** `tests/rtl-backstop.test.ts:171-176`

**Issue:** `expect(src).toMatch(/text:\s*f\.a\b/)` proves the literal substring `text: f.a`
exists somewhere in the 30 route-page source files, not that it's specifically the
`acceptedAnswer.text` property of the FAQPage JSON-LD `mainEntity` mapping. In practice this
is a reasonable, explicitly-documented tradeoff (the file's own comments acknowledge the
prior version's file-level blind spot and narrow the check, without claiming full AST
precision), and for the two pages with a live-render backstop
(`route-page-render.test.tsx`) the invariant is independently proven at runtime. For the
other 28 sibling pages, this regex is the only proof of the JSON-LD carve-out; a
sufficiently contrived regression (e.g., a stray, unrelated `text: f.a` elsewhere in the
file while the real `acceptedAnswer.text` was changed to something else) would not be
caught. Not asking for a fix given the acknowledged scope — flagging so this coverage
boundary is explicit for anyone relying on the backstop as a full behavioral proof.

### IN-02: Duplicate token-substitution work for every FAQ answer that has no price token

**File:** `app/[locale]/routes/prague-vienna/page.tsx:65`, `app/[locale]/routes/prague-berlin/page.tsx:66`

**Issue:** `content.faqs.map((f) => ({ q: f.q, a: interpolate(f.a, prices), aBidi: interpolateBidi(f.a, prices) }))`
runs both `interpolate()` and `interpolateBidi()` over every FAQ answer string, even though
only `a` (the plain string) is actually needed for the JSON-LD carve-out and `aBidi` for the
visible render — meaning the regex scan runs twice per string regardless of whether a price
token is even present. This is a performance-only observation (explicitly out of v1 scope
per the review brief) and not something I'm asking to be fixed; noting it only because it's
a direct byproduct of the swap being reviewed, in case a future contributor wants to
optimize by deriving `a` from `aBidi`'s plain-text form or vice versa.

---

_Reviewed: 2026-09-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
