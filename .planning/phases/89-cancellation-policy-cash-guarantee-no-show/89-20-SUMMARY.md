---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 20
subsystem: legal-wording
tags: [terms, faq, i18n, isr, json-ld, cancellation]
requires:
  - phase: 89-19
    provides: dark production deploy, getCancellationPolicy settings reader, no-show wait settings
provides:
  - lib/cancellation-wording.ts (getPolicyNumbers, fillPolicyNumbers, fillPolicyDeep, policyVariablesIn, assertNoUnresolved)
  - ISR terms and FAQ pages (revalidate 300) that fill policy numbers from the admin settings
  - terms section 4 and the FAQ cancellation block in 7 locales, no typed hour/km/percent/minute
affects: [89-21, 89-23, 89-24]
tech-stack:
  added: []
  patterns: ["ICU-style variables with plural blocks in static JSON, filled server-side by a small own formatter (no new dependency)"]
key-files:
  created:
    - lib/cancellation-wording.ts
    - tests/cancellation-wording.test.ts
  modified:
    - lib/no-show-wait.ts
    - app/[locale]/terms/page.tsx
    - app/[locale]/faq/page.tsx
    - tests/legal.test.ts
    - content/pages/{en,ru,es,fr,ar,hi,zh}/terms.json
    - content/pages/{en,ru,es,fr,ar,hi,zh}/faq.json
decisions:
  - "Own formatter (plain {var} plus {var, plural, one {..} other {..}} via Intl.PluralRules) instead of importing intl-messageformat, which is only a transitive dependency; unknown variables stay visible so a typo never ships silently"
  - "FAQ cancellation block grew from 2 to 4 questions (no-show wait, why a saved card with cash) so the FAQ agrees with the terms on every point; the cancelled-flight FAQ answer is untouched (D-05)"
  - "Terms hero 'Last updated' date left unchanged: the pages merge only at go-live (89-23), so the date belongs to that merge"
metrics:
  duration: "about 1 h"
  completed: "2026-11-07"
status: complete
commits: 3
plan_head_before: f031c0b1fbd56d8f0603b1d0dc41d34ff1cab442
plan_head_after: 447f5a3e03913d05eb5e4727ba9433170420aacd
actuals:
  tokens: 60000
  tasks: 3
  commits: 3
---

# Phase 89 Plan 20: Terms and FAQ wording under the new policy Summary

The terms (section 4) and the FAQ cancellation block now state the free-cancellation windows, the operator's decision on late cancellation and no-show, the saved card as a guarantee (cash bookings included) and refunds, in all 7 locales, with every number filled from the admin settings at render time.

## What was built

- **lib/cancellation-wording.ts.** `getPolicyNumbers()` reads `getCancellationPolicy()` plus `getNoShowThresholds()` and returns `{km, freeHoursShort, freeHoursLong, freeHoursHourly, percent, waitCityMin, waitAirportMin}`; any read failure (including a build without Supabase env) degrades to the defaults, never throws (T-89-64). `fillPolicyNumbers` fills `{var}` and `{var, plural, one {..} other {..}}` (locale plural rules, nested variables); an unknown variable stays visible. `assertNoUnresolved` is the test helper that throws on any leftover brace.
- **Terms page.** `force-static` replaced by `revalidate = 300`; only section 4 is filled. The page builds no Supabase client itself.
- **FAQ page.** Same switch; `content.sections` is filled once and that single copy feeds both the visible answers and the FAQPage JSON-LD, so `acceptedAnswer.text` is a plain filled string equal to the visible answer.
- **Content.** EN terms section 4 has five items (free cancellation with short/long/hourly windows, late cancellation, no-show, saved card as a guarantee, refunds incl. cancelled flight = full refund or new booking). Counsel is not mentioned. The FAQ cancellation block (index 3) has four answers: cancel, change (a request the operator confirms, D-01), no-show, why a card is saved for cash. ru, es, fr, ar, hi, zh were translated in-session in the register of each file; plural arms follow each language (ru one/few/many, ar one/two/few/many, others one/other or none).
- **legal.test.ts.** Two spot-check literals (`items[0]`, `items[4].desc`) were updated by copying from the JSON (the 71-08 generating script is not in the repo).

## Task commits

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 (tracer) | fbd53e74 | settings -> getPolicyNumbers -> fillPolicyNumbers -> terms page, EN |
| 2 | 0d3f9b62 | FAQ page + EN FAQ, JSON-LD equals visible text |
| 3 | 447f5a3e | six locales, terms + FAQ |

Tracer feedback gate: the end-to-end verify (render of the terms page from mocked settings through the real page component, default and changed numbers) passed before expansion.

## Verification

- `npx vitest run tests/cancellation-wording.test.ts tests/legal.test.ts tests/pages-a.test.ts`: 93 passed.
- Related suites also green: `i18n-freeze-manifest`, `business-number-guard`, `seo-snippets-no-prices`, `content-locale-parity`, `seo`, `static-pages-locale`, `force-static-metadata`, `author-surfaces-i18n` (678 tests).
- `npx tsc --noEmit`: 0 errors outside `tests/`; 8 errors inside `tests/` (the known baseline, none in the files of this plan).
- `npx eslint --quiet` on all changed `.ts`/`.tsx`: clean.
- No `€` in `lib/`, `app/`, `components/` changes; no secrets; `scripts/` untouched; translation script never run.
- `grep -c force-static` is 0 in both pages.

## Deviations from Plan

### Auto-fixed / additions

**1. [Rule 3 - Blocking] Exported the no-show wait defaults**
- **Found during:** Task 1
- **Issue:** `getPolicyNumbers` needs the 30/60 fallback when the Supabase client cannot be built, and `lib/no-show-wait.ts` kept them private (duplicating the numbers would drift).
- **Fix:** `DEFAULT_CITY_MIN` and `DEFAULT_AIRPORT_MIN` are now exported (one word each, no behaviour change).
- **Files modified:** lib/no-show-wait.ts
- **Commit:** fbd53e74

**2. [Rule 2 - Missing critical functionality] Own formatter, FAQ extended by two questions**
- The plan did not say how plural forms are rendered for 7 locales; a hard-typed "hour(s)" would be wrong for ru/ar and for a setting of 1. A small own parser handles plural blocks and keeps unknown variables visible. The FAQ gained the no-show and saved-card questions so it agrees with the terms (CANC-02 "FAQ answers agree with them").

## Notes for the orchestrator and plan 89-23

- Nothing here reaches main before 89-23; the branch carries the wording as planned.
- The terms hero `lastUpdated` still reads 6 April 2026 in all 7 locales; set it at the go-live merge.
- Other surfaces from the Pattern 8 inventory (book page, routes hub, contact, services, checkout, emails, llms, blog, admin) are outside this plan (89-21/89-24).
- Some tests import `next-intl/server` through the node_modules symlink; the ones run here (static-pages-locale, force-static-metadata) loaded and passed.

## Known Stubs

None.

## Threat Flags

None. The pages read the settings through the existing guarded reader; no new endpoint or trust boundary.

## Self-Check: PASSED

- lib/cancellation-wording.ts, tests/cancellation-wording.test.ts exist; 14 content files modified.
- Commits fbd53e74, 0d3f9b62, 447f5a3e exist on branch worktree-agent-ade86fa803059c07f.
