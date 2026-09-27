---
phase: 75-e2e-verification-launch
plan: 12
subsystem: i18n
tags: [next-intl, i18n, forms, corporate-form, contact-form, en-leak-fix]

requires:
  - phase: 69-string-externalization-ui-chrome
    provides: PascalCase namespace / camelCase key convention, renderWithIntl test helper
  - phase: 72-ai-translation-pipeline-catalogs
    provides: translation manifest freeze-pattern mechanism, i18n-translate.mjs --check
provides:
  - "Corporate.form namespace (7 catalogs) — CorporateForm fully localized incl. error/success states"
  - "ContactForm namespace (7 catalogs) — ContactForm fully localized incl. error/success states"
  - "content/pages/<locale>/contact.json::details — /contact page detail labels"
  - "freeze/75-12.freeze — 3 patterns frozen for the manifest (applied by plan 75-18)"
affects: [75-18-translation-manifest-freeze, 75-20-final-en-leak-reverify]

actuals:
  tokens: 17560
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Analytics/API-value identifiers stay English while only the visible <option> label is localized (CorporateForm.tripsPerMonth, ContactForm.services.*) — same split as Phase 69's structural-vs-translatable convention"
    - "localizedHref(locale, href) used for content-JSON-provided internal hrefs on a Server Component page (not next-intl's <Link>)"

key-files:
  created:
    - tests/corporate-form.test.tsx
    - tests/contact-form.test.tsx
    - .planning/phases/75-e2e-verification-launch/freeze/75-12.freeze
  modified:
    - app/[locale]/corporate/CorporateForm.tsx
    - components/ContactForm.tsx
    - app/[locale]/contact/page.tsx
    - content/pages/{en,ru,es,fr,ar,hi,zh}/contact.json
    - messages/{en,ru,es,fr,ar,hi,zh}.json
    - tests/force-static-metadata.test.tsx

key-decisions:
  - "CorporateForm's trips-option VALUES and ContactForm's service-option VALUES stay the English identifier sent to the API/GA4; only the visible <option> label is translated — avoids fragmenting analytics/admin data by locale while still killing the visible EN leak"
  - "Contact phone-number placeholder ('+420 725 986 855') stays a hardcoded literal in ContactForm.tsx (DNT, not routed through t()) since it's the company's real number, not translatable text"
  - "Legal-entity block text (chelautotrans s.r.o., IČO, address) stays hardcoded in the /contact page; only its 'Legal entity' label moved to content.details.legalEntityLabel, matching the plan's DNT scope"

requirements-completed: [VER-01]

coverage:
  - id: D1
    description: "CorporateForm fully externalized (labels, placeholders, select options, submit/sending, success, and all 3 error states) into Corporate.form across all 7 catalogs"
    requirement: "VER-01"
    verification:
      - kind: unit
        ref: "tests/corporate-form.test.tsx"
        status: pass
      - kind: unit
        ref: "tests/i18n-catalog-array-types.test.ts"
        status: pass
      - kind: integration
        ref: "tests/corporate-contact.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "ContactForm fully externalized into ContactForm namespace across all 7 catalogs; GA4 form_id/form_name identifiers unchanged"
    requirement: "VER-01"
    verification:
      - kind: unit
        ref: "tests/contact-form.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "/contact page detail labels (Phone/Email/Location/Availability/Legal entity) sourced from content.details; internal 'Also useful' links locale-prefixed via localizedHref"
    requirement: "VER-01"
    verification:
      - kind: unit
        ref: "tests/contact-form.test.tsx#/contact page (ru) — details labels + locale-prefixed internal links"
        status: pass
      - kind: unit
        ref: "tests/pages-a.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "messages/{ru,es,fr,ar,hi,zh}.json complete + type-parity vs en.json for the new namespaces"
    requirement: "VER-01"
    verification:
      - kind: other
        ref: "node scripts/i18n-translate.mjs --check"
        status: pass
    human_judgment: false

duration: 42min
completed: 2026-09-25
status: complete
---

# Phase 75 Plan 12: Corporate + Contact Forms i18n Summary

Externalized CorporateForm and ContactForm (labels, placeholders, options, error/success states) into `Corporate.form`/`ContactForm` catalog namespaces across all 7 locales, added `/contact` page detail labels from content JSON, locale-prefixed its internal links, and froze the new units for the translation manifest.

## Performance

- **Duration:** 42 min
- **Started:** 2026-09-25T20:58:00Z
- **Completed:** 2026-09-25T21:40:00Z
- **Tasks:** 2
- **Files modified:** 21 (2 components, 1 page, 7 message catalogs, 7 content catalogs, 2 test files created, 1 pre-existing test fixed, 1 freeze file)

## Accomplishments

- `CorporateForm` (`app/[locale]/corporate/CorporateForm.tsx`) now renders entirely from `useTranslations('Corporate.form')` — every label, placeholder, select option (incl. the `{count} trips/month` ICU template), submit/sending state, success block, and all three status-mapped error strings (429/400/other + network throw) are translated in all 7 locales, while the option values POSTed to `/api/corporate-contact` stay unchanged.
- `ContactForm` (`components/ContactForm.tsx`) now renders entirely from `useTranslations('ContactForm')` — heading, response note, labels, placeholders, the 6 service options, message prefill (ICU `{destination}`), submit/sending, and success/error states are translated in all 7 locales. GA4 `form_id`/`form_name` identifiers and the `service` value posted to `/api/contact` stay the English literal.
- `/contact` page's detail block (Phone/Email/Location/Availability/Legal entity labels + location/availability text) now sources from `content/pages/<locale>/contact.json::details`; the legal-entity address block, phone number, and email stay verbatim DNT. The "Also useful" internal links now route through `localizedHref()` so every href keeps its locale prefix.
- `messages/{ru,es,fr,ar,hi,zh}.json` gained both namespaces with natural, formal-register translations (Russian Вы-capitalization matched to existing site convention); `node scripts/i18n-translate.mjs --check` passes.
- `freeze/75-12.freeze` records the 3 new units for plan 75-18's manifest-freeze pass.
- Fixed a regression in a pre-existing SEO-02 test (`force-static-metadata.test.tsx`) that started throwing once `CorporateForm` gained a `useTranslations()` client hook — wrapped both `render()` calls in `NextIntlClientProvider`.

## Task Commits

1. **Task 1: Tracer — CorporateForm fully externalized (7 catalogs)** - `40a84b6f` (feat)
2. **Task 2: ContactForm namespace + /contact detail labels + locale links + freeze patterns** - `11b32fa4` (feat)
3. **Deviation fix: force-static-metadata regression** - `98598715` (fix)

## Files Created/Modified

- `app/[locale]/corporate/CorporateForm.tsx` — full `Corporate.form` externalization
- `components/ContactForm.tsx` — full `ContactForm` externalization; service-option value/label split
- `app/[locale]/contact/page.tsx` — `details` content wiring, `localizedHref` on internal links
- `content/pages/{en,ru,es,fr,ar,hi,zh}/contact.json` — new `details` section
- `messages/{en,ru,es,fr,ar,hi,zh}.json` — new `Corporate.form` and `ContactForm` namespaces
- `tests/corporate-form.test.tsx` (new) — EN parity, API-payload-unchanged, ru render + all 4 error paths
- `tests/contact-form.test.tsx` (new) — EN parity, API-payload-unchanged, ru render + success/error paths, GA4 identifier assertion, `/contact` page ru-label + locale-href assertion
- `tests/force-static-metadata.test.tsx` — wrapped corporate-page renders in `NextIntlClientProvider`
- `.planning/phases/75-e2e-verification-launch/freeze/75-12.freeze` (new)

## Decisions Made

- CorporateForm/ContactForm option **values** (trips range, service name) stay the English identifier sent to the API and analytics; only the **visible label** is localized — prevents fragmenting `/api/corporate-contact`, `/api/contact`, and the `generate_lead` GA4 `service` dimension by locale while still eliminating the visible EN leak.
- Phone-number placeholder and the legal-entity block stay hardcoded literals (DNT) per the plan's explicit scope — only their labels moved to catalogs/content.
- Russian translations use capitalized formal «Вы»/«Ваш» throughout, matching the existing site convention (corrected two lowercase instances discovered while translating, before commit).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS2322 in corporate-form.test.tsx catalog-import typing**
- **Found during:** Task 2 (`npx tsc --noEmit` plan-level verify)
- **Issue:** Passing the raw JSON-imported `ruMessages` object as `renderWithIntl`'s `messages` prop failed TS structural typing (`string[]` array leaves aren't assignable to `AbstractIntlMessages`'s index signature) — the repo's own established pattern (`tests/nav-locale-render-parity.test.tsx`) already works around this with a cast.
- **Fix:** Introduced `ruMessagesTyped = ruMessages as unknown as AbstractIntlMessages` and used it only at the `renderWithIntl`/`NextIntlClientProvider` call sites, leaving all property-access assertions on the original typed import.
- **Files modified:** `tests/corporate-form.test.tsx`, `tests/contact-form.test.tsx`
- **Verification:** `npx tsc --noEmit` shows zero errors for either file.
- **Committed in:** `11b32fa4` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed force-static-metadata.test.tsx regression caused by Task 1**
- **Found during:** post-Task-2 full-suite run (`npx vitest run`)
- **Issue:** `CorporateForm` gaining `useTranslations('Corporate.form')` (Task 1) broke a pre-existing SEO-02 regression test that renders the full `/corporate` page (including `CorporateForm`) without any `NextIntlClientProvider` ancestor — the client hook threw "Failed to call `useTranslations`".
- **Fix:** Wrapped both `render(PageElement)` calls (`en` and `fr` locale cases) in `<NextIntlClientProvider locale={...} messages={...}>`, matching the locale under test.
- **Files modified:** `tests/force-static-metadata.test.tsx`
- **Verification:** `npx vitest run tests/force-static-metadata.test.tsx` — 6/6 pass.
- **Committed in:** `98598715` (separate deviation commit)

---

**Total deviations:** 2 auto-fixed (2 bugs — one caused by a test-typing gap, one a direct regression from Task 1's own change).
**Impact on plan:** Both fixes are necessary for correctness (green build) and directly scoped to files this plan's changes affect. No scope creep.

## Issues Encountered

**Pre-existing, out-of-scope test-suite failures (not fixed, per scope boundary):** a full `npx vitest run` shows 5 test files (`tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts`) failing at import time with `ERR_MODULE_NOT_FOUND` for a hardcoded relative path (`../node_modules/next-intl/dist/esm/development/server.react-server.js`). Confirmed pre-existing and unrelated to this plan: none of these 5 files, or the source files they import (`app/[locale]/account/actions.ts`, `app/[locale]/login/actions.ts`, `app/[locale]/account/trips/page.tsx`), are touched by either task in this plan (`git diff HEAD~2` against the base commit shows zero changes to them). Root cause is a worktree environment artifact — the worktree's local `node_modules/` started out effectively empty (only a stray `.vite` cache dir). Attempted the sanctioned fix (symlinking `node_modules` to the main repo's) but the failure persists with a different error signature (`/@fs/...` path not found via Vite's module graph, despite the target file objectively existing on disk) — this is a deeper Vite/vitest symlink-resolution quirk, not something in scope for a content/i18n plan to chase further. All tests that this plan's own `<verification>` block names, plus the tests for every file this plan touched, are green. Every non-crashing test in the full suite passes (2201/2201 executed test cases pass; only these 5 files fail to even load).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `Corporate.form` and `ContactForm` namespaces are complete and frozen in `freeze/75-12.freeze` for plan 75-18's manifest-freeze pass.
- `messages/*.json` edits for this plan are done; the next sequential `messages/*.json` plan (75-13) can proceed without a concurrent-write conflict.
- The 5 pre-existing crash-at-import test files remain open for whichever plan owns the phase's "red baseline" cleanup (D-15) — logged above, not part of this plan's `files_modified`.

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-25*
