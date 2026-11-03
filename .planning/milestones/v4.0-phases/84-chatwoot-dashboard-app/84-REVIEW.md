---
phase: 84-chatwoot-dashboard-app
reviewed: 2026-10-29T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - app/api/chatwoot/dashboard-app/route.ts
  - app/embed/chatwoot-dashboard/BookingCard.tsx
  - app/embed/chatwoot-dashboard/CopyLinkButton.tsx
  - app/embed/chatwoot-dashboard/PanelClient.tsx
  - app/embed/chatwoot-dashboard/page.tsx
  - app/embed/chatwoot-dashboard/panel-handshake.ts
  - app/embed/chatwoot-dashboard/panel.css
  - app/embed/layout.tsx
  - components/chat/load-chat-widget.ts
  - infra/chatwoot/dashboard-apps.json
  - infra/chatwoot/sync.mjs
  - lib/chatwoot-operator.ts
  - lib/panel-bookings.ts
  - lib/panel-dto.ts
  - lib/panel-links.ts
  - lib/rate-limit.ts
  - middleware.ts
  - next.config.ts
  - public/robots.txt
  - supabase/migrations/080_panel_bookings.sql
findings:
  critical: 0
  warning: 5
  info: 3
  total: 8
status: issues_found
---

# Phase 84: Code Review Report

**Reviewed:** 2026-10-29
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

The panel's security core holds up. I traced these and found no break:

- **Auth path:** the operator token is checked against Chatwoot on every request. The conversation GET is never cached, and the stale-profile recheck on 401/403 is correct.
- **Lookup keys:** email and phone come only from Chatwoot's response, and the body schema is strict.
- **Cookies:** middleware strips cookies for both the page and the API.
- **Embed CSP:** no `unsafe-inline` script, and `frame-ancestors` is pinned to one origin.
- **Payment link:** an https `buy.stripe.com` allowlist is applied on the server and again on the client.
- **SQL function:** the SECURITY DEFINER function uses `search_path = ''`, schema-qualifies everything and revokes PUBLIC. The projection is allowlisted, and the identity-under-erasure and anonymised-booking cases are handled.
- **CVE guard:** the `chatwoot-widget:` message guard is registered before the SDK handler.

There are no BLOCKER-level defects. The five warnings are: stale cross-conversation data in the client, unverified contact identity exposing full booking PII, a misleading "Paid" badge, a CSP origin that can drift from the configured Chatwoot origin, and rate-limit/error-copy behaviour for a shared-IP team.

## Warnings

### WR-01: Previous conversation's bookings stay on screen after the conversation changes

**File:** `app/embed/chatwoot-dashboard/PanelClient.tsx:136-145, 170-218, 203-206`
**Issue:** The `message` listener stays registered and accepts every later `appContext`, so `conversationId` changes in place. Nothing clears `data` (or `errorCode`, `showAllPast`) when `conversationId` changes. Two consequences:
1. While the new request is in flight, customer A's cards and counters remain visible. The skeleton only shows when `!data`, so the only cue is the "Refreshing..." button text.
2. If the request for conversation B fails with anything other than `no_access` (`unavailable`, `rate_limited`, `internal`, a network error), the comment says "any other error keeps the last good data". Customer A's bookings and payment-link copy buttons are then shown under conversation B's error banner. An operator can paste the wrong customer's payment link or details into a reply.

If Chatwoot remounts the iframe per conversation, this is latent. The panel does not depend on that, and no test pins it.

**Fix:** Reset per-conversation state when the id changes, before fetching:
```tsx
const lastConversation = useRef<number | null>(null)
useEffect(() => {
  if (lastConversation.current !== conversationId) {
    lastConversation.current = conversationId
    setData(null)
    setErrorCode(null)
    setShowAllPast(false)
  }
}, [conversationId])
```
Or tag the response with its `conversationId` and render `data` only when it matches the current one. Add a test: switch the id, fail the second fetch, and assert that no A data renders.

### WR-02: Unverified (visitor-supplied) email or phone returns full booking PII, with only a text hint

**File:** `lib/chatwoot-operator.ts:304-314`, `lib/panel-bookings.ts:178-205`, `app/embed/chatwoot-dashboard/PanelClient.tsx:370-377`
**Issue:** Chatwoot's `meta.sender.email` and `phone_number` are whatever the visitor typed in the pre-chat form. Only `hmac_verified` indicates they were signed. Regardless of `verified`, the API returns pickup and destination addresses, flight, driver, customer notes, amounts and payment-link URLs for whichever identity that string resolves to. A visitor who types a victim's email, or a victim's phone when the email is unknown, gets an agent to read out the victim's trip details. Confirming identity before sharing is left to the operator, who sees one line of text. The hint says "Unverified email" even when the match was by phone, and there is no phone-specific warning.

**Fix:** For `verified === false`, send a reduced projection: reference, status, date and counters, but no addresses, notes, driver or payment link. Add an explicit "Reveal details" action that re-requests with a flag, or at minimum redact addresses to the city. Make the hint distinguish an email match from a phone-only match.

### WR-03: Any non-`unpaid`/`pending` status without `paid_at` is labelled "Paid"

**File:** `lib/panel-bookings.ts:106-112`
**Issue:** The fallback `return 'paid'` makes a `confirmed`, `assigned` or `completed` booking with `paid_at = null` show a green "Paid" badge. Examples are manual, invoiced or corporate bookings confirmed without Stripe. The operator may tell the customer "it's paid" when it was never paid. The SQL `spent_eur` counts the same rows, so "Total spent" is overstated by the same logic.

**Fix:** Return `'paid'` only when `paid_at` is set. For other non-terminal statuses use a neutral state such as `'confirmed_unpaid'` ("Payment not recorded"), or add a state that is not styled as paid.

### WR-04: Embed `frame-ancestors` host is hard-coded, while the handshake origin comes from `CHATWOOT_BASE_URL`

**File:** `middleware.ts` (hunk `buildCspEmbed`, `frame-ancestors https://chat.rideprestigo.com`), `lib/chatwoot-operator.ts:96-99`, `app/embed/chatwoot-dashboard/PanelClient.tsx:130-133, 269-275`
**Issue:** If `CHATWOOT_BASE_URL` ever differs from `chat.rideprestigo.com` (staging, a rename), the iframe is blocked by CSP, or the handshake targets a different origin. The panel then shows "Open this panel from a Chatwoot conversation." with no error and no log. The same copy appears when `chatwootOrigin` is null because the env is missing or invalid. That is a misconfiguration, not an "unframed" page. The Chatwoot widget has a WR-02 CSP-violation detector for this exact drift, but the panel has none.

**Fix:** Build the `frame-ancestors` value from `panelChatwootOrigin()` with the hard-coded host as the fallback, or fail loudly when they differ. Render a separate "not configured" message when `chatwootOrigin` is null instead of the "open from Chatwoot" text.

### WR-05: Per-IP, pre-auth, fail-closed rate limit can lock out a shared-NAT team, and a limiter outage is shown as "too many requests"

**File:** `app/api/chatwoot/dashboard-app/route.ts:66-69`, `lib/rate-limit.ts` (the 30/min limit)
**Issue:**
1. The limit is 30/min keyed by IP only, evaluated before the token is checked. Each open tab auto-refreshes every 30s (2 requests/min), plus a refresh on every focus, visibility change and conversation switch. All agents in one office share an IP. About 15 active tabs reach the limit, and any unauthenticated traffic from that IP spends the same budget.
2. When the limiter backend is degraded, the route returns 503 with body `{error:'rate_limited'}`. The client then shows "Too many requests. Wait a moment, then press Refresh.", which is wrong for an infrastructure outage.

**Fix:** Key the limit on `sha256(token)` once the token passes the shape check. Keep a looser IP bucket for requests with no valid token shape. Return a distinct code such as `unavailable` for the degraded case, and add its copy to `ERROR_COPY` and `PANEL_ERROR_CODES`.

## Info

### IN-01: Clipboard and manual field use the raw string instead of the parsed URL

**File:** `app/embed/chatwoot-dashboard/CopyLinkButton.tsx:84-85, 121`; `lib/panel-links.ts:18-33`
**Issue:** `isSafePaymentLinkUrl` validates `new URL(url)`, but the original string is what gets copied. The WHATWG parser strips leading and trailing whitespace and embedded tab/newline characters, so a stored value like `" https://buy.stripe.com/x\n"` passes validation and is copied with the whitespace.
**Fix:** Have the validator return `parsed.href`, or `url.trim()` and reject any control characters, and copy that.

### IN-02: Future bookings with null `pickup_utc` can fall outside the 200-row cap

**File:** `supabase/migrations/080_panel_bookings.sql:32-34, 214, 230`
**Issue:** The header claims every future booking falls inside the cap. `pickup_utc DESC NULLS LAST` puts rows with a null `pickup_utc` last, and the client does handle them via the wall-clock fallback. For an identity with more than 200 rows, a future booking that has only `pickup_date` and `pickup_time` can be truncated. This is unlikely in practice, but the invariant stated in the comment is not guaranteed.
**Fix:** Soften the comment, or order by `COALESCE(b.pickup_utc, <safe text-derived ts>)`. Alternatively, confirm that `pickup_utc` is always populated and add a NOT NULL or backfill note.

### IN-03: Redundant header rule for `/embed`

**File:** `next.config.ts` (hunk, `embedHeaders` entries)
**Issue:** `{ source: "/embed/:path*" }` also matches `/embed`, so `/embed` is covered by two identical rules. This is harmless, since headers are overwritten, but it is dead configuration.
**Fix:** Keep only `/embed/:path*`, or keep both with a comment. Verify the response headers on `/embed/chatwoot-dashboard` once, to confirm there is no duplicated HSTS value.

---

_Reviewed: 2026-10-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
