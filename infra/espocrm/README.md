# infra/espocrm - EspoCRM configuration as code

Everything that configures the live EspoCRM instance (`https://crm.rideprestigo.com`)
lives here, and `sync.mjs` applies it through the REST API. Git is the source of
truth: an edit made only in the CRM UI is drift, and the next sync overwrites it
for every resource listed in `RESOURCE_ORDER`. The VPS side (compose, backups,
Caddy) is documented under `infra/vps/`.

All EspoCRM code stays in `infra/espocrm/` and `tests/` (isolation guard,
`tests/infra-vps-isolation-guard.test.ts`). Nothing under `app/`, `components/`
or `lib/` imports from here.

## Identities and credential files

Two service identities, both created by the owner (D-17). Claude never sees,
prints or passes on a command line any password, token or API key. Secrets reach
the workstation through the clipboard into mode-600 files that are never committed.

| Identity | Type | File | Used for |
|----------|------|------|----------|
| `prestigo-config` | Admin, no 2FA | `~/.config/prestigo/espocrm-config.env` | metadata, roles, settings, mail config (admin-only endpoints) |
| `prestigo-sync` | API user, API Key | `~/.config/prestigo/espocrm-sync.env` | data writes: Contacts, Accounts, CBooking records |
| `prestigo-admin` | Admin, TOTP | (browser only) | the owner's own login; keeps its TOTP |

`espocrm-config.env` keys: `ESPOCRM_BASE_URL` (must be https), `ESPOCRM_ADMIN_USER`,
`ESPOCRM_ADMIN_PASSWORD`. `espocrm-sync.env` keys: `ESPOCRM_BASE_URL`,
`ESPOCRM_API_KEY`. An environment variable with the same name overrides the file.
`prestigo-sync` starts with no role; the Sync writer role is created and assigned
by a later plan (least privilege by default).

`prestigo-config` has no 2FA, so deactivate it in Administration -> Users when
you are not running a sync, and reactivate it before the next one.

**Never retry after a 401.** EspoCRM bans the source IP after repeated failed
logins. The client authenticates exactly once (password to token via
`GET /api/v1/App/user`), poisons itself on the first 401 and refuses every later
request without calling the network. If a run ends with a 401, fix the
credential first, then run once more.

Token header semantics (EspoCRM 10.0.8): first call sends
`Espo-Authorization: base64(user:password)`; every later call sends
`Espo-Authorization: base64(user:token)` plus `Espo-Authorization-By-Token: true`.
API key calls send `X-Api-Key`.

## Run order

```bash
node infra/espocrm/sync.mjs --dry-run      # always first: GET requests only, prints the plan
node infra/espocrm/sync.mjs                # apply
node infra/espocrm/sync.mjs --only settings
```

Output is one line per resource, `{resource}: create=N update=N unchanged=N skipped=N removed=N`,
then `summary: ...`. Exit codes: 0 ok, 1 config error, 2 API error. A second run
right after a real run must show `create=0 update=0`.

Tools added by this phase, in the order they are used:

1. `sync.mjs` - settings, then entities, links, fields, enums, layouts, roles, mail
2. `overlay.mjs` - one-time unique-index overlay for `CBooking.supabaseBookingId`
3. `verify-acl.mjs` - proves the role matrix against the live CRM
4. `backfill.mjs` - Supabase bookings into CBooking (`--dry-run`, `--audit`, `--relink`)
5. `account-candidates.mjs` - proposes Accounts from booking history (writes under `.work/`)
6. `seed-accounts.mjs` - creates only the Accounts the owner confirmed

## Naming interface (Phase 82 must reuse this)

- Custom entities get a `C` prefix: `CBooking`, `CPartnerRate`.
- Fields added to stock scopes get a `c` prefix, for example `cCommissionPercent`.
- Link panels on Contact and Account: `cBookings` and `cPartnerRates`.
- `CBooking` idempotency key: `supabaseBookingId` (the Supabase `bookings.id` uuid, D-07).
  One CBooking per Supabase row, so a round trip is two records.
- `CBooking.name` holds the booking reference; `contact` and `account` are many-to-one links.
- Contact key: the trimmed, lower-cased email address.
- Enum values for `status`, `source`, `vehicleClass`, `tripType` are identical to the
  database strings so later phases write them through unchanged.

## Field ownership matrix

| Record | Owner of the data | Rule |
|--------|-------------------|------|
| CBooking (all fields) | sync | The sync creates and overwrites every field. The CRM copy is read-only for people via roles, never via `readOnly` in entityDefs (that would also block the sync). |
| Contact | created by sync, then the owner | The sync never overwrites `accountId`, `title`, `description` or names of an existing Contact. The one exception is `phoneNumber` when it is empty. |
| Account | owner / seed only | Created by hand or by `seed-accounts.mjs` from confirmed candidates. The sync never writes Accounts. |

## PII rules

Export and candidate files contain customer names, emails and phone numbers.

- They live only in `infra/espocrm/.work/`, which is git-ignored together with
  `infra/espocrm/**/*.env`.
- Logs are counts only: never print a name, email or phone number.
- Delete the files in `.work/` after use.
- Production data never goes into fixtures or tests; tests use the in-memory fake
  in `tests/helpers/fake-espocrm.ts` with obviously fake secrets.
