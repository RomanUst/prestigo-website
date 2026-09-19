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

<!-- gsd:write-continue -->
