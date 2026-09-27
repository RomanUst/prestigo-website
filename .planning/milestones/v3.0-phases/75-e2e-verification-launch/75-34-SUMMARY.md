---
phase: 75-e2e-verification-launch
plan: 34
subsystem: i18n / blog
status: complete
tags: [i18n, blog, byline, dates, gap-closure, WR-04]
requires: [75-31]
provides:
  - "lib/locale-date.ts formatLocaleDate(iso, locale)"
  - "Localized blog byline labels (By / Published {date} / Updated {date}) on 7 locales"
  - "Locale-formatted /blog card dates"
affects: [75-36]
tech-stack:
  added: []
  patterns:
    - "Intl.DateTimeFormat with BCP-47 tag + -u-nu-latn (Latin digits in every locale), en-GB for EN"
    - "Label strings with {date} placeholder filled via String.replace (rendered as React text)"
key-files:
  created:
    - lib/locale-date.ts
    - tests/locale-date.test.ts
    - .planning/phases/75-e2e-verification-launch/freeze/75-34.freeze
  modified:
    - components/ArticleByline.tsx
    - components/BlogCard.tsx
    - content/pages/{en,ru,es,fr,ar,hi,zh}/authors/roman-ustyugov.json
    - i18n/translation-manifest.json
    - tests/author-surfaces-i18n.test.tsx
    - tests/BlogCard.test.tsx
decisions:
  - "Latin digits for all locales (-u-nu-latn), matching the site's DNT digit convention; zh keeps Y年M月D日"
  - "BlogCard reads the locale via next-intl useLocale (same source as its useTranslations) — /blog page file untouched"
  - "Manifest diff kept to the 3 new units by freezing from a temporary dir holding only 75-34.freeze (no restamp of existing lastTranslatedAt)"
metrics:
  duration: "~7 min"
  completed: 2026-09-27
actuals:
  tokens: 6500
  tasks: 2
  commits: 5
---

# Phase 75 Plan 34: Localized blog byline labels and dates Summary

Blog bylines now render localized "By" / "Published {date}" / "Updated {date}" labels from the author content, and both bylines and /blog cards format dates for the page locale with Latin digits. EN output is unchanged: en-GB "9 April 2026".

## What was built

- **lib/locale-date.ts**: `formatLocaleDate(iso, locale)`. EN and any unknown value use `en-GB`, which matches `formatBylineDate` exactly. Every other locale uses `${BCP47_TAG[locale]}-u-nu-latn` with day numeric, month long, year numeric and timeZone UTC. It imports only `@/i18n/locales`.
- **ArticleByline**: `labels.by` goes before the author link. The dates line is `labels.published` / `labels.updated` with `{date}` filled from `formatLocaleDate(date, locale)`. Markup, classes, Link and portrait are unchanged, and `formatBylineDate` is no longer imported here. `lib/authors.ts` is unchanged, so the Person JSON-LD stays English.
- **BlogCard**: `useLocale()` sits next to the existing `useTranslations` calls and the card date is `formatLocaleDate(post.date, locale)`.
- **Author content x7**: `labels.by/published/updated` were hand-translated in-session (D-08):
  - ru: Автор / Опубликовано {date} / Обновлено {date}
  - es: Por / Publicado el {date} / Actualizado el {date}
  - fr: Par / Publié le {date} / Mis à jour le {date}
  - ar: بقلم / نُشر في {date} / حُدّث في {date}
  - hi: लेखक / प्रकाशित: {date} / अपडेट: {date}
  - zh: 作者 / 发布于 {date} / 更新于 {date}
- **freeze/75-34.freeze**: holds the 3 unit patterns. The manifest gains exactly those 3 units, with +12 lines and no other changes.

## Tasks

| Task | Name | Commits | Files |
|------|------|---------|-------|
| 1 (tracer, TDD) | Byline localized labels + locale dates | c2aae3c2 (RED), b3313115 (GREEN) | lib/locale-date.ts, components/ArticleByline.tsx, author JSON x7, freeze/75-34.freeze, manifest, tests |
| 2 (TDD) | /blog card dates in locale format | fce64b19 (RED), 123a467d (GREEN) | components/BlogCard.tsx, tests/BlogCard.test.tsx |

The tracer gate ran automatically because the plan is autonomous. Task 1's `<verify>` passed end-to-end before expansion.

## Verification

- `npx vitest run tests/locale-date.test.ts tests/author-surfaces-i18n.test.tsx tests/content-locale-parity.test.ts`: 353 passed.
- `npx vitest run tests/BlogCard.test.tsx ... tests/static-pages-locale.test.tsx`: 92 passed. This includes the 6 non-EN card-date cases.
- `node scripts/i18n-translate.mjs --check`: PASSED.
- `node scripts/i18n-freeze-manifest.mjs --verify`: PASSED, 397 frozen units.
- The acceptance node check (labels present, not equal to EN, `{date}` kept) passed. `git diff --quiet -- lib/authors.ts` passed. `formatBylineDate` count is 0 in both components.
- `npx tsc --noEmit`, filtered to the touched files, reported no errors.
- Full `npx vitest run`: 2819 passed, 10 skipped, 139 todo. The only 5 failed files are account-trips, auth-customer, login-actions, passenger-actions and profile-actions. This is the known node_modules-symlink load quirk in worktrees and is unrelated to this plan.

## Deviations from Plan

**1. [Rule 1 - Hygiene] Kept the translation-manifest diff minimal**
- **Issue:** `i18n-freeze-manifest.mjs` re-stamps `lastTranslatedAt` on every frozen unit, which causes merge churn. 75-31 hit the same problem.
- **Fix:** Ran the tool with `--dir` pointing at a temporary freeze directory that held only `75-34.freeze`, then deleted that directory. Only the 3 new units were written. `--verify` over the real freeze dir passes.
- **Commit:** b3313115

Otherwise the plan was executed as written. The suggested translations were used verbatim.

## Notes

- React SSR used to emit `Published <!-- -->9 April 2026` (two text nodes). It now emits one text node, `Published 9 April 2026`. The visible text is identical, and no golden-HTML snapshot contains this markup.
- The production proof, where the 75-32 en_leak_rendered and en-date detectors must report 0 on blog pages, belongs to 75-36.

## Self-Check: PASSED

- FOUND: lib/locale-date.ts, tests/locale-date.test.ts, freeze/75-34.freeze
- FOUND commits: c2aae3c2, b3313115, fce64b19, 123a467d
