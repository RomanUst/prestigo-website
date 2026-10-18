---
phase: 81-lead-capture-site-forms-supabase-espocrm
plan: 05
subsystem: i18n / lead-capture forms
tags: [i18n, privacy-notice, forms, D-16]
requires: []
provides:
  - InquiryNotice.stored catalog key in 7 locales
  - D-16 storage notice on contact, corporate and multi-day quote forms
affects:
  - components/ContactForm.tsx
  - app/[locale]/corporate/CorporateForm.tsx
  - components/booking/MultiDayForm.tsx
tech-stack:
  added: []
  patterns: [next-intl t.rich with chunk component, Link from @/i18n/routing]
key-files:
  created:
    - tests/inquiry-notice-i18n.test.ts
  modified:
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - components/ContactForm.tsx
    - app/[locale]/corporate/CorporateForm.tsx
    - components/booking/MultiDayForm.tsx
    - tests/contact-form.test.tsx
    - tests/corporate-form.test.tsx
    - tests/MultiDayForm.test.tsx
decisions:
  - "Notice is informational only: no checkbox, no submit gating (D-16)"
  - "Privacy link wording equals each locale's Footer.privacy, enforced by test"
metrics:
  tasks: 2
  completed: 2026-10-18
status: complete
actuals:
  tasks: 2
  commits: 2
plan_head_before: e402616a5fe02ad76897effbe173c320ad8aad3e
plan_head_after: 73500a612c09cb3ef1e05f65b8d7427556d503e0
commits: 2
---

# Phase 81 Plan 05: Storage notice on lead forms Summary

One-line D-16 notice ("We store your request to reply to it — Privacy Policy") with a locale-aware /privacy link now sits under the submit button of the contact, corporate and multi-day quote forms, with hand-written translations in all 7 locales.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | InquiryNotice in 7 catalogs + ContactForm + parity test | be5d8c87 |
| 2 | Notice on CorporateForm and MultiDayForm | 73500a61 |

## What was done

- Added top-level `InquiryNotice.stored` to en/ru/es/fr/ar/hi/zh using the exact texts from the plan. The `<privacy>` chunk text equals each locale's `Footer.privacy`.
- Each form uses `useTranslations('InquiryNotice')` and `t.rich('stored', { privacy })` rendering a `Link` from `@/i18n/routing` (locale prefix kept, e.g. `/ru/privacy`).
- ContactForm and CorporateForm use Tailwind small-text classes; MultiDayForm uses inline Montserrat 11px warm-grey with underlined link. No checkbox, no change to submit behaviour, GA4 identifiers or honeypot.
- `tests/inquiry-notice-i18n.test.ts`: key presence, key set, differs-from-EN, no `[XX]` stub, chunk equals Footer.privacy, no "Prestigio"/price token. Form tests extended (en and ru for contact; en for corporate incl. honeypot hidden and notice after submit; en for multi-day).

## Verification

- `npx vitest run` of corporate-form, MultiDayForm, multi-day-page-render, inquiry-notice-i18n, contact-form: 75 passed. `tests/i18n-completeness.test.ts`: 20 passed.
- `eslint --quiet` on the three form components and the new test: clean. `tsc --noEmit`: no errors outside the `tests/` baseline.
- `grep -c 'type="checkbox"'` is 0 for all three forms.

## Deviations from Plan

None - plan executed as written, except:

- Browser preview screenshots (verification step 6, en and ar RTL) were NOT taken: the executor ran in an isolated worktree without a preview server. Recommend the orchestrator or verifier eyeball /contact, /corporate and the multi-day form in en and ar.
- The per-plan commit ledger file could not be written to the shared git dir from the worktree; `plan_head_before` was taken from the dispatch base (e402616a), and `commits: 2` was measured with `git rev-list --count e402616a..HEAD`.

## Known Stubs

None.

## Threat Flags

None. T-81-12 accepted (t.rich renders only the declared `privacy` tag via a React component). No packages installed.

## Self-Check: PASSED

- be5d8c87 and 73500a61 exist on branch worktree-agent-a03abc9e460987766.
- tests/inquiry-notice-i18n.test.ts and all modified files present.
