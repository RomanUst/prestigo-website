# CRM operator runbook (EspoCRM + Chatwoot)

How to run the CRM at `https://crm.rideprestigo.com` and how its people map onto
Chatwoot at `https://chat.rideprestigo.com`. Phase 80 (CRM-05, D-15, D-23, D-11, D-24).
Everything that configures the CRM is code under `infra/espocrm/`; this document is the
checklist for the humans around it. It carries no secret and no customer data. Companion
runbooks: `chatwoot-channels.md` (mailboxes and the one-mailbox rule), `backup-restore.md`
(what is backed up and how to restore it), `app-deploy.md` (how the CRM was installed).

## Systems and identities

EspoCRM has four credentials, each with one job. Secrets reach the workstation only through the owner:
the owner types or pastes them into files under `~/.config/prestigo/` (mode 600, git-ignored, never
committed); nobody puts a secret on a command line, in a chat, or in this repository.

| Identity | Type | Credential lives in | Used for |
|----------|------|---------------------|----------|
| prestigo-admin | Administrator with TOTP | the browser only | the owner's own login, the roman@rideprestigo.com mailbox, reminders |
| prestigo-config | Administrator, no 2FA | `~/.config/prestigo/espocrm-config.env` | `sync.mjs`, `overlay.mjs`, `inspect.mjs`, `verify-acl.mjs` (metadata, roles, settings, mail config, read-only counts) |
| prestigo-sync | API user holding the Sync writer role | `~/.config/prestigo/espocrm-sync.env` | `backfill.mjs` and `seed-accounts.mjs` (writes of Contacts, Accounts, CBooking records) |
| system mail | group account in EspoCRM, Resend SMTP | `~/.config/prestigo/espocrm-smtp.env` | read only by the `mail` resource of `sync.mjs` |

- `espocrm-config.env` holds `ESPOCRM_BASE_URL` (https only), `ESPOCRM_ADMIN_USER` and `ESPOCRM_ADMIN_PASSWORD`;
  `espocrm-sync.env` holds `ESPOCRM_BASE_URL` and `ESPOCRM_API_KEY`. An environment variable of the same name overrides the file.
- **prestigo-config has no 2FA**, so deactivate it in Administration -> Users when no sync is running and reactivate it
  before the next one. prestigo-admin keeps its TOTP and is never used by a script.
- **Never retry after a 401.** EspoCRM bans the source IP after repeated failed logins. The client logs in exactly once,
  stops itself on the first 401 and refuses later calls without touching the network. Fix the credential first, then run once more.
- The API key must be printable ASCII; the client rejects a key with a stray character (a Cyrillic letter typed on the
  wrong keyboard layout once broke it) with a clear error that never echoes the key.
- Chatwoot: the owner is the only administrator, signed in with a personal address. No agents exist yet (see the Chatwoot section).
- The `Restore Drill Canary` Account, role and user belong to the restore drill (`restore-drill.md`). Never edit, delete or seed them.

## Config as code

`infra/espocrm/` is the source of truth; `sync.mjs` applies it through the REST API. An edit made only in the CRM UI is drift
and the next sync overwrites it for every managed resource. Resources run in this order: settings, entities, links, fields,
enums, layouts, roles, mail.

```bash
node infra/espocrm/sync.mjs --dry-run             # always first: GET requests only, prints the plan
node infra/espocrm/sync.mjs                       # apply
node infra/espocrm/sync.mjs --only roles          # one or more resources, comma separated
node infra/espocrm/sync.mjs --only mail --set-smtp-password   # after rotating the Resend key
```

- Output is one line per resource, `{resource}: create=N update=N unchanged=N skipped=N removed=N`. Exit codes: 0 ok, 1 config
  error, 2 API error. **A second run right after a real run must show `create=0 update=0`.**
- Merge rules protect the owner's UI edits. Enums (Opportunity stage, Account type): declared values are added, owner-added
  values and owner renames are kept, and only unused stock values listed as retired are removed. Layouts on stock scopes
  (Contact, Account) only append what is missing; the CBooking layout is replaced from git.
- Roles are the exception: git wins for the three managed names (Dispatcher, Sales manager, Sync writer), so a scope removed
  from `roles.json` is removed live. Other roles are never touched. **Change a role in `infra/espocrm/roles.json`, never in the UI.**
- After a metadata change reload the browser (hard refresh), otherwise open tabs show stale layouts.
- Naming: custom entities get a `C` prefix (`CBooking`, `CPartnerRate`); fields added to stock scopes get a `c` prefix.

## Roles and permissions (EspoCRM)

Three roles are managed from code (`infra/espocrm/roles.json`, applied by `sync.mjs`, proven live by
`verify-acl.mjs`). The table below is checked by a test against `roles.json`: if a role or a scope rule
changes in the file, the test fails until this table is updated.

| Scope | Dispatcher | Sales manager | Sync writer |
|-------|------------|---------------|-------------|
| Contact | create no, read all, edit no, delete no | create yes, read all, edit all, delete no | create yes, read all, edit all, delete no |
| Account | create no, read all, edit no, delete no | create yes, read all, edit all, delete no | create yes, read all, edit all, delete no |
| CBooking | create no, read all, edit no, delete no | create no, read all, edit no, delete no | create yes, read all, edit all, delete no |
| Task | create yes, read own, edit own, delete own | create yes, read own, edit own, delete own | - |
| Opportunity | no access | create yes, read all, edit all, delete own | - |
| CPartnerRate | no access | create yes, read all, edit all, delete own | - |
| Lead | no access | create yes, read all, edit all, delete all | create yes, read all, edit all, delete all |
| Email | no access | create yes, read own, edit own, delete own | - |
| EmailAccountScope | no access | yes | - |
| User | - | - | read all |

Reading the table: `no access` means the scope is switched off for the role; `-` means the role file does not
mention the scope (the live CRM then answers 403 for the Sync writer; `verify-acl.mjs` proves it). `CBooking` is the
booking history record (the custom entity the CRM calls Booking). The Sync writer reads `User` and has assignment
permission `all` only so the website can assign each new Lead to the owner (D-13); without both EspoCRM answers 403.

The Dispatcher can read Accounts but not their commercial terms. These nine Account fields are hidden from the
Dispatcher (read and edit both `no`); the list is generated from the `commercial: true` flags in `fields.json`, so a new
commercial field cannot be forgotten, and a test compares this table with what `buildRoleSpecs` produces.

| Hidden Account field | Dispatcher |
|----------------------|------------|
| cCommissionPercent | hidden |
| cPaymentTerms | hidden |
| cInvoiceDueDays | hidden |
| cVatId | hidden |
| cReverseCharge | hidden |
| cContractDate | hidden |
| cContractValidUntil | hidden |
| cContractFile | hidden |
| cExpectedRidesPerMonth | hidden |

Rules behind the table:

- **Admin = owner only (D-15).** Administrator access belongs to `prestigo-admin`. Nobody else gets the admin type.
  The Dispatcher and Sales manager roles also have export and mass update switched off.
- **Booking history is read-only for people (D-09).** Both operator roles have `create no, edit no, delete no` on CBooking,
  so a booking can only be changed on the website admin; the sync overwrites the CRM copy. The one exception is the
  owner: an administrator can edit CBooking records, but the next backfill run overwrites such an edit
  (field ownership: the sync owns every CBooking field).
- **Money visibility (D-16, D-22).** Booking amounts are visible to both roles. Negotiated rates (CPartnerRate),
  Opportunities, commission, payment terms and contract data are visible only to the Sales manager and the owner.
  The contract file cannot be downloaded by a Dispatcher even through the attachment URL (proven live, 403).
- **Leads come from the website (Phase 81, D-22).** Contact forms, partner and corporate inquiries and bookings
  create Leads through the `prestigo-sync` API user. The Dispatcher has no Lead access at all (403), the Sales manager
  has full Lead access (create, read, edit, delete), and the Sync writer has full Lead access including delete, which
  the 90-day purge of abandoned-checkout Leads needs.
- **Sync writer** is a service role for the `prestigo-sync` API user: create and edit Account, Contact and CBooking
  (never delete them), full access to Lead including delete, and 403 on everything else.
- **One role per person.** EspoCRM combines several roles into the widest access, so give an operator exactly one.
  Roles use `all` and `own`, not `team`, so no EspoCRM team is needed.

## Chatwoot role mirror

Chatwoot Community Edition has only two roles, `agent` and `administrator`; custom roles are a paid feature. The mirror of the EspoCRM
roles is therefore **team membership plus inbox membership**: an agent sees only the inboxes they are a collaborator of, and the
team decides who is assigned what. D-23: this is documentation only. No agents exist yet (no hires), so nothing in `infra/chatwoot/`
creates agents; `sync.mjs` of Chatwoot only adds the owner to teams and inboxes and never removes anyone.

| EspoCRM role | Chatwoot role | Team (declared in `infra/chatwoot/teams.json`) | Inboxes |
|--------------|---------------|-----------------------------------------------|---------|
| Admin (owner) | administrator | Bookings and B2B | all |
| Dispatcher | agent | Bookings | the customer inboxes for booking conversations (Website, the two mail inboxes, WhatsApp, Telegram) |
| Sales manager | agent | B2B | the inboxes where partner and corporate enquiries arrive (at least Website and mail) |
| Sync writer | none | none | a service identity, no Chatwoot account |

- `teams.json` declares the teams as `Bookings` and `B2B`; Chatwoot stores and displays them lower-case (`bookings`, `b2b`).
  The channel rules assign new conversations to the Bookings team and to the owner.
- Chatwoot cannot hide data inside an inbox the way EspoCRM hides fields: an agent in an inbox sees every conversation in it.
  Keep a Dispatcher out of the B2B-only inboxes and give nobody an inbox they do not need.
- An agent's email is their personal work address. See "Adding an operator" for the addresses that must never be used.

## Adding an operator

Do both halves, then prove the result. Worked example: a new Dispatcher.

EspoCRM (as prestigo-admin, Administration -> Users):

1. Create the user: regular type (never administrator), the operator's own work email, a username in the house style.
   Let the operator set their own password; ask them to turn on 2FA in their profile.
2. Assign exactly one role: Dispatcher or Sales manager. No team is needed.
3. Task reminder mail goes to the user's email address, so that address must be filled in. In the operator's Preferences set the default
   reminders for Task (for example Popup at the due time and Email one hour before); only prestigo-admin gets these from `mail.json`.
   Reminder email leaves through the system mail account, which must be Active:
   `node infra/espocrm/inspect.mjs system-mail --expect-active` must print `system_smtp=present active=on use_smtp=on from_matches_settings=on`.
4. Sales manager only, and only if they will send partner mail from the CRM: they may add a Personal Email Account with their own mailbox.
   It is never roman@, info@ or bookings@ (those belong to the owner and to Chatwoot respectively).

Chatwoot (as administrator, Settings):

1. Agents -> Add agent. Role `agent`; administrator is the owner only. Use the operator's own address.
   **The agent email is never info@, bookings@ or roman@, and never any address that is connected to an inbox** (mail loop: Chatwoot mails
   each agent, the mail lands in the inbox as a new conversation, which mails the agent again). Check the address against the inbox list first:
   `node infra/chatwoot/inspect.mjs --status`. Reason and history: `chatwoot-channels.md`.
2. Teams -> add the agent to Bookings (Dispatcher) or B2B (Sales manager).
3. Inboxes -> each inbox -> Collaborators: add the agent to the inboxes listed in the mirror table, and to nothing else.
4. The agent signs in at `https://chat.rideprestigo.com` and installs the mobile app, which delivers push notifications.

Prove it:

```bash
node infra/espocrm/verify-acl.mjs          # acl: pass=N fail=0, exit 0
node infra/chatwoot/inspect.mjs --status   # inbox list and teams
```

`verify-acl.mjs` creates a throw-away API user per role, so it proves the roles, not the new person; open the CRM once as the new
user and confirm that the Dispatcher sees no Opportunities, no Rates and no commercial fields. An operator cannot be created by any script yet.

## Removing an operator

Reassign first, then switch off. Deactivate rather than delete so the history keeps its author.

EspoCRM:

1. Reassign the operator's open Tasks and Opportunities to another user (list views filtered by assigned user; a Task is visible only
   to the user it is assigned to and to the administrator, so do this as prestigo-admin).
2. If they had a Personal Email Account, set it inactive and delete it, so the CRM stops polling that mailbox.
3. Administration -> Users -> set the user inactive.

Chatwoot:

1. Reassign their open conversations to another agent or to the team (Conversations filtered by assignee).
2. Settings -> Agents -> remove the agent. Access is gone at once, team and inbox memberships go with it.

Then run `node infra/espocrm/verify-acl.mjs` (fail=0). If the person knew any shared credential, rotate it. The mailbox passwords of
info@ and bookings@ are entered by the owner only, so normally there is nothing to rotate.

## Sales mailbox (roman@)

`roman@rideprestigo.com` is the owner's sales mailbox. In EspoCRM it is a **Personal Email Account** assigned to `prestigo-admin`
(IMAP on `INBOX`, SMTP on, sent mail stored, **Fetch Since** is the go-live date 2026-10-16, so older mail is never imported).
The owner typed the mailbox password into the CRM; nobody else handles it. Hostinger servers are the same as in `chatwoot-channels.md`.

Rules (D-11, Phase 77 D-14):

- roman@ is a Personal Email Account, never a Group Email Account: a group account adds case and auto-reply handling and shared visibility.
- roman@ is connected to EspoCRM only. It is never connected to Chatwoot and never used as a Chatwoot agent email.
- No forwarder, no phone Mail app, no desktop client and no other IMAP or POP client on roman@. Hostinger webmail in a browser is fine.
- info@ and bookings@ are never connected to EspoCRM; they belong to Chatwoot. Cross-reference: `chatwoot-channels.md`, "One mailbox, one system".

How mail behaves (D-13):

- Mail from an unknown sender stays in the CRM inbox. No Contact or Lead is created from it.
- Mail from a known Contact attaches to the Contact's Account (the Contact's History panel still shows it); mail from an Account address attaches to the Account.
- **Send partner mail from the Opportunity (D-24).** Open the Opportunity and use Compose/Send Email there, so the partner's reply carries the
  reference and attaches to that Opportunity. Mail composed from a Contact attaches to the Contact and Account only; EspoCRM does not
  attach replies to an open Opportunity on its own.
- System mail from `notifications@rideprestigo.com` (task reminders) is moved by a personal filter into the owner's **Reminders** folder.
  The action is "Move to Folder", never Skip, so reminders stay visible. The owner created the folder in the UI (a folder created through the
  API would belong to the API user, not to the owner).
- Sender reputation: mail sent from the CRM leaves through Hostinger SMTP. SPF, DKIM (`hostingermail-a`) and DMARC (`p=none`) were checked and pass;
  the site's own mail goes through Resend. If a CRM mail lands in spam, re-run a mail-tester style check before changing DNS.

Checks (counts and booleans only, never an address or subject):

```bash
node infra/espocrm/inspect.mjs mailbox --expect-active   # email_account=active imap=on smtp=on store_sent=on chatwoot_inboxes_with_roman=0
node infra/espocrm/inspect.mjs email-parent --since 2026-10-16T00:00:00Z   # emails=N Account=N Contact=N Opportunity=N none=N
```

If the mailbox password changes at Hostinger, the owner re-enters it in the account in the CRM and runs "Test connection".

## Follow-ups, reminders and the pipeline

Follow-ups are Tasks with a due date, attached to the Opportunity, Account or Contact they are about (D-05). Everyone with a role can create Tasks;
a Task is visible to the user it is assigned to and to the administrator.

- **Reminders.** For `prestigo-admin`, `mail.json` sets the Task default: Popup at the due time and Email one hour before. Popup reminders appear in the CRM.
  Email reminders are sent by the job `SendEmailReminders` through the system mail account (`notifications@rideprestigo.com`, Resend). EspoCRM 10.0.8
  sends system mail only through an Active group account with SMTP on whose address equals the configured outbound address; if it is inactive every reminder
  fails with "No system SMTP settings". Check: `node infra/espocrm/inspect.mjs system-mail --expect-active`; jobs: `node infra/espocrm/inspect.mjs jobs`
  (`CheckEmailAccounts` and `SendEmailReminders` must be Active). After rotating the Resend key run `sync.mjs --only mail --set-smtp-password`.
- **Pipeline (Opportunity stage, D-01).** New, First contact, Meeting / call, Rate sent, Trial ride, Partner (Won), Lost. The stored values of the last two are
  `Closed Won` and `Closed Lost` (EspoCRM code depends on them); only their labels differ. Use the Kanban view of Opportunities; Lost is hidden there by the stock ignore list.
- **Account type (D-02):** Hotel, Travel agency / DMC, Corporate, Embassy / event agency, Other. The owner may add values in the Entity Manager; the sync keeps them.
- **Negotiated rates** live in CPartnerRate records under the Account. They are reference data only and do not change prices on the website.

## Booking history mirror

CBooking is a read-only copy of the Supabase `bookings` table, one record per row, keyed by `supabaseBookingId` (unique, see the overlay section).
The website admin is where bookings are edited; people cannot edit CBooking (roles), and the owner can edit CBooking records only as administrator,
which is an exception: the next backfill run overwrites such an edit because the sync owns every field. Phase 82 will continue updating the same records.

What is included (D-21): all bookings, including cancelled ones and pending quotes, except abandoned checkout attempts (unpaid, online, no payment link), which become Leads in Phase 81.
A Contact is keyed by the trimmed, lower-cased email; a CBooking links to its Contact and, through the Contact, to the Account.

Run order (identity prestigo-sync; the export is page files under `infra/espocrm/.work/export`, git-ignored, with customer data):

```bash
node infra/espocrm/backfill.mjs --dry-run         # counts only, compare with the expected numbers
node infra/espocrm/backfill.mjs --limit 1         # one booking as a smoke test
node infra/espocrm/backfill.mjs                   # full run
node infra/espocrm/backfill.mjs                   # repeat: create=0 update=0 (see phone note)
node infra/espocrm/backfill.mjs --audit           # records=N duplicates=0, exit 3 when a key is duplicated
node infra/espocrm/backfill.mjs --relink          # after Contacts were linked to Accounts: sets CBooking.account from the Contact
node infra/espocrm/inspect.mjs count CBooking     # also: count Contact, and count CBooking contactId= for bookings without a Contact
```

Result of the live backfill (plan 80-12): CBooking=56, Contact=29, bookings without a Contact=0, audit duplicates=0.

Field ownership: for an existing Contact the sync never overwrites account, title, description or names; the phone number is written only when the Contact has none.
Accounts are never written by the sync.

Phone rules operators should know (the Contact gets a normalised number, the booking keeps what the customer typed):

- Spaces, dashes, dots and brackets are removed; a leading 00 becomes a plus sign; a number already in E.164 form is kept.
- Exactly nine digits become a Czech number with +420; eleven or twelve digits that start with a known country code get a plus sign.
- Anything else (ten digits, empty, text) is left off the Contact; the original number is still on the booking in the website admin.
- One Contact has no phone because EspoCRM itself rejects its number. That is why a repeat run reports `contacts update=1` while writing nothing; it is expected, not an error.

PII rules: the export and candidate files hold names, emails and phone numbers. They live only in `infra/espocrm/.work/`, logs print counts only, and the files are deleted after use.

## Unique index overlay

EspoCRM's API cannot declare a unique index, so one metadata overlay (`infra/espocrm/overlay/CBooking.entityDefs.json`) is merged into the custom CBooking
definition on the VPS and EspoCRM's own rebuild creates the index `supabaseBookingIdDeleteId`. Nothing writes SQL. The index is live; the commands below are needed
only to re-apply it, for example after a restore where the custom volume (`espocrm_app_custom`) was not restored. VPS steps are owner-approved
(allow-rules for `ssh prestigo-vps`), one command at a time, backup first.

```bash
node infra/espocrm/overlay.mjs precheck           # cbooking_total=N; exit 3 when duplicate keys exist
ssh prestigo-vps 'sudo systemctl start prestigo-backup.service && systemctl show -p Result prestigo-backup.service'   # S1: Result=success
ssh prestigo-vps 'cd /opt/prestigo/espocrm && sudo docker compose exec -T app cat custom/Espo/Custom/Resources/metadata/entityDefs/CBooking.json' > infra/espocrm/.work/CBooking.current.json   # S2
node infra/espocrm/overlay.mjs check infra/espocrm/.work/CBooking.current.json   # exit 0: overlay present, exit 3: missing
node infra/espocrm/overlay.mjs merge infra/espocrm/.work/CBooking.current.json infra/espocrm/overlay/CBooking.entityDefs.json --out infra/espocrm/.work/CBooking.merged.json
scp infra/espocrm/.work/CBooking.merged.json prestigo-vps:/tmp/CBooking.merged.json   # S3
ssh prestigo-vps 'cd /opt/prestigo/espocrm && sudo docker compose cp /tmp/CBooking.merged.json app:/var/www/html/custom/Espo/Custom/Resources/metadata/entityDefs/CBooking.json && sudo docker compose exec -T app chown www-data:www-data custom/Espo/Custom/Resources/metadata/entityDefs/CBooking.json && rm /tmp/CBooking.merged.json'   # S4
node infra/espocrm/overlay.mjs rebuild            # rebuild: done
node infra/espocrm/overlay.mjs probe-unique       # unique=enforced (exit 0) or unique=absent (exit 3)
```

Rollback if the rebuild fails: repeat S3 and S4 with `CBooking.current.json`, then `overlay.mjs rebuild`. The fetched copy is the rollback file; keep it until the probe passes.

## Partner accounts seeding

Accounts are created from owner-confirmed candidates only (D-14); nothing is created automatically, and the `Restore Drill Canary` Account is out of every list.

1. `node infra/espocrm/account-candidates.mjs` reads the booking export (no network), proposes partner Accounts from corporate email domains and company names, and writes
   `infra/espocrm/.work/candidates.json` with every entry `confirm: false`. Its output shows names, domains and counts, never an email.
2. The owner confirms by editing the file: `confirm: true` and a type (Hotel, Agency, Corporate, Embassy, Other). Result of the first round: 5 of 6 confirmed; a placeholder source was rejected.
3. `node infra/espocrm/seed-accounts.mjs --dry-run`, check the counts against the confirmed list, then run it without the flag. Flags: `--dry-run` (GET requests only), `--candidates <file>` and `--input <export folder>` (defaults: `infra/espocrm/.work/candidates.json` and `infra/espocrm/.work/export`), `--delay-ms N`.
   It creates only the confirmed Accounts (an existing Account with the same name or website is reused, never changed) and links the Contacts that have no Account yet, by email domain or booking company name; a Contact matching two candidates is left alone and counted as ambiguous.
   Output is ids and counts only: `accounts: create=N existing=N` and `contacts: link=N already_linked=N ambiguous=N`. A second run must report `accounts: create=0` and `contacts: link=0`. First round: 5 Accounts, 5 Contacts linked.
4. `node infra/espocrm/backfill.mjs --relink` so the bookings show up on the new Accounts; a second `--relink` must report update=0.
5. Delete the working files (`infra/espocrm/.work/export`, `candidates.json`). A Dispatcher sees the Accounts but none of their commercial fields.

## Verification

Run these after any change to roles, mail, the model or an operator. All outputs are counts and statuses.

```bash
node infra/espocrm/sync.mjs --dry-run                          # summary: create=0 update=0 removed=0
node infra/espocrm/verify-acl.mjs                              # acl: pass=N fail=0 (it was 78/78 at go-live)
node infra/espocrm/inspect.mjs jobs                            # CheckEmailAccounts=Active, SendEmailReminders=Active
node infra/espocrm/inspect.mjs mailbox --expect-active
node infra/espocrm/inspect.mjs system-mail --expect-active
node infra/espocrm/backfill.mjs --audit                        # duplicates=0
node infra/espocrm/inspect.mjs count Account name=Restore Drill Canary   # count=1, the canary is untouched
node infra/chatwoot/inspect.mjs --status                       # inboxes and teams
```

Exit code 0 means the expectation held; 1 means it did not; 2 means an API error. On a 401 stop and fix the credential (see Systems and identities).

## Recovery

Backups (`backup-restore.md`): the nightly restic snapshot holds the EspoCRM database dump and the volumes `espocrm_app_data`, `espocrm_app_custom` and `espocrm_app_custom_client`
together, so a restored CRM never references a missing upload. Take a manual snapshot before any risky admin action (`sudo /opt/prestigo/scripts/backup.sh`).
A full restore on the production host is guarded by an interlock in `restore.sh`; follow `backup-restore.md` and `restore-drill.md`, never improvise.

After any restore:

1. Check that the overlay survived: fetch the CBooking definition (step S2 above) and run `overlay.mjs check`; if it exits 3 re-apply S3, S4 and the rebuild, then `probe-unique`.
2. Run `sync.mjs --dry-run`, then `verify-acl.mjs`, `inspect.mjs jobs`, `inspect.mjs mailbox` and `inspect.mjs system-mail`, and `backfill.mjs --audit` (see Verification).
3. If the system mail account is missing, `sync.mjs --only mail` recreates it, reading the password from `espocrm-smtp.env`
   (add `--set-smtp-password` to push the password to an account that already exists).

Other recoveries:

- **IP ban after failed logins.** Stop all scripts and do not retry; every further failed login prolongs the problem. The ban lifts by itself after the period configured in EspoCRM.
  Unblocking sooner is an owner-approved step on the VPS, never a guess at credentials. Then fix the credential and run once.
- **Auth log growth.** Every API-key call writes an auth log record. If the table grows large (a big backfill or the Phase 82 sync), switch it off; it is a system config key
  that the API cannot change:
  `ssh prestigo-vps 'cd /opt/prestigo/espocrm && sudo docker compose exec -T app bin/command config:set authApiUserLogDisabled true --type=bool'`.
- **Booking edited by hand.** An administrator's edit of a CBooking is overwritten by the next backfill run; fix the booking in the website admin instead.
- **Duplicate CBooking reported by `--audit`.** Do not delete by hand; stop and check the unique index with `overlay.mjs probe-unique`.
