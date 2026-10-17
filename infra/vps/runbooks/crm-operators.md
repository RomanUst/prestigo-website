# CRM operator runbook (EspoCRM + Chatwoot)

How to run the CRM at `https://crm.rideprestigo.com` and how its people map onto
Chatwoot at `https://chat.rideprestigo.com`. Phase 80 (CRM-05, D-15, D-23, D-11, D-24).
Everything that configures the CRM is code under `infra/espocrm/`; this document is the
checklist for the humans around it. It carries no secret and no customer data.

## Systems and identities

Placeholder: the CRM has three identities plus the owner's own login, described in full below.

## Config as code

Placeholder: `infra/espocrm/sync.mjs` applies the declared model through the REST API.

## Roles and permissions (EspoCRM)

Three roles are managed from code (`infra/espocrm/roles.json`, applied by `sync.mjs`, proven live by
`verify-acl.mjs`). The table below is checked by a test against `roles.json`: if a role or a scope rule
changes in the file, the test fails until this table is updated. Change roles in `roles.json`, never in the UI.

| Scope | Dispatcher | Sales manager | Sync writer |
|-------|------------|---------------|-------------|
| Contact | create no, read all, edit no, delete no | create yes, read all, edit all, delete no | create yes, read all, edit all, delete no |
| Account | create no, read all, edit no, delete no | create yes, read all, edit all, delete no | create yes, read all, edit all, delete no |
| CBooking | create no, read all, edit no, delete no | create no, read all, edit no, delete no | create yes, read all, edit all, delete no |
| Task | create yes, read own, edit own, delete own | create yes, read own, edit own, delete own | - |
| Opportunity | no access | create yes, read all, edit all, delete own | - |
| CPartnerRate | no access | create yes, read all, edit all, delete own | - |
| Email | no access | create yes, read own, edit own, delete own | - |
| EmailAccountScope | no access | yes | - |

Reading the table: `no access` means the scope is switched off for the role; `-` means the role file does not
mention the scope (the live CRM then answers 403 for the Sync writer; `verify-acl.mjs` proves it). `CBooking` is the
booking history record (the custom entity the CRM calls Booking).

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
- **Leads are deliberately unset.** Neither role mentions Lead; Phase 81 decides who may see leads.
- **Sync writer** is a service role for the `prestigo-sync` API user: create and edit Account, Contact and CBooking,
  never delete, and 403 on everything else.

## Chatwoot role mirror

Placeholder: Chatwoot Community Edition only has agent and administrator, so the mirror is the teams Bookings and B2B plus inbox membership.

## Adding an operator

Placeholder: checklist for EspoCRM and Chatwoot.

## Removing an operator

Placeholder: checklist for EspoCRM and Chatwoot.

## Sales mailbox (roman@)

Placeholder: roman@rideprestigo.com is a Personal Email Account in EspoCRM only.

## Follow-ups, reminders and the pipeline

Placeholder: follow-ups are Tasks with due dates and reminders.

## Booking history mirror

Placeholder: CBooking records mirror Supabase bookings.

## Unique index overlay

Placeholder: the unique index on supabaseBookingId.

## Partner accounts seeding

Placeholder: accounts are created only from owner-confirmed candidates.

## Verification

Placeholder: how to prove the CRM is healthy.

## Recovery

Placeholder: how to restore and unblock.
