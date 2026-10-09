# Phase 80: EspoCRM Deployment + Core Entities - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-09
**Phase:** 80-espocrm-deployment-core-entities
**Areas discussed:** Pipeline and account types, Booking history, Sales mailbox, Seed data and roles

---

## Pipeline and account types

| Option | Description | Selected |
|--------|-------------|----------|
| 7 stages | New → First contact → Meeting/call → Rate sent → Trial ride → Partner / Lost | ✓ |
| 5 stages | New → In progress → Proposal → Won / Lost | |
| You decide | Claude proposes, owner edits JSON | |

**Account types:** Hotel, Travel agency / DMC, Corporate, Embassy / event agency — all selected; owner added "configurable when it doesn't fit" → Other + owner-added types (recommended option chosen in follow-up).
**Commercial fields:** commission/discount %, payment terms, contract, expected volume — all selected; owner added "negotiated price".
**Negotiated price storage:** options were rate table / text field / price-list file; owner answered "each client can have different prices" → interpreted as per-Account rate rows.
**Reminders:** CRM + email (selected) vs CRM + Telegram vs CRM only.

---

## Booking history

| Option | Description | Selected |
|--------|-------------|----------|
| One-time backfill now | Entity + re-runnable import of all past bookings in Phase 80 | ✓ |
| Structure only | Entity + test records; history arrives in Phase 82 | |

**Which bookings:** all except abandoned (selected) / only completed / everything.
**Linking:** by contact email (selected) / manual / you decide. Note: `customer_profiles.company_name` exists and is used as a hint (Claude corrected an earlier statement that no company field existed).
**Extra fields:** passenger name, payment method, flight + driver, source — all selected.

---

## Sales mailbox

| Option | Description | Selected |
|--------|-------------|----------|
| roman@ | Reserved for CRM in Phase 77 | ✓ |
| New sales@ | Shared mailbox on Hostinger | |
| Both | roman@ + sales@ | |

**Sending from CRM:** yes via mailbox SMTP (selected) / read-only.
**Unknown senders:** stay in inbox (selected) / auto-create lead.

---

## Seed data and roles

**Partners at start:** auto-pick + owner confirmation (selected) / owner's list / empty CRM.
**Roles:** Dispatcher + Sales manager (selected) / single Operator role.
**Money visibility:** booking amounts to all, rates/commission to sales only (selected) / all money admin-only.

## Claude's Discretion

Config-as-code layout, API auth, entity/field naming, layouts, backfill mechanics, UI language/currency defaults.

## Deferred Ideas

- PartnerRate driving real B2B pricing on the site (CRM-FUT-01).
- Privacy-policy wording for EspoCRM (GDPR-02).
