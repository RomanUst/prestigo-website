# Phase 81: Lead Capture (Site Forms → Supabase + EspoCRM) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-17
**Phase:** 81-lead-capture-site-forms-supabase-espocrm
**Areas discussed:** Abandoned checkouts & calculator, Booking lead (LEAD-06), Lead content & repeats, Retention & consent

---

## Abandoned checkouts & calculator

| Option | Description | Selected |
|--------|-------------|----------|
| Strike from phase | /calculator removed 2026-05-04, nothing to capture | ✓ |
| Strike + remove quote_leads/purge | Also delete dead table and cron purge | |

**User's choice:** Strike. **Notes:** First two prompts were unclear to the owner ("which calculator?"); clarified it is the old `/calculator` "Get instant quote" page removed in May 2026.

| Option | Description | Selected |
|--------|-------------|----------|
| Immediately at payment step | Lead with the unpaid row, follows booking | ✓ |
| Only when definitely abandoned | After N hours unpaid | |

| Option | Description | Selected |
|--------|-------------|----------|
| After pickup time | Live until pickup, then Dead | ✓ |
| 24 hours | Fixed timeout, daily cron | |
| Manual in CRM | Site never sets Dead | |

| Option | Description | Selected |
|--------|-------------|----------|
| No, CRM only | Lead appears in list | ✓ |
| EspoCRM Task call-back | Task + email reminder | |

---

## Booking lead (LEAD-06)

| Option | Description | Selected |
|--------|-------------|----------|
| One lead per booking | Own status per booking, honest conversion | ✓ |
| One lead per customer | First booking creates, later update | |

| Option | Description | Selected |
|--------|-------------|----------|
| Proposed mapping | unpaid→New, pending→In Process, confirmed..completed→Converted, cancelled/unpaid past pickup→Dead (paid-then-cancelled→Dead) | ✓ |
| Cancel after payment stays Converted | Same, but Converted is sticky | |

| Option | Description | Selected |
|--------|-------------|----------|
| Site only | Online, quotes, multi-day, round-trip | |
| Site + admin-created | Manual bookings too, GNet no | |
| All incl. GNet | Every source | |

**User's choice (free text):** "все + созданные в админке + созданные вручную (WhatsApp, телефон и т.д.)" → all bookings incl. admin-created and GNet.

| Option | Description | Selected |
|--------|-------------|----------|
| "Channel" field in admin | WhatsApp/Phone/Email/Partner/Other on manual form | ✓ |
| Single "Manual" source | No admin change | |

| Option | Description | Selected |
|--------|-------------|----------|
| No Contact on Converted — Phase 82 | Only status + ref + admin link | ✓ |
| Create Contact immediately | Pull part of Phase 82 here | |

---

## Lead content & repeats

| Option | Description | Selected |
|--------|-------------|----------|
| New lead per submission | One submission = one lead | ✓ |
| Update open lead | Append to open form lead | |

| Option | Description | Selected |
|--------|-------------|----------|
| Lead + "existing customer" mark | Link to existing Contact, no merge | ✓ |
| Plain lead | No check | |

| Option | Description | Selected |
|--------|-------------|----------|
| Company name only | No auto Account create/link | ✓ |
| Link on exact match | Name/domain exact match links | |

| Option | Description | Selected |
|--------|-------------|----------|
| Assign to owner | All leads to owner | ✓ |
| By team b2b/bookings | Team routing | |

---

## Retention & consent

| Option | Description | Selected |
|--------|-------------|----------|
| Indefinite until request | Erasure via Phase 82 | ✓ |
| 3 years after last contact | Auto-anonymize | |

| Option | Description | Selected |
|--------|-------------|----------|
| 90 days after Dead | Delete from EspoCRM | ✓ |
| 12 months | | |
| Indefinite | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Short line, no checkbox | Notice + privacy link, 7 locales | ✓ |
| No change | Rely on Phase 82 policy | |
| Consent checkbox | Explicit | |

| Option | Description | Selected |
|--------|-------------|----------|
| Don't store IP/UA | Minimization | ✓ |
| Store in Supabase only | For spam review | |

---

## Claude's Discretion

- Outbox/dispatcher/sweep design, cron placement, form lead source values, "existing customer" and itinerary modelling, Channel field defaults, forward-only (no historical lead backfill), Sync writer role Lead scope.

## Deferred Ideas

- Remove dead `quote_leads` table + purge.
- Historical backfill of past bookings as Leads.
