---
phase: 80-espocrm-deployment-core-entities
fixed_at: 2026-10-17T22:52:00Z
review_path: .planning/phases/80-espocrm-deployment-core-entities/80-REVIEW.md
iteration: 1
findings_in_scope: 17
fixed: 17
skipped: 0
status: all_fixed
---

# Phase 80: Code Review Fix Report

**Fixed at:** 2026-10-17
**Source review:** .planning/phases/80-espocrm-deployment-core-entities/80-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 17 (9 warnings, 8 info; fix_scope = all)
- Fixed: 16 by a code change, 1 (WR-08) closed as `no_change_needed - owner decision` with documentation added
- Skipped: 0

**Where it ran:** the agent was already inside an orchestrator-provided git worktree (branch `worktree-agent-a42f1587bb5387526`, base local `main` 81ccc279), so no second worktree and no recovery sentinel were created; commits sit directly on that branch. No script was run against the live CRM or the VPS; every CRM-script change is proven against the in-memory fake only.

**Verification (run inside that worktree, `node_modules` symlinked from the main checkout):**
- `npx vitest run` on all touched test files plus `business-number-guard`, `infra-vps-isolation-guard`, `i18n-completeness`, `crm-runbook`, the middleware tests and `BookingWizard`: 29 of 30 files pass (885 tests). The one failing file is `tests/login-actions.test.ts`: it imports `../node_modules/next-intl/dist/esm/development/server.react-server.js` by relative path, which does not resolve through the worktree's `node_modules` symlink (`ERR_MODULE_NOT_FOUND`). It does not touch any file changed here and is an environment artefact of the worktree, not a regression. Re-run it in the main checkout after merge.
- `npx tsc --noEmit`: no errors in any changed or new file (only the 8 baseline errors in untouched `tests/` files remain).
- `npx eslint --quiet` on every changed file and `infra/espocrm`: clean.

## Fixed Issues

### WR-01: seed-accounts links Contacts with `accountId: null` when two confirmed candidates share a name

**Files modified:** `infra/espocrm/seed-accounts.mjs`, `tests/espocrm-seed.test.ts`
**Commit:** 541567e7 (shared with IN-08, same two files)
**Applied fix:** `planSeed` now tags a to-be-created Account with its owning candidate key; a later candidate that matches it becomes an `alias` op, resolved in `runSeed` to the id returned by the create. The `targets` ambiguity check treats an alias as the owner, so a Contact hitting both candidates is no longer `ambiguous`. `runSeed` throws instead of ever sending `accountId: null`. The counts gain `merged=N` only when N > 0 (existing log lines are unchanged otherwise). Tests: plan shape, linking to the created id, convergence on a second run, dry run prints no `null`.

### WR-02: backfill aborts permanently on a name-based Contact duplicate (409)

**Files modified:** `infra/espocrm/backfill.mjs`, `tests/helpers/fake-espocrm.ts`, `tests/espocrm-backfill.test.ts`
**Commit:** a856c06f
**Applied fix:** a 409 that the email lookup cannot explain is counted as `duplicate_unresolved`, the run continues, and bookings for that email are written without touching the Contact link (`bookings_unlinked=M`; counts only, no PII). The fake gained an optional `duplicateMatch` rule (email OR first+last name) used by a new test, including a re-run. Header comment and README document the behaviour. Note: the name-based rule itself is still unverified against 10.0.8 sources; the fix is correct either way.

### WR-03: offset paging on `orderBy=createdAt` is unstable, and nothing checks the preload is complete

**Files modified:** `infra/espocrm/lib/crm-read.mjs`, `infra/espocrm/overlay.mjs`, `infra/espocrm/backfill.mjs`, `infra/espocrm/seed-accounts.mjs`, `tests/espocrm-preload.test.ts`
**Commits:** 1687aa97, fea230b9 (test signature fix)
**Applied fix:** the shared `fetchAll` now pages by `orderBy=id` and throws `PartialPreloadError` when fewer records were loaded than the first page's `total` (growth during paging is tolerated). `overlay.mjs` `runPrecheck` uses it, so a row repeated across pages is no longer a duplicate key and a skipped row no longer passes. backfill and seed-accounts report `Preload incomplete: <entity>: loaded X of Y` (exit 2) before any write. Tests cover ordering, completeness, repeats, shortfalls, short middle pages, precheck, and "no write on partial preload" for both writers. Requires human verification on first live use: confirm the live instance accepts `orderBy=id` (it is an attribute of every entity, but this could not be exercised without touching the CRM).

### WR-04: `probe-unique` reports "enforced" for any failed second create except 401/403/0

**Files modified:** `infra/espocrm/overlay.mjs`, `tests/espocrm-overlay.test.ts`
**Commit:** c0292ae0
**Applied fix:** only 400, 409 and 500 (`UNIQUE_REFUSAL_STATUSES`) count as the database refusing the duplicate; 404, 429, 502, 503, 504 and status 0 are surfaced. The existing test deliberately treated a 500 as enforced (EspoCRM's unmapped PDOException), so 500 stays accepted, but only after a control record with a different key is created successfully, proving the refusal was key-specific. The observed live status could not be read without running the probe; if the live instance answers with a different code the probe now fails loudly and the constant is the single place to adjust.

### WR-05: `normalizePhone` keeps the national trunk "(0)"

**Files modified:** `lib/phone.ts`, `tests/phone.test.ts`, `infra/espocrm/lib/booking-map.mjs`, `tests/espocrm-booking-map.test.ts`
**Commits:** 23a3b417 (lib/phone.ts), bf652f61 (Contact normaliser)
**Applied fix:** `(0)` is dropped before the brackets are stripped. A single 0 right after the country code is dropped for +44, +49, +43, +41, +31, +32, +33, +36, +48; a 0 after +420/+421 makes the number invalid (rejected); Italy (+39) keeps its 0. The policy "country code required, never guessed" is unchanged. `normalizeContactPhone` (CRM backfill) got the same `(0)` handling. Judgement call for the owner: the instruction listed +48 among the trunk-zero countries, and it was implemented that way (no Polish number starts with 0, so stripping a stray 0 cannot corrupt a valid number). Tests for each code, Italy, non-trunk zeros, CZ/SK rejection and the explicit `(0)` form.
**Status:** fixed: requires human verification (logic change in a validator; confirm the country list matches the owner's intent).

### WR-06: `normalizePhone` rejects valid numbers typed with ar/hi/zh digits, fullwidth "+" or bidi marks

**Files modified:** `lib/phone.ts`, `tests/phone.test.ts`
**Commit:** 23a3b417
**Applied fix:** before matching, Arabic-Indic (U+0660-0669), Extended Arabic-Indic (U+06F0-06F9), Devanagari (U+0966-096F) and fullwidth (U+FF10-FF19) digits fold to 0-9; fullwidth plus/brackets/period map to ASCII; Unicode dashes (U+2010-2015, U+2212, U+FE58, U+FE63, U+FF0D) become separators; bidi/format marks (U+200B-200F, U+202A-202E, U+2066-2069, U+061C, U+FEFF) are removed; Unicode spaces are already covered by `\s`. NFKC was deliberately not used (it would also fold circled/superscript digits); explicit ranges keep the behaviour predictable. 16 accepting cases, 3 look-alike rejections and 2 "no country code" rejections in tests.

### WR-07: server 422 `INVALID_PHONE` is not mapped on the client

**Files modified:** `components/booking/steps/Step6Payment.tsx`, `components/booking/steps/Step5Passenger.tsx`, `components/booking/BookingWizard.tsx`, `components/booking/MultiDayForm.tsx`, `tests/Step6Payment.test.tsx`, `tests/Step5Passenger.test.tsx`, `tests/MultiDayForm.test.tsx`, `tests/BookingWizard-phone-gate.test.tsx` (new)
**Commit:** b042483d
**Applied fix:** no new message keys. Step 6 maps `INVALID_PHONE` to the existing `Booking.validation.invalidPhone` text and sends the customer back to Step 5 (`goToStep(5)`); Step 5 now validates a restored phone on mount so the field error is visible. MultiDayForm shows the existing `validPhoneRequired` on a 422 `INVALID_PHONE`. Root cause also addressed: the Step 5 Continue gate only required a non-empty phone, so a national-format number reached Step 6 even without a stale session; it now uses `isValidIntlPhone`.

### WR-08: backfill guesses a `+420` prefix

**Files modified:** `infra/espocrm/lib/booking-map.mjs` (comment), `infra/espocrm/README.md`
**Commit:** bf652f61
**Status:** no_change_needed - owner decision. The rule stays as approved ("как предлагаешь"). The divergence from `lib/phone.ts` is documented in `booking-map.mjs` and in a new README section "Contact phone numbers", including that prefixed numbers are reported as `contact_phones: ... prefixed=N` for review and that the guess must never be copied into the live flow. The "never overwritten once set" concern is not a bug for empty phones: `planBackfill` already updates an existing Contact whose `phoneNumber` is empty (covered by an existing test), so nothing was changed there.

### WR-09: admin deep link is re-applied on every remount

**Files modified:** `components/admin/BookingsTable.tsx`, `tests/BookingsTable.test.tsx`
**Commit:** 0cb73690
**Applied fix:** after the first render consumed `?search=`, an effect removes it with `history.replaceState`, keeping other params, the hash and `history.state` (Next.js bookkeeping). The `useState` initializer stays pure (StrictMode-safe). A remount after creating a manual booking now starts from the operator's defaults. All 32 previous tests pass; one new test covers the strip and the remount. No `crm.rideprestigo.com` or `ESPOCRM_*` in app code (isolation guard passes).

### IN-01: env credential files are read without checking their mode

**Files modified:** `infra/espocrm/lib/client.mjs`, `infra/espocrm/README.md`, `tests/espocrm-client-hardening.test.ts` (new)
**Commit:** b4196926 (shared with IN-04)
**Applied fix:** the default file reader (`readSecretFile`) throws `EspoConfigError` with a `chmod 600` hint when group/others can read the file (skipped on win32; environment-variable credentials unaffected). `parseEnvFile` accepts an `export ` prefix and drops inline `# comments` after quoted or unquoted values, while a `#` not preceded by whitespace stays part of the value.

### IN-02: server phone enforcement is optional, and whitespace-only values pass

**Files modified:** `app/api/create-payment-intent/route.ts`, `tests/create-payment-intent.test.ts`
**Commit:** faf2de64 (`security:`)
**Applied fix:** the booking wizard always collects a phone (Step 5 requires it, and the Continue gate now enforces validity), and Step 6 is the only caller, so the server now requires it: missing, empty or whitespace-only values return 422 `INVALID_PHONE` before any PaymentIntent. Tests for whitespace, empty, missing and a normalised `(0)` number reaching storage.

### IN-03: the CRM admin link loses its target when the operator is not logged in

**Files modified:** `lib/admin-next.ts` (new), `lib/supabase/middleware.ts`, `app/(internal)/admin/login/actions.ts`, `app/(internal)/admin/login/page.tsx`, `tests/admin-login-next.test.ts` (new)
**Commit:** 7810625c (`security:`)
**Applied fix:** the middleware redirects an unauthenticated `/admin/*` request to `/admin/login?next=<encoded path+query>`; the login form carries it in a hidden field (read after mount, no Suspense needed); `signIn` redirects to it only if `safeAdminNext` accepts it, otherwise to `/admin`. Whitelist: must be `/admin` or `/admin` followed by `/`, `?` or `#`; no `//`, no backslash, no scheme, no whitespace/control characters, no `..` segment, max 512 chars, never `/admin/login`; re-validated by URL parsing. 44 tests (accept list, 27 reject cases, middleware behaviour, action redirect and fallback).
**Status:** fixed: requires human verification (security-sensitive redirect logic; a browser check of login via the CRM Admin link is worthwhile).

### IN-04: client hardening gaps in `rawFetch` and the redactor

**Files modified:** `infra/espocrm/lib/client.mjs`, `infra/espocrm/sync.mjs`, `tests/espocrm-client-hardening.test.ts`, `tests/espocrm-mail.test.ts`
**Commit:** b4196926
**Applied fix:** a timeout or reset while reading the response body is now mapped to a status-0 `EspoApiError` (redacted) and does not poison the client. The client exposes `addSecret()`; `syncSystemSmtp` registers the SMTP password before sending it, so an `InboundEmail` error that echoes it is masked (test included).

### IN-05: an interrupted `verify-acl` leaves active API users behind

**Files modified:** `infra/espocrm/verify-acl.mjs`, `tests/espocrm-roles.test.ts`
**Commit:** 34e99a96
**Applied fix:** SIGINT/SIGTERM set a flag; the probe stops at the next step via `AclInterruptedError` and the existing `finally` deletes every probe user and record (exit 130; a second signal kills at once). Cleanup entries are labelled, and a failed cleanup now prints each leftover as `scope/id` plus the probe prefix and run stamp.

### IN-06: `.work` candidate export directory and file modes

**Files modified:** `infra/espocrm/account-candidates.mjs`, `tests/espocrm-candidates.test.ts`
**Commit:** d2586cd6
**Applied fix:** the output folder is created with mode 700 and tightened with `chmodSync` if it pre-exists; the file is `chmodSync(out, 0o600)` after writing. Test checks fresh and pre-existing loose modes (skipped on Windows).

### IN-07: duplicated helpers across the migration scripts

**Files modified:** `infra/espocrm/lib/crm-read.mjs` (new), `infra/espocrm/lib/export-loader.mjs` (new), `infra/espocrm/backfill.mjs`, `infra/espocrm/seed-accounts.mjs`, `infra/espocrm/account-candidates.mjs`, `infra/espocrm/sync.mjs`
**Commit:** 9b2a9d2b
**Applied fix:** `fetchAll`, `readOnlyClient`, `sleep`, `describeApiError` live in `lib/crm-read.mjs`; `loadExport`/`byExportOrder` in `lib/export-loader.mjs` (still re-exported from `backfill.mjs`, so existing imports keep working). `seed-accounts` and `account-candidates` no longer import the backfill module. `sync.mjs` uses the shared read-only wrapper; its dry-run refusal message now omits the query string (safer, no test depended on the old text). Done first so WR-03 is fixed in one place.

### IN-08: `seed-accounts` and `candidates` input validation gaps

**Files modified:** `infra/espocrm/lib/candidates.mjs`, `infra/espocrm/seed-accounts.mjs`, `tests/espocrm-candidates.test.ts`, `tests/espocrm-seed.test.ts`
**Commit:** 541567e7 (shared with WR-01)
**Applied fix:** `selectConfirmed` throws on a non-boolean `confirm` (`"true"`, `"yes"`, `1`; a missing key still means not confirmed) and on a confirmed candidate with a blank name; a free-mail domain is neither written as `website` nor used to match existing Accounts. Because WR-01 and IN-08 edit the same functions in `seed-accounts.mjs`, they were committed together rather than split.

## Skipped Issues

None.

## Notes for the orchestrator

- Two commits combine two findings each (WR-01 + IN-08, IN-01 + IN-04) because the hunks overlap in the same files and interactive hunk staging is not available.
- Commits carry the `fix(80):` prefix; IN-02 and IN-03 use `security:` per CLAUDE.md. All hooks ran (no `--no-verify`).
- No `.env*` file was read or written; no message key was added, so the 7-locale rule did not apply.
- `STATE.md` and `ROADMAP.md` were not modified; this report is not committed.

---

_Fixed: 2026-10-17_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
