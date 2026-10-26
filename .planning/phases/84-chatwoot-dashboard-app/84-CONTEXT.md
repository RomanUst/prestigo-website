# Phase 84: Chatwoot Dashboard App - Context

**Gathered:** 2026-10-26
**Status:** Ready for planning

<domain>
## Phase Boundary

A Chatwoot Dashboard App (iframe in the conversation sidebar) that shows the operator the current
conversation's customer bookings from Supabase: upcoming + recent past, status, payment, and links into
`/admin`. Read-only: the panel never writes to Supabase, Stripe, Chatwoot or EspoCRM. It renders only when
framed by Prestigo's Chatwoot (`frame-ancestors` + origin-validated `postMessage`), never uses the admin session
cookie, and runs on a Chatwoot version confirmed patched for CVE-2025-12245 (PANEL-01, PANEL-02).

</domain>

<decisions>
## Implementation Decisions

### Carried forward (locked in earlier phases — do not re-decide)
- Supabase is the single source of truth for `bookings` / `customer_profiles`; Chatwoot/CRM never write them
  (PROJECT.md v4.0, REQUIREMENTS Out of Scope).
- Identity: normalized email = same person; E.164 phone merges only when not shared; shared phones never merge;
  links live in `contact_identities` + `identity_emails` / `identity_phones` (82 D-04..D-06).
- Chatwoot contact attributes already carry next trip, counters, total spent and
  `admin_bookings_url = /admin/bookings?search=<email>` (82 D-02, `lib/chatwoot-mapping.ts`). Full per-booking
  history was explicitly left to this phase.
- Chatwoot is pinned at `chatwoot/chatwoot:v4.18.0-ce` (`infra/vps/chatwoot/compose.yml`). Per
  `.planning/research/PITFALLS.md` Pitfall 16, CVE-2025-12245 affects Chatwoot ≤ 4.7.0 — research must confirm
  the fix against the advisory/changelog and record the evidence; it is a PANEL-02 gate, not an assumption.
  **Superseded by D-13** (research 2026-10-26: no upstream fix exists).
- `app/embed/` (or equivalent) route outside `app/[locale]/`, no next-intl, own narrow CSP with
  `frame-ancestors https://chat.rideprestigo.com` (research ARCHITECTURE.md). Middleware matcher rules from
  CLAUDE.md still apply.
- Security work → run tests, commit with `security:` prefix (CLAUDE.md).

### Operator verification (PANEL-02)
- **D-01:** The panel API authenticates the operator with the operator's **personal Chatwoot access token**
  (from their Chatwoot profile). The server validates it against the Chatwoot API and requires that this agent
  can access the requested conversation. No admin session cookie, no shared secret in the iframe URL, no
  separate panel login. Removing an agent in Chatwoot revokes panel access immediately. —
  **Reversibility:** costly — the token handshake, API contract and runbook are built around Chatwoot-issued
  identity.
- **D-02 (revised 2026-10-26 after research):** The token is pasted into the panel and kept in the iframe's
  **`sessionStorage`** (lives until the tab closes; re-paste in each new browser session). `localStorage` was
  rejected: `rideprestigo.com` and `chat.rideprestigo.com` are same-site, so the iframe's storage is shared with
  the marketing site's origin and third-party scripts (GTM, GA, Meta Pixel, Clarity) could read it. A dedicated
  `panel.` subdomain and an encrypted HttpOnly cookie were also considered and not chosen. The token travels only
  as a request header (`api-access-token`, hyphenated) to our own API. The server never persists it; at most a
  short-lived cache of the validation result keyed by a hash of the token.
- **D-03:** The iframe sends only the **conversation id** (from Chatwoot's `postMessage` context, after
  `event.origin` is checked against the exact Chatwoot origin). The server fetches the conversation from the
  Chatwoot API with the operator's token and takes the contact's email/phone from that response. Contact data
  from `postMessage` is never trusted for the lookup, so the API cannot be used to look up bookings by an
  arbitrary email.
- **D-04:** Any Chatwoot agent who can access the conversation sees its bookings. Panel permissions mirror
  Chatwoot permissions: no admin-only gate, no env allowlist. A 2nd operator works without extra setup.

### What the panel shows (PANEL-01)
- **D-05:** Layout: header with counters (total trips, total spent EUR); an "Upcoming" block with **all** future
  bookings, nearest first; a "Past" block with the **10 most recent**, newest first, then a "more" control or a
  link to `/admin`.
- **D-06:** Each booking card shows date/time, route, reference, booking status, payment status, link into
  `/admin`, **plus** vehicle class, passengers/luggage, amount in EUR, assigned driver and driver trip progress
  (Phase 67 status), flight number and customer notes/special requests. Showing amounts is fine: this is an
  internal operator tool, and the marketing "no prices" rule does not apply. Amounts still come from booking
  data, not typed constants (pre-commit `€` guard).
- **D-07:** Panel UI is English and matches the `/admin` visual language and status vocabulary. Plain internal
  tool, no next-intl. Readable in Chatwoot's light and dark themes and at a narrow sidebar width (~320–400 px).
- **D-08:** Empty state (no bookings): "No bookings", the email/phone that was searched, and plain links:
  "Create booking in admin" (`/admin`) and the open EspoCRM Lead if one exists. Links only; the panel performs
  no writes.

### Payment link
- **D-09:** For an unpaid booking that already has a Stripe payment link, show it with a **Copy** button so the
  operator can paste it into the reply. Creating a new payment link stays in `/admin` (reached by a link). The
  panel stays strictly read-only. This partially closes the 77 D-19 "one-click link from Chatwoot" item;
  generating links from the panel is deferred.

### Whose bookings
- **D-10:** Matching goes through the Phase 82 identity tables: the Chatwoot contact's email/phone → identity →
  bookings across all linked emails/phones, using the same merge rules (shared phones never count). The panel
  sees what the sync sees after any split or merge.
- **D-11:** Only bookings where the contact's email/phone is the **booker** (the same field sync and erasure key
  on). Passenger-name/phone matching is not used. An agency writing in sees its bookings; a passenger of an
  agency booking does not see that trip.
- **D-12:** A contact with no email and no phone (e.g. Telegram name only) shows a hint: "Add an email or phone
  to this contact in Chatwoot to see bookings". The panel refreshes after the operator adds one. No name search
  and no manual search box: the panel is not a general booking search for any agent.

### CVE-2025-12245 gate (PANEL-02)
- **D-13 (2026-10-26, after research):** CVE-2025-12245 is in the Chatwoot **website widget SDK**
  (`IFrameHelper.js` postMessage handling), not in the Dashboard App, and GHSA-hgg8-54gw-8v33 lists no patched
  version — the vulnerable code is identical in v4.7.0, v4.18.0 and the latest release. The PANEL-02 gate is
  re-worded to "scoped with evidence, no upstream fix, compensating control shipped": a capture-phase `message`
  origin guard in `components/chat/load-chat-widget.ts`, registered before the SDK loads, that drops
  `chatwoot-widget:` messages from any origin other than the Chatwoot origin. The advisory evidence and a
  re-check recipe go into the runbook. Chatwoot stays pinned at v4.18.0 (no upgrade for this reason).

### Claude's Discretion
- Exact route paths (`app/embed/chatwoot-dashboard`, `app/api/chatwoot/dashboard-app` or similar), handshake
  message flow (`chatwoot-dashboard-app:fetch-info`, re-fetch on conversation switch), and request shape.
- Which Chatwoot API endpoints prove agent identity and conversation access (`/api/v1/profile`, conversation
  GET) and how the CE v4.18 permission model maps to "can access the conversation".
- Validation cache TTL and storage, rate limiting per token/IP (existing Upstash limiter pattern), and response
  headers (`Cache-Control: no-store`, `Referrer-Policy`, CSP with `frame-ancestors`).
- Read-only data access: a narrow RPC or projection query via the service-role client on the server only;
  structural guard test that the panel modules cannot import booking/profile write helpers (like the 83 D-17
  guard).
- Token-entry UX (where the operator finds the token, error states for an invalid or revoked token), loading and
  error states, and the "more" behaviour for past trips.
- Admin link targets (`/admin/bookings?search=<reference or email>`; there is no booking detail page).
- Registering the Dashboard App in Chatwoot via the existing `infra/chatwoot` config-as-code (`sync.mjs`) vs a
  runbook step; how CVE-2025-12245 patch evidence is recorded (runbook/verification).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and roadmap
- `.planning/ROADMAP.md` § "Phase 84: Chatwoot Dashboard App" — goal, success criteria, security note
- `.planning/REQUIREMENTS.md` — PANEL-01, PANEL-02; Out of Scope table

### Research (v4.0)
- `.planning/research/ARCHITECTURE.md` — Dashboard App component row, request flow, Anti-Pattern 1 (no cookie
  session), `app/embed/` carve-out, read-only RPC boundary
- `.planning/research/PITFALLS.md` — Pitfall 7 (CSP), Pitfall 16 (Dashboard App iframe/postMessage, CVE-2025-12245)
- `.planning/research/FEATURES.md` — Dashboard App notes and dependency on a stable contact↔customer link

### Prior phase context
- `.planning/phases/77-chatwoot-deployment-core-channels/77-CONTEXT.md` — D-09 CSP baseline process, D-19
  (payment link from Chatwoot deferred to 84)
- `.planning/phases/82-site-crm-chatwoot-sync-foundation/82-CONTEXT.md` — D-02 contact attributes, D-04..D-06
  identity rules
- `.planning/phases/83-crm-chatwoot-site-webhooks/83-CONTEXT.md` — D-04 (no name-only identity), D-17
  structural write-guard pattern

### Infra and config
- `infra/vps/chatwoot/compose.yml` — pinned Chatwoot image version (CVE gate)
- `infra/chatwoot/README.md` — Chatwoot config-as-code, secrets handling, webhook section
- `scripts/qa/baselines/csp_baseline.json` — reviewed CSP diff baseline (77 D-09)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/chatwoot-client.ts` (`loadSiteChatwootConfig`, `createSiteChatwootClient`, `classifyChatwootError`):
  Chatwoot base URL/config and error classification. The panel calls Chatwoot with the operator's token, not
  the site token.
- `lib/identity-store.ts` (`createIdentityStore`), `lib/identity.ts` (`normalizeIdentityEmail`),
  `lib/phone.ts`: identity resolution for D-10.
- `lib/chatwoot-mapping.ts`: existing `admin_bookings_url` format and booking summary fields used by sync.
- Admin bookings UI (`app/(internal)/admin/(dashboard)/bookings/`): status vocabulary and visual language to
  mirror (D-07).

### Established Patterns
- Admin auth guard order, 400 vs 422 validation, CSRF (memory: API route patterns) — the panel API adds its own
  token guard instead of the admin cookie.
- Service-role Supabase client only on the server; never create a Supabase client during render.
- CSP nonce middleware (`middleware.ts`) and the matcher exclusions; CSP changes go through the reviewed
  baseline.
- Isolation guard tests (Phase 76 VPS guard, Phase 83 write-guard) as the model for a panel read-only guard.

### Integration Points
- New embed page + API route; `middleware.ts` (CSP / `frame-ancestors` for the embed route, keep it out of the
  next-intl locale handling).
- Chatwoot Dashboard App registration (Settings → Integrations → Dashboard Apps) pointing at the embed URL.
- Driver trip progress (Phase 67) and payment-link fields on `bookings` for D-06/D-09.

</code_context>

<specifics>
## Specific Ideas

- Security model in one line: Chatwoot is the identity provider. Operator token + server-side conversation
  fetch means a leaked panel URL or a forged `postMessage` gets nothing.
- The panel complements the 82 D-02 contact attributes: those show the summary, the panel shows the full list.

</specifics>

<deferred>
## Deferred Ideas

- **Generate a payment link from the panel** (write via Stripe from Chatwoot): would require rewriting PANEL-02's
  read-only rule. Candidate backlog item; remainder of 77 D-19.
- **Manual booking search in the panel** (by email/phone/reference): rejected for now, since it would turn the
  panel into a booking search for any agent.
- **Passenger-based matching** for agency bookings: not used (D-11).

</deferred>

---

*Phase: 84-chatwoot-dashboard-app*
*Context gathered: 2026-10-26*
