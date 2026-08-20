# Phase 58: Sign-in UI + Account Dashboard - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning

<domain>
## Phase Boundary

The customer-facing UI layer on top of the Phase 57 auth foundation. This phase
delivers:

- **Auth-aware header (NAV-01/02):** a Sign in button for guests and an account
  dropdown (My trips / Profile / Sign out) for signed-in customers, on desktop
  and mobile.
- **Account dashboard (ACCT-01/02/03):** a `/account` zone with separate routes —
  `/account` (overview), `/account/trips` ("My trips"), `/account/profile`
  (profile editing). Profile editing covers contact fields, personal/corporate
  type switching, basic corporate fields (company / IČO / DIČ-VAT), and a list
  of saved passengers.

The Supabase Auth wiring itself, `/login`, OAuth, `customer_profiles`,
`bookings.user_id`, middleware gating, and the working `/account` sign-out were
all delivered in Phase 57.

**Out of scope (boundary anchors):**
- Real booking history data, `bookings` RLS, and linking new bookings to
  `user_id` at submit time — migration `045` explicitly assigns this to
  **Phase 60**. "My trips" ships as a UI shell with an empty state only.
- The Blacklane booking-flow redesign and "Book for a guest" at checkout —
  **Phase 59** (BOOK-06).
- Cost-centre and other extended B2B fields — later corporate/B2B phase.

</domain>

<decisions>
## Implementation Decisions

### "My trips" scope
- **D-01:** "My trips" is a UI shell with an empty state only ("No trips yet" +
  a "Book now" CTA). Do NOT add `bookings` RLS, do NOT link bookings to
  `user_id` at submit time, do NOT query real history. Migration `045` assigns
  that work to Phase 60 — respect that boundary.

### Account dashboard structure
- **D-02:** The account zone uses separate routes, not tabs on one page:
  `/account` (overview), `/account/trips` (My trips), `/account/profile`
  (profile editing). All live under the existing `/account/*` middleware gate
  from Phase 57.

### Corporate profile fields
- **D-03:** Extend `customer_profiles` (new migration `047`) with the basic
  corporate fields: `company_name` (already exists) + `ico` (IČO) + `vat_id`
  (DIČ / VAT). These are exposed/edited only when `account_type = corporate`.
- **D-04:** Cost-centre is deferred. "Book for a guest" is deferred to Phase 59
  (it is a booking-time action, not a profile field).
- **D-05:** Account type is switchable on `/account/profile` (personal ⇄
  corporate), consistent with Phase 57 D-04 (OAuth signups default personal and
  change type later in profile).

### Profile editing (contacts + saved passengers)
- **D-06:** Editable contact fields live on `customer_profiles`: full name and
  phone. Email is read-only (sourced from `auth.users`, not editable here).
- **D-07:** Add a separate **`saved_passengers`** table (new migration `048`)
  with per-user RLS (mirror the `customer_profiles` own-row RLS pattern):
  `user_id` FK, `full_name`, `phone`, `email` (nullable), `notes` (nullable),
  and an `is_default` flag. Customers can add/edit/delete their saved passengers
  from `/account/profile`.

### Auth-aware header
- **D-08:** Signed-in state renders an account **dropdown** in `Nav` (My trips /
  Profile / Sign out); guests see a "Sign in" button. Applies to both the
  desktop bar and the mobile menu.
- **D-09:** `Nav` stays a client component and reads session state via
  `createBrowserClient` + `onAuthStateChange` (the pattern already used in
  `components/auth/OAuthButtons.tsx`). This is the explicit choice to AVOID
  forcing the marketing/static pages (which all render `<Nav />`) into dynamic
  rendering — protects SEO/perf. A brief pre-hydration flash of the guest state
  is acceptable.

### Claude's Discretion
- Exact dropdown/menu markup, icons, copy, and empty-state wording (UI-SPEC will
  refine).
- Whether to extract a shared `lib/supabase/client.ts` browser helper or keep
  inline `createBrowserClient` calls (current pattern is inline).
- Whether profile/passenger writes use server actions (like `app/login/actions.ts`)
  or client mutations.
- Whether `saved_passengers` enforces a single-default via a partial unique
  index or app logic.
- Form validation specifics and field ordering on `/account/profile`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external spec/ADR documents exist for this phase. The authoritative
references are existing code patterns the new UI MUST mirror and not break.

### Phase 57 foundation (the substrate this phase builds on)
- `.planning/phases/57-customer-auth-foundation/57-CONTEXT.md` — all auth
  decisions (routes `/login` + `/account/*`, return-to rule D-08, session
  separation, minimal header affordance handed off to this phase D-14).
- `supabase/migrations/044_customer_profiles.sql` — current profile schema
  (`account_type` TEXT+CHECK, `company_name`) + own-row RLS pattern to mirror
  for `saved_passengers`.
- `supabase/migrations/045_bookings_user_id.sql` — **read the header comment**:
  it assigns booking↔user_id linking and `bookings` RLS to Phase 60. This is the
  boundary D-01 enforces.
- `supabase/migrations/046_customer_profiles_updated_at_trigger.sql` —
  updated_at trigger convention to reuse for new tables.

### Auth / session / actions (follow these)
- `app/login/actions.ts` — customer server actions (`customerSignOut`,
  `saveBookingWithUserId` already exists but is NOT wired to booking submit —
  that wiring is Phase 60). Mirror these for any profile/passenger server action.
- `app/login/auth-helpers.ts` — helper split (a `'use server'` module may only
  export async fns).
- `lib/supabase/server.ts` — `createClient()` for server-side reads/writes;
  do NOT weaken `getAdminUser`.
- `lib/supabase/middleware.ts` + `middleware.ts` — `/account/*` is already gated;
  new routes under it inherit gating. Respect CSP nonce + CSRF prefixes.
- `components/auth/OAuthButtons.tsx`, `app/account/reset-password/page.tsx` —
  existing `createBrowserClient` usage = the pattern for D-09.

### Components / UI to extend
- `components/Nav.tsx` — the header to make auth-aware (desktop bar + mobile
  menu; both currently render the same static link list + "Book now").
- `app/account/page.tsx` — current minimal placeholder to evolve into the
  overview + the new `/account/trips` and `/account/profile` routes.

### Project conventions
- `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/INTEGRATIONS.md` —
  Supabase client selection, migration naming, RLS conventions, dark-theme CSS
  vars and `btn-ghost`/`btn-primary` classes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `customerSignOut` server action (`app/login/actions.ts`) — already used by the
  current `/account` sign-out; reuse directly in the header dropdown.
- `createBrowserClient` usage already established in `OAuthButtons.tsx` and
  `reset-password/page.tsx` — copy for the Nav auth-state read (D-09).
- `customer_profiles` own-row RLS (migration 044) — template for the
  `saved_passengers` RLS policies.
- Dark-theme CSS vars + `btn-ghost` / `btn-primary` classes (globals.css) and
  the existing `/account/page.tsx` styling are the visual baseline.

### Established Patterns
- Auth read server-side via `supabase.auth.getUser()` (JWT-validated); in the
  client `Nav` use `onAuthStateChange` (not `getSession`) per D-09.
- Migrations are sequential + idempotent (`IF NOT EXISTS`); next free numbers
  are **047** (corporate fields on `customer_profiles`) and **048**
  (`saved_passengers` table).
- `'use server'` action modules export only async fns (see `auth-helpers.ts`
  split) — keep profile/passenger mutations consistent.

### Integration Points
- `<Nav />` is rendered on nearly every page (home, marketing, account). D-09's
  client-only auth read is what keeps those pages from going dynamic.
- `saveBookingWithUserId` already exists but is intentionally NOT connected to
  the booking submit path — leave it for Phase 59/60.

</code_context>

<specifics>
## Specific Ideas

- "Минимум сейчас, расширим позже" continues: corporate profile gets only
  company / IČO / VAT this phase; cost-centre waits.
- My trips must look intentional even when empty — a real empty state with a
  Book-now CTA, not a blank or error.
- Keep the static/SEO marketing pages static: the header must not drag them into
  dynamic rendering (D-09).

</specifics>

<deferred>
## Deferred Ideas

- **Real booking history + `bookings` RLS + linking new bookings to `user_id`**
  → Phase 60 (per migration 045 comment; ACCT-04 lands there).
- **"Book for a guest" at checkout** → Phase 59 (BOOK-06) — booking-time action.
- **Cost-centre and extended B2B fields** (billing address, billing contacts)
  → later corporate/B2B phase.
- **GA4 `login` / `sign_up` events (TRACK-04)** — cross-cutting tracking, not
  raised as in-scope for this UI phase; revisit when wiring the booking flow.

None — discussion stayed within phase scope (the above are explicit boundary
hand-offs, not dropped scope).

</deferred>

---

*Phase: 58-sign-in-ui-account-dashboard*
*Context gathered: 2026-06-11*
