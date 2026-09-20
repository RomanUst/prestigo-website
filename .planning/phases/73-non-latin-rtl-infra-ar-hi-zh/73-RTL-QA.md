# Phase 73 — RTL / Font / Bidi QA Record

Phase: 73-non-latin-rtl-infra-ar-hi-zh
Plan: 73-06 (closing gate)

This file records the FONT-01 weight-budget build-output inspection (Task 2)
and the D-10/D-11 human visual QA checklist (Task 3).

---

## Task 2 — FONT-01 Weight-Budget Check

**Method:** `npx next build` (clean build, `rm -rf .next` first) + direct inspection of
the emitted static HTML (`.next/server/app/<locale>/*.html`) for the presence of the
`noto_sans_arabic_*`/`noto_sans_devanagari_*`/`noto_sans_sc_*` `.variable` class on
`<body>`, cross-referenced against `components/SiteChrome.tsx`'s source guarantee
(single `localeFontClassName` ternary — one Noto variable applied per locale, `''` for
LTR/internal). This is the build-output-inspection method flagged as the only available
mechanism in 73-RESEARCH.md (no machine-checkable per-route font-request manifest exists
in this stack — confirmed again this session).

**Build result:** `npx next build` — **PASS**, exit 0, no `nextFontError`.

**Source guarantee (grep):**
```
$ grep -c "localeFontClassName" components/SiteChrome.tsx
3
```
The single ternary branch (`components/SiteChrome.tsx:142-149`) applies exactly one of
`notoArabic.variable` / `notoDevanagari.variable` / `notoSC.variable` / `''` based on
`getLocale()`'s resolved value — structurally, only one Noto family can ever be applied
per render.

**Weight-budget result (zero-Noto-on-LTR hard gate) — full static-output count, not a sample:**

| Locale | Static `.html` files | Files carrying ANY Noto `.variable` class | Result |
|---|---|---|---|
| en | 32 | **0** | PASS — zero Noto bytes |
| ru | 32 | **0** | PASS — zero Noto bytes |
| es | 32 | **0** | PASS — zero Noto bytes |
| fr | 32 | **0** | PASS — zero Noto bytes |
| ar | 32 | 22 (see Known Gap below) | own-family-only where applied — PASS (no cross-family leak) |
| hi | 32 | 22 (see Known Gap below) | own-family-only where applied — PASS (no cross-family leak) |
| zh | 32 | 22 (see Known Gap below) | own-family-only where applied — PASS (no cross-family leak) |

**Cross-family leak check:** grepped every `ar`/`hi`/`zh` static HTML file that DOES carry
a Noto class — in every case it carries exactly its own family (`ar`→`noto_sans_arabic`,
`hi`→`noto_sans_devanagari`, `zh`→`noto_sans_sc`) and never another locale's family. No
occurrence of `/en/`, `/ru/`, `/es/`, `/fr/` output carrying ANY Noto class was found —
**the FONT-01 hard weight-budget gate (never ship Noto bytes to a locale that doesn't need
them) is satisfied with zero exceptions.**

**Gate result for Task 2's literal acceptance criteria: PASS.**

---

### ⚠ Critical finding surfaced during this inspection (out of Phase 73 scope — recorded, not fixed here)

While confirming the weight-budget rule, live-server verification (`next build && next start`,
plus direct inspection of the pre-rendered static HTML) uncovered that **7 statically-generated
page templates — `about`, `terms`, `corporate`, `privacy`, `faq`, the blog **index** listing
(`/blog`), and `contact` — silently render their `content/pages/<locale>/*.json` content in
**English on every locale**, including `ru`/`es`/`fr` (already shipped in Phase 72) and
`ar`/`hi`/`zh` (this phase). The same pages also skip the per-locale Noto `<body>` class for
`ar`/`hi`/`zh`, because the SAME root-cause misresolution affects `SiteChrome`'s
`localeFontClassName` on that specific render pass.**

**Reproduction (`en`/`ar` both shown; identical on `ru`/`es`/`fr`/`hi`/`zh`):**
```
$ grep -oE '<h1[^>]*>[^<]*' .next/server/app/en/about.html
<h1 ...>Prague&#x27;s chauffeur service.
$ grep -oE '<h1[^>]*>[^<]*' .next/server/app/ar/about.html
<h1 ...>Prague&#x27;s chauffeur service.   ← should be Arabic; content/pages/ar/about.json:13
                                             already has "خدمة السائقين الخاصين في براغ."
```

**Root cause (confirmed, not speculative):** `app/[locale]/about/page.tsx` (and the other 6
affected pages) call `getLocale()` from `next-intl/server` directly — with **no `params`
prop, no explicit locale forward** — inside both `generateMetadata()` and the page body, to
resolve the locale for `getPageContent('about', locale)`. next-intl's own docs (confirmed via
Context7, `amannn/next-intl` — "Pass locale param to generateMetadata in page.tsx") state this
pattern requires forwarding the resolved `{ locale } = await params` explicitly "to support
static rendering for metadata" — an unforwarded `getLocale()` in a page using
`export const dynamic = 'force-static'` can resolve to the i18n config's **default locale**
during static generation instead of the per-page requested locale. `getPageContent()` validates
its `locale` argument against `routing.locales` and throws on an invalid value — since the
build did NOT throw and every locale rendered `en` content, the resolved value is confirmed to
be the valid default locale `'en'`, not `undefined`.

**Why this does not block the Phase 73 gate:** D-10 scopes the phase's own visual-QA bar to
**5 representative template types — home, booking flow, one route page, one blog post,
account/login** — and this session verified all 5 render correctly for `ar` (translated
content + correct Noto class): home (`/ar/`, dynamic render — unaffected), `/ar/book` (Noto
correct; wizard/EntryBar content correctly Arabic — see the one unrelated hardcoded-EN
decorative heading noted below), `/ar/routes/prague-vienna` (dynamic route render, Arabic
h1 confirmed), `/ar/blog/prague-airport-arrivals-guide` (real MDX post, Arabic h1 + Noto
class confirmed), `/ar/login` (Noto class + Arabic UI strings confirmed). None of the 7
affected templates are in the D-10 set, and the weight-budget hard gate (zero Noto bytes on
`en`/`ru`/`es`/`fr`) is unaffected — the bug causes Noto **under-delivery** on some ar/hi/zh
pages, never over-delivery on LTR pages.

**Why this is NOT fixed in this plan:** the bug predates Phase 73 (present in `about.tsx` etc.
since Phase 71's content externalization; `ru`/`es`/`fr` already exhibit it on production
content shipped in Phase 72) and is not caused by any file this phase's plans (73-01..73-05)
touched. Per the Scope Boundary rule ("Only auto-fix issues DIRECTLY caused by the current
task's changes... pre-existing failures in unrelated files are out of scope... log to
deferred-items.md, do NOT fix them"), this is logged as a deferred, high-priority, cross-phase
finding rather than patched inline here — the correct fix (forwarding `{ locale } = await
params` into `generateMetadata`/the page body across ~7 files, per next-intl's documented
pattern) is a distinct, mechanical, multi-file remediation task, not a font/RTL-infra change.

**Recorded to:** `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/deferred-items.md` and
`.planning/WINDOWS.md` (kind: deviation) for ship-gate visibility.

**Separate, unrelated, narrower observation (also not fixed, also pre-existing):** `/book`'s
top decorative heading ("Your transfer," in `app/[locale]/book/page.tsx:97`) is a literal
hardcoded English JSX string, never externalized under Phase 70/STR-02 — unrelated to the
getLocale() bug above (this string simply was never wired to a translation key at all). The
EntryBar/wizard content below it (the actual D-10 "booking flow" surface) is correctly
translated. Logged to deferred-items.md as a narrow STR-02 gap, not a RTL-01/FONT-01/TR-02 item.

---

## Task 3 — D-10 Visual QA Checklist (5 representative `/ar/` pages) + D-11 Mixed LTR-in-RTL + Tofu + Backstops

**Status: PERFORMED — live browser walkthrough completed 2026-09-19 by the orchestrator
(Claude) via the built-in browser against the local dev server (`npm run dev`,
`http://localhost:3000`), after all 73-07..73-11 code fixes and the 73-12 Task-1 backstop
landed.** Every cell below carries a recorded PASS/FAIL with a one-line note. One FAIL was
found (brand wordmark reversal under RTL), fixed in this same plan (see the deviation note in
73-12-SUMMARY.md — `app/globals.css` `.wordmark { direction: ltr }`), and re-verified PASS.

**The 5 D-10 representative pages (all confirmed reachable + correctly localized this pass):**

| # | Template type | URL | Live check |
|---|---|---|---|
| 1 | Home | `/ar` | `dir=rtl`, `lang=ar`, Noto Arabic on `<body>`; Arabic h1 "خدمة سيارات مع سائق في براغ،" — clean |
| 2 | Booking flow | `/ar/book` | `dir=rtl`, Noto Arabic; EntryBar/wizard Arabic ("خطّط رحلتك", "القائمة"). Hero decorative headings still hardcoded EN — known deferred STR-02 (out of scope), not a Phase-73 FAIL |
| 3 | Route page | `/ar/routes/prague-vienna` | `dir=rtl`, Noto Arabic; Arabic h1 "من براغ إلى فيينا، من الباب إلى الباب." |
| 4 | Blog post | `/ar/blog/prague-airport-arrivals-guide` | `dir=rtl`, Noto Arabic; real translated Arabic body; article `text-align: start` (right-aligned under RTL) |
| 5 | Account/login | `/ar/login` | `dir=rtl`, Noto Arabic; Arabic UI + skip-link "تخطَّ إلى المحتوى" (WR-04 verified live) |

### Group 1 — Mirroring (labels/icons swap sides; directional chevrons/arrows point reader-correct; non-directional marks do NOT flip)

| Page | Result |
|---|---|
| 1. Home | PASS — nav mirrored (labels RTL, "أحجز الآن" CTA on the inline-start/left); Hero corners/scroll-cue centered; FeatureStrip divider on correct side. Brand wordmark: FAIL-then-FIXED (see note below) — now renders "PRESTIGO" (verified via child geometry: visual L→R = PRESTIGO). |
| 2. Booking flow | PASS — EntryBar/wizard step chevrons and journey timeline mirror correctly under `dir=rtl`; no layout break. |
| 3. Route page | PASS — `text-end`/`text-start` conversion (73-04) right-aligns route body under RTL. |
| 4. Blog post | PASS — shared blog template; article `text-align: start` right-aligns; no directional-class breakage. |
| 5. Account/login | PASS — Nav account/menu chevron correct (CR-01 fix, 73-07); dropdown anchored via `insetInlineEnd` (WR-01). Login-card wordmark also fixed by the same `.wordmark` rule. |

**Group-1 FAIL found & fixed (RTL-01):** the Latin brand wordmark (`.wordmark`, used in
`components/Nav.tsx` and `components/CookieBanner.tsx`) is an `inline-flex` row whose two
children (`PRESTI` + `GO`) reversed under `dir=rtl`, rendering **"GOPRESTI"** on every `/ar`
page (confirmed by child `getBoundingClientRect().left` ordering, not eyeball alone). The
footer wordmark (a `<p>`, not flex) was unaffected. Fix: `app/globals.css` `.wordmark {
direction: ltr }` — a no-op for LTR locales, changes no page HTML (byte-parity for
en/ru/es/fr preserved), fixes the flex main-axis order under RTL. Re-verified on `/ar` and
`/ar/login`: both wordmarks now read "PRESTIGO". A source-level backstop assertion was added
to `tests/rtl-backstop.test.ts` (46/46 green).

### Group 2 — Tofu (no fallback glyph boxes on `/ar/`, `/hi/`, `/zh/`)

| Page | Result |
|---|---|
| 1. Home (ar) | PASS — Arabic glyphs paint via Noto Sans Arabic; no tofu boxes (screenshot-verified). |
| 2. Booking flow (ar) | PASS — wizard Arabic strings render clean, no tofu. |
| 3. Route page (ar) | PASS — Arabic h1 + body render clean. |
| 4. Blog post (ar) | PASS — long translated Arabic body renders clean, no tofu. |
| 5. Account/login (ar) | PASS — Arabic UI + skip-link render clean. |
| `/hi/login` spot-check | PASS — `dir=ltr`, `lang=hi`, Noto Sans Devanagari; Devanagari ("सामग्री पर जाएँ", "सेवाएँ", "फ़्लीट") renders clean, no tofu (screenshot-verified). |
| `/zh/login` spot-check | PASS — `dir=ltr`, `lang=zh`, Noto Sans SC; Simplified Chinese ("跳转到主要内容", "服务项目", "车队") renders clean, no tofu (screenshot-verified). |

### Group 3 — Mixed LTR-in-RTL (D-11): prices `€…`, phone `+420…`, flight numbers, times stay LTR and un-reversed; EntryBar + RouteMap do not break under `dir=rtl`

| Page | Result |
|---|---|
| 1. Home — Hero price anchor | PASS — `<bdi>€69</bdi>` renders with `direction:ltr; unicode-bidi:isolate`; numeral stays LTR, un-reversed. |
| 2. Booking flow — EntryBar/RouteMap under `dir=rtl` | PASS — EntryBar chips, wizard, and RouteMap render without visual breakage; step numbers "01/02/03" and times "12:00 AM" stay LTR. |
| 3. Route page — inline price/phone/time tokens | **PASS (closed by gap cycle 73-13/73-14)** — the *discrete* price fields (hero intro, CTA, `v.price`/`c.price`, copper highlight) were already bidi-isolated by the 73-08/73-09 sweep. This row previously recorded a FAIL because `openingParagraphs`/`routeNarrative.paragraphs`/`faqs[].a` embedded `{ePrice}`/`{vPrice}`/`{sPrice}` tokens inside Arabic RTL prose and rendered via plain `interpolate()` with NO `<bdi>` — unprotected across all 30 route pages, confirmed live on `/ar/routes/prague-vienna` and `/ar/routes/prague-berlin`. 73-13 switched these three fields' render sites to `interpolateBidi()`/`aBidi` across all 30 `app/[locale]/routes/prague-*/page.tsx` files (FAQPage JSON-LD `acceptedAnswer.text` kept on the plain `f.a` string — carve-out preserved, JSON.stringify never receives a ReactNode). A live structural re-check this cycle (`tests/route-page-render.test.tsx` — the 73-13 `PragueViennaPage` `/ar` assertion plus a new equivalent 73-14 `PragueBerlinPage` `/ar` assertion) proves the opening-paragraph and FAQ-answer price tokens now render inside `<bdi>` on both D-10 reference pages (6+ `<bdi>` isolates each, JSON-LD payload stays plain-string). `tests/rtl-backstop.test.ts`'s CR-02 block is now strengthened (73-14, GAP-2) to assert these exact render call sites per-field (not file-level presence) across all 30 route pages, so a future regression at these sites fails the gate. *(Separate data note: price values render "€0" in local dev on all locales incl. en/ru — missing local Supabase pricing, not an RTL defect; independent of this structural fix.)* |
| 4. Blog post — inline tokens | PASS — chosen MDX post carries no DNT price/phone tokens in body; no reversed token present. |
| 5. Account/login | PASS — no price/phone content; nothing reversed. |

### Group 4 — Backstops (overflow/clipping, CJK line-breaking, vertical-rhythm drift)

| Backstop | Scope | Result |
|---|---|---|
| Long Arabic/Hindi strings do not clip/overflow fixed-width UI | All 5 pages (ar) + `/hi/login` | PASS — `document.documentElement.scrollWidth === clientWidth` on every page (no horizontal overflow); nav labels/buttons/EntryBar chips intact. |
| Long Chinese headings/labels break acceptably on `/zh/` | `/zh/login` (+ nav) | PASS — Simplified Chinese nav/headings wrap cleanly, no mid-glyph awkward break, no overflow. |
| Taller ar/hi line-height does not overlap/clip a section boundary | All 5 pages (ar) + `/hi/login` | PASS — no section-boundary overlap or clipping observed; locale vertical-rhythm drift stays within bounds. |

### Harvest note

Walkthrough **performed 2026-09-19** by the orchestrator (Claude) using the built-in browser
against `npm run dev` at `http://localhost:3000`, covering the 5 D-10 pages on `/ar` plus
`/hi/login` and `/zh/login`. Method per row: `dir`/`lang`/`<body>` Noto-class assertions +
child-geometry checks for mirroring + `scrollWidth`/`clientWidth` for overflow + screenshots
for tofu/glyph rendering. One FAIL (brand wordmark reversal under RTL) was found, fixed in
this plan (`app/globals.css`), and re-verified PASS; a machine backstop for it was added to
`tests/rtl-backstop.test.ts`. All Group 1–4 rows are now recorded PASS with zero remaining
unresolved-operator cells. Known out-of-scope items (7 static pages `getLocale()` EN-fallback
— WINDOWS #7; `/book` hardcoded-EN decorative heading — STR-02; local dev €0 pricing data)
are noted but are not Phase-73 RTL/FONT/TR FAILs and remain in `deferred-items.md`.

**Update (gap cycle 73-13/73-14):** Group 3's route-page row (above) initially recorded a
genuine FAIL, correctly caught by this walkthrough and confirmed independently by
`73-VERIFICATION.md`'s re-verification pass (2026-09-19) — `openingParagraphs`/
`routeNarrative.paragraphs`/`faqs[].a` embedded unprotected DNT price tokens in Arabic RTL
prose on every route page. 73-13 closed the defect (switched to `interpolateBidi()`/`aBidi`
at the render site across all 30 route pages, JSON-LD `text: f.a` carve-out preserved);
73-14 re-ran the D-10/D-11 structural check on `/ar/routes/prague-vienna` and
`/ar/routes/prague-berlin` (via `tests/route-page-render.test.tsx`, confirming `<bdi>`
isolation in the rendered markup on both pages) and strengthened `tests/rtl-backstop.test.ts`'s
CR-02 assertions to per-field render-call-site checks so this class of regression fails the
gate instead of passing it silently. The Group 3 route-page row is now corrected to PASS.
This closes the previously-open Group 3 route-page gap; no other row in this document is
affected by this update, and the FONT-01 glyph-tofu human-verification item (Task 3, Group 2)
remains routed to independent human sign-off, unchanged.
