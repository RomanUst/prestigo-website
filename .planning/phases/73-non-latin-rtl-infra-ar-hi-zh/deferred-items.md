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
