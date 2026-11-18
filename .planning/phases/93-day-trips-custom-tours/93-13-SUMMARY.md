---
phase: 93-day-trips-custom-tours
plan: 13
subsystem: tour-page-gallery-and-booking-area
tags: [tours, gallery, lightbox, photo-credits, booking-box, sessionStorage, a11y]
status: complete
requires: ["93-11", "93-12"]
provides:
  - "components/tours/TourGallery.tsx: one photo list as 440px desktop grid (1/2/3/4/5+) and scroll-snap carousel below 1024px"
  - "components/tours/TourLightbox.tsx: focus-trapped modal photo viewer"
  - "components/tours/PhotoCredits.tsx: credits disclosure (server)"
  - "components/tours/TourBookingArea.tsx: client island owning box state, box + sticky bar, sessionStorage restore"
  - "components/tours/tour-credit.ts: photoCredit, safeCreditUrl"
  - "TourBookingBox prop `initial`"
affects: ["93-08 (remotePatterns for the Supabase host must be merged for real photos to render)", "93-14 (related, band, compactCustom slots)"]
tech-stack:
  added: []
  patterns:
    - "One DOM list serves carousel and grid (CSS only), so each image exists once and only the first is priority"
    - "Restore by remounting the box with a key (box and bar together) after a validated sessionStorage read"
key-files:
  created:
    - components/tours/TourGallery.tsx
    - components/tours/TourLightbox.tsx
    - components/tours/PhotoCredits.tsx
    - components/tours/TourBookingArea.tsx
    - components/tours/tour-credit.ts
    - tests/tour-gallery.test.tsx
  modified:
    - components/tours/TourBookingBox.tsx
    - app/[locale]/services/[slug]/page.tsx
    - tests/tour-pages.test.tsx
decisions:
  - "Single photo list for both layouts instead of two DOM sets: no duplicate downloads, no double priority image."
  - "The sticky bar is rendered by TourBookingArea next to the box (it is position: fixed), so the stickyBar slot of TourPageView stays unused; a client island cannot fill two slots."
  - "Sticky aside classes stay on the aside wrapper in TourPageView (lg:[@media(min-height:800px)]:sticky top-[88px], added in 93-11): that wrapper spans both grid rows, a nested sticky would do nothing. The acceptance grep in TourBookingArea.tsx matches only in the explanatory comment; a page test pins the classes on the wrapper."
  - "Lightbox prev/next wrap around; photo credits use the existing Tours.sections.credits key as the summary text (no new catalog keys, all locales already had gallery.*)."
metrics:
  completed: 2026-11-18
commits: 3
plan_head_before: ef1469043089e565130c12fc94dc01cf366ffb8f
plan_head_after: 0e70ca377207a7d47f0ca27c616b3dfdb2349efa
actuals:
  tokens: 38000
  tasks: 3
  commits: 3
---

# Phase 93 Plan 13: Tour gallery, lightbox, credits and booking area Summary

The tour page now shows its photos (cover first, `+{count-5}` tile, "Show all" button, mobile scroll-snap carousel with an "{n} of {count}" chip), a focus-trapped lightbox with per-photo credit lines, a "Photo credits" disclosure, and the booking box plus mobile sticky bar fed from the tour row and tour_settings; "Change trip details" restores the box from sessionStorage.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | gallery layouts and the booking area placed on the page | e5b76890 |
| 2 | lightbox dialog and photo credits disclosure | fc3217d0 |
| 3 | restore the box from sessionStorage, sticky-aside pinned | 0e70ca37 |

## Verification

- `npx vitest run --exclude '.claude/**'` on tests/tour-*.test.ts(x), seo, seo-volume-pages, chat-launcher: 17 files, 464 tests, all green. tests/tour-gallery.test.tsx (1, 2, 3, 4, 5, 6 and 9 photos, ar alt text, carousel chip, broken image, lightbox keys incl. rtl, swipe, Tab trap, scroll lock, credits, tampered storage) and the extended tests/tour-pages.test.tsx (6-photo page, prices from the row, credits, one box instance, sticky classes).
- tsc: only the 8-error tests/ baseline. eslint --quiet clean on components/tours, the page and both test files. No euro sign in components/tours or the page.
- Box restore tests live in tests/tour-gallery.test.tsx (neither test file mounted TourBookingArea before).

## Deviations from Plan

**1. [Rule 3 - Blocking] tests/tour-pages.test.tsx wraps the page in NextIntlClientProvider and mocks the i18n router.** The page now contains client islands (gallery, booking area) that read catalogs through hooks; production gets the provider from the locale layout.

**2. [Interface] `stickyBar` slot not used** (see decisions). **3. Extra file** `components/tours/tour-credit.ts` shared by the lightbox and credits.

**4. next/image `priority` is not visible in jsdom** (Next 16 emits a preload instead of a DOM attribute), so the test asserts the first image is eager and the rest `loading="lazy"`.

## Pending (needs a published tour or the orchestrator)

- **Human check not run:** broken-image layout in a real browser (UI Considerations E2 backstop), and the 320px/360px visual pass. No published tour or Supabase env in the worktree. To run: `preview_start prestigo`, open a tour page, block one photo URL, reload; the broken tile must keep its navy box and the grid must not shift.
- **Real photos require plan 93-08** (Supabase host in `next.config.ts` `images.remotePatterns` and CSP `img-src`); without it `next/image` rejects the bucket host. With `NEXT_PUBLIC_SUPABASE_URL` unset the gallery renders navy boxes, no broken image.
- The `lg:[@media(min-height:800px)]:sticky` variant (from 93-11) was not compiled-checked in a browser.

## Known Stubs

None.

## Threat Flags

None. T-93-35 mitigated (storage read in try/catch, whole value validated with `parseTourCheckoutQuery`, box re-validates each field, tampered value ignored, server re-validates at checkout). T-93-36 mitigated (credit links only for `https:`, `target="_blank" rel="noopener noreferrer nofollow"`; a `javascript:` url renders as text, tested).

## Self-Check: PASSED

All created files exist; commits e5b76890, fc3217d0, 0e70ca37 are on the branch.
