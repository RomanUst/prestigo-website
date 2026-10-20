---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 10
subsystem: sync / Chatwoot
tags: [chatwoot, outbox, qstash, contact, custom-attributes, merge, tdd]
status: complete
requires:
  - phase: 82-01 (identity_person read contract, identity store, router)
  - phase: 82-03 (infra/chatwoot/custom-attributes.json contact attributes)
  - phase: 82-07 (lib/crm-sync.ts, Espo contact id, sync.chatwoot refresh enqueue)
provides:
  - lib/chatwoot-client.ts (site-side Chatwoot client, config loader, error classification)
  - lib/chatwoot-mapping.ts (pure D-02 attribute builder and contact draft)
  - lib/chatwoot-sync.ts (deliverChatwootSync: sync.chatwoot handler)
  - sync.chatwoot routing in lib/lead-sync.ts behind its own chatwoot_unconfigured gate
  - infra/chatwoot/probe-filter.mjs (read-only live filter probe)
  - tests/helpers/fake-chatwoot.ts (in-memory Chatwoot contacts API)
affects: [82-11, 82-12, 82-13, 82-14, 82-15]
key-files:
  created:
    - lib/chatwoot-client.ts
    - lib/chatwoot-mapping.ts
    - lib/chatwoot-sync.ts
    - infra/chatwoot/probe-filter.mjs
    - tests/helpers/fake-chatwoot.ts
    - tests/chatwoot-contact-sync.test.ts
    - tests/chatwoot-site-client.test.ts
    - tests/chatwoot-mapping.test.ts
    - tests/chatwoot-probe-filter.test.ts
  modified:
    - lib/lead-sync.ts
    - tests/infra-vps-isolation-guard.test.ts
    - tests/sync-resolve.test.ts
decisions:
  - "A valid cached chatwoot_contact_id short-circuits the find scan (a repeat sync is one GET and zero writes); the identifier filter still runs when the person has an account and the cached contact has no identifier (signup adoption can then detect and merge a second contact)"
  - "Owned attributes are compared with the contact's current values and only the changed keys are sent; an empty value and a missing key count as equal, so crm_contact_url '' is not written on adopt until the Espo contact id is known (it is sent as '' on create)"
  - "A contact whose identifier differs from the person's user id, or two candidates holding different identifiers, is never adopted or merged: cw_ambiguous (a merge cannot be undone by a split)"
  - "A refused (401/403) administrator token during contact_merge fails the row as cw_ambiguous instead of tripping the 6 h chatwoot_auth breaker for every normal sync"
  - "Merge base preference: identifier contact > contact holding the primary email > older (smaller id); the merged base is re-read before diffing attributes"
  - "lib/chatwoot-mapping.ts is allowlisted in the VPS isolation guard: it is pure, but the mandated export name CHATWOOT_SYNCED_ATTRIBUTE_KEYS matches the guard's CHATWOOT_* env-var pattern"
metrics:
  tasks_total: 3
  tasks_done: 3
  commits: 3
  plan_head_before: 2732e874340e31b910c4d77935c5715f57a98296
  plan_head_after: 71e6169d8b143be7dc0a2cb5558e00e1364b5e35
  completed: 2026-10-19
actuals:
  tokens: 28000
  tasks: 3
  commits: 3
---

# Phase 82 Plan 10: Chatwoot contact sync Summary

A `sync.chatwoot` row now makes the person's Chatwoot contact equal to their current Supabase state: it finds the contact (cached id, user-id identifier, each identity email, each non-shared phone, all with exact filters), creates it when nothing matches, adopts a single match, merges exactly two through the administrator client, and otherwise fails loudly as `cw_ambiguous`. Name, email, phone and identifier are filled only into empty slots (D-03, the operator wins); the seven D-02 attributes (`next_trip`, `trip_count`, `last_trip_date`, `repeat_customer`, `lifetime_value`, `crm_contact_url`, `admin_bookings_url`) are refreshed on every sync, and nothing else on the contact is touched. The site only creates, updates or merges contact records: no message, conversation or automation endpoint is ever called (test-enforced).

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Tracer: new person -> exact filters find nothing -> contact created with D-02 attributes -> id stored; own config gate; isolation allowlist | 05c624a6 |
| 2 | Client hardening, D-02 counter rules, live read-only filter probe | 3cdbe377 |
| 3 | Find / adopt / merge ladders, D-03, ambiguity, shared phones, idempotency, signup adoption | 71e6169d |

## Live probe (RESEARCH A3)

`node infra/chatwoot/probe-filter.mjs` (owner token from `~/.config/prestigo/chatwoot-api.env`, read-only, random `probe-<hex>@example.invalid`):

```
status=200 payload_array=true meta_count=0
```

The assumed request shape `{ payload: [{ attribute_key, filter_operator: 'equal_to', values: [v], query_operator: null }] }` is confirmed for `email`. A one-off read-only probe with the same shape also answered `status=200 payload_array=true count=0` for `phone_number` and `identifier`, so all three lookup keys are accepted. No adaptation of the client, handler or fake was needed. Only status and booleans were printed; no token, address or body. A match-bearing response (non-empty `payload` with contact objects) was not observed live (no known real contact was queried, deliberately, to keep PII out of output); the handler parses `payload[]` items tolerantly (numeric `id`, strings for name/email/phone/identifier, object `custom_attributes`).

## Verification

- `npx vitest run` on the plan's test files plus the neighbours: chatwoot-contact-sync (45), chatwoot-site-client, chatwoot-mapping, chatwoot-probe-filter, chatwoot-config, crm-sync, lead-sync, sync-resolve, infra-vps-isolation-guard, and 15 further outbox/identity/dispatch test files: all green (292 + 457 tests).
- `npx eslint --quiet` on all new/changed lib files and the fake and contact-sync test: clean.
- `npx tsc --noEmit`: no error in any file of this plan (only the 8 baseline `tests/` errors remain).
- `grep -c "€" lib/chatwoot-mapping.ts` prints 0.
- The `verify` skill directory is not present in this worktree (untracked in the main repo), so its steps were run by hand: tsc, eslint, the related tests above, the secret/price scan by inspection (no env files, no prices).

## Deviations from Plan

**1. [Rule 3 - Blocking] `lib/chatwoot-mapping.ts` added to the isolation-guard allowlist.** The plan allowlists only the client and the handler, but the plan-mandated export `CHATWOOT_SYNCED_ATTRIBUTE_KEYS` matches the guard's `CHATWOOT_[A-Z0-9_]+` env-var pattern (lines 15 and 25 of the mapping), failing "zero violations on the real tree". The file is pure (no env, no I/O) and imported only by `lib/chatwoot-sync.ts`; the entry's reason says so. The acceptance grep for the two named entries still prints 2.

**2. [Rule 1 - Test fix] `tests/sync-resolve.test.ts`.** The 82-01 test asserting `sync.chatwoot` completes `failed unsupported_event` became obsolete; it now asserts the Chatwoot gate (`breaker chatwoot_unconfigured`). `erase.person` stays unsupported until 82-12.

**3. [Rule 2 - Security] Identifier safety rails (T-82-30).** Not in the plan text: a candidate whose identifier belongs to a different account than the person's user id, and a pair of candidates with two different identifiers, are never adopted/merged (`cw_ambiguous`). A refused admin token on `contact_merge` also maps to `cw_ambiguous` rather than the auth breaker (a wrong optional admin token must not stop all contact syncs for 6 h).

**4. [Rule 2 - Test coverage] Extra test file `tests/chatwoot-probe-filter.test.ts`** pins the probe's request body to the literal the handler sends (guards drift between the probe and the handler) and checks the probe output carries status and booleans only.

**5. Deferred-by-design (not a bug).** `crm_contact_url` is sent as `''` on create but is not written on adopt while the Espo contact id is unknown, because an empty value and a missing key compare equal; the 82-07 enqueue of a `sync.chatwoot` refresh fills it as soon as the Espo contact exists. `tests/chatwoot-config.test.ts` (listed in the plan's verify but not in `files_modified`) already existed from Phase 77/82-03 and passes unchanged.

## Auth gates

None. The owner token for the probe was available in `~/.config/prestigo/chatwoot-api.env`; nothing was written to live Chatwoot.

## Known Stubs

None.

## Threat Flags

None. The plan's threat register (T-82-28..31) is covered: https-only base URL, redirect `error`, 10 s timeout and payload-free errors/logs (client tests); a separate admin client used only for `contact_merge` (merge test asserts the token split); merges limited to exactly two candidates found through the person's own keys with identifier/primary-email/older preference and `cw_ambiguous` otherwise; fill-only-when-empty plus owned-keys-only attribute writes (D-03 tests).

## Notes for the orchestrator / go-live (82-14)

- Not yet applied to live Chatwoot: the 7 contact custom attributes from 82-03 (`node infra/chatwoot/sync.mjs`). The handler writes the attribute keys regardless; Chatwoot stores custom_attributes without requiring a definition, but the operator UI shows them only after the definitions exist.
- New Vercel env (all optional until go-live): `CHATWOOT_BASE_URL`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_API_TOKEN`, `CHATWOOT_ADMIN_API_TOKEN` (merge/erasure only). Without them `sync.chatwoot` rows wait on the 6 h `chatwoot_unconfigured` breaker and EspoCRM sync is unaffected.
- `contact_merge` needing an administrator token is still an assumption (RESEARCH); the handler merges only through the admin client and degrades to `cw_ambiguous` when it is unavailable or refused.
- `next_trip` can lag after a trip date passes until the next event for that person (no time-based refresh), as flagged in the plan.

## Self-Check: PASSED

- Files exist: lib/chatwoot-client.ts, lib/chatwoot-mapping.ts, lib/chatwoot-sync.ts, infra/chatwoot/probe-filter.mjs, tests/helpers/fake-chatwoot.ts, tests/chatwoot-contact-sync.test.ts, tests/chatwoot-site-client.test.ts, tests/chatwoot-mapping.test.ts, tests/chatwoot-probe-filter.test.ts.
- Commits exist: 05c624a6, 3cdbe377, 71e6169d.
