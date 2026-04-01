# Phase 7: Foundation — Supabase Schema + Env Vars + Deploy - Research

**Researched:** 2026-03-30
**Domain:** Infrastructure setup — SQL migration, environment variables, Vercel deployment
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Migration file format: Extract SQL verbatim from the comment in `lib/supabase.ts` — no defensive guards, no transaction wrapper
- File location: `supabase/migrations/0001_create_bookings.sql`
- Remove the SQL comment from `lib/supabase.ts` after migration file is created — single source of truth in the migration file
- Each of the 8 vars gets a comment with where to find it (source URL or dashboard path)
- Format: `# Short description — Source: Dashboard > Section > Key`
- Document all 8 vars now, including `STRIPE_WEBHOOK_SECRET` with a note that it's set in Phase 8 after webhook registration
- The 8 required vars: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, MANAGER_EMAIL
- Manual steps embedded inline in each plan task — plans are self-contained, no separate checklist document
- Phase 7 complete when: Vercel build succeeds (no errors) + rideprestige.com returns 200
- No full booking smoke test — that's Phase 8 (health check) scope
- Phase 7 also ends after Resend DNS records submitted; propagation verified in Phase 9
- `vercel.json` with `{"framework": "nextjs"}` is sufficient — no custom region, build commands, or output directory overrides
- Env vars scoped to Production only — live keys must NOT appear in Preview or Development scopes
- No Supabase CLI (out of scope per requirements)

### Claude's Discretion

- Exact comment wording in .env.example
- Whether to add a README or header comment to the migration file

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DB-01 | SQL migration file exists at `supabase/migrations/0001_create_bookings.sql` with full bookings schema extracted from `lib/supabase.ts` | SQL is fully defined in `prestigo/lib/supabase.ts` lines 1–38 as a verbatim-extractable comment block |
| DB-02 | Bookings table created in production Supabase project and accepts inserts without error | Migration runs via Supabase Dashboard SQL Editor; `saveBooking()` in `lib/supabase.ts` already uses `upsert` with `onConflict: 'payment_intent_id'` confirming schema compatibility |
| ENV-01 | `.env.example` documents all 8 required environment variables with descriptions and source instructions | Current `.env.example` has only 1 var (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`); 7 more need to be added |
| ENV-02 | All 8 env vars set in Vercel with Production scope only (live keys must not be scoped to Preview or Development) | Vercel Dashboard > Project Settings > Environment Variables; scope must be set to Production only at add time |
| ENV-03 | Production deployment on Vercel succeeds with all env vars set | `vercel.json` already minimal and correct; Vercel auto-deploys from GitHub main branch push; verified by homepage 200 |

</phase_requirements>

---

## Summary

Phase 7 is a pure infrastructure phase — no new application code is written. It has three independent work streams: (1) extract the SQL schema into a migration file and run it in Supabase, (2) document and set all 8 environment variables, and (3) deploy to Vercel and submit Resend DNS records.

The SQL schema is fully present in `prestigo/lib/supabase.ts` lines 1–38 as a block comment. Extraction means copying the 33-column CREATE TABLE statement verbatim (stripping the `/* ... */` delimiters) into `supabase/migrations/0001_create_bookings.sql` at the repo root, then removing the comment from `lib/supabase.ts`. The migration runs in the Supabase Dashboard SQL Editor — no CLI involved.

The `.env.example` currently documents only `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Seven more variables need to be added with comments pointing to the source dashboard. Of the 8, only 7 are set in this phase — `STRIPE_WEBHOOK_SECRET` is noted as "set in Phase 8" because the webhook endpoint must exist before the signing secret is available.

**Primary recommendation:** Execute tasks in order — migration first (unblocks DB-02 verification), then env vars, then trigger a Vercel deployment, then submit Resend DNS records to start the 24–48h propagation clock.

---

## Standard Stack

### This phase uses no new libraries

All tooling is already installed. The phase involves:
- Supabase Dashboard SQL Editor (browser-based — no CLI)
- Vercel Dashboard (browser-based — no CLI)
- Resend Dashboard (browser-based — no DNS zone access required)
- Git (already configured) — committing migration file triggers Vercel deploy via GitHub integration

### Existing dependencies confirmed present
| Package | Version in package.json | Purpose |
|---------|------------------------|---------|
| @supabase/supabase-js | (installed) | Supabase client — already used in `lib/supabase.ts` |
| vitest | ^4.1.1 | Test runner — for post-deploy verification |

No `npm install` needed for this phase.

---

## Architecture Patterns

### Recommended Project Structure After Phase 7

```
prestigo-website/          ← repo root
├── supabase/
│   └── migrations/
│       └── 0001_create_bookings.sql   ← NEW: extracted from lib/supabase.ts
├── prestigo/
│   ├── lib/
│   │   └── supabase.ts                ← MODIFIED: SQL comment removed
│   └── .env.example                   ← MODIFIED: all 8 vars documented
└── vercel.json                        ← unchanged: {"framework": "nextjs"}
```

### Pattern 1: Migration File — Verbatim Extraction

**What:** Copy the CREATE TABLE statement from the `lib/supabase.ts` block comment exactly as-is. Do not add `IF NOT EXISTS`, `BEGIN/COMMIT`, or any wrapper — the locked decision prohibits guards and transaction wrappers.

**The exact SQL to extract** (from `lib/supabase.ts` lines 4–37, stripping `/*`, `*/`, and leading ` * `):

```sql
CREATE TABLE bookings (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          timestamptz DEFAULT now() NOT NULL,
  booking_reference   text NOT NULL,
  payment_intent_id   text UNIQUE,
  booking_type        text NOT NULL,
  trip_type           text NOT NULL,
  origin_address      text,
  origin_lat          float8,
  origin_lng          float8,
  destination_address text,
  destination_lat     float8,
  destination_lng     float8,
  hours               integer,
  passengers          integer NOT NULL,
  luggage             integer NOT NULL,
  pickup_date         text NOT NULL,
  pickup_time         text NOT NULL,
  return_date         text,
  vehicle_class       text NOT NULL,
  distance_km         float8,
  amount_czk          integer NOT NULL,
  amount_eur          integer,
  extra_child_seat    boolean DEFAULT false NOT NULL,
  extra_meet_greet    boolean DEFAULT false NOT NULL,
  extra_luggage       boolean DEFAULT false NOT NULL,
  client_first_name   text NOT NULL,
  client_last_name    text NOT NULL,
  client_email        text NOT NULL,
  client_phone        text NOT NULL,
  flight_number       text,
  terminal            text,
  special_requests    text
);
```

**Column count:** 33 columns. Cross-check `buildBookingRow()` in `lib/supabase.ts` — all 33 fields mapped.

### Pattern 2: .env.example — All 8 Variables

**What:** Document every env var the application reads, with source instructions as comments.

**The complete .env.example:**

```bash
# ── Google Maps ────────────────────────────────────────────────────────────────

# Client-side Places Autocomplete key — restricted to Places API + HTTP referrer
# Source: Google Cloud Console > APIs & Services > Credentials > your client key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE

# Server-side Routes API key — API restriction only, NO HTTP referrer restriction
# Source: Google Cloud Console > APIs & Services > Credentials > your server key
GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE

# ── Supabase ──────────────────────────────────────────────────────────────────

# Supabase project URL
# Source: Supabase Dashboard > Project Settings > API > Project URL
SUPABASE_URL=https://your-project.supabase.co

# Service role key — server-side only, never expose to browser
# Source: Supabase Dashboard > Project Settings > API > service_role key
SUPABASE_SERVICE_ROLE_KEY=YOUR_KEY_HERE

# ── Stripe ────────────────────────────────────────────────────────────────────

# Stripe live secret key
# Source: Stripe Dashboard > Developers > API keys > Secret key (live mode)
STRIPE_SECRET_KEY=sk_live_YOUR_KEY_HERE

# Stripe webhook signing secret — set in Phase 8 after registering live Stripe webhook
# Source: Stripe Dashboard > Developers > Webhooks > your endpoint > Signing secret
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE

# ── Resend ────────────────────────────────────────────────────────────────────

# Resend API key for transactional email
# Source: Resend Dashboard > API Keys > Create API Key
RESEND_API_KEY=re_YOUR_KEY_HERE

# ── Application ───────────────────────────────────────────────────────────────

# Manager email address for booking alert notifications
# Source: your own email address
MANAGER_EMAIL=manager@rideprestige.com
```

### Pattern 3: Vercel Environment Variable Scoping

**What:** Each env var must be added with Production scope only. Do NOT check Preview or Development.

**Navigation:** Vercel Dashboard > Project > Settings > Environment Variables > Add New > set scope to "Production" only.

**Critical:** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_API_KEY` are likely already set (the site was previously deployed). Verify before adding — update existing rather than creating duplicates.

**Trigger redeployment after adding vars:** Vercel does not automatically redeploy when env vars are added. A new deployment must be triggered — done by pushing a commit (the migration file commit serves this purpose).

### Anti-Patterns to Avoid

- **Running migration with IF NOT EXISTS:** The locked decision says no guards. The table doesn't exist in production yet, so `IF NOT EXISTS` is unnecessary complexity.
- **Adding env vars to Preview/Development scope:** Live keys in Preview scope create a risk of real charges from preview URLs. Production scope only.
- **Committing real keys to .env.example:** The file documents var names and instructions only — all values are placeholders (`YOUR_KEY_HERE`).
- **Re-running the migration:** Running `CREATE TABLE bookings` twice will fail with "relation already exists". The migration is a one-time operation. Verify table exists in Supabase Table Editor before declaring DB-02 done.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema migration | Custom migration runner script | Supabase Dashboard SQL Editor | One-time operation; CLI has been explicitly ruled out |
| Env var documentation | External wiki/Notion doc | `.env.example` file in repo | Standard Next.js convention; stays in sync with code |
| Production deployment | Manual file upload | Git push to main → Vercel auto-deploy | Already configured via GitHub integration |

**Key insight:** This phase has zero new code. All "infrastructure" work is dashboard operations triggered by a single git commit (the migration file). Don't over-engineer it.

---

## Common Pitfalls

### Pitfall 1: NEXT_PUBLIC_ Variables Not Available Server-Side (and vice versa)
**What goes wrong:** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is exposed to the browser bundle. `GOOGLE_MAPS_API_KEY` (no prefix) is server-side only. Setting both in Vercel as "Production" scoped is correct — but accidentally naming the server key with `NEXT_PUBLIC_` would expose it to the browser.
**Why it happens:** Copy-paste error when setting vars in Vercel dashboard.
**How to avoid:** Verify the exact var name matches `lib/supabase.ts` and `app/api/*/route.ts` references before saving.
**Warning signs:** Build warning about exposed keys in the browser bundle.

### Pitfall 2: Vercel Build Uses Stale Env Vars
**What goes wrong:** Env vars are added in the dashboard, but the existing deployment still runs with the old env. The site appears to work but still fails on Supabase/Stripe calls.
**Why it happens:** Vercel caches the build; env vars only apply to new deployments.
**How to avoid:** After setting all 8 vars, trigger a new deployment. The migration file commit (which pushes to main) will automatically trigger Vercel to redeploy.
**Warning signs:** `SUPABASE_URL` is set in the dashboard but `saveBooking()` still throws "Invalid URL" — the deployment pre-dates the env var addition.

### Pitfall 3: Supabase Migration Fails on Second Run
**What goes wrong:** Running `CREATE TABLE bookings` a second time returns `ERROR: relation "bookings" already exists`.
**Why it happens:** Migration was already applied. This is not an error state — it means DB-02 is already satisfied.
**How to avoid:** Check Supabase Table Editor before running. If `bookings` table exists with 33 columns, the migration succeeded.
**Warning signs:** SQL Editor returns red error text immediately on run.

### Pitfall 4: Resend DNS Records Submitted to Wrong Domain
**What goes wrong:** DNS TXT/CNAME records for `rideprestige.com` are added at the domain registrar for the wrong subdomain or wrong record type, causing DNS verification to never pass.
**Why it happens:** Resend shows "DKIM" and "SPF" records; registrars have different UIs (some pre-fill subdomain, some require full domain).
**How to avoid:** Copy values exactly from Resend Dashboard > Domains > rideprestige.com. For subdomain records (e.g., `resend._domainkey`), do not append the root domain — most registrars add it automatically.
**Warning signs:** Resend dashboard shows "Unverified" after 24–48h propagation window.

### Pitfall 5: STRIPE_WEBHOOK_SECRET Set Now (Wrong Phase)
**What goes wrong:** Setting `STRIPE_WEBHOOK_SECRET` in Vercel before the webhook endpoint is registered in Stripe gives a placeholder value — or worse, a test-mode signing secret.
**Why it happens:** Temptation to "complete" all 8 vars at once.
**How to avoid:** Set only 7 vars in this phase. Leave `STRIPE_WEBHOOK_SECRET` out or add it with a placeholder value and a clear note. Phase 8 handles webhook registration and this var.
**Warning signs:** Webhook validation in `app/api/webhooks/stripe/route.ts` fails with signature mismatch.

---

## Code Examples

### Migration File — Exact Content

```sql
-- Source: extracted verbatim from prestigo/lib/supabase.ts (lines 4-37)
-- Run once in Supabase Dashboard > SQL Editor

CREATE TABLE bookings (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          timestamptz DEFAULT now() NOT NULL,
  booking_reference   text NOT NULL,
  payment_intent_id   text UNIQUE,
  booking_type        text NOT NULL,
  trip_type           text NOT NULL,
  origin_address      text,
  origin_lat          float8,
  origin_lng          float8,
  destination_address text,
  destination_lat     float8,
  destination_lng     float8,
  hours               integer,
  passengers          integer NOT NULL,
  luggage             integer NOT NULL,
  pickup_date         text NOT NULL,
  pickup_time         text NOT NULL,
  return_date         text,
  vehicle_class       text NOT NULL,
  distance_km         float8,
  amount_czk          integer NOT NULL,
  amount_eur          integer,
  extra_child_seat    boolean DEFAULT false NOT NULL,
  extra_meet_greet    boolean DEFAULT false NOT NULL,
  extra_luggage       boolean DEFAULT false NOT NULL,
  client_first_name   text NOT NULL,
  client_last_name    text NOT NULL,
  client_email        text NOT NULL,
  client_phone        text NOT NULL,
  flight_number       text,
  terminal            text,
  special_requests    text
);
```

Note on the optional header comment: Per "Claude's Discretion", adding a brief header comment in the migration file is acceptable and recommended for clarity. The locked constraint is "no defensive guards, no transaction wrapper" — a plain SQL comment is not a guard.

### Vercel API — Verify Deployment Status (Optional CLI Check)

```bash
# If Vercel CLI is installed (not required for this phase)
vercel --prod  # Trigger production deployment manually
# OR just push to main — GitHub integration handles it
```

### Quick Smoke Test After Deploy

```bash
# Verify homepage returns 200
curl -I https://rideprestige.com
# Expected: HTTP/2 200
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Supabase CLI `supabase db push` | Dashboard SQL Editor (manual) | Out of scope by requirement; CLI adds project linking overhead for a one-time migration |
| All env vars in all scopes | Production scope only | Live keys never exposed via Preview URLs |
| `.env` committed to repo | `.env.example` with placeholders | Standard Next.js security practice |

**Explicitly out of scope (from REQUIREMENTS.md):**
- Supabase CLI migration tooling — one-time schema creation; CLI overhead adds no value
- Row Level Security (RLS) policies — service role key bypasses RLS; no client-side DB access in v1
- Staging environment — single production env sufficient while booking volume is low

---

## Open Questions

1. **Google Maps keys in Vercel — already set?**
   - What we know: The site was deployed in v1.0 MVP (Phase 6). `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is the only env var currently in `.env.example`, suggesting it was the first one configured.
   - What's unclear: Whether both Google Maps keys (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_API_KEY`) are already set in Vercel from the v1.0 deployment.
   - Recommendation: Plan task should check existing Vercel env vars first, then add/update as needed. Avoid duplicates.

2. **Resend domain already registered?**
   - What we know: The v1.0 codebase uses Resend (`RESEND_API_KEY` is one of the 8 required vars).
   - What's unclear: Whether a Resend account exists and whether `rideprestige.com` domain has been added to Resend Dashboard.
   - Recommendation: Plan task should include "if domain not yet added, add it first" as an inline step before the DNS record submission step.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.1 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd prestigo && npx vitest run --reporter=verbose 2>&1 \| tail -5` |
| Full suite command | `cd prestigo && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DB-01 | `supabase/migrations/0001_create_bookings.sql` exists with correct schema | File existence check | `test -f supabase/migrations/0001_create_bookings.sql && echo PASS` | ❌ Wave 0 |
| DB-02 | Bookings table accepts inserts without error | Manual (production Supabase) | Manual — run SQL in Supabase Dashboard, check no error | Manual only |
| ENV-01 | `.env.example` contains all 8 vars | File content check | `grep -c "YOUR_KEY_HERE\|YOUR_SECRET_HERE\|rideprestige.com" prestigo/.env.example` | ✅ file exists, ❌ content incomplete |
| ENV-02 | 8 vars set in Vercel Production scope | Manual (Vercel Dashboard) | Manual — verify in Vercel Dashboard | Manual only |
| ENV-03 | Production deployment succeeds + homepage 200 | Smoke test | `curl -s -o /dev/null -w "%{http_code}" https://rideprestige.com` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd prestigo && npx vitest run --reporter=verbose 2>&1 | tail -5`
- **Per wave merge:** `cd prestigo && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `supabase/migrations/0001_create_bookings.sql` — covers DB-01 (this IS the deliverable, not a test file)
- [ ] ENV-03 smoke test is a shell command, not a Vitest test — run manually after deploy: `curl -I https://rideprestige.com`

**Note:** DB-02 and ENV-02 are manual-only steps (dashboard operations). They cannot be automated in the test suite. Vitest covers only what runs in the local codebase. Production verification for these two requirements is done by following inline plan instructions.

*(Existing 32/32 passing tests cover webhook, payment intent, booking store, and pricing — none are affected by this phase's changes.)*

---

## Sources

### Primary (HIGH confidence)
- `prestigo/lib/supabase.ts` lines 1–123 — full SQL schema, Supabase client pattern, `saveBooking()` upsert implementation
- `prestigo/.env.example` — current state: only 1 of 8 vars documented
- `prestigo/vercel.json` — confirmed minimal config `{"framework": "nextjs"}`
- `.planning/phases/07-foundation-supabase-schema-env-vars-deploy/07-CONTEXT.md` — all locked decisions for this phase
- `.planning/REQUIREMENTS.md` — DB-01, DB-02, ENV-01, ENV-02, ENV-03 acceptance criteria

### Secondary (MEDIUM confidence)
- `.planning/PROJECT.md` — Key Decisions table confirming Supabase service role key rationale, Vercel serverless constraint
- `prestigo/vitest.config.ts` — confirmed test framework and configuration

### Tertiary (LOW confidence)
- None required — this phase involves no new libraries or undocumented APIs

---

## Metadata

**Confidence breakdown:**
- Migration SQL: HIGH — SQL is already written and present in the codebase; extraction is mechanical
- Architecture: HIGH — Vercel + Supabase + Resend patterns are well-established; all decisions locked
- Pitfalls: HIGH — derived from reading actual code and known deployment patterns; no new technology
- Validation: MEDIUM — DB-02 and ENV-02 are manual-only; cannot be fully automated

**Research date:** 2026-03-30
**Valid until:** Stable — these are infrastructure operations with no moving library targets
