# Phase 7: Foundation — Supabase Schema + Env Vars + Deploy - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Create the SQL migration file for the bookings table, complete `.env.example` with all 8 required variables, run the migration in production Supabase, set 7 of 8 env vars in Vercel (Production scope only), deploy to Vercel, and submit Resend DNS records to start the propagation clock.

Phase is complete when: Vercel build is green, rideprestige.com homepage loads (200), and Resend DNS records have been submitted.

</domain>

<decisions>
## Implementation Decisions

### Migration file format
- Extract SQL verbatim from the comment in `lib/supabase.ts` — no defensive guards, no transaction wrapper
- File location: `supabase/migrations/0001_create_bookings.sql`
- Remove the SQL comment from `lib/supabase.ts` after migration file is created — single source of truth in the migration file

### Env var descriptions in .env.example
- Each of the 8 vars gets a comment with where to find it (source URL or dashboard path)
- Format: `# Short description — Source: Dashboard > Section > Key`
- Document all 8 vars now, including `STRIPE_WEBHOOK_SECRET` with a note that it's set in Phase 8 after webhook registration

### The 8 required environment variables
1. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — client-side Places Autocomplete key (HTTP referrer restricted)
2. `GOOGLE_MAPS_API_KEY` — server-side Routes API key (API restriction only, no HTTP referrer)
3. `SUPABASE_URL` — project URL from Supabase Dashboard
4. `SUPABASE_SERVICE_ROLE_KEY` — service role key (server-side only, never expose to browser)
5. `STRIPE_SECRET_KEY` — Stripe live secret key
6. `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret (set in Phase 8 after registering live webhook)
7. `RESEND_API_KEY` — Resend API key
8. `MANAGER_EMAIL` — email address for manager booking alert notifications

### Manual steps in plans
- Embedded step-by-step instructions inline within each plan task
- Each manual task includes exact UI navigation: "Go to X > click Y > paste Z > click Run"
- No separate checklist document — plans are self-contained

### Deployment acceptance criteria
- Phase 7 complete when: Vercel build succeeds (no errors) + rideprestige.com returns 200
- No full booking smoke test — that's Phase 8 (health check) scope
- Phase 7 also ends after Resend DNS records submitted; propagation verified in Phase 9

### Vercel deployment settings
- Default settings: `vercel.json` with `{"framework": "nextjs"}` is sufficient
- No custom region, build commands, or output directory overrides

### Claude's Discretion
- Exact comment wording in .env.example
- Whether to add a README or header comment to the migration file

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema source
- `prestigo/lib/supabase.ts` — Contains full SQL schema as comment (lines 1–35), `buildBookingRow()` function defines all field names and types, `saveBooking()` shows upsert pattern with `payment_intent_id` conflict key

### Requirements
- `.planning/REQUIREMENTS.md` — DB-01, DB-02, ENV-01, ENV-02, ENV-03 define acceptance criteria for this phase
- `.planning/ROADMAP.md` — Phase 7 success criteria; also confirms "no Supabase CLI" is out of scope (requirements out-of-scope table)

### Project context
- `.planning/PROJECT.md` — Constraints section (Vercel serverless, no framework changes), Key Decisions table (Supabase service role key rationale)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `prestigo/lib/supabase.ts` — Full SQL schema in comment ready to extract; `buildBookingRow()` confirms all 33 columns; service role key pattern already established
- `prestigo/.env.example` — Exists with 1 var, needs 7 more added

### Established Patterns
- Service role key only (no anon key) — server-side Supabase access, never exposed to browser
- `upsert` with `onConflict: 'payment_intent_id'` — dedup strategy already in place
- `vercel.json` is minimal by design — just `{"framework": "nextjs"}`

### Integration Points
- Migration SQL runs in Supabase Dashboard SQL Editor (not CLI)
- Env vars set in Vercel Dashboard > Project Settings > Environment Variables > Production scope only
- Resend DNS records found in Resend Dashboard > Domains > rideprestige.com

</code_context>

<specifics>
## Specific Ideas

- The SQL schema in `lib/supabase.ts` is the exact source — extract verbatim, don't rewrite
- `STRIPE_WEBHOOK_SECRET` should be documented in `.env.example` with a note like `# Set in Phase 8 after registering live Stripe webhook`
- Env vars scoped to Production only — live keys must NOT appear in Preview or Development scopes

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-foundation-supabase-schema-env-vars-deploy*
*Context gathered: 2026-03-30*
