# Phase 66: Driver Trip Portal — Permanent Link & Trip Sheet - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-31
**Phase:** 66-driver-trip-portal-permanent-link-trip-sheet
**Areas discussed:** Trip sheet content, Link delivery, Invalid-link behavior, Backfill (+ "mini-app" framing)

---

## Framing — "mini-app by link"

User stated the trip sheet "should be like a mini-app that works by link." Captured
as D-09 (app-shell page, not throwaway static render) with interactive features
(status marking, notes) held in Phase 67 to avoid scope creep.

---

## Trip Sheet Content & Presentation

### Language
| Option | Description | Selected |
|--------|-------------|----------|
| Bilingual CZ + EN | Field labels in both languages | |
| Czech only | Optimized for police | |
| English only | Universal for drivers | ✓ |

**User's choice:** English only.

### Header / branding
| Option | Description | Selected |
|--------|-------------|----------|
| Logo + title | Prestigo logo + "Trip Sheet" + booking ref | ✓ |
| Minimal, no logo | Data only | |

**User's choice:** Logo + title — **plus** add vehicle and driver data to the sheet (D-06).
**Notes:** "1+данные машины и водителя".

### Map vs text
| Option | Description | Selected |
|--------|-------------|----------|
| Text + Maps link | Addresses + "Open in Maps" link | |
| Embedded map | Map embedded on page | ✓ |
| Text only | No map | |

**User's choice:** Embedded map.
**Notes:** Flagged constraint — embedded map uses the shared Google Maps key; Google attribution must not be hidden (ToS/key-suspension risk).

---

## Link Delivery

| Option | Description | Selected |
|--------|-------------|----------|
| Email + admin | Link in assignment email + "copy link" in admin | ✓ |
| Email only | Link only in assignment email | |
| Admin only | Link only in admin for manual send | |

**User's choice:** Email + admin. Accept/decline flow unchanged (DTRIP-07).

---

## Invalid-Link Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Neutral placeholder | "No longer active", no booking data, enumeration-safe | ✓ |
| Reason without data | Short cause ("Trip completed" / "Reassigned") | |

**User's choice:** Neutral placeholder.

---

## Backfill

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, for active | Migration backfills trip_token for existing non-terminal assignments | ✓ |
| New only | Token only on assignments created after deploy | |

**User's choice:** Yes, for active assignments.

---

## Claude's Discretion

- URL/route shape (leaning path-based `/driver/trip/[token]`).
- Server-read vs API-endpoint data load behind the app shell.
- Exact embedded-map implementation (static vs interactive), subject to the Google Maps constraint.

## Deferred Ideas

- Status marking, trip note/feedback, admin live visibility — Phase 67 (DTRIP-03/04/05/06).
- GPS/geolocation, push/SMS, GNet trip-progress push — future (DTRIP-FUT-*).
