---
phase: 80-espocrm-deployment-core-entities
reviewed: 2026-10-17T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - app/api/create-payment-intent/route.ts
  - app/api/submit-multiday-quote/route.ts
  - components/admin/BookingsTable.tsx
  - components/booking/MultiDayForm.tsx
  - components/booking/steps/Step5Passenger.tsx
  - lib/phone.ts
  - infra/espocrm/account-candidates.mjs
  - infra/espocrm/backfill.mjs
  - infra/espocrm/inspect.mjs
  - infra/espocrm/lib/booking-map.mjs
  - infra/espocrm/lib/candidates.mjs
  - infra/espocrm/lib/client.mjs
  - infra/espocrm/lib/enum-merge.mjs
  - infra/espocrm/overlay.mjs
  - infra/espocrm/seed-accounts.mjs
  - infra/espocrm/sync.mjs
  - infra/espocrm/verify-acl.mjs
  - tests/helpers/fake-espocrm.ts
findings:
  critical: 0
  warning: 9
  info: 8
  total: 17
status: issues_found
---

# Phase 80: Code Review Report

**Reviewed:** 2026-10-17
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

The security-critical parts hold up. Credentials are loaded from env or `~/.config/prestigo/*.env`, never from argv, and are registered with the redactor. Logs are counts and ids only. The client runs one request at a time, refuses redirects, and poisons itself on the first 401 or on any failed token exchange. No loop retries a 401 or 403. The only retry is the single phone-less Contact POST after a 400. EspoCRM `where` queries use fixed attribute names, and every value goes through `encodeURIComponent` or `URLSearchParams`, so I found no injection path. `inspect.mjs count` validates the entity and attribute names with regexes. The admin `?search=` deep link is whitelisted to `^[A-Za-z0-9-]{1,40}$` and then goes through the existing parameterised `admin_search_bookings` RPC. `BookingsTable` is mounted only after `settingsLoaded`, so there is no SSR hydration mismatch.

No BLOCKER-level defect was found. The warnings fall into four groups:
- **E.164 normaliser.** It accepts wrong numbers (the `(0)` trunk digit) and rejects valid ones typed on ar/hi/zh keyboards.
- **Server 422 path.** The new `INVALID_PHONE` code is not mapped by Step 6, so it surfaces as a generic payment error.
- **Migration tooling.** Idempotency and safety are weaker than the file headers claim, in these places:
  - `seed-accounts.mjs` mishandles two candidates that share a name.
  - Offset paging sorts on a non-unique key.
  - The `probe-unique` check can report "enforced" on any 5xx.
  - The backfill can abort permanently on a name-based duplicate (409).
- **Phone policy.** The backfill guesses a `+420` prefix, which contradicts the site policy of "rejected rather than guessed".

## Warnings

### WR-01: seed-accounts links Contacts with `accountId: null` when two confirmed candidates share a name

**File:** `infra/espocrm/seed-accounts.mjs:73-92, 196-198, 211-214`
**Issue:** `planSeed` keeps a working list `known` so that two candidates with the same name do not create the Account twice. The entry pushed for a to-be-created Account has `id: null` (line 90). When the second candidate matches that entry, it is recorded as `{ kind: 'existing', key, id: null }` (line 83). `runSeed` then does `accountIdOf.set(op.key, null)` and logs `account null existing`. Every Contact that hits only the second candidate is sent `PUT /Contact/{id} { accountId: null }` and counted as `link`. The Contact is not linked, and the counts are wrong. The `targets` set in the ambiguity check also compares `id:null` with `new:<key>` for the same real Account, so a Contact that hits both candidates is wrongly counted as `ambiguous`.
This is plausible with real data. `buildCandidates` can emit two candidates with one name, for example one hotel booked from two corporate domains. The header claim "second run reports contacts: link=0" only holds after a second run converges.
**Fix:** Make the working list carry the owning candidate key, and resolve aliases when the ops run.
```js
const known = (accounts ?? []).map((a) => ({ id: a.id, ownerKey: null, nameKey: nameKey(a.name), host: websiteHost(a.website) }))
...
if (match) {
  existing++
  accountOps.push(match.ownerKey
    ? { kind: 'alias', key, of: match.ownerKey }
    : { kind: 'existing', key, id: match.id })
  return
}
...
known.push({ id: null, ownerKey: key, nameKey: nameKey(c.name), host: domain })
```
In `runSeed`, set `accountIdOf.set(op.key, accountIdOf.get(op.of))` for an alias. In the `targets` computation, treat an alias as `new:${op.of}`.

### WR-02: backfill aborts permanently on a name-based Contact duplicate (409) whose email does not match

**File:** `infra/espocrm/backfill.mjs:414-421`
**Issue:** The 409 handler assumes the duplicate is the same email: `lookupContactByEmail(op.key)`, and `if (!found) throw err`. As far as I recall, EspoCRM's Contact duplicate check also matches on first and last name, not only on email. I could not verify this against the 10.0.8 sources from here. If that is right, two bookers with the same name and different emails, such as a work and a private address, produce a 409 that the lookup cannot resolve. The whole run then exits 2. All Contacts are written before any booking, so no booking is written. Every re-run hits the same 409, so the backfill is stuck until someone hand-edits the CRM. The test fake only models `duplicateCheck` as one equality attribute, so the tests cannot catch this.
**Fix:** When the lookup finds nothing, count the row as `duplicate_unresolved`, log counts only, and continue. Bookings for that email then become `without_contact`, or link to the matched Contact only if the owner confirms. If the name-based 409 is confirmed against 10.0.8, document that the owner resolves such pairs in the CRM. Extend the fake to model a name+email rule.

### WR-03: offset paging on `orderBy=createdAt` is unstable, and nothing checks that the preload is complete

**File:** `infra/espocrm/backfill.mjs:290-301`, `infra/espocrm/seed-accounts.mjs:149-160`, `infra/espocrm/overlay.mjs:111-124`
**Issue:** The backfill writes records about 50 ms apart, and `createdAt` has one-second resolution, so ties are frequent. `ORDER BY createdAt LIMIT/OFFSET` without a unique tiebreaker may skip or repeat rows between pages. I could not confirm whether EspoCRM appends an `id` tiebreaker. `fetchAll` de-duplicates repeats but never notices skipped rows, and it ignores `total` once `list.length < PAGE_SIZE`. A skipped CBooking looks "not yet created", so the backfill POSTs it. The unique index turns that into an aborting error rather than a duplicate. A skipped Account in `seed-accounts` is created a second time, with no unique guard. In `overlay.mjs` `runPrecheck` does not track ids at all. A row repeated across pages is counted as a duplicate `supabaseBookingId`, which gives a false exit 3 that blocks the index overlay. A skipped real duplicate gives a false pass.
**Fix:** Sort on a unique key (`orderBy=id`) or add a tiebreaker. After paging, compare `out.size` with the first response's `total` and fail closed:
```js
if (typeof total === 'number' && out.size !== total) {
  throw new EspoConfigError(`${entity}: loaded ${out.size} of ${total} records; refusing to write on a partial preload`)
}
```
In `runPrecheck`, track `row.id` the way `fetchAll` does, and count a duplicate only when the id differs.

### WR-04: `probe-unique` reports "enforced" for any failed second create except 401/403/0

**File:** `infra/espocrm/overlay.mjs:151-158, 160-164`
**Issue:** The index probe is the only proof of the race-safe idempotency key. It treats every `EspoApiError` other than 401, 403 or status 0 as proof that the database refused the duplicate. A 404, 429, 500, 502, 503 or 504 on the second POST is therefore reported as `unique=enforced`. The follow-up check `total === 1` does not help, because a failed second create leaves exactly one record. The comment says "Auth failures and transport problems say nothing about the index", but gateway and server errors say nothing either. `verify-acl.mjs` handles this correctly: "a 5xx can never satisfy a check".
**Fix:** Accept only the status the instance returns for a unique violation, and surface everything else. Pin the observed code in a constant, for example `[400, 409]` or whatever the live instance produced, and add a test.
```js
const UNIQUE_REFUSAL = new Set([400, 409])
if (!(err instanceof EspoApiError) || !UNIQUE_REFUSAL.has(err.status)) throw err
```

### WR-05: `normalizePhone` keeps the national trunk "(0)" and stores a wrong E.164 number

**File:** `lib/phone.ts:18-23` (also `infra/espocrm/lib/booking-map.mjs:241`)
**Issue:** `+44 (0) 20 7946 0958` and `+420 0725 986 855` are common ways to write numbers. The strip step removes the parentheses and spaces but keeps the zero, giving `+4402079460958`. That is 13 digits, so it passes `E164_RE` and is stored. The module doc promises "drivers and the CRM never get a wrong prefix", but this number is undialable. It goes into the booking, to the driver, and into the CRM Contact. The Contact phone is never overwritten once set.
**Fix:** Drop a parenthesised zero directly after the country code before stripping:
```ts
let s = raw.trim().replace(/\(0\)/g, '').replace(/[\s\-.()]/g, '')
```
Apply the same change in `normalizeContactPhone`. Consider rejecting `+<cc>0...` for known codes.

### WR-06: `normalizePhone` rejects valid numbers typed with ar/hi/zh digits, fullwidth "+" or bidi marks

**File:** `lib/phone.ts:20-22`; client use in `components/booking/steps/Step5Passenger.tsx:87`, `components/booking/MultiDayForm.tsx:83`
**Issue:** The site ships ar, hi and zh. JS `\d` matches only ASCII 0-9. Arabic-Indic (`٠١٢`) and Devanagari (`०१२`) digits, a fullwidth `＋` or fullwidth digits from a CJK IME, and Unicode dashes (`– — −`) are not stripped or folded. Pasted RTL text often carries U+200E and U+200F, which `\s` does not match. All of these fail validation. The user sees "enter the number with the country code" although they did. Before this change a 7-character minimum accepted such input.
**Fix:** Normalise before matching, for example:
```ts
const DASHES = /[\u2010-\u2015\u2212]/g
const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g
// Map any Unicode decimal digit to 0-9. Each Nd block is a run of 10 starting at a zero,
// so the value is (codePoint - blockZero); blockZero can be found by scanning back while \p{Nd} matches.
function foldDigit(ch: string): string {
  let zero = ch.codePointAt(0)!
  while (/\p{Nd}/u.test(String.fromCodePoint(zero - 1)) && ch.codePointAt(0)! - (zero - 1) < 10) zero--
  return String(ch.codePointAt(0)! - zero)
}
let s = raw.normalize('NFKC').replace(BIDI, '').replace(DASHES, '-').replace(/\p{Nd}/gu, foldDigit).trim()
```
NFKC alone folds fullwidth forms but not Arabic-Indic or Devanagari digits, hence the digit fold. Add unit tests for these inputs.

### WR-07: server 422 `INVALID_PHONE` is not mapped on the client, and persisted sessions can reach it

**File:** `app/api/create-payment-intent/route.ts:114-120`, `components/booking/steps/Step6Payment.tsx:26-37`, `components/booking/MultiDayForm.tsx:222-228`
**Issue:** `KNOWN_STEP6_ERROR_CODES` has no `INVALID_PHONE`, and `messages/*` has no `Booking.step6.errors.INVALID_PHONE`. The booking store persists `passengerDetails` and `currentStep` in `sessionStorage` (`lib/booking-store.ts:153-178`). A customer who entered a national-format phone before this deploy can resume on Step 6. Step 5 validation is not re-run, so the server returns 422 and the user sees only the generic `paymentInitFailed`. They have no hint to fix the phone and no clear path back. MultiDayForm likewise collapses every non-OK answer into `submitError`.
**Fix:** Add `INVALID_PHONE` to the known set and add `Booking.step6.errors.INVALID_PHONE` in all 7 locales (real translations, per CLAUDE.md). Better, link that error back to Step 5. In MultiDayForm, branch on `res.status === 422` and show `validPhoneRequired`.

### WR-08: backfill guesses a `+420` prefix, contradicting the site policy and making wrong numbers permanent

**File:** `infra/espocrm/lib/booking-map.mjs:249-255`
**Issue:** `lib/phone.ts` states that a number without a country code is "rejected rather than guessed, so drivers and the CRM never get a wrong prefix". `normalizeContactPhone` does the opposite for legacy rows. Any bare 9-digit number becomes `+420...`, though Poland, Hungary, Spain, Austria and many others also use 9-digit national numbers. Any 11-12 digit number that starts with a "known" code is also accepted. The README rule says the Contact `phoneNumber` is written only while empty and then never overwritten, so a wrong guess is permanent. The Contact is the record the owner calls from.
**Fix:** Either omit unprefixed numbers (the booking keeps the original), or mark prefixed Contacts for owner review (counts only) and add the `+420` default as an explicit opt-in flag (`--assume-cz`). At minimum document the guess in the README PII/field-ownership section.

### WR-09: admin deep link is re-applied on every remount, overriding what the operator changed

**File:** `components/admin/BookingsTable.tsx:1052-1062, 1087`; `app/(internal)/admin/(dashboard)/bookings/page.tsx:151`
**Issue:** `BookingsTable` is keyed by `refreshKey`, and `handleBookingCreated` bumps it. Each remount re-runs `readBookingDeepLink()` against `window.location.search`, which still holds `?search=PRG-...`. After the operator clears the search or changes the horizon, then creates a manual booking, the table silently returns to `search=<ref>` and `horizon='all'`. The URL is never cleaned.
**Fix:** After the first read, strip the parameter with `window.history.replaceState(null, '', pathname)`, or read the deep link once in the page component and pass it as a prop that is cleared after mount.

## Info

### IN-01: env credential files are read without checking their mode

**File:** `infra/espocrm/lib/client.mjs:100-115, 158-168`
**Issue:** The README says the files are mode 600, but the loader accepts any mode. A group- or world-readable `espocrm-config.env` is used silently.
**Fix:** `const m = statSync(file).mode & 0o077; if (m) throw new EspoConfigError(...chmod 600...)` (skip on win32). `parseEnvFile` also ignores `export KEY=...` and keeps inline `# comment` text in values.

### IN-02: server phone enforcement is optional, and whitespace-only values pass

**File:** `app/api/create-payment-intent/route.ts:114-120`
**Issue:** The rule "must carry a country code" applies only "when given". A crafted request that omits `phone`, or sends only spaces (`trim() !== ''` is false, so the value is stored unchanged), creates a booking with no usable driver contact. The client form requires a phone, but the server does not.
**Fix:** If a phone is mandatory for bookings, require it in the schema and reject empty values with 422 `INVALID_PHONE`.

### IN-03: the CRM admin link loses its target when the operator is not logged in

**File:** `lib/supabase/middleware.ts:81-85`, `app/(internal)/admin/login/actions.ts:40`
**Issue:** An unauthenticated visit to `/admin/bookings?search=PRG-...` redirects to `/admin/login?search=...`, and a successful sign-in redirects to `/admin`. The CRM "Admin link" (D-18) therefore works only for an already-open session.
**Fix:** Pass a validated `returnTo` through the login redirect, allow-listing `/admin/*` paths.

### IN-04: client hardening gaps in `rawFetch` and the redactor

**File:** `infra/espocrm/lib/client.mjs:236, 174-187`
**Issue:**
- `await res.text()` sits outside the try block. A timeout while reading the body surfaces as a bare `TimeoutError`/`AbortError`, not an `EspoApiError`, so callers that branch on `EspoApiError` (`runProbeUnique`, `evaluate`) misclassify it.
- `RESEND_SMTP_PASSWORD` is never registered with the redactor. If an `InboundEmail` POST/PUT error body ever echoed a field, it would not be masked.

**Fix:** Move the body read inside the try and map it to `EspoApiError(..., 0, ...)`. Let `makeContext` or `syncSystemSmtp` register the password with a redaction hook before sending it.

### IN-05: an interrupted `verify-acl` leaves active API users behind

**File:** `infra/espocrm/verify-acl.mjs:259-339`
**Issue:** Cleanup lives only in `finally`. SIGINT or a crash skips it, leaving API users named `acl-probe-*` with live role grants, whose keys were never persisted. The cleanup failure line says only "N probe object(s)" without any identifier.
**Fix:** Add `process.once('SIGINT', ...)` that runs the cleanup list. Print the probe userName prefix when cleanup fails so the owner can find them.

### IN-06: `.work` candidate export directory and file modes

**File:** `infra/espocrm/account-candidates.mjs:66-69`
**Issue:** `mkdirSync(..., { recursive: true })` uses the default mode (usually 755). `writeFileSync(..., { mode: 0o600 })` applies the mode only when it creates the file, so a pre-existing looser file keeps its mode.
**Fix:** Use `mkdirSync(dir, { recursive: true, mode: 0o700 })` and call `chmodSync(out, 0o600)` after writing.

### IN-07: duplicated helpers across the migration scripts

**File:** `infra/espocrm/backfill.mjs:51,290-314,525-528`, `infra/espocrm/seed-accounts.mjs:46-49,149-170,262-265`, `infra/espocrm/sync.mjs:97-105`
**Issue:** `fetchAll`, `readOnlyClient`, `sleep` and `describeApiError` are copied verbatim into two or three files. `seed-accounts.mjs` and `account-candidates.mjs` also import `loadExport` from `backfill.mjs`, which couples them to the backfill module. That duplication is exactly how WR-03 has to be fixed in three places.
**Fix:** Move the shared helpers into `lib/` and have the scripts import them.

### IN-08: `seed-accounts` and `candidates` input validation gaps

**File:** `infra/espocrm/lib/candidates.mjs:199-210`, `infra/espocrm/seed-accounts.mjs:86-87`
**Issue:**
- `confirm: "true"` or `"yes"` is silently treated as not confirmed, because the check is `=== true`. The run just reports `create=0`.
- A confirmed candidate with a blank `name` is not rejected and reaches `POST /Account`.
- A hand-edited free-mail `domain` is excluded from linking but is still written as `website: https://gmail.com` and used to match existing Accounts.

**Fix:** In `selectConfirmed`, reject a non-boolean `confirm` and a blank name. Drop `website` and domain matching when the domain is in `FREE_MAIL`.

---

_Reviewed: 2026-10-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
