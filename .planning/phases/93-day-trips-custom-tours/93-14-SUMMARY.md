---
phase: 93-day-trips-custom-tours
plan: 14
subsystem: tour-catalogue-surfaces
tags: [tours, catalogue, hub, related, custom-tour, services-index]
status: complete
requires: ["93-11", "93-13"]
provides:
  - "components/tours/TourCard.tsx: catalogue card (cover 4:3, single stretched title link, facts, lowest class price)"
  - "components/tours/TourCardGrid.tsx: grid, HubTourSection (grid or empty state), RelatedToursSection, relatedCards"
  - "components/tours/CustomTourBlock.tsx: compact and band variants, localizedCustomHref"
  - "LandingView props afterGlance / beforeCta"
affects: ["93-34 (flips CUSTOM_TOUR_REQUEST_LIVE; all entry points already go through customTourHref)"]
tech-stack:
  added: []
  patterns:
    - "Grid cells never stretch, so 1-2 related cards keep column width without special markup"
    - "Hub stays a landing page; DB tours enter through two optional LandingView slots"
key-files:
  created:
    - components/tours/TourCard.tsx
    - components/tours/TourCardGrid.tsx
    - components/tours/CustomTourBlock.tsx
    - tests/tour-catalogue.test.tsx
  modified:
    - components/LandingView.tsx
    - app/[locale]/services/[slug]/page.tsx
    - app/[locale]/services/page.tsx
    - tests/tour-pages.test.tsx
decisions:
  - "Price line uses Tours.box.from / box.perCar around a bdi amount (three styled parts) instead of the single hub.cardFrom string, matching the box and sticky bar."
  - "Empty hub state shows heading, body and button only (no DAY TRIPS label)."
  - "Store calls in the pages are wrapped in try/catch even though the store never throws, so a render cannot fail on a surprise."
metrics:
  completed: 2026-11-18
commits: 2
plan_head_before: 6ae92cbba366f9b7700fe7aceddf7dd6133d3622
plan_head_after: f3b203a6f9c4c677c89b3f2dce2bc190dae03313
actuals:
  tokens: 30000
  tasks: 3
  commits: 2
---

# Phase 93 Plan 14: Catalogue cards, hub grid, related tours, custom-tour blocks Summary

The hub /services/day-trips-from-prague now lists the published, locale-complete tours as cards right after "At a glance" (empty state with a custom-tour button when none), a "You might also like" row of up to 3 other tours and the compact custom-tour card plus band appear on every tour page, the band also sits between the hub's related links and final CTA, and the /services index "also popular" lists the hub plus the published tours.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) + 2 | cards, grid, LandingView slots, hub grid; CustomTourBlock, related row, compact + band on tour pages | b90b785e |
| 3 | services index lists tours | f3b203a6 |

## Verification

- vitest (`--exclude '.claude/**'`): tests/tour-catalogue.test.tsx (26 tests), tour-pages, tour-gallery, landing-change, seo-volume-pages, static-pages-locale all green.
- tsc: only the 8-error tests/ baseline. eslint --quiet clean on components/tours, LandingView, app/[locale]/services, both test files. No euro literal in the new components (amounts via formatEUR from the tour row).
- Tests cover: hub grid position (after glance, before FAQ), single link per card, localized hrefs (ru), facts and lowest price in bdi, cover alt/no-cover, null price, no badge/rating/popularity words, empty state with customTourHref({}), band between FAQ and final CTA, related max 3 and never the current tour, 1-2 card grid, absent with 0, compact under the box with `?tour=<slug>`, /contact while not live, ar copy and `/ar` link, services index (en, ru, empty, rejecting store).

## Deviations from Plan

**1. Tasks 1 and 2 share one commit.** The hub empty state needs the localized custom-tour link helper that lives in CustomTourBlock, and both tasks wire the same page.tsx, so splitting would have left an uncompilable intermediate commit. Task 3 is its own commit.

**2. [Rule 3 - Blocking] tests/tour-pages.test.tsx** (not in the plan's file list): its store mock gained `listPublishedTours` (resolves `[]`), because the tour page now calls it.

**3. Price line parts** use `box.from` / `box.perCar` rather than `hub.cardFrom` (see decisions); `hub.cardFrom` stays in the catalogs, unused.

## Pending

- **Browser human check not run** (no published tour or Supabase env in the worktree): hub with 1/2/3+ cards at 320, 768, 1280px (equal heights, price pinned to bottom), card hover/focus ring, ar mirrored chevron, band layout stacked below 1024px and side by side above. To run: publish tours, `preview_start prestigo`, open /services/day-trips-from-prague and a tour page.
- Real cover images need the 93-08 remotePatterns entry (already merged per the dispatch note).

## Known Stubs

None.

## Threat Flags

None. T-93-37: listPublishedTours (93-05) filters published and complete; tests feed it only fixtures. T-93-38: card markup has no badge or rating; a test checks the forbidden words.

## Self-Check: PASSED

Files exist (TourCard, TourCardGrid, CustomTourBlock, tour-catalogue test); commits b90b785e and f3b203a6 on branch worktree-agent-ad2fff24fd37ac2c6.
