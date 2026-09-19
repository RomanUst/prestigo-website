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

**Status: scaffold committed, pending operator visual pass.** Per the task's own `<human-check>`
verify item, the actual pixel-level walkthrough is **queued for the end-of-phase human-check
harvest** (rolled into the UAT flow), not performed synchronously by this executor — this agent
has no browser/screenshot capability in this session. Cells below are pre-filled ONLY where an
automated/textual check this session already confirms the underlying fact (noted inline); every
cell requiring an actual visual/rendering judgment is left `PENDING — operator`.

**The 5 D-10 representative pages (confirmed reachable, correctly localized text + correct Noto
class via `next build && next start` + `curl` this session — see Task 2):**

| # | Template type | URL | Pre-check this session |
|---|---|---|---|
| 1 | Home | `/ar/` | Noto class present (dynamic render); Arabic h1 confirmed |
| 2 | Booking flow (EntryBar → wizard → vehicle cards) | `/ar/book` | Noto class present; EntryBar/wizard Arabic strings confirmed (`aria-label`, `placeholder`) — see deferred-items.md for the one unrelated hardcoded-EN decorative heading above the wizard |
| 3 | Route page | `/ar/routes/prague-vienna` | Dynamic render (not SSG); Arabic h1 "من براغ إلى فيينا،" confirmed |
| 4 | Blog post | `/ar/blog/prague-airport-arrivals-guide` | Noto class present; Arabic h1 confirmed (real MDX-translated post, not one of the 3 locked-EN legacy JSX posts) |
| 5 | Account/login | `/ar/login` | Noto class present; `dir="rtl"` confirmed; Arabic UI strings confirmed |

### Group 1 — Mirroring (labels/icons swap sides; directional chevrons/arrows point reader-correct; non-directional marks do NOT flip)

| Page | Result |
|---|---|
| 1. Home | PENDING — operator (Hero decorative corners, scroll-cue centering, FeatureStrip divider — all logical-class-converted per 73-03, needs visual confirmation of correct RTL mirror) |
| 2. Booking flow | PENDING — operator (EntryBar/wizard step-progress chevrons, journey-timeline arrows — needs visual confirmation of D-03 mirror rule) |
| 3. Route page | PENDING — operator (`text-end` conversion per 73-04 — needs visual confirmation renders on the correct/mirrored side under `dir="rtl"`) |
| 4. Blog post | PENDING — operator (pull-quote/results-table logical conversion N/A on MDX posts — MDX posts use the shared blog template, not the 3 legacy JSX pages 73-05 touched; needs visual confirmation) |
| 5. Account/login | PENDING — operator (Nav.tsx dropdown chevron JS-computed RTL mirror per 73-01 — needs visual confirmation) |

### Group 2 — Tofu (no fallback glyph boxes on `/ar/`, `/hi/`, `/zh/`)

| Page | Result |
|---|---|
| 1. Home (ar) | PENDING — operator (correct-script text confirmed reaching the browser + correct Noto class applied; actual glyph-render-without-tofu needs a human eyeball pass) |
| 2. Booking flow (ar) | PENDING — operator (same basis as above) |
| 3. Route page (ar) | PENDING — operator (same basis as above) |
| 4. Blog post (ar) | PENDING — operator (same basis as above) |
| 5. Account/login (ar) | PENDING — operator (same basis as above) |
| `/hi/` spot-check (home or login) | PENDING — operator — Noto Sans Devanagari class confirmed present on `/hi/login` (Task 2 count); text-level Devanagari confirmed in `messages/hi.json`/`content/pages/hi/*.json` |
| `/zh/` spot-check (home or login) | PENDING — operator — Noto Sans SC class confirmed present on `/zh/login` (Task 2 count); text-level Simplified Chinese confirmed in `messages/zh.json`/`content/pages/zh/*.json` |

### Group 3 — Mixed LTR-in-RTL (D-11): prices `€…`, phone `+420 725 986 855`, flight numbers, times stay LTR and un-reversed; EntryBar + RouteMap do not break under `dir="rtl"`

| Page | Result |
|---|---|
| 1. Home — Hero price anchor | Confirmed programmatically: `<bdi style="color:var(--copper)">€69</bdi>` present in `/ar/` server-rendered HTML (73-03's bdi wrap). Visual isolation (numeral stays LTR, un-reversed) still needs operator confirmation. |
| 2. Booking flow — EntryBar/RouteMap integrity under `dir="rtl"` | PENDING — operator (no known price/phone/flight/time literal on the EntryBar chrome itself; the check here is structural — EntryBar/map must not visually break, not a bdi-wrap check) |
| 3. Route page — any inline price/phone/time tokens | PENDING — operator. Note: route pages were NOT in 73-03/73-05's bdi-wrap scope (no existing DNT span boundary was found there per the RESEARCH audit) — if a price/phone/time token is visually reversed on `/ar/routes/prague-vienna`, this is a **new finding**, not a known scoped no-op, and should be logged as a bug per the plan's prohibition ("MUST NOT declare the phase complete while a `/ar/` QA page shows... a reversed price/phone token"). |
| 4. Blog post — inline price/phone/time tokens | PENDING — operator. The chosen MDX post (`prague-airport-arrivals-guide`) was not one of the 3 legacy JSX pages 73-05 bdi-wrapped — same "new finding if reversed" caveat as row 3 applies. |
| 5. Account/login | PENDING — operator (no price/phone content expected on this template; confirm no unexpected token exists) |

### Group 4 — Backstops (overflow/clipping, CJK line-breaking, vertical-rhythm drift)

| Backstop | Scope | Result |
|---|---|---|
| Long Arabic/Hindi strings do not clip/overflow fixed-width UI (nav labels, buttons, EntryBar chips) | All 5 pages, `ar` + `hi` spot-check | PENDING — operator. Any clipped label is a bug, not an accepted state (must_haves backstop). |
| Long Chinese headings/labels do not break mid-character awkwardly on `/zh/` | Home + one heading-heavy page (route or blog post), `zh` | PENDING — operator. Flag + fix any `overflow-wrap`/`word-break` need found. |
| Taller `ar`/`hi` line-height (1.7–1.8 body / 1.4 heading per UI-SPEC Typography) does not break a section boundary | All 5 pages, `ar` + `hi` spot-check | PENDING — operator. Locale-specific vertical-rhythm drift vs the EN baseline is acceptable IF it doesn't overlap/clip a section boundary. |

### Harvest note

This checklist is authored and committed as scaffold per Task 3's `<done>` criteria
("73-RTL-QA.md checklist scaffold is committed; the D-10/D-11 visual QA is queued for the
end-of-phase human-check harvest"). The `PENDING — operator` cells above are the explicit,
non-silent representation of "no automated evidence exists" for a visual-judgment item — they
are NOT a pass, and must be completed via a live `/ar/`, `/hi/`, `/zh/` browser walkthrough
before the phase's D-10/D-11 success criterion can be marked fully verified (human_needed,
never silently defaulted to pass, per the project's status vocabulary).

