# Phase 58: Sign-in UI + Account Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-11
**Phase:** 58-sign-in-ui-account-dashboard
**Areas discussed:** My trips scope, Account structure, Corporate profile fields, Profile editing / saved passengers, Account header, Nav auth-state delivery

---

## My trips scope

| Option | Description | Selected |
|--------|-------------|----------|
| UI shell + empty state | Build "My trips" with empty state; real data + RLS = Phase 60; don't touch bookings/migrations | ✓ |
| Full live data now | Pull booking↔user_id linking + bookings RLS + history query into Phase 58 | |
| Shell + link new bookings | Empty-state UI now, but also start setting user_id on new bookings (ACCT-04) | |

**User's choice:** UI shell + empty state
**Notes:** Aligns with migration 045's explicit Phase 60 boundary for linking and bookings RLS.

---

## Account structure

| Option | Description | Selected |
|--------|-------------|----------|
| Separate routes | /account, /account/trips, /account/profile | ✓ |
| Single page with tabs | Everything on /account with tab switching, no URL change | |

**User's choice:** Separate routes
**Notes:** Cleaner URLs, scales, maps directly to header dropdown items.

---

## Corporate profile fields

| Option | Description | Selected |
|--------|-------------|----------|
| Add IČO/VAT | New migration: company_name + IČO + DIČ/VAT (defer cost-centre) | ✓ |
| company_name only | Keep 044 schema unchanged; defer all B2B fields | |
| Full set | company_name + IČO + VAT + cost-centre immediately | |

**User's choice:** Add IČO/VAT
**Notes:** "Basic corporate fields" per milestone; cost-centre and "book for a guest" deferred (the latter is a booking-time action → Phase 59).

---

## Profile editing / saved passengers

| Option | Description | Selected |
|--------|-------------|----------|
| Contacts + type + company | Name, phone, personal/corporate toggle, corp fields; email read-only; default passenger = the customer | |
| + separate saved passengers | Above plus a saved-passengers list (new table) | ✓ |
| Contacts only | Name + phone + corp fields, no saved-passengers concept | |

**User's choice:** + separate saved passengers
**Follow-up — saved passenger fields:**

| Option | Description | Selected |
|--------|-------------|----------|
| Name + phone + email | full_name, phone, email (optional) + default flag | |
| Name + phone only | full_name + phone, no email/default | |
| + notes/flight | Name + phone + email + free-text notes field | ✓ |

**Notes:** `saved_passengers` table with full_name, phone, email, notes, is_default, per-user RLS (migration 048).

---

## Account header

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown menu | Account dropdown: My trips / Profile / Sign out; guest sees "Sign in" | ✓ |
| Simple Account link | Guest "Sign in"; signed-in "Account" link → /account, no dropdown | |

**User's choice:** Dropdown menu

---

## Nav auth-state delivery

| Option | Description | Selected |
|--------|-------------|----------|
| Browser client in Nav | Nav stays client; createBrowserClient + onAuthStateChange; preserves static pages; brief flash possible | ✓ |
| Server wrapper + prop | Server parent reads getUser() and passes isLoggedIn prop; no flash but risks dynamic rendering of static pages | |
| Claude's discretion | Let researcher/planner choose, prioritising "don't break static/SEO" | |

**User's choice:** Browser client in Nav
**Notes:** Explicit priority on keeping marketing/static pages static for SEO/perf.

---

## Claude's Discretion

- Dropdown/menu markup, icons, copy, empty-state wording (UI-SPEC will refine).
- Shared `lib/supabase/client.ts` vs inline `createBrowserClient`.
- Server actions vs client mutations for profile/passenger writes.
- Single-default enforcement (partial unique index vs app logic).
- Form validation and field ordering on /account/profile.

## Deferred Ideas

- Real booking history + bookings RLS + linking new bookings to user_id → Phase 60.
- "Book for a guest" at checkout → Phase 59 (BOOK-06).
- Cost-centre and extended B2B fields → later corporate/B2B phase.
- GA4 login/sign_up events (TRACK-04) → revisit during booking-flow wiring.
