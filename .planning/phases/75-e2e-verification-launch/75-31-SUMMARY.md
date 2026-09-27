---
phase: 75-e2e-verification-launch
plan: 31
subsystem: i18n-metadata
status: complete
tags: [i18n, seo, metadata, open-graph, twitter-card, gap-closure]
requires: []
provides:
  - "lib/site-metadata.ts: siteMetadata, OG_LOCALE, getLocaleSiteMetadata, buildShareMetadata, getNotFoundMetadata"
  - "Locale-aware root layout metadata (app/[locale]/layout.tsx generateMetadata)"
  - "Central og->twitter mirroring (default twitter block = card + images only)"
  - "tests/helpers/resolveNextMetadata.ts: real Next.js accumulateMetadata harness"
affects:
  - "75-33 (wires getNotFoundMetadata into every 404 path)"
  - "75-36 (production share_meta_audit / en_leak_rendered proof)"
tech-stack:
  added: []
  patterns:
    - "Twitter title/description come ONLY from Next.js postProcessMetadata mirroring the resolved openGraph; no page or helper sets a twitter block"
    - "Contract tests run Next.js's own accumulateMetadata via a server-only resolver shim + createRequire"
key-files:
  created:
    - lib/site-metadata.ts
    - tests/helpers/resolveNextMetadata.ts
    - tests/site-metadata-i18n.test.ts
    - .planning/phases/75-e2e-verification-launch/freeze/75-31.freeze
  modified:
    - components/SiteChrome.tsx
    - app/[locale]/layout.tsx
    - app/[locale]/login/layout.tsx
    - tests/login-metadata-i18n.test.ts
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - i18n/translation-manifest.json
decisions:
  - "WR-02 fixed centrally: the locale layout default twitter block is { card, images } only, so Next.js mirrors each page's resolved og:title/og:description into twitter:* on every locale (EN included)"
  - "SiteMetadata.keywords stored as one bare-comma string; Next renders keywords via join(','), so EN <meta name=keywords> is byte-identical"
  - "translation-manifest diff limited to the 4 new units; the freeze tool's re-stamp of lastTranslatedAt on 390 pre-existing units was reverted (enHash unchanged, --verify still PASSED)"
metrics:
  duration: "~14 min"
  completed: 2026-09-27
actuals:
  tokens: 10600
  tasks: 2
  commits: 5
---

# Phase 75 Plan 31: Locale-aware site metadata + central og→twitter mirroring Summary

The locale layout now emits a localized default title/description/keywords/og via `getLocaleSiteMetadata(locale)` (locale from params, EN fallback). Its twitter block is card + image only, so Next.js mirrors each page's own localized og into twitter:* on all 7 locales. /login now gets full localized share metadata, and a shared localized `getNotFoundMetadata` helper is ready for 75-33. All of this is proven through Next.js's real `accumulateMetadata`.

## What was built

**Task 1 (tracer): locale-aware default + central mirroring**
- `lib/site-metadata.ts`: the new module has no next/font, CSS or React imports. It holds `siteMetadata` (moved verbatim from `components/SiteChrome.tsx`, which now re-exports it, so `app/(internal)/layout.tsx` is unchanged), `OG_LOCALE` and `getLocaleSiteMetadata`.
- `app/[locale]/layout.tsx`: the static `export const metadata` is replaced by `generateMetadata({ params })` (CR-01, no `getLocale`). The layout component body is unchanged.
- `messages/*.json`: 4 new keys (`SiteMetadata.defaultTitle`, `defaultDescription`, `keywords`, plus `NotFound.metaDescription`), hand-translated in-session into ru/es/fr/ar/hi/zh (D-08). PRESTIGO stays in Latin script, Prague uses each locale's exonym, keywords are natural local search phrases, and there are no prices. The keys were inserted as text so the rest of each catalog is byte-unchanged; the inline-array formatting would not survive a JSON round-trip.
- `tests/helpers/resolveNextMetadata.ts`: runs the installed Next 16.2.3 `accumulateMetadata`. It uses a `Module._resolveFilename` shim that maps `server-only` to `next/dist/compiled/server-only/empty.js`.

**Task 2: /login + 404 helper + freeze**
- `buildShareMetadata(locale, title, description)` returns an absolute title, the description and a full openGraph block (locale-specific `og:locale`, `/og-image.jpg` with alt). It deliberately has no twitter key.
- `getNotFoundMetadata(locale)` returns the NotFound metaTitle/metaDescription with robots noindex/nofollow. It takes only the locale and never the path or slug (T-75-G33).
- `app/[locale]/login/layout.tsx` spreads `buildShareMetadata` + `ROBOTS`. The non-locale branch is still exactly `{ robots }`.
- `freeze/75-31.freeze` was created (`messages/en.json::SiteMetadata`, `messages/en.json::NotFound.metaDescription`), and the manifest gains the 4 units.

## Verification

- `tests/site-metadata-i18n.test.ts` + `tests/login-metadata-i18n.test.ts` + `tests/i18n-completeness.test.ts`: 78/78 pass. The real-Next contract covers:
  - twitter title/description mirror the page og ×7;
  - pages without an og override inherit the localized default ×6;
  - /login twitter equals Auth.login ×7;
  - the 404 has an absolute NotFound title (no `| PRESTIGO` suffix) and mirrored og/twitter ×7;
  - `'xx'` falls back to EN without throwing.
- `node scripts/i18n-freeze-manifest.mjs --verify`: PASSED (394 units).
- `node scripts/i18n-translate.mjs --check`: PASSED after the commit (no API calls; `--dry-run` was never run).
- `npx tsc --noEmit` filtered to the touched files: no errors.
- Every acceptance grep in the plan returned the expected value. The (internal) layout diff is empty.
- Full `npx vitest run`: 158 files passed, 2791 tests passed. 5 suites failed at load time; see Deferred Issues. They are not caused by this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had no node_modules**
- **Found during:** Task 1 setup
- **Issue:** The worktree has no `node_modules`, so vitest and tsc could not run.
- **Fix:** Symlinked `node_modules` to the main checkout's installed tree. This is read-only use, matches the gitignored `node_modules` pattern and is not committed. No packages were installed.

**2. [Rule 1 - Hygiene] Kept the translation-manifest diff minimal**
- **Found during:** Task 2
- **Issue:** `i18n-freeze-manifest.mjs` re-stamps `lastTranslatedAt` on every frozen unit (406+/390−), which would cause merge churn with later waves.
- **Fix:** Kept pre-existing entries byte-identical to HEAD and added only the 4 new units. A scratch script asserted that no pre-existing enHash had changed. `--verify` still passes.
- **Commit:** 46eb42bb

### Execution-flow note

- **Tracer gate:** `workflow.auto_advance` is not set, but the plan is `autonomous: true` and the orchestrator asked for a full run in a parallel worktree. So I applied the autonomous tracer gate: I re-ran the tracer `<verify>` end-to-end (44/44 passing) before the expansion task, instead of returning an interactive checkpoint. No human-verifiable surface exists locally (a dev server cannot render without Supabase env); the production proof is 75-36.
- The `siteMetadata` block was removed from `components/SiteChrome.tsx` together with its now-unused `import type { Metadata }` (otherwise an unused-import lint warning).

## Deferred Issues

- **5 vitest suites fail to load in this worktree only:** `tests/account-trips.test.tsx`, `auth-customer.test.ts`, `login-actions.test.ts`, `passenger-actions.test.ts`, `profile-actions.test.ts`.
  - **Cause:** they `vi.importActual('../node_modules/next-intl/dist/esm/development/server.react-server.js')`. Through the node_modules symlink that path resolves outside the worktree's Vite root (`/@fs/.../Prestigo/node_modules/...` → "Cannot find module").
  - **Why it's not this plan:** none of them imports a file touched here. This is an environment artifact of the symlinked deps, not a regression. They should pass on the merged tree, where node_modules is real. Recommend that the orchestrator re-run the full suite after merge.

## TDD Gate Compliance

- RED `test(75-31)` 9df33801 came before GREEN `feat(75-31)` 5305248d (Task 1).
- RED `test(75-31)` 4fed1aa7 came before GREEN `feat(75-31)` 46eb42bb (Task 2).
- No refactor commits were needed.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | 9df33801 | test(75-31): add failing contract test for locale-aware site metadata + twitter mirroring |
| 1 GREEN | 5305248d | feat(75-31): locale-aware site default metadata + central og->twitter mirroring |
| 2 RED | 4fed1aa7 | test(75-31): add failing tests for /login share metadata and localized 404 helper |
| 2 GREEN | 46eb42bb | feat(75-31): localized /login share metadata + shared 404 metadata helper, freeze new units |

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: lib/site-metadata.ts, tests/helpers/resolveNextMetadata.ts, tests/site-metadata-i18n.test.ts, freeze/75-31.freeze
- FOUND commits: 9df33801, 5305248d, 4fed1aa7, 46eb42bb
- STATE.md / ROADMAP.md / REQUIREMENTS.md not modified
