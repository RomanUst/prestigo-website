# Phase 57: Customer Auth Foundation - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Customers authenticate via Supabase Auth (GoTrue) — email (magic-link + optional
password) plus Google and Apple OAuth — entirely separate from admin auth. A
`customer_profiles` table (migration `044_customer_profiles.sql`) stores
`account_type` (personal/corporate) under row-level security, the `bookings`
table gains a nullable `user_id` FK to `auth.users`, and customer-account routes
are gated by middleware without touching `/admin` gating.

This phase delivers the auth foundation only. Booking-flow integration (auto-fill
from profile, "my bookings" lists), corporate billing fields beyond company name,
and the full account-aware header nav are out of scope (later phases).

</domain>

<decisions>
## Implementation Decisions

### Email sign-in method
- **D-01:** Magic-link is the primary email method; password is an optional
  secondary method (both supported via Supabase Auth). Sign-in form offers
  magic-link by default with a password option.
- **D-02:** Because password is supported, the phase must include a password
  reset flow and rely on Supabase email confirmation for password signups.

### Account type (personal / corporate)
- **D-03:** Account type is chosen at email registration. Default is `personal`.
- **D-04:** OAuth sign-up (Google/Apple) does NOT prompt for account type —
  new OAuth customers default to `personal`; they can change account type later
  in their profile. No blocking onboarding/interstitial screen in this phase.
- **D-05:** `customer_profiles` schema is minimal for this phase:
  `account_type` (enum/text: personal | corporate) + `company_name` (nullable,
  used only for corporate). IČO/VAT, billing address, and other B2B fields are
  deferred to a later phase.
- **D-06:** A `customer_profiles` row is created for every customer on first
  sign-in/registration (email and OAuth), keyed by FK to `auth.users(id)`. RLS
  isolates each user to their own row (read + write).

### Routes and post-login landing
- **D-07:** Customer login lives at `/login`; the protected customer zone lives
  under `/account/*`. Admin keeps `/admin/login` + `/admin` unchanged.
- **D-08:** After successful sign-in, redirect to the originating page via a
  `return-to` (redirect/next) param when present; otherwise land on `/account`.
- **D-09:** OAuth callback handled at a dedicated route (e.g. `/auth/callback`)
  that exchanges the code, ensures the `customer_profiles` row, then honors the
  `return-to`/`/account` rule from D-08.

### Admin / customer session separation
- **D-10:** Admin vs customer is distinguished solely by
  `app_metadata.is_admin` on the same `auth.users` record — both account kinds
  live in one Supabase project. Customers never have `is_admin`.
- **D-11:** Middleware change: if an authenticated user WITHOUT
  `app_metadata.is_admin` requests `/admin/*` (excluding the existing
  `/admin/login` rule), redirect to `/` (home) — not to `/admin/login`, and not
  a bare 403. `/admin` gating for admins is otherwise unchanged.
- **D-12:** Middleware adds customer-route gating: unauthenticated requests to
  `/account/*` redirect to `/login` (with `return-to` set). This logic is
  additive and must not alter the existing `/admin` branches.

### Sign-out
- **D-13:** Sign-out is available from an account menu in the header AND from
  `/account`. Sign-out fully clears the Supabase session (server action +
  cookie clear) and redirects to `/`; afterward protected `/account/*` routes
  redirect to `/login`.
- **D-14:** Coordination note: the full account-aware header nav is Phase 58
  (NAV). For Phase 57, the header account control can be a minimal affordance;
  the authoritative sign-out surface that MUST work in this phase is `/account`.
  Do not block Phase 57 on the Phase 58 header redesign.

### Claude's Discretion
- Exact form layout/copy for `/login` and registration (UI-SPEC will refine).
- Browser Supabase client setup (`createBrowserClient` from `@supabase/ssr`) and
  whether sign-in uses server actions (matching admin) or client calls.
- Naming of the OAuth callback route and the `return-to` query param.
- Whether `account_type` is a Postgres enum or a checked text column.
- Email template wording for magic-link / password reset.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external spec/ADR documents exist for this phase. The authoritative
references are existing code patterns that the new customer auth MUST mirror and
must not break:

### Auth & session patterns (follow these)
- `lib/supabase/server.ts` — `createClient()` (SSR cookie wiring) and
  `getAdminUser()` (the `app_metadata.is_admin` gate). Customer server access
  reuses `createClient()`; do NOT weaken `getAdminUser`.
- `lib/supabase/middleware.ts` — `updateSession()`; the `getUser()` JWT
  validation pattern and the existing `/admin` + `/admin/login` redirect
  branches that must remain intact. New customer/`/account` and non-admin
  `/admin` redirect logic is added here.
- `middleware.ts` — top-level middleware: CSP nonce, CSRF prefixes, matcher.
  New customer routes must respect the nonce/CSRF approach.
- `app/admin/login/actions.ts` — existing server-action login pattern to mirror
  for the customer sign-in flow.

### Schema & migrations
- `supabase/migrations/` — migration sequence; latest is `043_*`, so customer
  profiles is `044_customer_profiles.sql` and the bookings `user_id` FK is the
  next migration after it. Follow existing migration file conventions.
- `lib/supabase.ts` — service-role client usage notes (anon-key rationale) for
  server-side reads.

### Project conventions
- `CLAUDE.md` (repo root, if present) and `.planning/codebase/CONVENTIONS.md`,
  `.planning/codebase/INTEGRATIONS.md` — Supabase client selection, API route
  auth-guard order, migration naming, RLS conventions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createClient()` / `createServerClient` (SSR) already configured with cookie
  handling — customer server-side auth reuses this directly.
- Admin login server action (`app/admin/login/actions.ts`) is a working template
  for a customer sign-in server action.
- `@supabase/ssr@^0.10.0` and `@supabase/supabase-js@^2.101.0` already installed.

### Established Patterns
- Auth state is read server-side via `supabase.auth.getUser()` (JWT-validated),
  never `getSession()`. Customer gating must follow the same rule.
- Authorization is metadata-driven: `app_metadata.is_admin`. Customer accounts
  are simply the absence of that flag — no separate auth system.
- Migrations are sequential, idempotent (`IF NOT EXISTS`), and live in
  `supabase/migrations/NNN_name.sql`.

### Integration Points
- `middleware.ts` → `lib/supabase/middleware.ts:updateSession()` is the single
  place that gates routes — both `/admin` and the new `/account` logic live here.
- No `createBrowserClient`, `/login`, `/account`, or customer routes exist yet —
  all created fresh in this phase.
- `bookings` table predates the tracked migrations (lives in the live DB); the
  `user_id` FK is added by a new migration and must keep existing anonymous
  inserts/reads valid (nullable, no default, no RLS regression for guests).

</code_context>

<specifics>
## Specific Ideas

- Keep admin and customer auth visibly separate at the URL level (`/admin/*` vs
  `/login` + `/account/*`) so the two audiences never see each other's screens.
- Conversion-first: a guest mid-booking who signs in should return to where they
  were (return-to), not be dumped on a generic dashboard.
- "Минимум сейчас, расширим позже" — corporate gets only `company_name` now;
  resist adding IČO/VAT/billing fields this phase.

</specifics>

<deferred>
## Deferred Ideas

- Corporate billing fields (IČO/VAT, billing address, billing contacts) — later
  B2B/corporate phase.
- Post-OAuth account-type onboarding interstitial — only if product later wants
  corporate OAuth signups to self-identify at signup.
- Full account-aware header nav with account dropdown — Phase 58 (NAV).
- Linking customers to a "my bookings" view / auto-filling booking forms from
  profile — later booking-account phase (builds on `bookings.user_id` from here).

None of the above block Phase 57.

</deferred>

---

*Phase: 57-customer-auth-foundation*
*Context gathered: 2026-06-10*
