import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Phase 73 Plan 12, Task 1 — re-runnable source-level backstop for the
 * 73-07..73-10 RTL fixes.
 *
 * These are deterministic, source-reading assertions only (no browser, no
 * live render). They prove the CODE that prevents chevron mirroring,
 * un-RTL-aware carousel keys, residual physical-direction CSS, over-broad
 * blog CTA bdi scope, and missing route/service price bidi-isolation is in
 * place. The rendering-time facts (no tofu, no visual reversal) stay with
 * the human D-10/D-11 visual pass (73-12 Task 2) — this file deliberately
 * does not attempt to prove those.
 */

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf-8')
}

describe('RTL backstop — Nav.tsx chevron + dropdown inset (CR-01 / WR-01)', () => {
  const src = read('components/Nav.tsx')

  it('does not contain an RTL-mirror addend on the account-menu chevron (CR-01)', () => {
    // The pre-fix bug conditioned the chevron's rotation transform on an
    // `isRtl` boolean, inverting the open/closed indicator on /ar/. The
    // fix removed the isRtl branch (and the unused `isRtl` const) entirely.
    expect(src).not.toMatch(/isRtl/)
  })

  it('rotates the chevron open/closed only, with no other addend', () => {
    expect(src).toMatch(/transform:\s*`rotate\(\$\{menuOpen \? 180 : 0\}deg\)`/)
  })

  it('positions the account dropdown panel via insetInlineEnd, not a physical right (WR-01)', () => {
    expect(src).toMatch(/insetInlineEnd:\s*0/)
    expect(src).not.toMatch(/(?<!inset)[^a-zA-Z]right:\s*0/)
  })
})

describe('RTL backstop — TestimonialsCarousel.tsx keyboard direction (WR-03)', () => {
  const src = read('components/TestimonialsCarousel.tsx')

  it('imports useLocale and derives an RTL flag from it', () => {
    expect(src).toMatch(/import\s*\{[^}]*useLocale[^}]*\}\s*from\s*['"]next-intl['"]/)
    expect(src).toMatch(/useLocale\(\)\s*===\s*['"]ar['"]/)
  })

  it('conditions ArrowRight/ArrowLeft navigation deltas on the RTL flag', () => {
    expect(src).toMatch(/goTo\(activeIndex \+ \(isRtl \? -1 : 1\)\)/)
    expect(src).toMatch(/goTo\(activeIndex \+ \(isRtl \? 1 : -1\)\)/)
  })
})

describe('RTL backstop — app/globals.css logical properties (WR-02)', () => {
  const src = read('app/globals.css')

  it('uses inset-inline-start for the skip-link', () => {
    expect(src).toMatch(/inset-inline-start:\s*1rem/)
  })

  it('uses inset-inline-end for the calendar nav', () => {
    expect(src).toMatch(/inset-inline-end:\s*0/)
  })

  it('uses text-align: start for the calendar month caption', () => {
    expect(src).toMatch(/text-align:\s*start/)
  })

  it('has no residual left-anchored transform-origin on the CTA hover-zoom rule', () => {
    expect(src).not.toMatch(/transform-origin:\s*left center/)
  })

  it('forces the Latin brand wordmark to LTR so it never reverses under dir=rtl (73-12 QA)', () => {
    // The .wordmark flex/inline-flex layouts (Nav, CookieBanner) otherwise reverse
    // "PRESTI"+"GO" to "GOPRESTI" on /ar. direction:ltr keeps the brand readable.
    const rule = src.match(/\.wordmark\s*\{[^}]*\}/)?.[0] ?? ''
    expect(rule).toMatch(/direction:\s*ltr/)
  })
})

describe('RTL backstop — static blog CTA bdi scope narrowing (WR-05)', () => {
  const blogCtaFiles = [
    'app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx',
    'app/[locale]/blog/prague-airport-to-city-center/page.tsx',
    'app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx',
  ]

  for (const file of blogCtaFiles) {
    it(`${file} does not apply display-italic directly on a <bdi> element`, () => {
      const src = read(file)
      // The pre-fix bug applied `className="display-italic"` to the <bdi>
      // itself, isolating the whole sentence rather than just the DNT
      // token. The fix moved that class to a wrapping <span> and narrowed
      // each <bdi> to isolate only the price/duration numeral run.
      expect(src).not.toMatch(/<bdi[^>]*className="display-italic"/)
      // Confirm at least one narrowed, DNT-token-only bdi is still present.
      expect(src).toMatch(/<bdi[^>]*>\s*(?:€\d|3h)/)
    })
  }
})

describe('RTL backstop — route/service page price bidi isolation (CR-02)', () => {
  // Reuses the 73-09 sweep list: prague-berlin (73-08 reference fix) + all
  // 29 remaining route pages + the 3 service pages touched across 73-08/09.
  const routeSlugs = [
    'prague-berlin',
    'prague-bratislava',
    'prague-brno',
    'prague-budapest',
    'prague-ceske-budejovice',
    'prague-cesky-krumlov',
    'prague-dresden',
    'prague-frantiskovy-lazne',
    'prague-graz',
    'prague-hradec-kralove',
    'prague-karlovy-vary',
    'prague-krakow',
    'prague-kutna-hora',
    'prague-leipzig',
    'prague-liberec',
    'prague-linz',
    'prague-marianske-lazne',
    'prague-munich',
    'prague-nuremberg',
    'prague-olomouc',
    'prague-ostrava',
    'prague-pardubice',
    'prague-passau',
    'prague-plzen',
    'prague-regensburg',
    'prague-salzburg',
    'prague-vienna',
    'prague-warsaw',
    'prague-wroclaw',
    'prague-zlin',
  ]

  // 73-14 gap closure (GAP-2 / RTL-01): the old per-route-slug assertion
  // below only checked `/interpolateBidi/.test(src) || /<bdi>/.test(src)`
  // ANYWHERE in the file — true on every route page because hero.intro is
  // wrapped, so it stayed green (46/46) even while openingParagraphs and
  // faqs[].a were rendered through the plain, unprotected interpolate()
  // helper (the GAP-1 defect). These per-field assertions instead pin the
  // SPECIFIC render call sites 73-13 fixed, and assert the plain-helper
  // form is gone from exactly those sites (not a file-level grep) — so a
  // future regression at these sites fails the gate instead of passing it.
  for (const slug of routeSlugs) {
    const src = read(`app/[locale]/routes/${slug}/page.tsx`)

    it(`app/[locale]/routes/${slug}/page.tsx isolates the openingParagraphs precompute via interpolateBidi (not plain interpolate)`, () => {
      expect(src).toMatch(/content\.openingParagraphs\.map\(\(p\) => interpolateBidi\(p, prices\)\)/)
      // Anchored on the full field-qualified LHS so this cannot false-match
      // the sibling chauffeurNarrative precompute, which legitimately stays
      // on the plain helper — and the `interpolate\(` token boundary
      // (immediate `(` after the helper name) cannot match `interpolateBidi(`.
      expect(src).not.toMatch(/content\.openingParagraphs\.map\(\(p\) => interpolate\(p, prices\)\)/)
    })

    it(`app/[locale]/routes/${slug}/page.tsx isolates the routeNarrative.paragraphs precompute via interpolateBidi (not plain interpolate)`, () => {
      expect(src).toMatch(/content\.routeNarrative\.paragraphs\.map\(\(p\) => interpolateBidi\(p, prices\)\)/)
      expect(src).not.toMatch(/content\.routeNarrative\.paragraphs\.map\(\(p\) => interpolate\(p, prices\)\)/)
    })

    it(`app/[locale]/routes/${slug}/page.tsx defines faqs.aBidi via interpolateBidi(f.a, prices) and renders it in the FAQ answer JSX`, () => {
      expect(src).toMatch(/aBidi:\s*interpolateBidi\(f\.a,\s*prices\)/)
      expect(src).toMatch(/\{faq\.aBidi\}/)
    })

    it(`app/[locale]/routes/${slug}/page.tsx keeps the FAQPage JSON-LD acceptedAnswer.text on the plain f.a string (carve-out)`, () => {
      // The JSON-LD `text` field must stay a plain string — JSON.stringify
      // must never receive a ReactNode. `f.a` is the plain
      // interpolate()-derived field (distinct from the aBidi sibling above).
      expect(src).toMatch(/text:\s*f\.a\b/)
    })
  }

  const servicePages = [
    'app/[locale]/services/page.tsx',
    'app/[locale]/services/airport-transfer/page.tsx',
    'app/[locale]/services/city-rides/page.tsx',
  ]

  for (const file of servicePages) {
    it(`${file} renders bidi isolation at a price site`, () => {
      const src = read(file)
      const hasBidiEvidence = /interpolateBidi/.test(src) || /<bdi>/.test(src)
      expect(hasBidiEvidence).toBe(true)
    })
  }
})
