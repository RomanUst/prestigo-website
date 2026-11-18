---
phase: 93-day-trips-custom-tours
plan: 04
subsystem: content
tags: [photos, licensing, wikimedia-commons, seed-manifest, tours]
requires: []
provides:
  - content/tours-seed/photos.json (launch photo manifest v1, 6 tours)
  - scripts/tour-photo-licences.mjs (re-runnable Commons extmetadata fetch)
  - tests/tour-photos-manifest.test.ts (manifest rules guard)
affects: [93-21 seed upload, 93-13 tour page credits]
tech-stack:
  added: []
  patterns: [licence data from Commons API extmetadata, no binaries committed, https-only URLs]
key-files:
  created:
    - scripts/tour-photo-licences.mjs
    - content/tours-seed/photos.json
    - tests/tour-photos-manifest.test.ts
  modified: []
key-decisions:
  - "Commons thumbnail width is 1920, not 2000: the API rounds 2000 up to 3840 and a hand-built 2000px thumb URL returns HTTP 400"
  - "All photos are Commons; no Unsplash entries were needed, so no unverifiable Unsplash photo ids were recorded"
  - "Own car photos: 2 per tour from public/vehicles (interior jpg + model avif), never a cover"
requirements-completed: [TRIP-02]
duration: ~35 min
completed: 2026-11-18
status: complete
commits: 3
plan_head_before: 22c3ca2ff23902275bffa2d2dd82de7829a07e34
plan_head_after: da490ced651346327c51eeac25f3333df4309c7a
actuals:
  tokens: 14000
  tasks: 2
  commits: 3
---

# Phase 93 Plan 04: Tour photo manifest Summary

Licensed launch photos for the 6 day-trip tours as a manifest with Commons-verified credits (author, licence, source page, 1920 px download URL), plus a re-runnable licence script and a guard test.

## What was built

- `scripts/tour-photo-licences.mjs`: dependency-free Node script. Takes Commons `File:` titles, calls the Commons API (`prop=imageinfo&iiprop=extmetadata|url`) and prints author (HTML stripped), licence short name and URL, restrictions, NonFree flag, source page and thumbnail URL. Exits 1 on a missing title, `NonFree=true` or any `Restrictions` value.
- `content/tours-seed/photos.json`: manifest v1, 6 tours, 6 to 7 entries each (4 or 5 Commons photos plus 2 own car photos), exactly one non-own cover per tour. Licences in use: CC0, Public domain, CC BY 3.0/4.0, CC BY-SA 3.0/4.0. Every download URL was fetched (HTTP 200) before commit.
- `tests/tour-photos-manifest.test.ts`: 53 tests. Requires the 6 slugs, 4..8 entries, one non-own cover, at least one own entry, licence allow list, https credit and download URLs, Commons source-page host, own files exist on disk, no shared download URL.

## Photo set

| Tour | Cover | Other free photos | Own |
|------|-------|-------------------|-----|
| cesky-krumlov-day-trip | old town panorama (CC BY-SA 3.0) | Jelení lávka (CC BY 4.0), castle tower (CC BY 4.0), rooftops (CC BY-SA 3.0) | first-int-1, s-class |
| kutna-hora-day-trip | St. Barbara exterior (CC0) | nave (CC BY-SA 4.0), Sedlec Ossuary x2 (CC BY-SA 3.0) | business-int-1, e-class |
| karlovy-vary-day-trip | Mill Colonnade (CC BY-SA 4.0) | Market Colonnade x3 (CC BY 4.0 / BY-SA 3.0 / BY-SA 4.0) | first-int-2, s-class |
| dresden-day-trip | Frauenkirche square (Public domain) | dome, Wall Pavilion, Crown Gate, gardens | business-int-2, e-class |
| karlstejn-day-trip | castle above the valley (CC BY-SA 3.0) | southeast view, aerial, castle wall | van-int-1, v-class |
| bohemian-switzerland-day-trip | Pravčická brána (CC BY-SA 4.0) | viewpoint, Kamenice gorge x3 | van-int-2, v-class |

All candidates were checked visually (contact sheet): landscapes and architecture, no close-up identifiable people. A Mill Colonnade shot with a large advertising bottle and a Karlštejn shot framed by a beer-brand umbrella were skipped for brand reasons.

## Deviations from Plan

**1. [Rule 1 - Bug] Thumbnail width 1920 instead of 2000**
- **Found during:** Task 1
- **Issue:** `iiurlwidth=2000` makes the API return a 3840 px URL (nearest standard step); a hand-built `2000px-` thumbnail URL returns HTTP 400. 1920 is a valid standard step.
- **Fix:** script requests `iiurlwidth=1920`; manifest URLs are 1920 px thumbnails (or the unscaled original for small files). The `?utm_*` query is stripped from the stored URLs.
- **Files modified:** scripts/tour-photo-licences.mjs, content/tours-seed/photos.json
- **Commit:** 071a073d

**2. Task 2 TDD split:** the guard was tightened and committed first (RED, 2 failures, `e6989589`), then the manifest completed (GREEN, `da490ced`).

**3. Acceptance title:** the Task 1 acceptance example title `File:Cesky Krumlov.jpg` was not used; a verified free Commons file was used instead (`Český Krumlov (Krummau) - panorama - old city.JPG`), and the script ran green on it.

## RESEARCH A10

Resolved: acceptable free photos were found for all 6 tours, including Karlštejn (exterior only) and Bohemian Switzerland. No tour needed to be filled with only own photos. Karlštejn has no castle-interior photos (interiors are mostly restricted or unfree); the gallery uses exterior and valley views instead.

## Notes for downstream plans

- 93-21 (seed) should send a descriptive `User-Agent` when downloading from `thumb.wikimedia.org`, and pause between files: the Commons API and thumb host return HTTP 429 under bursts (seen during this plan).
- `credit_text` already contains "Author / Wikimedia Commons"; render `license` and `credit_url` as links on the tour page (93-13). CC BY-SA files are shown unmodified apart from server-side resizing.
- The cover is always a non-own photo; own photos are interiors/exteriors of the current Mercedes fleet.

## Known Stubs

None.

## Threat Flags

None. T-93-09 (licence claims) mitigated by extmetadata script plus allow-list test; T-93-10 (URLs) mitigated by the https-only test.

## Self-Check: PASSED

- scripts/tour-photo-licences.mjs, content/tours-seed/photos.json, tests/tour-photos-manifest.test.ts exist.
- Commits 071a073d, e6989589, da490ced exist.
- `npx vitest run --exclude '.claude/**' tests/tour-photos-manifest.test.ts`: 53 passed; eslint clean on the new files.
