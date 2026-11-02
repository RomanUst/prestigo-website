# Phase 84: Chatwoot Dashboard App - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-26
**Phase:** 84-chatwoot-dashboard-app
**Areas discussed:** Operator verification, What the panel shows, Payment link, Whose bookings

---

## Operator verification

| Option | Description | Selected |
|--------|-------------|----------|
| Operator's Chatwoot token | Pasted once; server validates via Chatwoot API + conversation access | ✓ |
| Shared secret in panel URL | Secret in Dashboard App URL; server resolves contact by conversation id | |
| Separate panel login | Magic link/password inside the iframe; fragile third-party cookies | |

| Option | Description | Selected |
|--------|-------------|----------|
| localStorage | Kept in the browser, sent only as a header to our API | ✓ |
| sessionStorage per session | Re-paste every session | |
| Exchange for short panel token | Server-issued signed token, own session mechanics | |

| Option | Description | Selected |
|--------|-------------|----------|
| Server fetches contact from Chatwoot by conversation id | Unforgeable, also proves access | ✓ |
| Trust postMessage email/phone | Token holder could look up any email | |

| Option | Description | Selected |
|--------|-------------|----------|
| Any agent with conversation access | Mirrors Chatwoot permissions | ✓ |
| Chatwoot administrators only | Stricter | |
| Allowlist in env | Explicit agent list | |

**User's choice:** all recommended options.

---

## What the panel shows

| Option | Description | Selected |
|--------|-------------|----------|
| All upcoming + 10 latest past | Counters header, "more"/admin link | ✓ |
| All bookings in one list | Long for B2B clients | |
| Upcoming + last past only | Minimal | |

Fields (multi-select): vehicle class + pax/luggage ✓, amount EUR ✓, driver + trip progress ✓, flight + customer notes ✓.

| Option | Description | Selected |
|--------|-------------|----------|
| English, like admin | No next-intl, light/dark | ✓ |
| Russian | Separate strings | |
| Agent's Chatwoot UI language | Two string sets | |

| Option | Description | Selected |
|--------|-------------|----------|
| "No bookings" + links | Searched identifiers, admin + EspoCRM Lead links | ✓ |
| Just "No bookings" | Minimal | |

---

## Payment link

| Option | Description | Selected |
|--------|-------------|----------|
| Copy existing link | New links only in /admin; panel read-only | ✓ |
| Create link from the panel | Violates PANEL-02 read-only | |
| Status only | No link shown | |

---

## Whose bookings

| Option | Description | Selected |
|--------|-------------|----------|
| Via Phase 82 identity | All linked emails/phones, shared phones excluded | ✓ |
| Exact contact email only | Misses second emails/phone-only contacts | |

| Option | Description | Selected |
|--------|-------------|----------|
| Booker email/phone only | Same key as sync/erasure | ✓ |
| Also passenger name/phone | Wider, risk of wrong matches | |

| Option | Description | Selected |
|--------|-------------|----------|
| Hint to add email/phone | No name search | ✓ |
| Manual search in panel | Turns panel into general search | |

---

## Claude's Discretion

Route paths, handshake details, Chatwoot endpoints for identity/access, cache TTL, rate limits, headers,
read-only RPC + guard test, token-entry UX, admin link targets, Dashboard App registration, CVE evidence recording.

## Deferred Ideas

- Generate payment link from the panel (requires PANEL-02 change; rest of 77 D-19)
- Manual booking search in the panel
- Passenger-based matching for agency bookings
