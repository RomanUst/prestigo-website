---
phase: 93-day-trips-custom-tours
plan: 21
subsystem: tours-content
tags: [tours, seed, content, price-proposal, hub, terms]
requires: ["93-04", "93-05"]
provides:
  - "lib/tours/seed.ts: loadSeedTours, buildSeedRows, SeedTour, SeedTranslation (pure, DB-free)"
  - "scripts/seed-tours.ts: dry-run price table + completeness, insert-only --apply, --force, --publish, --prices"
  - "scripts/lib/tour-price-proposal.ts: proposeTourPrices, proposeExtraHourPrices"
  - "content/tours-seed/tours.json + content/tours-seed/en/{6 slugs}.json"
  - "EN hub and EN terms updated for the fixed-price + hours-included model"
affects: [93-22, 93-23, 93-24, 93-25, 93-26, 93-27, 93-28]
key-files:
  created:
    - lib/tours/seed.ts
    - scripts/seed-tours.ts
    - scripts/lib/tour-price-proposal.ts
    - content/tours-seed/tours.json
    - content/tours-seed/en/dresden-day-trip.json
    - content/tours-seed/en/cesky-krumlov-day-trip.json
    - content/tours-seed/en/kutna-hora-day-trip.json
    - content/tours-seed/en/karlovy-vary-day-trip.json
    - content/tours-seed/en/karlstejn-day-trip.json
    - content/tours-seed/en/bohemian-switzerland-day-trip.json
    - tests/tour-seed.test.ts
    - tests/tour-seed-content.test.ts
  modified:
    - content/pages/en/services/day-trips-from-prague.json
    - content/pages/en/terms.json
decisions:
  - "The day-trip terms clause was appended to the existing 'Late cancellation' item of section4 (no new key, no new array item), so the content-locale-parity test and legal.test.ts keep passing before the other locales are translated; the locale plans 93-22..93-27 add the same sentence to their own item."
  - "The hub keeps every key and every array length; the four 'related' links to the old tour pages now point at other service pages (intercity routes, city rides, private driver, airport transfer) because the tour cards come from the DB (D-25)."
  - "Stops on the way (Hluboka, Loket) are not offered in the tour content: D-13 allows no stops inside a catalogue booking, so the content points to the custom-tour request instead."
  - "Content numbers: hours-at-destination and cancellation-hours numbers are rejected in EN copy by test; drive times are not stated in copy either (they live in drive_minutes_each_way), distances in km are physical facts and are allowed."
  - "--apply writes the proposed prices unless --prices=<file> supplies owner-approved values; extra-hour prices only fill empty settings unless --force; photos are only added to a tour that has none, and a failed photo batch is rolled back for that tour."
metrics:
  completed: 2026-11-18
status: complete
commits: 3
plan_head_before: 36e0c261d15b2525161a34ef45ccdc45a3f4fc13
plan_head_after: caff9f814cd4cbf11d1e7fa68fcbf59bb5e835a7
actuals:
  tokens: 32500
  tasks: 3
  commits: 3
---

# Phase 93 Plan 21: Launch content pipeline Summary

English content for the six launch tours, a pure seed library, an owner-reviewable price proposal and an insert-only seed runner, all tested against fakes. Nothing was run against the live database.

## What was built

- **Task 1 (tracer)** - `lib/tours/seed.ts` (`loadSeedTours`, `buildSeedRows`: draft tour rows, translation rows with `is_complete` from `isLocaleComplete`, zh-hant generated from zh with opencc `cn -> twp`, per-field database-limit check), `content/tours-seed/tours.json` (six tours, no money values), the Dresden EN file, and the two test files. Commit `c5f1c828`.
- **Task 2** - EN files for Český Krumlov, Kutná Hora, Karlovy Vary, Karlštejn and Bohemian Switzerland. The content test now requires all six slugs for every locale folder that exists. Commit `7ebf26f2`.
- **Task 3** - `scripts/lib/tour-price-proposal.ts`, `scripts/seed-tours.ts`, the EN hub rewrite and the EN terms clause. Commit `caff9f81`.

## Content rules enforced by tests (tests/tour-seed-content.test.ts)

Every locale folder present is checked for: complete with no leak and within database limits; no euro sign, currency code or amount; no "15 minute" waiting model; no scarcity, rating, review or ride-hailing wording. English files are additionally checked for: no hours-included or cancellation-hours numbers; itinerary starts with the pickup and ends with the return to the same address; titles say "Day Trip", never "Transfer"; title and SEO title at most 60 characters, SEO description at most 160; the package-travel posture (not a guide, tickets and guide excluded, child seats at no charge, pickup and return included); at least 850 words per tour.

## The seed runner (for the orchestrator, plan 93-28)

```
npx tsx scripts/seed-tours.ts                         # dry run (default): writes nothing
npx tsx scripts/seed-tours.ts --apply                 # insert-only
npx tsx scripts/seed-tours.ts --apply --force         # also updates existing tours (photos kept)
npx tsx scripts/seed-tours.ts --publish=a,b           # checklist only; add --apply to publish the ones that pass
npx tsx scripts/seed-tours.ts --prices=approved.json  # owner-approved prices: { tours: { <slug>: { e, s, v, hours_included? } }, extra_hour: { e, s, v } }
```

Run from the repo root. It loads `.env.local` itself (`process.loadEnvFile` in a try) and prints no env value. The dry run needs live credentials (route fares, tariffs, existing tours), so **the orchestrator runs it** and shows the owner the table; I did not run it and did not run `--apply`. Without env it prints the completeness table and "Supabase env not available" and exits 0.

Photos: manifest entries are downloaded over https from an allow-list of hosts (thumb.wikimedia.org, upload.wikimedia.org, images.unsplash.com) with the generic agent `prestigo-tour-seed/1.0`, 1.5 s between downloads and retries on 429/5xx; own photos are read from `public/` only; max 8 MB; uploaded to `tours/<tourId>/<uuid>.<ext>` and registered with credits. Width and height are left null (nullable columns). `tsx` is not installed in the repo; `npx tsx` fetches it on first run, as for `seed-route-prices.ts`.

## Known proposals the owner must review (D-21)

`tours.json` carries hours_included proposals: Kutná Hora 3, Karlštejn 3, Karlovy Vary 4, Dresden 5, Český Krumlov 5, Bohemian Switzerland 5. Karlštejn and Bohemian Switzerland have no route page, so their prices are a distance x rate-per-km estimate flagged "ESTIMATE" in the table. If a route slug has no fare in `route_prices`, that tour is also flagged as an estimate.

## Deviations from Plan

**1. [Rule 3 - Blocking] Terms clause placed in an existing item, not a new key.**
- **Issue:** a new key or array item in the EN terms breaks `tests/content-locale-parity.test.ts` and the top-level key check in `tests/legal.test.ts` until the other seven locales are translated (plans 93-22..93-27).
- **Fix:** the clause is appended to `section4.items[1].desc` ("Late cancellation"); no structure changed. The other-locale plans add the same sentence to their own item. Verified: parity, legal, public-cancellation-wording, seo-snippets-no-prices and landing-change tests pass.
- **Commit:** caff9f81

**2. [Rule 2 - Missing critical] Extras on the runner beyond the interfaces block:** `--prices=<file>` (so the owner-approved table, not the proposal, is what gets written), per-tour rollback of a failed photo batch, host allow-list and 8 MB cap on downloads, `public/`-only own-photo paths, refusal to apply when a field exceeds the database limit. These mitigate T-93-57/58 and avoid a half-seeded tour.

**3. Tracer test scope:** the "all six slugs per locale" check was added in Task 2, when the other five files existed, so Task 1 could pass with Dresden alone.

## Notes for downstream plans

- 93-22..93-27 translate from `content/tours-seed/en/*.json`; the `en` file is the leak-guard reference for es/fr (title and short description must differ from EN). zh-hant is generated, never written by hand; do not add a `zh-hant` folder.
- The hub JSON edits to mirror per locale: metadata.description, hero.intro, glance (items[0] and items[3]), features (all six items), steps (items[0], items[3]), editorial (paragraphs 0 and 1), faqs (0, 2, 3, 4, 5) and related (all four links, now service pages). The terms sentence: "Day trips have their own free-cancellation period, shown on the tour page and confirmed at booking; after it the full price of the trip applies. Extra time beyond the booking may be charged only after a person at Prestigo approves it." appended to `section4.items[1].desc`.
- `lib/landing-pages.ts` and `app/` still reference the old day-trip slugs; removal belongs to the later hub/tour-page plans (93-14/93-15). The old per-tour page JSON (`content/pages/*/services/<slug>-day-trip.json`) was not touched.

## Known Stubs

None. The seed content is real; `width`/`height` of seeded photos are null by design (nullable columns).

## Threat Flags

None. T-93-57 (no env value printed, loadEnvFile inside the script), T-93-58 (insert-only, dry run default), T-93-59 (content test rejects amounts, waiting model, scarcity, ride-hailing) are mitigated and covered by tests.

## Verification

- `npx vitest run --exclude '.claude/**' tests/tour-seed.test.ts tests/tour-seed-content.test.ts` - 88 passed.
- Also green: seo-snippets-no-prices, landing-change, content-locale-parity, legal, public-cancellation-wording, seo-volume-pages, seo, i18n-freeze-manifest, i18n-translate-manifest, tour-photos-manifest, tour-completeness.
- `npx tsc --noEmit`: no new errors (baseline only). `npx eslint --quiet` clean on all new TS files.

## Self-Check: PASSED

- All created files exist (lib/tours/seed.ts, scripts/seed-tours.ts, scripts/lib/tour-price-proposal.ts, tours.json, six EN files, two test files).
- Commits c5f1c828, 7ebf26f2, caff9f81 exist; `git rev-list --count 36e0c261..HEAD` = 3 before this SUMMARY.
