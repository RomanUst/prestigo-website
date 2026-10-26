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
The tools refuse to read a credential file that group or others can read
(`chmod 600 <file>` fixes it); values from the environment are not affected.

| Identity | Type | File | Used for |
|----------|------|------|----------|
| `prestigo-config` | Admin, no 2FA | `~/.config/prestigo/espocrm-config.env` | metadata, roles, settings, mail config (admin-only endpoints) |
| `prestigo-sync` | API user, API Key | `~/.config/prestigo/espocrm-sync.env` | data writes: Contacts, Accounts, CBooking records |
| `prestigo-admin` | Admin, TOTP | (browser only) | the owner's own login; keeps its TOTP |
| system mail | Resend SMTP password | `~/.config/prestigo/espocrm-smtp.env` | `RESEND_SMTP_PASSWORD`, read only by the `mail` resource |

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

## System mail (task reminders, notifications)

EspoCRM 10.0.8 sends system mail (Task reminders, password resets) through the **system SMTP
account**, and that is not the legacy `smtp*` block in Settings. `Core/Mail/Sender::applyGlobal`
asks `SendingAccountProvider::getSystem()`, which returns an **active group email account**
(Administration -> Group Email Accounts, entity `InboundEmail`) with `useSmtp` on whose
`emailAddress` equals `Settings.outboundEmailFromAddress`. Without it every system mail fails with
"No system SMTP settings." (this silently held from Phase 76 until plan 80-10 found it).

`mail.json` -> `systemSmtp` declares that account (Resend: `smtp.resend.com:587`, TLS, user
`resend`, address `notifications@rideprestigo.com`, `excludeFromReply`). `sync.mjs --only mail`
ensures exactly one such account exists (create, or update only the drifted non-secret fields) and
refuses to run when two share the address. The secret handling:

- The password is never in `mail.json` (the file is a whitelist: a `smtpPassword` key is refused).
  It lives in `~/.config/prestigo/espocrm-smtp.env` (mode 600, `RESEND_SMTP_PASSWORD=...`, owner-entered).
- It is sent only when the account is created, or on an existing account with
  `node infra/espocrm/sync.mjs --only mail --set-smtp-password` (the API never returns it, so it
  cannot be diffed; use the flag after rotating the Resend key). It is never logged and a dry run
  never reads it.
- Check without any secret: `node infra/espocrm/inspect.mjs system-mail [--expect-active]` prints
  `system_smtp=present|missing active=on|off use_smtp=on|off from_matches_settings=on|off`.
  `Settings.outboundEmailFromAddress` is owned by Phase 76 and only compared here, never written.

Task reminders reach the owner as email from that address; a personal filter files them into the
owner's "Reminders" folder (never `Skip`, which would hide them).

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
2. `overlay.mjs` - one-time unique-index overlay for `CBooking.supabaseBookingId` (default) and `Lead.cSupabaseRef` (`--entity Lead`)
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

## Contact phone numbers

The site and the booking API require a country code and never guess one (`lib/phone.ts`:
a number without it is rejected). The one-time backfill (`backfill.mjs`) deliberately does
**not** follow that rule for legacy rows. This is an owner decision (Phase 80 review WR-08):

- a bare 9-digit number becomes `+420...`;
- a bare 11-12 digit number that starts with a known calling code gets a `+`;
- `(0)` after the country code and a leading `00` are normalised; anything else that is not a
  valid E.164 number is left out of the Contact (the CBooking keeps the original text).

These guesses can be wrong (Poland, Hungary, Spain, Austria and others also use 9-digit national
numbers). The backfill reports them as `contact_phones: ... prefixed=N` so the owner can review
them, and the guess applies to the backfill only: never copy it into `lib/phone.ts` or the live
flow. A phone is written to a Contact only while its `phoneNumber` is empty, so a wrong guess is
fixed by editing the Contact in the CRM.

## Duplicate Contacts during the backfill

EspoCRM's duplicate check on Contact create matches the email and also the first + last name.
When a create is refused with 409 and no Contact with that email exists, the backfill counts it as
`contacts: duplicate_unresolved=N bookings_unlinked=M`, continues, and writes those bookings without
a Contact link. The owner resolves such pairs in the CRM (merge, or give one of them another name);
a re-run repeats the same 409 harmlessly.

## Inbound webhook (Phase 83)

One EspoCRM webhook tells the site about human edits of a Contact. `webhook.mjs` registers and
manages it; nothing here is applied automatically, the owner runs it during go-live (plan 83-14).

```
node infra/espocrm/webhook.mjs create             # register, as prestigo-sync, with skipOwn
node infra/espocrm/webhook.mjs list               # id, event, active, skipOwn, owner (no secret)
node infra/espocrm/webhook.mjs delete <id>        # remove one webhook (17 lowercase hex id)
node infra/espocrm/webhook.mjs --print secret     # only to a pipe, refused on a terminal
node infra/espocrm/webhook.mjs probe              # signed round trip against the live receiver
```

- **Event: `Contact.update` only.** Contact edits are the only inbound trigger (D-13). Creating a
  second webhook for another event needs a new decision.
- **Owner: `prestigo-sync`, with `skipOwn`.** EspoCRM skips an event when the user who caused it is
  the webhook owner and `skipOwn` is on, so a write made by the sync never comes back as an event
  (the echo guard at the source, HOOK-04 / D-14). An admin-created webhook silently has `skipOwn`
  forced off and would echo every sync write, so `create` always uses the `prestigo-sync` key, needs
  the `Webhook` scope of the Sync writer role, re-reads the webhook and fails with
  `skipown_not_effective` unless `skipOwn` is true and the webhook has an owner (the broken webhook
  is deleted again). A second `create` prints `webhook=exists` and registers nothing.
- **Role widening (Sync writer only):** the `Webhook` scope and `stream: all` on Contact and Lead
  (needed to post and read history Notes). `verify-acl.mjs` expects `GET /Webhook` to be allowed
  for the Sync writer and exactly 403 for every other managed role.
- **Receiver:** `https://rideprestigo.com/api/webhooks/espocrm` (the canonical host; another host or
  a non-https URL is refused). EspoCRM disables a webhook after repeated failures and deletes it when
  the receiver answers HTTP gone, so the receiver must never answer that status.

### Secret custody

The webhook secret is returned once, when the webhook is created. `create` writes it with the id to
`~/.config/prestigo/espocrm-webhook.env` (mode 600, directory 700; keys `ESPOCRM_WEBHOOK_ID` and
`ESPOCRM_WEBHOOK_SECRET`) and prints neither. Hand both to Vercel through a pipe, never through the
screen or a command line:

```
node infra/espocrm/webhook.mjs --print id     | vercel env add ESPOCRM_WEBHOOK_ID production --yes
node infra/espocrm/webhook.mjs --print secret | vercel env add ESPOCRM_WEBHOOK_SECRET production --sensitive --yes
```

`--print` writes the bare value (no newline) and exits 1 without output when stdout is a terminal.

### Live check and rotation

After the Vercel deploy that carries the receiver, `node infra/espocrm/webhook.mjs probe` signs a
synthetic `Contact.update` batch for a random unlinked contact id exactly like EspoCRM (`Signature` =
base64 of the webhook id, a colon and the hex HMAC-SHA256 of the body), posts it to the receiver and
posts a tampered copy. `verdict=ok` means the receiver answered 200 and then 401; anything else is
`verdict=fail` (exit 1) and the receiver does not verify the signature the way EspoCRM signs it.

Rotation without a gap: `create` treats an existing webhook for the same event and URL as done, so
register the new one under a marked URL (the receiver ignores the query string):
`node infra/espocrm/webhook.mjs create --url "https://rideprestigo.com/api/webhooks/espocrm?v=2"`
(this overwrites the stored env file, whose old value Vercel still holds). Then in Vercel copy the old
`ESPOCRM_WEBHOOK_SECRET` to `ESPOCRM_WEBHOOK_SECRET_PREVIOUS`, set the new id and secret through the
pipes above, deploy, run `probe`, and finally `delete <old id>`.

## PII rules

Export and candidate files contain customer names, emails and phone numbers.

- They live only in `infra/espocrm/.work/`, which is git-ignored together with
  `infra/espocrm/**/*.env`.
- Logs are counts only: never print a name, email or phone number.
- Delete the files in `.work/` after use.
- Production data never goes into fixtures or tests; tests use the in-memory fake
  in `tests/helpers/fake-espocrm.ts` with obviously fake secrets.
