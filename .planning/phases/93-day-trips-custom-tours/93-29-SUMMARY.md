---
phase: 93-day-trips-custom-tours
plan: 29
subsystem: database
tags: [tours, custom-tour, inquiries, espocrm, stats, migration]
requires:
  - phase: 93-day-trips-custom-tours
    provides: PR 1 live (93-28)
provides:
  - inquiries.kind 'custom_tour' (093 live)
  - one quote per request (quotes_source_inquiry_id_key)
  - Custom tour Lead mapping and EspoCRM Lead source enum value
  - stats source form_custom_tour
affects: [93-30, 93-31, 93-32, 93-33, 93-34, 93-35]
tech-stack:
  added: []
  patterns: [stats_conversion re-created verbatim from its latest definition with one appended source + REVOKE/GRANT re-run]
key-files:
  created: [supabase/migrations/093_custom_tour_inquiries.sql, tests/migration-093.test.ts, .planning/phases/93-day-trips-custom-tours/93-29-smoke.sql]
  modified: [lib/inquiries.ts, lib/lead-mapping.ts, infra/espocrm/enums.json, lib/admin-stats.ts, tests/outbox-migrations.test.ts, tests/lead-mapping.test.ts, tests/espocrm-enums.test.ts, tests/admin-stats-period.test.ts]
key-decisions:
  - "Custom-tour Lead description flattens every payload value to one line, so a visitor cannot forge description lines"
  - "tests/stats-migration.test.ts left unchanged (pinned to 081); the 093 test pins the live source list against FUNNEL_SOURCES"
requirements-completed: [TRIP-06]
status: complete
completed: 2026-11-23
commits: 3
plan_head_before: 6cb41428a144f6181a845ef3a25ecb92e8b5276c
---

# Phase 93 Plan 29: custom-tour data and CRM foundation Summary

**Migration 093 lets the database store a custom_tour inquiry, enforces one quote per request and counts the new form in stats; the inquiry maps to an EspoCRM Lead with source 'Custom tour'.**

## Commits

- d90afdde security(93-29): custom_tour inquiry kind, 093 kind CHECK and one-quote-per-request, Custom tour Lead mapping
- bac18789 feat(93-29): Custom tour Lead source enum and stats source form_custom_tour
- eded7199 test(93-29): rolled-back smoke for migration 093

## Task 3: 093 live (orchestrator, 2026-11-23)

- STEP 0 (before apply): live constraint name `inquiries_kind_check` = `CHECK ((kind = ANY (ARRAY['contact', 'corporate', 'multiday_quote'])))`; no prior index on quotes.source_inquiry_id.
- Pre-check: the live stats_conversion body equals 083 once comments are stripped (md5 of whitespace-stripped body c0f57d32...), so 093's copy-of-083 replaces exactly the live logic.
- apply_migration `093_custom_tour_inquiries`: success (schema_migrations version 20261123092731).
- Smoke (rolled back): `SMOKE_OK`, every check true:
  - kind_check_def `CHECK ((kind = ANY (ARRAY['contact', 'corporate', 'multiday_quote', 'custom_tour'])))`
  - custom_tour_inquiry_stored true, outbox_row_enqueued true, unknown_kind_rejected true
  - quote_unique_index_exists true, second_quote_same_inquiry_refused true, null_source_inquiry_unconstrained true
  - has_function_privilege: anon false, authenticated false, service_role true; public_pseudo_role_has_no_execute true
  - stats_runs true, funnel_has_10_rows_form_custom_tour_last true, funnel_counts_the_smoke_inquiry true
- STEP 2 leftovers: inquiries 0, quotes 0, orphan outbox rows 0.
- Security advisors: no new findings (only the pre-existing RLS-no-policy INFO and leaked-password WARN).

## Owner action before PR 2 go-live (D-26, plan 93-35)

Run `infra/espocrm/sync.mjs` so the live EspoCRM Lead source enum has `Custom tour`; until then a custom_tour Lead POST fails terminally in the outbox dispatcher. Nothing stores a custom_tour inquiry until the 93-32 route ships behind CUSTOM_TOUR_REQUEST_LIVE.

## Verification

290/290 on migration-093, outbox-migrations, lead-mapping, lead-sync, espocrm-enums, stats-migration, stats-conversion-083-migration, admin-stats-period (main checkout). tsc baseline 8.
