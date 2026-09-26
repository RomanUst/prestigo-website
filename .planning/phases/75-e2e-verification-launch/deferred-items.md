# Phase 75 — Deferred Items

Out-of-scope discoveries logged during plan execution per the executor's
scope-boundary rule (fix only what the current task's `files_modified`
covers; log everything else here instead of silently expanding scope).

## 75-13

- **`components/ArticleByline.tsx` uses `next/link`'s default import instead
  of the i18n `Link`.** `.planning/phases/75-e2e-verification-launch/75-EN-LEAK-AUDIT.md`
  row 85 attributes this finding to plan 75-13, but the plan's own
  `files_modified` frontmatter and task list do not include this file — it
  was never one of 75-13's targets (BookingSection, HourlyBookingSection,
  Routes/RoutesBento/RoutesMap, BlogCard, StepStub, not-found, /book
  loading, blog post CTA, author page). Severity is low (R3: a byline link
  on an article page drops the locale prefix on click-through). Mocked out
  in `tests/shared-sections-i18n.test.tsx`'s blog-CTA test so it doesn't
  interfere with that test's own assertions. Needs its own task/plan (or
  folding into 75-20's final EN-leak re-verify) to fix.
