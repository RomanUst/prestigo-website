# Phase 80: EspoCRM Deployment + Core Entities - Research

**Researched:** 2026-10-11
**Domain:** EspoCRM 10.0.8 configuration-as-code over REST, custom read-only entity, one-time Supabase backfill, personal-mailbox integration, role ACL
**Confidence:** HIGH on EspoCRM mechanics (read from the v10.0.8 source tag cloned this session), MEDIUM on Hostinger/Chatwoot facts (web docs), LOW on a few UI-level behaviours flagged `[ASSUMED]` for UAT

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Opportunity stages (7, in order): New → First contact → Meeting/call → Rate sent → Trial ride → Partner (Won) / Lost. "Trial ride" is a real stage — hotels and concierges usually test one ride before committing. Stage labels in English in config; owner may rename in UI.
- **D-02:** Account `type` enum: Hotel, Travel agency / DMC, Corporate, Embassy / event agency, Other. The owner can add more values in Entity Manager; the config-as-code sync must **merge**, never overwrite or delete, enum values it did not create.
- **D-03:** Account commercial fields: commission/discount %, payment terms (card / invoice with terms / group Stripe link; billing details incl. VAT ID and reverse-charge flag), contract (date, validity, attached file), expected volume (rides per month).
- **D-04:** Negotiated prices differ per client → a child entity of Account (working name `PartnerRate`): route (free text, e.g. "PRG airport → city", "hourly", "Prague → Vienna"), vehicle class (E-Class / S-Class / V-Class), price EUR, valid from/to, note. Reference only in CRM — it does NOT drive site prices (site prices stay in `lib/route-prices.ts` / `lib/pricing-config.ts`). — **Reversibility:** costly — Phase 85 B2B stats and any future CRM→site pricing would build on this shape.
- **D-05:** Follow-ups are EspoCRM Tasks with due dates; reminders arrive in the CRM UI and by email via the existing Resend SMTP (Phase 76 D-18, `notifications@rideprestigo.com`) to the owner.
- **D-06:** Phase 80 creates the read-only `Booking` entity AND runs a one-time, re-runnable backfill of all past bookings + their customers from Supabase. Continuous sync stays in Phase 82, which must update the same records (no second copy).
- **D-07:** Idempotency key = Supabase booking id stored on the EspoCRM Booking (unique). Re-running the backfill updates, never duplicates. Same for Contacts (keyed by normalized email). — **Reversibility:** costly — Phase 82 outbox and SYNC-04 rely on these keys.
- **D-08:** Scope: all bookings except abandoned/unpaid checkout attempts (paid, invoice/cash, admin-created, cancelled are included). Abandoned attempts become Leads in Phase 81 (LEAD-04).
- **D-09:** Booking fields: date/time, route (pickup → dropoff), vehicle class, status, amount EUR, link to the admin booking, **plus** passenger name, payment method (Stripe / invoice / cash), flight number and assigned driver, source (website / admin-created / GNet). Booking is read-only for all EspoCRM users (edits happen in the site admin).
- **D-10:** Booking → Contact by customer email; Contact → Account when the contact is linked to an Account, so the Account shows all its contacts' bookings. Hints for linking: corporate email domain and `customer_profiles.company_name`.
- **D-11:** Mailbox = **roman@rideprestigo.com** (reserved in Phase 77). Connected to EspoCRM only — never to Chatwoot, and no other app pulls it via IMAP/POP or forwarding (viewing in Hostinger webmail is fine). roman@ is never used as a Chatwoot agent email (Phase 77 runbook).
- **D-12:** Two-way: IMAP fetch of inbox + sent, and sending from EspoCRM through roman@'s Hostinger SMTP (mail lands in Sent). The owner enters the mailbox password in the EspoCRM UI personally; Claude never sees it.
- **D-13:** Mail from an unknown sender stays in the EspoCRM inbox without auto-creating a Contact or Lead; mail from known Contacts/Accounts auto-attaches to them and their open Opportunities.
- **D-14:** Initial Accounts via assisted auto-pick: a script scans bookings for corporate email domains and `company_name` values (e.g. TravelExpress, TLTGO, Traveltime), shows the owner a candidate list; the owner confirms which to create and their type. Nothing is created without that confirmation.
- **D-15:** Roles: **Dispatcher** — Contacts + Booking history (read), own Tasks; no Opportunities, no PartnerRate, no commission/contract fields. **Sales manager** — Accounts, Contacts, Opportunities, PartnerRate, Tasks, emails. **Admin** — owner only. Chatwoot mirror: agents in teams `bookings` (dispatcher) and `b2b` (sales); admin = owner.
- **D-16:** Money visibility: booking amounts visible to every role; negotiated rates, commission and contract terms only to Sales manager and Admin (field-level ACL).

### Claude's Discretion
- Config-as-code layout for EspoCRM (mirroring `infra/chatwoot/sync.mjs` + JSON: idempotent, `create=0 update=0` on second run), API auth method (API user with key/HMAC), entity/field naming, layouts, list views, Kanban setup.
- Backfill implementation (run from repo with service credentials read inside the script; batch size; dry-run that prints counts without writing to EspoCRM).
- How the dedicated "Other" type text and VAT/reverse-charge fields are modelled.
- EspoCRM UI language/currency defaults (EUR, English UI unless owner asks otherwise).

### Deferred Ideas (OUT OF SCOPE)
- Using PartnerRate to drive actual site/admin pricing for B2B clients — would be CRM→site write path (CRM-FUT-01), future milestone.
- Privacy-policy wording for EspoCRM processing — GDPR-02 (later phase of v4.0).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CRM-01 | Owner manages Accounts and Contacts, each Contact linked to its Account | Account `type` enum merge (Pattern 3), Account commercial fields (`c`-prefixed), Contact.account native link, assisted seed script (Pattern 8) |
| CRM-02 | Kanban B2B pipeline with Prestigo stages, follow-up tasks/reminders | Opportunity `stage` already has `kanbanViewMode: true`; stage options + `probabilityMap` via FieldManager PUT; Task reminders + `SendEmailReminders` job + daemon container present (Pitfalls 8, 9) |
| CRM-03 | Contact/Account show full booking history via read-only Booking entity from Supabase | `CBooking` entity + links to Contact and Account; ACL-based read-only (NOT entityDefs `readOnly`); backfill with idempotency key; unique-index overlay (Pattern 5/6) |
| CRM-04 | Sales mail connected to EspoCRM only; emails attach to matching records | Personal Email Account (IMAP+SMTP), `DefaultParentFinder` semantics verified from source, daemon runs `CheckEmailAccounts` every minute (Mailbox section) |
| CRM-05 | Roles/ACL for 2-3 future operators in Chatwoot and EspoCRM, runbook | Role JSON format verified from the UI source; Chatwoot CE has only `agent`/`administrator`; role invariants as vitest tests; runbook + guard test |
</phase_requirements>

## Summary

EspoCRM 10.0.8 can be configured almost entirely through its REST API — entities (`POST /EntityManager/action/createEntity`), links (`createLink`), fields (`POST /Admin/fieldManager/:scope`), field updates (`PUT /Admin/fieldManager/:scope/:name`), layouts (`PUT /:scope/layout/:name`), roles (`POST /Role`), settings (`PUT /Settings`). Every one of those controllers rebuilds the metadata cache itself, so no `bin/command rebuild` is needed for the REST path. **The decisive constraint is that all of these endpoints require `isAdmin()`, and an `api`-type user is never admin** (`Entities/User.php`: `isAdmin()` is true only for `admin`, `system`, `super-admin`). A working design therefore needs two identities: an **admin-type service user** (schema, roles, settings; password auth) and a **least-privilege API user with `X-Api-Key`** (data writes: backfill, account seeding, later Phase 81/82). The owner's `prestigo-admin` has TOTP enabled (76-05-SUMMARY: `user_data.auth2_f_a=1, method Totp`), so password-only Basic auth would be rejected for it; a second, non-2FA admin service user (created once by the owner) is the practical path.

Two things cannot be done through REST and shape the plan. (1) A **database-level unique index** on the Supabase booking id: FieldManager only accepts the params listed per field type (no `unique`/`index`), so the unique constraint needs one overlay JSON file in the `app_custom` volume (`entityDefs/CBooking.json` with `indexes` + `deleteId: true`, the same pattern EspoCRM uses for `User.userName`) and a rebuild; this is a single VPS step and is covered by the existing restic backup of that volume. (2) A **deep link to a single booking** in the site admin: `components/admin/BookingsTable.tsx` keeps `search` in `useState('')` and defaults the horizon to future bookings, so there is no URL that opens one booking today; the CRM link field can only point at the bookings list unless a small admin change is added.

Booking read-only-ness must be enforced by **role ACL** (create/edit/delete = no for Dispatcher/Sales manager), not by entityDefs `readOnly: true`: the latter is a global restriction that strips the attribute from *every* write including the sync API user (`AclManager::getGlobalRestrictionTypeList` adds `TYPE_READ_ONLY` for the edit action for all users; `Record\Service::filterInput` unsets the forbidden attributes). The owner (admin) bypasses ACL and can still edit; that is acceptable and should be documented. For email, a **Personal Email Account** is the right object (no case-creation or auto-reply fields exist on it, so unknown senders are never auto-converted); inbound mail attaches to the Contact's **Account** (not the Contact) when the Contact has one, and to the Contact otherwise; "attach to open Opportunities" is only natively true for replies to mail sent from that Opportunity (via the `References` header), so D-13's Opportunity clause needs either that working practice or an optional formula (Open Question 7). The compose already has the `daemon` service, so scheduled jobs (`CheckEmailAccounts` every minute, `SendEmailReminders` every 2 minutes) run; the websocket container is not needed.

**Primary recommendation:** Build `infra/espocrm/` as a declarative, read-then-diff REST sync (JSON in git → admin-service-user calls; enum options merged, labels seeded-not-enforced; second run prints `create=0 update=0`), plus a separate API-key data tool for backfill/seeding fed from a Supabase SQL export file, with every ACL rule (D-15/D-16) encoded as a vitest invariant; do the one VPS overlay step for the unique index and the owner's mailbox/UI steps as explicit human checkpoints.

## Project Constraints (from CLAUDE.md)

- Never read `.env.local`; no secrets or `.env*` in commits (pre-commit enforces). New creds go to `~/.config/prestigo/espocrm-api.env` (mode 600), read inside scripts only.
- No hard-coded `€` prices in `app/` or `components/` (infra scripts are outside that rule, but the CZK→EUR constant must be pinned to `lib/currency.ts` by a test).
- Tests: `npx vitest run [files]` (full ~90s); `vitest related` crashes here, grep `tests/` instead. Type check `npx tsc --noEmit` (8 old errors in `tests/` baseline). Lint `npx eslint --quiet <files>`.
- Security work (auth, validation, rate limits) is committed with a `security:` prefix after tests pass.
- Marketing/social/blog content rules (no prices, no Uber comparisons) do not apply to this phase's artefacts.
- Brand spelling "Prestigo". English UI strings only here; no `messages/*.json` changes unless the optional admin deep-link touches site strings (it should not).
- `tests/infra-vps-isolation-guard.test.ts` scans `app`, `components`, `lib`, `i18n`, `middleware.ts`, `next.config.ts`, `vercel.json` for `crm.rideprestigo.com` and `ESPOCRM_*` names: nothing from this phase may land in those directories (keep all code under `infra/espocrm/` and `tests/`).
- Memory-recorded: Claude never sees the mailbox password; the Stripe/Supabase live keys are run by user-side scripts; SSH to the VPS needs the owner's allow-rules (auto mode blocks it).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Entity/field/layout/role/settings definition | EspoCRM app (metadata in `custom/` volume + MariaDB) | Git (`infra/espocrm/*.json` = source of truth) | Git declares, REST sync applies; EspoCRM owns runtime copy |
| Booking history storage | EspoCRM `CBooking` (MariaDB) | Supabase (true source) | Supabase stays source of truth; CRM is a downstream read-only mirror |
| Backfill / account seeding | Workstation Node script (API-key identity) | Supabase SQL export file | Site must not depend on VPS; script runs by hand, not at request time |
| Unique idempotency guard | MariaDB unique index (overlay) | Script lookup-before-write | DB constraint is the only race-safe guard; lookup alone is single-writer-safe |
| Read-only Booking enforcement | EspoCRM role ACL | Absence of UI edit paths | Admin bypasses ACL; entityDefs `readOnly` would also block the sync writer |
| Email fetch/send | EspoCRM Personal Email Account + `daemon` container | Hostinger IMAP/SMTP | One mailbox, one system (D-11) |
| Reminders | EspoCRM scheduled job `SendEmailReminders` + client popups | Resend SMTP relay (system mail) | Already wired in Phase 76 |
| Operator roles | EspoCRM Roles (ACL JSON) | Chatwoot teams/inbox membership (CE has only agent/admin) | Role mirror is by team + inbox membership, not custom Chatwoot roles |
| Admin deep link to a booking | Site admin (`components/admin/BookingsTable.tsx`) | CRM URL field | Needs a tiny site change or the link only opens the list |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node built-ins (`fetch`, `node:fs`, `node:path`, `node:os`, `node:readline`) | Node v24.14.1 local `[VERIFIED: node --version]` | REST client, JSON config, env-file reading | Exactly what `infra/chatwoot/lib/client.mjs` does; no new dependency |
| EspoCRM REST API | 10.0.8 (running); 10.0.9 exists (2026-09-29, two small fixes) `[VERIFIED: GitHub releases API]` | All configuration + data | The only supported programmatic surface |
| vitest | ^4.1.1 `[VERIFIED: package.json line 75]` | Tests for pure logic + fake EspoCRM | Project standard; `tests/chatwoot-sync.test.ts` is the template |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Supabase MCP `execute_sql` (session tool) | n/a | Produce the booking export JSON without service-role key on disk | Default backfill input path |
| `@supabase/supabase-js` | ^2.101.0 already a dependency `[VERIFIED: package.json line 25]` | Optional direct-read mode of the backfill | Only if the owner wants a no-export run; needs a key file in `~/.config/prestigo/` |
| `zod` | ^4.3.6 already a dependency `[VERIFIED: package.json line 48]` | Validate JSON specs / export rows | Optional; plain checks are enough for infra scripts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| REST sync with admin service user | Write metadata JSON straight into the `custom/` volume over SSH + `bin/command rebuild` | No admin password on workstation, but every change needs SSH (blocked in auto mode), no read-back diff, harder idempotency. Use only for the unique-index overlay |
| Admin service user without 2FA | `prestigo-admin` + TOTP header (`Espo-Authorization-Code`) per run | Keeps 2FA on every admin credential but the owner must type a code for every run; supported as fallback flag |
| API user (HMAC) | API user (API key) | HMAC is "most secure" `[CITED: docs.espocrm.com/development/api/]` but the call set is tiny, traffic is TLS to one host; API key is simpler and enough |
| Group Email Account | Personal Email Account | Group adds `createCase`/auto-reply fields (unwanted), is shared; Personal matches D-11/D-13 |
| Native `Pipeline` entities (multi-pipeline, new in 10.0) | Single enum `stage` | Multi-pipeline is opt-in per entity and makes the status field read-only; one pipeline needs none of it. Do not enable `pipelines` on Opportunity |

**Installation:** none. No external packages are added; every dependency above is already in `package.json` or a Node built-in.

**Version verification:** `espocrm/espocrm` latest release 10.0.9 (2026-09-29); the VPS runs 10.0.8 pinned (compose.yml). Do not bump in this phase (upgrade runbook governs it); 10.0.9 fixes are unrelated to this phase.

## Package Legitimacy Audit

No external packages are installed in this phase (Node built-ins, plus `vitest`, `zod`, `@supabase/supabase-js` that already exist in `package.json`). The `package-legitimacy` seam was not run because there is nothing new to check.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none new) | - | - | - | - | - | - |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none. If the planner later adds any package (e.g., a CSV or TOTP helper), it must go through the legitimacy gate first; the design below needs none.

## Architecture Patterns

### System Architecture Diagram

```
 git: infra/espocrm/*.json  ──►  sync.mjs (admin service user, Basic auth, sequential)
 (entities, fields, enums,        │  1 GET  /Metadata/action/get?key=...   (read current)
  layouts, roles, settings)       │  2 diff desired ⊆ current  (planCollection / subsetEqual)
                                  │  3 POST/PUT only the delta  ──► EspoCRM 10.0.8 (crm.rideprestigo.com via Caddy)
                                  │     EntityManager / FieldManager / Layout / Role / Settings
                                  │     (each controller rebuilds cache itself)
                                  ▼
                       one-time VPS step: overlay CBooking.json (unique index) ─► POST /Admin/rebuild

 Supabase ──(SQL export via MCP → JSON file, PII, not committed)──► backfill.mjs (API-key identity)
                                  │ preload Contacts + CBooking keys (paged 200)
                                  │ map rows → payloads (pure fn)  ──► drop abandoned checkouts
                                  │ diff → create / update / unchanged   (--dry-run prints counts only)
                                  ▼
                       Contact (key: normalized email) ◄── CBooking (key: supabaseBookingId)
                                  │ account link only if Contact already has Account
 bookings ──► account-candidates.mjs ──► candidates.json (owner edits: confirm + type)
                                  └──► seed-accounts.mjs (creates only confirmed, links Contacts by domain/company)

 Owner (UI): Personal Email Account roman@ (IMAP imap.hostinger.com:993, SMTP smtp.hostinger.com:465)
   Hostinger ◄─IMAP/SMTP─► EspoCRM app ─ daemon container runs cron.php ─► CheckEmailAccounts (*/1) → DefaultParentFinder
        inbound: References header → From/ReplyTo/To address → Contact(→Account) | Account | Lead → else no parent (stays in inbox)
 Tasks + reminders ─ SendEmailReminders (*/2) ─► Resend SMTP (notifications@) ─► owner
 Roles (Dispatcher / Sales manager) ─ ACL JSON in git ─► verify-acl.mjs (temp API user per role, asserts 403s)
```

### Recommended Project Structure
```
infra/espocrm/
├── README.md                    # run order, credentials, owner steps
├── sync.mjs                     # config-as-code sync (pure helpers exported for tests)
├── backfill.mjs                 # Supabase export → Contacts + CBooking (idempotent, --dry-run)
├── account-candidates.mjs       # D-14 scan → candidates.json (no writes to EspoCRM)
├── seed-accounts.mjs            # creates only owner-confirmed accounts, links Contacts
├── verify-acl.mjs               # temp API user per role, asserts forbidden operations
├── lib/
│   ├── client.mjs               # createEspoClient (basic | apikey), redaction, timeouts
│   ├── enum-merge.mjs           # mergeEnumOptions (pure)
│   ├── booking-map.mjs          # rowToBooking, normalizeEmail, isAbandonedCheckout (pure)
│   └── candidates.mjs           # free-mail list, domain grouping, type guess (pure)
├── entities.json                # CBooking, CPartnerRate (type Base) + links
├── fields.json                  # per-scope field specs (Account/Opportunity/CBooking/CPartnerRate)
├── enums.json                   # Account.type, Opportunity.stage (+probabilityMap), seeds + retire lists
├── layouts/                     # detail/list/relationships JSON per scope
├── roles.json                   # Dispatcher, Sales manager (data + fieldData), API sync role
├── settings.json                # EUR, Europe/Prague, tabList, defaultRemindersTask, etc.
└── overlay/CBooking.entityDefs.json   # unique index + deleteId (applied on the VPS once)
infra/vps/runbooks/crm-operators.md    # roles/ACL, mailbox, reminders runbook (+ tests/crm-runbook.test.ts)
tests/espocrm-sync.test.ts, espocrm-backfill.test.ts, espocrm-candidates.test.ts, espocrm-roles.test.ts, crm-runbook.test.ts
```
Working files with PII (`export.json`, `candidates.json`) live under `infra/espocrm/.work/` and must be git-ignored (add `infra/espocrm/.work/` to `.gitignore`).

### Pattern 1: Two identities, one config file
**What:** `~/.config/prestigo/espocrm-api.env` (mode 600) holds `ESPOCRM_BASE_URL=https://crm.rideprestigo.com`, `ESPOCRM_API_KEY` (data identity), `ESPOCRM_ADMIN_USER`, `ESPOCRM_ADMIN_PASSWORD` (config identity). Optional `ESPOCRM_TOTP` only from the environment/stdin, never from the file. The client picks the identity per command: `sync.mjs`, `verify-acl.mjs`, role/user management use Basic; `backfill.mjs`, `seed-accounts.mjs` use `X-Api-Key`.
**Why:** `FieldManager`, `EntityManager`, `Admin`, `Settings`, `Layout` (PUT/getOriginal) controllers all throw `Forbidden` unless `$this->user->isAdmin()`, and `User::isAdmin()` is `getType() === TYPE_ADMIN || isSystem() || isSuperAdmin()` (API type excluded). `Role` is an admin-only scope as well. `[VERIFIED: espocrm@10.0.8 Controllers/FieldManager.php checkControllerAccess, Controllers/EntityManager.php __construct, Controllers/Admin.php, Controllers/Settings.php putActionUpdate, Entities/User.php isAdmin]`
**Headers:** API key → `X-Api-Key: <key>` `[VERIFIED: Core/Authentication/Logins/ApiKey.php]`; Basic → `Espo-Authorization: base64(user:password)` (the Phase 76 runbook already uses this form; docs call Basic "not recommended" and prefer `GET /App/user` to exchange the password for a token `[CITED: docs.espocrm.com/development/api/]`). Implement the token exchange in the client: one `GET /App/user` with Basic, then use `Espo-Authorization: base64(user:token)` for the rest of the run. With TOTP set, add `Espo-Authorization-Code` on that first call only (`Authentication::processTwoFactor` is skipped when an auth token is used).
**Admin service user bootstrap (owner checkpoint):** the owner creates `prestigo-config` (type Admin, no 2FA enrolled, long random password) in Administration → Users, and an API user `prestigo-sync` (type API, auth method API Key, role "Sync writer") — or a one-shot `bootstrap-users.mjs` run once with `prestigo-admin` + TOTP that writes the new key straight into the env file without printing it (create response of an `api` user already contains `apiKey`, see app-deploy.md step 8: never echo it). Deactivate `prestigo-config` (`isActive=false`) between configuration sessions if desired.
**Never retry on 401:** EspoCRM counts failed logins (`authMaxFailedAttemptNumber` family in `systemConfig.php`) and bans the IP for a period. One failure aborts the run.

### Pattern 2: Read-then-diff REST sync mirroring `infra/chatwoot/sync.mjs`
**What:** For each declared item, read current state with `GET /api/v1/Metadata/action/get?key=<dot.path>` (admin-only; returns merged core+custom metadata; `null` when absent — unlike `GET /Admin/fieldManager/...`, which throws a 500-class `Error` for a missing field) and compare with the existing `subsetEqual(want, have)` helper (copy it from chatwoot `sync.mjs`; extra server-side keys are ignored). Create → `POST`, differs → `PUT`, equal → skip. Resource order: `settings → entities → links → fields → enums → layouts → roles → tabs`. Output contract identical to chatwoot: `<resource>: create=N update=N unchanged=N skipped=N`, exit 0 ok / 1 config / 2 API.
**Rules found in source that the sync must encode:**
- Custom entity names get a **`C` prefix** (`NameUtil::addCustomPrefix`, `ucFirst=true`): ask for `Booking`, get `CBooking`; `PartnerRate` → `CPartnerRate`. REST paths are `/CBooking`, `/CPartnerRate`. `createEntity` returns `{ "name": "CBooking" }`. Labels (`labelSingular`: "Booking") carry the human name. These names are an interface for Phase 82; record them in the README.
- Fields on a **non-custom scope** (Account, Contact, Opportunity) get a lowercase **`c` prefix** (`cCommissionPercent`); on a custom scope (CBooking) they do not (`FieldManager::create`: `if (!$this->isScopeCustom($scope)) $name = addCustomPrefix($name)`). The create response does not echo the final name; compute it (`'c' + ucfirst(name)`).
- Field names: start with a lowercase letter, only `[a-zA-Z0-9]`, ≤ 50 chars after underscore conversion, not in `FIELD_FORBIDDEN_NAME_LIST` (`id, deleted, deleteId, teams, assignedUser, createdAt, modifiedAt, createdBy, modifiedBy, isLocked, ...`). Link names on the non-custom side also get `c` (`cBookings`, `cPartnerRates`).
- `createEntity` params: `name, type ("Base"), labelSingular, labelPlural, stream:false, kanbanViewMode:false`; a tab is added automatically (`CreateParams::addTab = true`).
- `createLink` body: `{linkType:"manyToOne", entity:"CBooking", link:"contact", entityForeign:"Contact", linkForeign:"bookings", label:"Contact", labelForeign:"Bookings"}`. `layout`/`layoutForeign` select the row layout of the related panel, not the relationships layout.
- `FieldManager::update` only persists params that are permitted for the field *type* (`params` list in `Resources/metadata/fields/<type>.json`). `unique` and `index` are **not** permitted for `varchar`/`enum`.
- All metadata-writing endpoints must run **strictly sequentially** (one request in flight) and never while the owner edits in Entity Manager; metadata is file-based and each call triggers a rebuild. Use a 120 s timeout for admin calls (chatwoot client uses 30 s).

### Pattern 3: Merge-safe enum sync (D-02) and seeded-not-enforced labels
**What:** `mergeEnumOptions({desired, current, currentLabels, retire})` is a pure function used for `Account.type` and `Opportunity.stage`:
1. `current` ← `GET /Metadata/action/get?key=entityDefs.Account.fields.type` → `.options`.
2. `currentLabels` ← `GET /I18n` → `Account.options.type` (the field-manager PUT **replaces the whole `translatedOptions` map** for the field in the custom i18n file: `FieldManager::setTranslatedOptions` calls `language->set($scope,'options',$name,$value)`; so always send existing ∪ new labels).
3. `options = desiredValues(in desired order) ++ current values not in desired and not in retire (owner-added, original order)`. Idempotent: a second run yields the same list.
4. `translatedOptions = currentLabels` with a desired label added **only for values that have no label yet** (D-01: the owner may rename in the UI; a rename survives re-runs).
5. `retire` is an explicit list of **stock EspoCRM values** removed only when not in use (`GET /Account?where=type equals <v>&maxSize=1` returns 0): `Account.type` stock `["", "Customer", "Investor", "Partner", "Reseller"]`; `Opportunity.stage` stock `Prospecting, Qualification, Proposal, Negotiation`. This is the only sanctioned deletion and is itself config in git; it never touches a value the owner added. (Open Question 6.)
6. PUT body (only if the computed state differs): `{ options, translatedOptions, probabilityMap?, style? }`.

**Stable machine values, human labels** (recommended; avoids "/" and parentheses in stored values):

| Entity.field | Stored value | Seeded label |
|---|---|---|
| Account.type | `Hotel` | Hotel |
| | `Agency` | Travel agency / DMC |
| | `Corporate` | Corporate |
| | `Embassy` | Embassy / event agency |
| | `Other` | Other |
| Opportunity.stage | `New` | New |
| | `First Contact` | First contact |
| | `Meeting` | Meeting / call |
| | `Rate Sent` | Rate sent |
| | `Trial Ride` | Trial ride |
| | `Closed Won` | Partner (Won) |
| | `Closed Lost` | Lost |

**Keep `Closed Won` / `Closed Lost` as stored values.** They are hard-wired: `Opportunity::STAGE_CLOSED_WON = 'Closed Won'`, `STAGE_CLOSED_LOST = 'Closed Lost'`, `logicDefs/Opportunity.json` shows `lastStage` only when `stage equals "Closed Lost"`, `scopes/Opportunity.json` has `"kanbanStatusIgnoreList": ["Closed Lost"]` (so Lost is hidden from the Kanban board by default, which fits), and the sales-pipeline dashlet checks `item.stage === 'Closed Won'`. Renaming the stored value breaks these; only the label changes.
`probabilityMap` (stage field additional param, accepted by FieldManager via `fieldManagerAdditionalParamList`): suggested `New 10, First Contact 20, Meeting 40, Rate Sent 60, Trial Ride 80, Closed Won 100, Closed Lost 0` `[ASSUMED]` (owner can tweak; not specified in D-01). Suggested `style`: `Trial Ride: primary`, `Closed Won: success`, `Closed Lost: info`.

### Pattern 4: Account/Opportunity/PartnerRate model
**Account (scope Account, all commercial fields tagged `commercial:true` in `fields.json`, names get `c`):** `cOtherTypeNote` varchar (dynamic logic visible only when `type == Other`; FieldManager accepts `dynamicLogicVisible`), `cCommissionPercent` float 0-100, `cPaymentTerms` enum `Card | Invoice | GroupStripeLink`, `cInvoiceDueDays` int (logic: visible when `Invoice`), `cVatId` varchar, `cReverseCharge` bool, `cContractDate` date, `cContractValidUntil` date, `cContractFile` file, `cExpectedRidesPerMonth` int. Billing details reuse native `billingAddress*`. Mark person-bearing fields `isPersonalData: true` where applicable (permitted additional param) to keep the later GDPR erasure tool usable.
**Opportunity:** native fields plus stage/probability above; `closeDate`, `amount` (currency EUR) already exist. Optional `cExpectedRidesPerMonth`.
**CPartnerRate (type Base, parent Account):** `name` = route text (free text), `vehicleClass` enum `E_Class | S_Class | V_Class` (labels E-Class/S-Class/V-Class), `price` currency (`onlyDefaultCurrency: true`), `validFrom`/`validTo` date (`validTo` `afterOrEqual: validFrom`), `note` text; link `account` manyToOne to Account (`cPartnerRates` on the Account side), shown as an Account relationships panel. Dispatcher has no access to the scope.
**Currency:** `PUT /Settings` `{defaultCurrency:"EUR", baseCurrency:"EUR", currencyList:["EUR"]}` (these three keys exist in `Settings.json` entityDefs; the stock default is USD). Currency attributes in payloads are `amount` + `amountCurrency: "EUR"`.

### Pattern 5: `CBooking` (read-only reference mirror)
**Entity:** type `Base`, `stream:false`, label "Booking"/"Bookings". Fields (custom scope, no prefix):

| Field | Type | Source column (Supabase) | Note |
|---|---|---|---|
| `name` (built-in varchar, required) | varchar | `booking_reference` | e.g. `PRG-20260928-D8E6DC` (format from `lib/booking-reference.ts`) |
| `supabaseBookingId` | varchar(36), `pattern` uuid | `bookings.id` | idempotency key; unique via overlay |
| `leg` | enum `outbound, return` | `leg` | round trips are two rows (`linked_booking_id`) |
| `pickupAt` | datetime | `pickup_utc` (fallback: `pickup_date`+`pickup_time` in Europe/Prague) | UTC stored, Prague displayed |
| `pickup`, `dropoff` | varchar/text | `origin_address`, `destination_address` | hourly: dropoff empty, tripType shows it |
| `tripType` | enum | `trip_type` | |
| `vehicleClass` | enum | `vehicle_class` | |
| `status` | enum | `status` | |
| `amount` | currency (EUR) | `amount_eur`, else `czkToEur(amount_czk)` | |
| `paymentMethod` | enum `Stripe, Invoice, Cash, Other` | derived (see Pitfall 11) | `[ASSUMED]` mapping |
| `passengerName` | varchar | `client_first_name` + `client_last_name` | |
| `flightNumber` | varchar | `flight_number` | |
| `driverName` | varchar | `drivers.name` via `bookings.driver_id` | plain text, no Driver entity |
| `source` | enum `Website, Admin, GNet` | `booking_source` (`online`, `manual`, `gnet`) | |
| `adminLink` | url | built | see Open Question 3 |
| `contact` | link manyToOne → Contact | by normalized `client_email` | Contact side link `cBookings` |
| `account` | link manyToOne → Account | copy of the Contact's account | Account side `cBookings`; denormalised so the Account panel works |

Verbatim enum sources (so `status` / `source` / `vehicleClass` options match the DB): `supabase/migrations/053_unpaid_booking_status.sql` lines 21-30 `[VERIFIED]`: `CHECK (status IN ( 'unpaid', 'pending', 'confirmed', 'completed', 'cancelled', 'assigned', 'en_route', 'on_location' ));`; `supabase/migrations/039_gnet_bookings.sql` line 17 `[VERIFIED]`: `CHECK (booking_source IN ('online', 'manual', 'gnet'));`; `types/booking.ts` lines 16 and 28 `[VERIFIED]`: `export type VehicleClass = 'business' | 'first_class' | 'business_van'` and `export type BookingSource = 'online' | 'manual' | 'gnet'`; line 1: `export type TripType = 'transfer' | 'hourly' | 'daily' | 'round_trip'`. Keep the EspoCRM enum *values* identical to these DB strings (labels human), so Phase 82 can write them through unchanged. (`unpaid` remains a legal value because admin-created bookings awaiting a payment link are real; see Pitfall 11.)
**Read-only mechanism:** roles, not entityDefs. `Dispatcher` and `Sales manager`: `CBooking: {create:"no", read:"all", edit:"no", delete:"no"}`. The sync API role: `{create:"yes", read:"all", edit:"all", delete:"no"}`. Admin bypasses ACL (`DefaultTable::load`: `if ($this->user->isAdmin())` → highest level). Do **not** set `readOnly:true` on Booking fields (it removes the attribute from every write, including the sync, per `AclManager::getGlobalRestrictionTypeList` + `Record\Service::filterInput`).
**Visibility pitfall:** records created by an API user have no `assignedUser` (`DefaultPopulator` skips API users); roles with read level `own`/`team` would then hide them. Give Dispatcher and Sales manager read `all` on Contact, Account, CBooking.
**Unique index (overlay, applied once on the VPS):**
```json
{
  "indexes": {
    "supabaseBookingIdDeleteId": { "type": "unique", "columns": ["supabaseBookingId", "deleteId"] }
  },
  "deleteId": true
}
```
placed at `/var/www/html/custom/Espo/Custom/Resources/metadata/entityDefs/CBooking.json` (owner `www-data`; merged with what FieldManager already wrote), then `POST /Admin/rebuild`. This is the exact pattern core uses (`entityDefs/User.json` `indexes.userNameDeleteId` + `"deleteId": true`; `AdditionalBuilder/DeleteIdField.php` adds the `deleteId` varchar). `FieldManager::saveCustomEntityDefs` re-reads the existing custom file and only replaces `fields`/`links`, so later FieldManager writes keep the overlay keys `[VERIFIED: source reading]`. The `app_custom` volume is in the nightly restic set (`infra/vps/runbooks/backup-restore.md` line 21). Fallback if the owner declines the VPS step: lookup-before-write plus an `--audit` mode that lists duplicate `supabaseBookingId` groups.

### Pattern 6: Backfill from Supabase (idempotent, re-runnable, dry-run)
- **Input:** `infra/espocrm/.work/export.json` produced with the Supabase MCP (no key on disk, `.env.local` untouched), or direct mode with a key file `~/.config/prestigo/supabase-readonly.env` (owner-created). Default to the export file.
- **SQL (exclusion rule is in SQL and re-checked in code):**
```sql
select b.id, b.booking_reference, b.status, b.booking_source, b.leg, b.trip_type, b.vehicle_class,
       b.pickup_utc, b.pickup_date, b.pickup_time, b.origin_address, b.destination_address,
       b.amount_eur, b.amount_czk, b.client_first_name, b.client_last_name, b.client_email, b.client_phone,
       b.flight_number, b.payment_intent_id, b.payment_link_id, b.invoice_number, b.paid_at, b.attempt_id,
       b.user_id, b.created_at, d.name as driver_name, cp.company_name, cp.account_type
from public.bookings b
left join public.drivers d on d.id = b.driver_id
left join public.customer_profiles cp on cp.user_id = b.user_id
where not (b.status = 'unpaid' and b.booking_source = 'online' and b.payment_link_id is null)
```
- **Abandoned checkout definition** (D-08): `lib/supabase.ts` `captureUnpaidBooking` / `create-payment-intent` write `status 'unpaid'` rows with a `payment_intent_id` and **no** `payment_link_id`, `booking_source` defaulting to online. Admin-created "collect payment" bookings are also `unpaid` but `booking_source: 'manual'` (`app/api/admin/bookings/route.ts` line 1098) and get a `payment_link_id` once the link exists; quote rows flipped to `unpaid` by the payment-link route (`app/api/admin/bookings/[id]/payment-link/route.ts`, lines 164 and 220) also carry `payment_link_id`. So `status='unpaid' AND booking_source='online' AND payment_link_id IS NULL` = abandoned checkout (excluded, becomes a Lead in Phase 81); other `unpaid` rows are kept with status `unpaid`. `[VERIFIED: files read this session]`; threshold confirmed by counts at run time (Open Question 4).
- **Algorithm:** (1) preload all Contacts `select=id,emailAddress,accountId,firstName,lastName` and all CBooking `select=id,supabaseBookingId,...` paged at `maxSize=200` (the server cap: `SearchParamsFetcher::MAX_SIZE_LIMIT = 200`); (2) map rows with the pure `rowToBooking`; (3) Contacts: create missing (keyed by `normalizeEmail` = trim + lowercase), **never overwrite** an existing Contact's `accountId`, `title`, `description`, or names (owner-managed); (4) Bookings: create or update all fields (the sync owns them), link `contact`, and set `account` from the Contact's current `accountId`; (5) sequential writes (or concurrency 2) with a small delay: the app container is capped at 768 MB; (6) `--dry-run` prints `contacts: create=N unchanged=N`, `bookings: create=N update=N unchanged=N`, `excluded_abandoned=N`, no names or emails; (7) counts-only logging; on a `409` for a Contact (EspoCRM's duplicate check on email) fetch-and-treat-as-existing rather than send `X-Skip-Duplicate-Check`.
- **Re-link pass:** a second command `relink-accounts` (idempotent) re-reads Contacts and sets `CBooking.account` where it drifted, because the owner will attach Contacts to Accounts after the first run. Phase 82 inherits this rule.
- **Field ownership matrix** (document in README so Phase 82 does not clobber owner edits): Booking = sync-owned (all fields); Contact = created by sync, then owner-owned except `phoneNumber` when empty; Account = owner/seed only.
- **Currency conversion:** `lib/currency.ts` lines 1-2 `[VERIFIED]`: `export const EUR_TO_CZK_RATE = 25` and `export const CZK_TO_EUR_RATE = 0.04`; `czkToEur(czk)` is `Math.round(czk * CZK_TO_EUR_RATE)`. Duplicate the constants in `lib/booking-map.mjs` and add a vitest that reads `lib/currency.ts` and asserts the numbers match.
- **Return legs / multi-day:** one CBooking per Supabase row (`id`), so a round trip yields two records; this matches D-07 (key = booking id).

### Pattern 7: Assisted Account auto-pick (D-14)
Pure `buildCandidates(rows, {freeMailDomains})`: group by corporate email domain and by `customer_profiles.company_name` (via `bookings.user_id`); drop free-mail domains (gmail/googlemail, yahoo/ymail, outlook/hotmail/live/msn, icloud/me/mac, aol, proton/protonmail, gmx, web.de, mail.ru/bk.ru/list.ru/inbox.ru, yandex/ya.ru, seznam.cz/email.cz/centrum.cz/volny.cz, qq.com, 163.com, 126.com, t-online.de, orange.fr, free.fr, wanadoo.fr); candidate = `{name, domain, companyNames[], emails[], bookingCount, totalEur, suggestedType, confirm:false, type:null}`; type guess by keywords (`hotel|resort|palace|residence` → Hotel; `travel|tour|dmc|transfers|express|tlt|agency` → Agency; `embassy|consulate|events?` → Embassy; else Other); a domain qualifies with ≥ 1 `company_name` hit or ≥ 2 distinct bookers/bookings. Output `.work/candidates.json` plus a console table (names and counts only). `seed-accounts.mjs` reads the file, creates **only** `confirm:true` entries, matches existing Accounts by `name` (case-insensitive) or website domain, then sets `Contact.accountId` for Contacts whose email domain equals the candidate domain **and** whose `accountId` is empty. Known partners to expect: TravelExpress, TLTGO, Traveltime. The Restore-drill canary Account in production must be excluded from every list (name "Restore Drill Canary") and never deleted (the drill's `drill-verify.sh` compares canary IDs).

### Pattern 8: Roles (D-15/D-16) as data, ACL format verified from the UI code
Role record via `POST /Role` (`PUT /Role/:id` to update; match by `name`): `{ "name":"Dispatcher", "data": {...}, "fieldData": {...}, "exportPermission":"no", "massUpdatePermission":"no", ... }`.
`data[scope]` is `false` (disabled) or an object of actions: `create` is `"yes"|"no"`; `read|edit|delete|stream` are `"all"|"team"|"own"|"no"`; boolean-type scopes (e.g. `EmailAccountScope`, `Import`) are `true|false` (`client/src/views/role/record/table.js` `fetchScopeData`/`fetchFieldData`, lines ~740-815). `fieldData[scope][field]` is `{ "read":"yes"|"no", "edit":"yes"|"no" }`.
```json
{
  "Dispatcher": {
    "data": {
      "Contact": {"create":"no","read":"all","edit":"no","delete":"no"},
      "Account": {"create":"no","read":"all","edit":"no","delete":"no"},
      "CBooking": {"create":"no","read":"all","edit":"no","delete":"no"},
      "Task": {"create":"yes","read":"own","edit":"own","delete":"own"},
      "Opportunity": false,
      "CPartnerRate": false,
      "EmailAccountScope": false
    },
    "fieldData": { "Account": { "cCommissionPercent": {"read":"no","edit":"no"}, "cContractFile": {"read":"no","edit":"no"} } }
  },
  "Sales manager": {
    "data": {
      "Account": {"create":"yes","read":"all","edit":"all","delete":"no"},
      "Contact": {"create":"yes","read":"all","edit":"all","delete":"no"},
      "Opportunity": {"create":"yes","read":"all","edit":"all","delete":"no"},
      "CPartnerRate": {"create":"yes","read":"all","edit":"all","delete":"no"},
      "CBooking": {"create":"no","read":"all","edit":"no","delete":"no"},
      "Task": {"create":"yes","read":"own","edit":"own","delete":"own"},
      "Email": {"create":"yes","read":"own","edit":"own","delete":"own"},
      "EmailAccountScope": true
    }
  },
  "Sync writer": {
    "data": {
      "Account": {"create":"yes","read":"all","edit":"all","delete":"no"},
      "Contact": {"create":"yes","read":"all","edit":"all","delete":"no"},
      "CBooking": {"create":"yes","read":"all","edit":"all","delete":"no"}
    }
  }
}
```
(Sketch only; the Dispatcher `fieldData` list must be generated from the `commercial:true` flags in `fields.json` so a new commercial field cannot be forgotten.) Admin = the owner's `prestigo-admin` only; `prestigo-config` is an admin type user too and should be deactivated when idle. Roles apply to API users exactly like to regular users, which gives `verify-acl.mjs` a no-password way to test them: create a throw-away API user per role, call the API with its key, assert `403` on Opportunity/CPartnerRate (Dispatcher), absence of `cCommissionPercent` in `GET /Account/:id`, `403` on `PUT /CBooking/:id`, then delete the user.
**Chatwoot mirror:** CE has only the built-in roles `administrator` and `agent` (custom roles are a paid feature `[CITED: chatwoot.com help centre "Manage team access control with flexible role-based permissions" and pricing page]`). `POST /api/v1/accounts/{id}/agents` accepts `{name, email, role: "agent"|"administrator", availability, auto_offline}` `[VERIFIED: chatwoot/chatwoot swagger/definitions/request/agent/create_payload.yml]`; team membership is `POST /teams/:id/team_members {user_ids}` (already used by `infra/chatwoot/sync.mjs` lines ~471-481). Existing teams in `infra/chatwoot/teams.json` are named `"Bookings"` and `"B2B"` (capitalised, not the lower-case names in D-15), both with `"members": ["@owner"]`. Differentiation between Dispatcher and Sales in Chatwoot is therefore **team membership plus inbox membership** (agents see only inboxes they belong to), and the runbook documents it; no code is strictly required. Optional small extension: an `infra/chatwoot/operators.json` (empty list) consumed by a new `agents` resource in `sync.mjs`. Reminder from `chatwoot-channels.md` lines 80-91: never use info@, bookings@ or roman@ as an agent email.

### Pattern 9: Mailbox (D-11..D-13) - what Claude automates vs the owner does
- **Object:** Personal Email Account (Emails → top-right menu in the owner's session, or Administration → Personal Email Accounts), assigned to `prestigo-admin`. The user's own email field must equal the account address and only an admin can change it `[CITED: docs.espocrm.com/administration/emails/]`: set `prestigo-admin`'s email to `roman@rideprestigo.com` (this also makes task-reminder emails land in that mailbox).
- **Fields** (`entityDefs/EmailAccount.json`, 10.0.8 `[VERIFIED]`): `host, port (default 993), security (SSL|TLS), username, password, monitoredFolders (default ["INBOX"]), sentFolder, folderMap, storeSentEmails, keepFetchedEmailsUnread, fetchSince (required), useImap, useSmtp, smtpHost, smtpPort, smtpAuth, smtpSecurity, smtpUsername, smtpPassword, smtpAuthMechanism, status`. No `createCase`/reply fields exist on it (they live on `InboundEmail`), so nothing can auto-create a Case or Lead from an unknown sender.
- **Hostinger values** `[CITED: hostinger.com support pages via web search]`: IMAP `imap.hostinger.com:993` SSL/TLS; SMTP `smtp.hostinger.com:465` SSL/TLS (587 STARTTLS is the documented alternative); username = full address. `monitoredFolders` = `INBOX` and the Sent folder (Hostinger's exact folder names are `[ASSUMED]`; the folder picker in the UI lists them after the connection test); `storeSentEmails` on, `sentFolder` = Hostinger's Sent so mail sent from EspoCRM lands in Sent. `fetchSince` is mandatory: pick the go-live date to avoid importing years of history, or an earlier date if the owner wants history.
- **Owner steps (Claude never sees the password):** create the account in the UI, type the password, "Test connection", pick folders, Save. Claude can verify afterwards with a read-only `GET /EmailAccount` as admin (status Active, `connectedAt` set, password field not returned).
- **Scheduling:** `daemon` service exists in `infra/vps/espocrm/compose.yml` (`entrypoint: docker-daemon.sh`, `mem_limit: 384m`); `Daemon::run` loops `php cron.php` every `daemonInterval`; `scheduledJobs.json`: `CheckEmailAccounts` `*/1 * * * *`, `CheckInboundEmails` `*/1`, Crm `SendEmailReminders` `*/2 * * * *`. `bin/command populate-scheduled-jobs` was run in the install (app-deploy.md step 4). The websocket container is not required for any of this (it only adds live UI push).
- **Attach rules** (`Core/Mail/Importer/DefaultParentFinder::find`, in this order): `References` header (mail sent from EspoCRM encodes `parentType/parentId` in its Message-ID) → parent of the replied-to email → From address → Reply-To → first To address. `getByAddress`: a Contact whose `emailAddress` matches resolves to the Contact's **Account** (when `b2cMode` is off and Account is an allowed parent type), else the Contact; then an Account with that address; then a Lead; then other Person/Company entities; else `null` (no parent, no creation). In addition, the Contact/Account **History** panel includes emails matched by from/to address via `EntityEmailAddress` joins (`Modules/Crm/Tools/Activities/Service.php`, the `$personBuilder`/`$addressBuilder` queries) `[VERIFIED]`, so a Contact sees its mail even though the stored parent is the Account.
- **Opportunity attach:** only via `References`/replied parent (mail composed from an Opportunity record) or manual Parent. Native auto-attach to "open Opportunities" does not exist; see Open Question 7 for an optional `beforeSave` formula on Email.
- **Noise:** system notification mail (task reminders, assignment notices from `notifications@rideprestigo.com`) addressed to roman@ will be fetched back into the same mailbox. Add one global Email Filter (From `notifications@rideprestigo.com`, action Skip) so system mail does not pollute the CRM inbox.

### Pattern 10: Reminders (D-05)
Task has `reminders` (`jsonArray`, `dateField: dateEnd`), parent can be `Account|Contact|Lead|Opportunity|Case`. Reminder types are Popup and Email (client-side popups poll; Email is sent by `SendEmailReminders` through the **system** SMTP = Resend relay configured in Phase 76 step 7 with `outboundEmailIsShared:true` and from `notifications@rideprestigo.com`). Set per-user defaults in `Preferences.defaultRemindersTask` (e.g. Popup at due time, Email 1 hour before) via `PUT /Preferences/<userId>` or in the UI; `[ASSUMED]` exact payload shape `[{"type":"Email","seconds":3600},{"type":"Popup","seconds":0}]` (field type is the same `crm:views/meeting/fields/reminders` `jsonArray` as on Task). The task's assigned user must have an email address. Validate end-to-end with one real Task: reminder email arrives from notifications@ (this also exercises the Skip-filter above).

### Anti-Patterns to Avoid
- **`readOnly:true` on Booking fields** - blocks the sync writer too (Pattern 5).
- **Renaming stage values `Closed Won`/`Closed Lost`** - breaks Opportunity code paths and dashlets; relabel only.
- **Overwriting `translatedOptions`/`options` from git** - clobbers owner renames/additions (D-02/D-01); always merge.
- **API user for schema work** - impossible (`isAdmin()` false); do not look for a role that grants it.
- **Parallel metadata calls** - file-based metadata + per-call rebuild; strictly sequential.
- **Enabling `pipelines` on Opportunity** - makes the status field read-only and moves stages into Pipeline records; unnecessary for one pipeline.
- **Group Email Account for roman@** - adds Case/auto-reply machinery and shared visibility.
- **Reading `.env.local` for the Supabase key** - forbidden; use the MCP export or an owner-created key file.
- **Logging emails/names in script output** - counts only; the export/candidate files are PII and git-ignored.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Kanban board for Opportunity | Custom UI/dashlet | Built-in Kanban view (`clientDefs/Opportunity.json` has `"kanbanViewMode": true`; `GET /Kanban/:entityType`) | Already enabled, stage ordering handled natively |
| Email fetching/sending/threading | An IMAP poller or Resend relay for roman@ | Personal Email Account + `CheckEmailAccounts` job | Native parent-finder, folder handling, Sent storage |
| Reminders | Cron/n8n reminder mails | Task `reminders` + `SendEmailReminders` job | Already scheduled; uses Phase 76 SMTP |
| Duplicate Contact guard | Own email-dedupe table | EspoCRM Contact duplicate check (`409` on same email) + email-address table | Case-insensitive address storage already unique |
| Access control | Application-side filtering | Role ACL + field-level `fieldData` (+ `verify-acl.mjs`) | Enforced in API for every client incl. API users |
| Schema migration | Raw SQL on MariaDB | EntityManager/FieldManager REST (or the one overlay file) | Raw SQL desyncs metadata and breaks rebuild/restore |
| Soft-delete-safe unique key | Hand-made hash column | `deleteId` + unique `indexes` (core pattern) | Same mechanism `User.userName` uses |
| Currency formatting/conversion | Custom money type | Native `currency` field, EUR only | Handles `amount` + `amountCurrency` |

**Key insight:** every behaviour D-01..D-16 asks for is a stock EspoCRM capability; the only custom code worth writing is the declarative sync, the pure mapping/normalisation functions, and the Supabase→CRM data loader.

## Runtime State Inventory

This phase is not a rename/refactor, but it layers configuration onto a live instance, so the live-state surfaces were checked:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Production EspoCRM already holds a "Restore Drill Canary" Account and Document (76-09 drill); `drill-verify.sh` compares canary IDs and requires counts ≥ baseline | Never delete/rename; exclude from candidate lists; seeding only adds |
| Live service config | EspoCRM Settings already set via API in Phase 76: Resend SMTP (`outboundEmailIsShared`), `auth2FA:true`, `auth2FAMethodList:["Totp"]`; `prestigo-admin` has TOTP; `siteUrl`, `language en_US`, `jobRunInParallel` set at install | `settings.json` must be a subset-merge (never replace the SMTP/2FA keys); EUR/timezone/tabList added |
| OS-registered state | `daemon` container (`docker-daemon.sh`) runs jobs; scheduled jobs populated at install | None; verify `GET /Admin/jobs`/ScheduledJob list shows `CheckEmailAccounts` and `SendEmailReminders` active |
| Secrets/env vars | `/etc/prestigo/espocrm.env` (DB + admin password + `ESPOCRM_CANARY_API_KEY`); new `~/.config/prestigo/espocrm-api.env` will hold the sync key + service-admin password on the workstation only | Create file mode 600; never commit; `.gitignore` already blocks `infra/vps/**/*.env`, add a rule for `infra/espocrm/.work/` |
| Build artifacts | `custom/` and `client/custom` volumes persist metadata/layouts/i18n; included in restic | After the overlay + REST changes, take/confirm a fresh restic snapshot before and after Phase 80 owner steps |

## Common Pitfalls

### Pitfall 1: API user cannot do schema work
**What goes wrong:** the planner plans a "single API user" and every `Admin/*`, `EntityManager/*`, `Layout PUT`, `Role`, `Settings` call returns 403.
**Why:** `isAdmin()` excludes `api`. **How to avoid:** two identities (Pattern 1). **Warning signs:** `403` on the first `createEntity`.

### Pitfall 2: Owner's admin has TOTP
**What goes wrong:** Basic auth with `prestigo-admin` returns 401/`TWO_FACTOR` style failure; repeated attempts trigger the IP ban. **How to avoid:** service admin without 2FA, or send `Espo-Authorization-Code` once and use a token; never loop on failures.

### Pitfall 3: `readOnly:true` kills the sync
See Pattern 5. **Warning signs:** backfill creates Bookings with empty fields (silently stripped), no error.

### Pitfall 4: Unique index not available via REST
`FieldManager` ignores `unique`/`index`. Without the overlay, concurrent writers (Phase 82 outbox retries) can create duplicates. **How to avoid:** apply the overlay once, add an `--audit` duplicate check to the backfill, assert in the runbook.

### Pitfall 5: Enum options/labels overwrite
PUT replaces `options` arrays and the entire `translatedOptions` map. **How to avoid:** merge function (Pattern 3) + test that adds an owner value and a renamed label to the fake, then asserts they survive a re-run.

### Pitfall 6: Stock stage values and hard-wired Closed Won/Lost
Dropping `Closed Won`/`Closed Lost` breaks `Opportunity` logic and dashlets; leaving the four stock stages leaves a 11-stage Kanban. **How to avoid:** keep the two, retire the four stock ones only if unused.

### Pitfall 7: Record visibility with `own`/`team` read levels
API-created records have no assigned user; roles with `own` read cannot see them. **How to avoid:** `read:"all"` for Contact/Account/CBooking in both human roles; test with `verify-acl.mjs` (positive read assertion).

### Pitfall 8: Sequential rebuilds and memory
Each field/link/entity call rebuilds. ~40 calls × several seconds is fine sequentially; parallel calls corrupt metadata files; the app container has `mem_limit: 768m`. **How to avoid:** one request at a time, 120 s timeout, a progress line per resource, resume-safe (idempotent).

### Pitfall 9: Mail-loop noise and sender reputation
Reminder/notification mails go to roman@ and are fetched back; sending from Hostinger SMTP uses Hostinger's DKIM/SPF while the site's transactional mail uses Resend. **How to avoid:** Skip-filter for `notifications@`; owner checks one real outbound mail lands in Sent and passes SPF/DKIM (mail-tester style check) `[ASSUMED]` DNS is already correct since mail is hosted at Hostinger (project_dns_setup).

### Pitfall 10: Auth log bloat
Every API-key call writes an `AuthLogRecord` unless `authApiUserLogDisabled` is set; it is a *system* config key (`systemConfig.php`), settable only via `bin/command config:set authApiUserLogDisabled true --type=bool` on the VPS (CLI exists since 10.0, used in the Phase 76 runbook). Backfill of a few thousand rows is tolerable; set it only if volume is large. 

### Pitfall 11: Mapping `payment method` and unpaid rows
No `payment_method` column exists. Inference (all `[ASSUMED]`, owner to confirm): `payment_intent_id IS NOT NULL` → Stripe; else `payment_link_id IS NOT NULL` → Stripe (payment link); else `invoice_number IS NOT NULL` → Invoice; else `booking_source='manual'` → Cash; `gnet` → Other. Quote rows (`booking_type 'quote'`, status `pending`) are real customer requests; include them (status `pending`) unless the owner objects (Open Question 5). `bookings` base DDL (migrations 001-037) is not in the repo, so column existence for `amount_eur`, `pickup_utc` and `payment_intent_id` was taken from `types/database.types.ts` rows 17-69 `[VERIFIED: file read]` and migrations 051/052/056/062, not from DDL; the SQL export will fail loudly if one is missing.

### Pitfall 12: Admin deep link impossible today
`BookingsTable` seeds `search` with `useState('')` and `horizon` with the persisted default (`future`); no `useSearchParams`. A CRM link can open `https://rideprestigo.com/admin/bookings` only (admin routes are non-localised: `middleware.ts` `NON_LOCALIZED_PREFIXES = ['/admin', '/api', '/auth', '/driver']`). **How to avoid:** either accept a list-only link in v1 or add a small change that reads `?search=<booking_reference>&horizon=all` (a past booking is hidden by the default horizon). Admin is auth-gated, so the URL leaks nothing.

### Pitfall 13: GDPR / data location
Names, emails, phones, flight numbers and addresses now live on the VPS and in B2 backups (B2 region chosen as US by the owner, memory project_phase76_vps). The privacy policy wording is GDPR-02 (deferred). Keep PII out of git and logs, mark person fields `isPersonalData` so the Data Privacy tool can erase later.

### Pitfall 14: Browser/cache after metadata change
REST controllers rebuild server caches, but the UI needs a hard refresh to pick up layouts/metadata; a user session open during the sync may show stale tabs.

## Code Examples

### Client auth headers (Pattern 1)
```js
// Source: espocrm@10.0.8 Core/Authentication/Logins/ApiKey.php (X-Api-Key); docs.espocrm.com/development/api/ (Espo-Authorization)
const headers = auth.kind === 'apikey'
  ? { 'X-Api-Key': auth.apiKey, Accept: 'application/json' }
  : { 'Espo-Authorization': Buffer.from(`${auth.user}:${auth.secret}`).toString('base64'), Accept: 'application/json' }
// redirect: 'error', AbortSignal.timeout(120_000) for admin calls (mirror infra/chatwoot/lib/client.mjs)
```

### Existence check + create/update for a field (Pattern 2)
```js
// Source: espocrm@10.0.8 Controllers/Metadata.php getActionGet; Controllers/FieldManager.php
const key = `entityDefs.${scope}.fields.${finalName}`
const have = await admin.get(`/Metadata/action/get?key=${encodeURIComponent(key)}`) // null if absent
if (have == null) await admin.post(`/Admin/fieldManager/${scope}`, { name: baseName, ...spec })
else if (!subsetEqual(permittedParamsOnly(spec), have)) await admin.put(`/Admin/fieldManager/${scope}/${finalName}`, spec)
// finalName = isCustomScope(scope) ? baseName : 'c' + baseName[0].toUpperCase() + baseName.slice(1)
```

### Entity and relationship creation (Pattern 2)
```js
await admin.post('/EntityManager/action/createEntity', { name: 'Booking', type: 'Base', labelSingular: 'Booking', labelPlural: 'Bookings', stream: false })
// -> { name: 'CBooking' }
await admin.post('/EntityManager/action/createLink', {
  linkType: 'manyToOne', entity: 'CBooking', link: 'contact', entityForeign: 'Contact', linkForeign: 'bookings',
  label: 'Contact', labelForeign: 'Bookings',
}) // Contact side is created as `cBookings`
```

### Contact lookup / pure normalisation (Pattern 6)
```js
export const normalizeEmail = (e) => String(e ?? '').trim().toLowerCase()
export const isAbandonedCheckout = (r) =>
  r.status === 'unpaid' && r.booking_source === 'online' && !r.payment_link_id
// GET /api/v1/Contact?select=id,emailAddress,accountId&maxSize=200&offset=N&orderBy=createdAt
```

### Role create/update by name (Pattern 8)
```js
const roles = (await admin.get('/Role?select=id,name&maxSize=200')).list
const hit = roles.find(r => r.name === spec.name)
hit ? await admin.put(`/Role/${hit.id}`, spec) : await admin.post('/Role', spec) // only when subsetEqual fails
```

### Live ACL probe with a throw-away API user (Validation)
```js
// admin creates { type: 'api', userName, authMethod: 'ApiKey', rolesIds: [roleId] }, reads apiKey from the create response into memory only,
// asserts: GET /Opportunity -> 403 ; GET /Account/<id> lacks cCommissionPercent ; PUT /CBooking/<id> -> 403 ; then DELETE /User/<id>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single fixed Opportunity stage list | Optional multiple pipelines (Pipeline/PipelineStage entities, opt-in `pipelines` scope flag) | 10.0.0 (2026-07-02) | Not needed here; leaving it off keeps `stage` an ordinary enum |
| Cron-only scheduled jobs | `daemon.php` runner loops `cron.php` more often than once a minute (the `daemon` container) | 8.x+ | Email fetch/reminders work without host cron; websocket container optional |
| Admin config by UI only | `bin/command config:get/set` CLI + REST Admin endpoints | 10.0.0 | CLI is the way for system-only keys (e.g. `authApiUserLogDisabled`) |
| Record access "restrict links" loose | "Restrict access to disabled links" | 10.0.0 | Disabled scopes (Dispatcher without Opportunity) hide related panels cleanly `[CITED: 10.0.0 release notes]` |

**Deprecated/outdated:** SelectManager support removed in 10.0 (irrelevant: no PHP customisation); `Espo.ui`/`Espo.utils` removed (irrelevant); services as popup notifications removed (irrelevant).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `probabilityMap` values (10/20/40/60/80/100/0) and `style` choices | Pattern 3 | Cosmetic forecasting numbers; owner edits in UI |
| A2 | Payment-method inference from `payment_intent_id`/`payment_link_id`/`invoice_number`/`booking_source` | Pitfall 11, Pattern 5 | Wrong labels on the Booking list; fixable by re-running the backfill with a corrected rule |
| A3 | Abandoned checkout = `status='unpaid' AND booking_source='online' AND payment_link_id IS NULL` | Pattern 6 | Real bookings dropped or ghosts imported; verify with counts before the live run |
| A4 | Hostinger Sent/Inbox folder names and that Hostinger SMTP DKIM/SPF are already valid | Pattern 9, Pitfall 9 | Sent mail not stored or lands in spam; owner checks in UI |
| A5 | `Preferences.defaultRemindersTask` payload shape `[{"type":"Email","seconds":3600}]` | Pattern 10 | Defaults not applied; owner sets reminders per task manually |
| A6 | Field-level `read:"no"` on `cContractFile` also blocks downloading the attachment | Pattern 8 | Dispatcher could fetch a contract via attachment URL; `verify-acl.mjs` and UAT must test it; fallback: keep contract files in a Sales-only `Document` folder |
| A7 | Bookings volume is small enough (low thousands) for a sequential backfill within one session | Pattern 6 | Long run; add batching/resume |
| A8 | Owner will accept removing the four stock Opportunity stages and four stock Account types when unused | Pattern 3 | Owner may prefer to keep them; make `retire` empty |
| A9 | Optional Email `beforeSave` formula can attach inbound mail to the single open Opportunity of the Account | Pattern 9, Open Q 7 | Wrong attachment; keep it optional, UAT only |
| A10 | Chatwoot agents API behaves as the swagger shows on the self-hosted CE build (`role: agent|administrator`) | Pattern 8 | Runbook instructs UI steps instead |

## Open Questions

1. **How is the config identity provisioned?**
   - Known: `prestigo-admin` has TOTP; API type cannot administer; the Phase 76 runbook's curl-with-password approach no longer works for it.
   - Unclear: owner appetite for a second admin account on a public host.
   - Recommendation: owner creates `prestigo-config` (Admin, no 2FA, 32+ char password) and `prestigo-sync` (API key) in the UI as a `checkpoint:human-action`; deactivate `prestigo-config` after the configuration session. Supported fallback: `--totp` for `prestigo-admin`.

2. **Is the one-time VPS overlay step (unique index) acceptable?**
   - Known: REST cannot set `unique`; overlay + rebuild is a single file copy (`docker compose exec app ...`) and restic covers the volume.
   - Recommendation: do it (D-07 reversibility is "costly"); keep lookup-before-write plus `--audit` as defence in depth.

3. **Booking deep link**
   - Known: no URL opens one booking; default horizon hides past ones.
   - Recommendation: add a tiny, tested change in `components/admin/BookingsTable.tsx` to seed `search` and `horizon=all` from `?search=` (security-reviewed, no new strings); else store the list URL.

4. **Exact abandoned-checkout predicate and row counts**
   - Known: predicate in Pattern 6 matches the code paths read.
   - Unclear: volume, and whether any legacy `unpaid` rows lack `booking_source`.
   - Recommendation: first export run is `--dry-run` printing counts per status/source; owner sanity-checks before writing.

5. **Include `pending` quote rows?** Recommendation: include (they are customer requests with history value); label status "pending".

6. **Retire stock enum values?** Recommendation: retire only unused stock values of `Account.type` and `Opportunity.stage` via an explicit `retire` list; owner may veto.

7. **D-13 "open Opportunities" clause**
   - Known: native parent resolves to Account (or Contact); Opportunity only through reply threading or manual Parent.
   - Recommendation: document the practice (compose from the Opportunity); treat an `Email` `beforeSave` formula (`POST /EntityManager/action/formula`) as an optional stretch behind UAT.

8. **Does Dispatcher get read access to Account?** D-15 lists Contacts + Booking history; the Contact's Account name and the Account's Booking panel need Account read with commercial fields hidden. Recommendation: Account read-only with `fieldData` hiding all `commercial:true` fields.

9. **Chatwoot role mirror depth:** runbook-only, or also an `agents` resource in `infra/chatwoot/sync.mjs`? Recommendation: runbook + one empty `operators.json` and a no-op-when-empty resource, tested with the existing fake.

10. **`fetchSince` for roman@:** go-live date vs. earlier history. Owner decision at the mailbox step.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All infra scripts, vitest | ✓ | v24.14.1 | - |
| vitest | Tests | ✓ | ^4.1.1 (package.json) | - |
| EspoCRM 10.0.8 at `crm.rideprestigo.com` | Sync, backfill, UAT | ✓ (Phase 76 live; not probed this session) | 10.0.8 | - |
| `~/.config/prestigo/espocrm-api.env` | Sync/backfill auth | ✗ (only `chatwoot-api.env`, `telegram-chat-bot.env` exist) | - | Owner checkpoint creates it; no live GET could be done in research |
| SSH to `prestigo-vps` (host `prestigo-vps` in `~/.ssh/config`) | Overlay step, `config:set`, log checks | ✓ configured; blocked in auto mode | - | Owner runs the 3 commands from the runbook |
| Supabase MCP (`execute_sql`) | Booking export | ✓ per memory (session tool) | - | Owner-created key file + direct mode |
| Hostinger roman@ mailbox | Mail integration | ✓ (reserved Phase 77) | - | - |
| Resend SMTP relay | Reminder email | ✓ (Phase 76 step 7) | - | - |
| `gsd-tools` research seams / npm registry | Package legitimacy | n/a | - | No packages added |

**Missing dependencies with no fallback:** none blocking planning.
**Missing dependencies with fallback:** the env file (owner step), SSH in auto mode (owner allow-rules or manual).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.1 `[VERIFIED: package.json line 75]` (default env jsdom; infra tests start with `// @vitest-environment node`, as `tests/chatwoot-sync.test.ts` does) |
| Config file | `vitest.config.ts` (globals true, alias `@`) |
| Quick run command | `npx vitest run tests/espocrm-*.test.ts tests/crm-runbook.test.ts` |
| Full suite command | `npx vitest run` (~90 s) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CRM-01 | Account.type merge keeps owner-added values and renamed labels; retire only unused stock values; second run `create=0 update=0` | unit (fake EspoCRM) | `npx vitest run tests/espocrm-sync.test.ts -t enum` | ❌ Wave 0 |
| CRM-01 | Candidate scan excludes free-mail, groups by domain/company_name, never creates without `confirm:true` | unit | `npx vitest run tests/espocrm-candidates.test.ts` | ❌ Wave 0 |
| CRM-02 | stage options/probabilityMap/style consistent; `Closed Won`/`Closed Lost` retained; 7 labels per D-01 | unit (config invariants) | `npx vitest run tests/espocrm-sync.test.ts -t stage` | ❌ Wave 0 |
| CRM-02 | Live: Kanban shows 6 columns (Lost hidden), a Task with Email reminder arrives from notifications@ | manual UAT | owner checklist in runbook | manual (needs live Resend + browser) |
| CRM-03 | `rowToBooking` mapping (status/source/vehicle enums verbatim, amount fallback via 0.04, pickup datetime, payment-method rule); abandoned exclusion; Contact key normalisation | unit | `npx vitest run tests/espocrm-backfill.test.ts` | ❌ Wave 0 |
| CRM-03 | Backfill idempotent against fake: run 1 create=N, run 2 create=0 update=0; owner-set `accountId` never overwritten; dry-run writes nothing and prints counts only | unit (fake) | `npx vitest run tests/espocrm-backfill.test.ts -t idempotent` | ❌ Wave 0 |
| CRM-03 | CZK constants equal `lib/currency.ts` | unit | `npx vitest run tests/espocrm-backfill.test.ts -t currency` | ❌ Wave 0 |
| CRM-03 | Live: unique index rejects duplicate `supabaseBookingId`; Account panel lists contact bookings; `PUT /CBooking` as Dispatcher is 403 | live script | `node infra/espocrm/verify-acl.mjs` (+ `backfill.mjs --audit`) | ❌ Wave 0 |
| CRM-04 | Runbook documents Personal account (not Group), no Chatwoot connection, Skip filter, fetchSince; no secret in docs | unit (doc guard) | `npx vitest run tests/crm-runbook.test.ts` | ❌ Wave 0 |
| CRM-04 | Live: send/receive with a known Contact attaches to Account/Contact; unknown sender stays unlinked; reply to a mail sent from an Opportunity attaches to it | manual UAT | owner checklist | manual (needs the mailbox password and real mail) |
| CRM-05 | roles.json invariants: Dispatcher has no Opportunity/CPartnerRate/commercial fields; every `commercial:true` field is hidden for Dispatcher; Booking is create/edit/delete=no for both human roles; Sync role is the only non-admin writer | unit | `npx vitest run tests/espocrm-roles.test.ts` | ❌ Wave 0 |
| CRM-05 | Live ACL probe per role via temp API user | live script | `node infra/espocrm/verify-acl.mjs` | ❌ Wave 0 |
| All | Client never prints key/password/TOTP; redirect refused; 401 aborts without retry | unit | `npx vitest run tests/espocrm-sync.test.ts -t client` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/espocrm-*.test.ts tests/crm-runbook.test.ts`
- **Per wave merge:** `npx vitest run` plus `npx tsc --noEmit` (baseline 8 old errors) and `npx eslint --quiet <changed files>`; `tests/infra-vps-isolation-guard.test.ts` must still pass
- **Phase gate:** full suite green, `sync.mjs` second live run prints `create=0 update=0` for every resource, `verify-acl.mjs` 0 failures, then `/gsd-verify-work` (UAT items above)

### Wave 0 Gaps
- [ ] `tests/espocrm-sync.test.ts` - fake EspoCRM (metadata map, field/entity/link/role/settings handlers, request log, admin-only enforcement) mirroring `createFakeChatwoot`
- [ ] `tests/espocrm-backfill.test.ts` plus a synthetic export fixture (fake names/emails only) covering unpaid/online, unpaid/manual with link, quote pending, gnet, round trip, null `amount_eur`
- [ ] `tests/espocrm-candidates.test.ts`, `tests/espocrm-roles.test.ts`, `tests/crm-runbook.test.ts`
- [ ] Shared `tests/helpers/fake-espocrm.ts` (or inline) so sync, backfill and roles tests reuse one fake
- [ ] No framework install needed

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json` (key absent), so this section applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Admin service user with long random password; owner admin keeps TOTP; API key for data; no retry on 401; deactivate config user when idle |
| V3 Session Management | yes | Token exchange (`GET /App/user`) instead of re-sending the password; tokens held in memory only |
| V4 Access Control | yes | Role ACL + field-level `fieldData`; Booking create/edit/delete=no for humans; `verify-acl.mjs` proves it for every role |
| V5 Input Validation | yes | Validate JSON specs and export rows before sending; EspoCRM validates server-side; strip control chars; cap string lengths to field `maxLength` |
| V6 Cryptography | yes | No hand-rolled crypto; TLS to Caddy; secrets in mode-600 files; restic already encrypts backups |
| V8 Data Protection | yes | PII (names, emails, phones, flights) only in EspoCRM and git-ignored `.work/` files; counts-only logs; mark `isPersonalData`; GDPR-02 policy later |
| V14 Configuration | yes | No secrets in repo; `.gitignore` for `.work/`; pre-commit secret scan; pinned image unchanged |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Admin password for the CRM stored on the workstation | Elevation of Privilege | Separate service admin, file mode 600, idle deactivation, never in argv/logs; redirect refused so the header cannot be forwarded |
| Brute force on a public login endpoint | Spoofing | EspoCRM failed-attempt limits (system config), owner TOTP, Caddy exposure unchanged (D-17); script never retries failed auth |
| API key leaked via create response/echo | Information Disclosure | Read key into memory/file only, redact in error bodies, rotate with `POST /UserSecurity/apiKey/generate` if ever shown (app-deploy.md step 8) |
| Dispatcher reads commercial terms (rates, commission, contract) | Information Disclosure | Scope `false` for CPartnerRate/Opportunity, `fieldData` read:no on commercial fields, live probe; attachment-download check (A6) |
| Booking tampered in the CRM | Tampering | Create/edit/delete=no on CBooking for human roles; sync role is the single writer; owner admin documented as exception |
| PII in export/candidate files or logs | Information Disclosure | `.work/` git-ignored, delete after run, logs print counts only; pre-commit scan stays on |
| Mailbox password exposure | Information Disclosure | Owner types it in the UI; Claude only reads connection status; password field is write-only in API output |
| Duplicate/ghost bookings from retries | Tampering/Repudiation | Unique index on `supabaseBookingId` + lookup-before-write + audit mode |
| Mail loop (system mail refetched) | Denial of Service | Skip filter for `notifications@`; no auto-reply configured on the Personal account |
| Header smuggling by proxy (underscore headers dropped as seen with Chatwoot) | Spoofing | EspoCRM headers are hyphenated (`X-Api-Key`, `Espo-Authorization`); verify once through the real Caddy URL |

## Sources

### Primary (HIGH confidence)
- espocrm/espocrm tag `10.0.8`, shallow-cloned and read this session: `application/Espo/Controllers/{FieldManager,EntityManager,Admin,Layout,Settings,Metadata}.php`, `Entities/User.php`, `Tools/FieldManager/FieldManager.php`, `Tools/EntityManager/{EntityManager,NameUtil,CreateParams}.php`, `Tools/LinkManager/LinkManager.php`, `Core/Record/Service.php`, `Core/AclManager.php`, `Core/Acl/GlobalRestriction.php`, `Core/Acl/Table/DefaultTable.php`, `Core/Authentication/{Authentication.php,Logins/ApiKey.php}`, `Core/Mail/Importer/DefaultParentFinder.php`, `Core/ApplicationRunners/Daemon.php`, `Core/Utils/Metadata/AdditionalBuilder/{Pipelines,DeleteIdField}.php`, `Modules/Crm/Tools/Activities/Service.php`, `Resources/routes.json`, `Resources/metadata/{entityDefs,scopes,app/scheduledJobs}.json`, `Modules/Crm/Resources/metadata/{entityDefs,scopes,logicDefs,clientDefs,app/scheduledJobs}`, `client/src/views/role/record/table.js`
- GitHub releases API for espocrm/espocrm (10.0.0 notes, 10.0.9) and chatwoot/chatwoot `swagger/definitions/request/agent/create_payload.yml`
- This repo: `infra/vps/espocrm/compose.yml`, `infra/vps/runbooks/{app-deploy,backup-restore,upgrade,chatwoot-channels,restore-drill}.md`, `infra/chatwoot/{sync.mjs,lib/client.mjs,teams.json}`, `tests/{chatwoot-sync,infra-vps-isolation-guard,whatsapp-runbook}.test.ts`, `supabase/migrations/{039,041,044,047,050,051,052,053,056,062,063}`, `types/{booking.ts,database.types.ts}`, `lib/{supabase.ts,currency.ts,booking-reference.ts}`, `app/api/admin/bookings/route.ts`, `app/api/admin/bookings/[id]/payment-link/route.ts`, `app/api/admin/accounts/[id]/route.ts`, `components/admin/BookingsTable.tsx`, `middleware.ts`, `.planning/phases/76-vps-infrastructure/76-05-SUMMARY.md`

### Secondary (MEDIUM confidence)
- docs.espocrm.com/development/api/ (auth headers, Basic not recommended, OpenAPI), docs.espocrm.com/administration/emails/ (personal vs group accounts, cron requirement), docs.espocrm.com/user-guide/emails/ (relating emails, Sent folder import)
- Hostinger support pages (IMAP/SMTP host and ports), via web search
- Chatwoot help centre / pricing page (custom roles are not in Community Edition), via web search

### Tertiary (LOW confidence)
- None relied on; remaining unknowns are in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; all primitives read from source.
- Architecture (admin vs API identity, REST coverage, overlay for unique index, ACL format): HIGH - verified in 10.0.8 code; live behaviour not exercised (no credentials, no write calls made).
- Pitfalls: MEDIUM-HIGH - code-derived; mailbox/folder specifics and attachment ACL are `[ASSUMED]` pending UAT.

**Research date:** 2026-10-11
**Valid until:** 2026-11-10 (EspoCRM patch releases are frequent; re-check routes/params if the pinned image is bumped to 10.0.9+)
