# Deferred Items — Phase 73

Out-of-scope discoveries logged per executor Scope Boundary rule (not fixed by 73-03).

## 35 pre-existing test failures (unrelated to 73-03's files)

**Found during:** Task 2 full-suite verification run (`npx vitest run`) of plan 73-03.
**Files:** `tests/blog-locale-fallback.test.ts`, `tests/legal.test.ts`, `tests/route-content.test.ts`,
`tests/routes-a.test.ts`, `tests/routes-b.test.ts`, `tests/routes-c.test.ts`.
**Cause:** These tests assert `"ar still falls back to EN (no ar file yet — Phase 73)"` / similar —
written before Phase 73-02 generated real `ar`/`hi`/`zh` content. Now that `ar` content actually
exists (73-02, commit f6f9af5), the fallback assertion is stale and fails. None of these test
files import or exercise `components/CookieBanner.tsx`, `components/Hero.tsx`,
`components/HowItWorks.tsx`, `components/FeatureStrip.tsx`, or `components/TestimonialsCarousel.tsx`
— confirmed via grep before and after 73-03's edits; failure count/identity is unchanged by this plan.
**Action:** Not fixed here — out of scope for 73-03 (component-level RTL class conversion only).
Already partially tracked in STATE.md ("~10 hi heading DNT-fallbacks deferred (WINDOWS #6)");
this entry extends that note to the full stale-fallback-assertion set surfaced by the fuller test run.
Belongs to whichever later plan/phase updates these fixtures for real ar/hi/zh content (likely a
73-02 follow-up or Phase 74/75 test-suite pass).
**Update (73-06):** this specific test-failure set no longer reproduces — the full `npx vitest run`
executed at the 73-06 phase gate (Task 1) is 124 files / 1458 tests passed, 0 failed. Resolved by
a later plan in this phase (73-04/73-05). Entry kept for history.

## CRITICAL (pre-existing, cross-phase, HIGH severity) — 7 static pages silently render English on every locale

**Found during:** 73-06 Task 2 (FONT-01 weight-budget build-output inspection).
**Files affected (all statically-generated, `export const dynamic = 'force-static'`):**
`app/[locale]/about/page.tsx`, `app/[locale]/terms/page.tsx`, `app/[locale]/corporate/page.tsx`,
`app/[locale]/privacy/page.tsx`, `app/[locale]/faq/page.tsx`, `app/[locale]/blog/page.tsx`
(the blog index/listing page only — individual `/blog/[slug]` posts are unaffected),
`app/[locale]/contact/page.tsx`.
**Symptom:** `next build`'s static HTML output for these 7 templates renders `content/pages/en/*.json`
content on EVERY locale — `en`, `ru`, `es`, `fr` (already shipped, Phase 72), `ar`, `hi`, `zh`
(this phase) — despite correct, real translated JSON existing at `content/pages/<locale>/*.json`
for all of them. The same render pass also fails to apply the per-locale Noto `<body>` class on
`ar`/`hi`/`zh` for these 7 templates (font delivery and content delivery share the same broken
locale-resolution call).
**Root cause:** these pages call `getLocale()` (next-intl/server) with no `params`-derived locale
forward, in both `generateMetadata()` and the page body — next-intl's own docs (confirmed via
Context7) require forwarding `{ locale } = await params` explicitly for reliable static-rendering
locale resolution; an unforwarded `getLocale()` on a `force-static` page can resolve to the i18n
config's default locale (`en`) during `next build` instead of the per-page requested locale.
Confirmed reproducible on a clean build (`rm -rf .next && next build`), 100% deterministic (not a
race), and confirmed live via `next start` + `curl` — not a static-export-only artifact.
**Not caused by Phase 73:** none of these 7 files were touched by 73-01 through 73-05; the bug
predates this phase (present since Phase 71 content externalization) and already affects
production-shipped `ru`/`es`/`fr` content from Phase 72.
**Why not fixed in 73-06:** out of Scope Boundary — pre-existing bug in unrelated files, a
multi-file (~7 pages) mechanical fix (thread `params.locale` into `generateMetadata` + page body
per next-intl's documented pattern), not a font/RTL-infra change. Does not block Phase 73's own
D-10-scoped success criteria — none of the 5 D-10 representative template types (home, booking
flow, route page, blog post, login) are among the 7 affected pages; all 5 verified correctly
translated + correct Noto class this session (see 73-RTL-QA.md Task 2).
**Full write-up:** `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md` § "Critical
finding surfaced during this inspection."
**Recommended fix:** in each of the 7 files, forward the resolved locale explicitly —
`export async function generateMetadata({ params }) { const { locale } = await params; ... }`
and thread the same into the page body's `getPageContent(page, locale)` call — matching the
official next-intl pattern, instead of the current bare `await getLocale()`.
**Also recorded to:** `.planning/WINDOWS.md` (kind: deviation) for ship-gate visibility.

## Minor (pre-existing, unrelated) — `/book` decorative heading never externalized

**Found during:** 73-06 Task 2, while spot-verifying the D-10 "booking flow" template live.
**File:** `app/[locale]/book/page.tsx:97` — the literal JSX string `Your transfer,` (decorative
heading above the EntryBar/wizard) is hardcoded English, never wired to a translation key under
Phase 70/STR-02. Unrelated to the getLocale() bug above — this string was simply never
externalized at all, on any locale. The actual EntryBar/wizard content beneath it (the D-10
"booking flow" surface) IS correctly translated and verified this session on `/ar/book`.
**Action:** Not fixed here — narrow STR-02 (Phase 70) scope gap, not a RTL-01/FONT-01/TR-02 item.

## Anthropic API credit exhaustion mid-run — 6 route files + corporate.json left untranslated for all 6 locales

**Found during:** 73-11 Task 2 (`node scripts/i18n-translate.mjs --locales ar,hi,zh,ru,es,fr`),
running the full-surface pipeline as instructed to translate the new `Common.skipToContent` key.
**Symptom:** The pipeline walks every EN source, not just `messages/en.json`; it discovered
pre-existing stale/pending translation units in
`content/routes/en/{prague-marianske-lazne,prague-olomouc,prague-pardubice,prague-plzen,prague-wroclaw,prague-zlin}.json`
and `content/pages/en/corporate.json`, and attempted to translate them for all 6 requested locales.
Every one of those attempts failed with `400 {"type":"invalid_request_error", "message":"Your
credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or
purchase credits."}`.
**Why not fixed here:** Out of Scope Boundary (unrelated files, not touched by this plan's declared
`files_modified`) AND blocked by account billing, which only the account owner can resolve — no
amount of retrying will succeed until credits are topped up.
**Verified safe:** the manifest's cross-locale-success invariant held — no unit was marked done
partially; `git diff` shows zero changes to any of the 7 affected files (no corrupt partial
writes), and `messages/en.json` / all `content/*/en/*.json` sources remain byte-unchanged.
**Also recorded to:** `.planning/WINDOWS.md` entry #8 (kind: deviation) for ship-gate visibility.
**Recommended fix:** top up the Anthropic account's credit balance, then re-run
`node scripts/i18n-translate.mjs` (full surface, no `--locales` filter) to pick up these 7 files
plus re-verify nothing else drifted since.

## 2 pre-existing stale ru/zh route translations resynced as an incidental fix

**Found during:** 73-11 Task 2, same pipeline run as above.
**Files:** `content/routes/ru/prague-ceske-budejovice.json`, `content/routes/ru/prague-frantiskovy-lazne.json`,
`content/routes/zh/prague-ceske-budejovice.json` — one `whyBook.headingLine1` unit each, out of sync
with the current `content/routes/en/*.json` wording ("Why book with Prestigo").
**Action:** Kept (not reverted) — Rule 1 auto-fix. The pipeline's own hash-manifest correctly
detected and re-translated these units in the same run that translates `Common.skipToContent`;
reverting would knowingly reintroduce an EN/translation mismatch the sanctioned AI pipeline already
fixed, for no benefit. Committed separately (`fix(73-11): resync 2 pre-existing stale ru/zh route
translations`) so it's clearly distinguishable from the WR-04 catalog work. `hi`'s equivalent unit
for the same 2 files remains on its known EN-fallback (WINDOWS #6 — DNT-token drop, unrelated to
this discovery).
