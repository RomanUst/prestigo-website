---
phase: 87-status-service-driver-step-flow
reviewed: 2026-11-03T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - app/(internal)/driver/trip/[token]/ConfirmStepDialog.tsx
  - app/(internal)/driver/trip/[token]/NavigateChooser.tsx
  - app/(internal)/driver/trip/[token]/TripDetails.tsx
  - app/(internal)/driver/trip/[token]/TripScreen.tsx
  - app/(internal)/driver/trip/[token]/page.tsx
  - app/(internal)/driver/trip/help/DriverHelpChat.tsx
  - app/(internal)/driver/trip/help/page.tsx
  - app/api/driver/respond/route.ts
  - app/api/driver/trip/[token]/help/route.ts
  - components/chat/load-chat-widget.ts
  - infra/chatwoot/sync.mjs
  - lib/chat-contact.ts
  - lib/chat-intake.ts
  - lib/chatwoot-identity.ts
  - lib/driver-accept-email.ts
  - lib/driver-help-contract.ts
  - lib/driver-nav-url.ts
  - lib/email.ts
  - lib/rate-limit.ts
  - middleware.ts
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

# Phase 87: Code Review Report (gap closure 87-15..87-20 plus sheet layout)

**Reviewed:** 2026-11-03
**Depth:** standard (incremental, `git diff 8076d71e`)
**Files Reviewed:** 20
**Status:** issues_found

## Summary

This is an incremental review of the gap closure: driver accept email, Google Maps/Waze chooser, Help chat on the tokenless `/driver/trip/help` page, the driver identity endpoint, the CRM guard, the Drivers inbox sync fallback, and the swipe-up sheet layout.

The security-critical parts hold up.
- **Help endpoint:** The route is CSRF-covered by the `/api/driver/trip` prefix. It is rate-limited and size-capped, and the token is uuid-validated before any DB call. Every rejection returns one uniform 400. The response never contains the trip token.
- **HMAC and config validation:** The HMAC is computed server-side over a namespaced `driver:<uuid>` identifier, and fails closed. The client re-validates the sessionStorage config and rebuilds it from checked fields.
- **CSP:** The help-page CSP is an exact-path match that only adds the chat origin. The matcher is untouched.
- **Accept email:** It reads `driver_price_czk` only (no client price), gates on `isTripLinkValid`, and escapes every interpolated value.

No blockers found. The findings below are the places where a stated invariant (referrer silence, dedupe, HMAC-enforced guard) is not actually enforced by the code, plus one touch-handling bug that hijacks page scrolling.

## Warnings

### WR-01: Trip token can reach the help page as `document.referrer`; "no referrer" is claimed but not enforced

**File:** `app/(internal)/driver/trip/[token]/TripScreen.tsx:359` (navigation), `app/(internal)/driver/trip/help/DriverHelpChat.tsx:64` (claim), `next.config.ts:159-166` (policy)
**Issue:** `openDriverHelpPage()` does `window.location.assign('/driver/trip/help')` from `/driver/trip/<token>`. The global `Referrer-Policy` for every non-`/embed` path is `strict-origin-when-cross-origin`. `middleware.ts:417` sets `no-referrer` for `/embed` only, and nothing under `app/(internal)` overrides it.
- For a same-origin navigation the browser therefore sends the full URL, so on the help page `document.referrer === 'https://rideprestigo.com/driver/trip/<token>'`.
- The page docblock states "Nothing about the page address, the referrer or the visit is sent to Chatwoot".
- That holds only if the Chatwoot SDK never reads `document.referrer`. This is not guaranteed, and no test or header enforces it.
- The token is the sole credential for a driver's write link, so the only thing standing between it and a third party is third-party SDK behaviour.

**Fix:** Make it structural by stopping the trip document from emitting a referrer. In `app/(internal)/driver/trip/[token]/page.tsx` (and the ended/completed variants if they are separate):
```ts
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}
```
A `headers()` entry in `next.config.ts` for `/driver/trip/:token*` also works. Add a test asserting the meta tag or header. The `rel="noopener noreferrer"` already used in `NavigateChooser` shows this is the intended invariant.

### WR-02: Accept-email dedupe is a silent no-op (`.eq('booking_id', null)`)

**File:** `lib/driver-accept-email.ts:98-102` (relies on `lib/email-log.ts:30-36`)
**Issue:** The helper passes `bookingId: null` and `logEmail` dedupes with `.eq('booking_id', params.bookingId)`.
- postgrest-js serialises that as `booking_id=eq.null` (verified in `node_modules/@supabase/postgrest-js/dist/index.cjs:1360`). That never matches a NULL row, and against a uuid column it is a cast error. `logEmail` ignores the error and returns `true`.
- So the "deduped via logEmail" requirement from the UAT gap is not met. Today a double send is prevented only by the single-use `token_used_at` guard in `/api/driver/respond`, not by dedupe.
- The same pattern exists in `assign/route.ts:154`, so it is copied rather than introduced, but the new code advertises dedupe it does not have.

**Fix:** Fix it once in `lib/email-log.ts`:
```ts
let q = supabase.from('email_log').select('id')
q = params.bookingId === null ? q.is('booking_id', null) : q.eq('booking_id', params.bookingId)
const { data: existing } = await q.eq('email_type', params.emailType)...
```
Or pass `booking.id` here, if the FK collision mentioned in the assign route comment does not apply. Add a test that a second call within 10 minutes returns `false`.

### WR-03: Accept email failure is swallowed and then logged as `outcome=sent`

**File:** `lib/driver-accept-email.ts:117-126`, `lib/email.ts` (`sendDriverAcceptedEmail`, around line 1883)
**Issue:** `sendDriverAcceptedEmail` catches every Resend error and returns `void`. The caller then unconditionally logs `outcome=sent` and returns `'sent'`.
- The `email_log` row is written before the send.
- A Resend failure (the exact symptom UAT gap 1 was raised for: the driver gets no email) therefore leaves no error trail beyond a generic `console.error`.
- There is no signal for the operator, and the 10-minute dedupe row (once WR-02 is fixed) would suppress a retry.

**Fix:** Have `sendDriverAcceptedEmail` return `boolean`, and in the caller:
```ts
const ok = await sendDriverAcceptedEmail({...})
return ok ? sent(...) : skip(assignmentId, 'send_failed')
```
Log `outcome=send_failed` through `console.error`. Optionally delete the log row on failure so a retry is possible.

### WR-04: Swipe handlers on the sheet head hijack ordinary page scrolling

**File:** `app/(internal)/driver/trip/[token]/TripScreen.tsx:140-155, 619-622`
**Issue:** `onTouchEnd` treats any vertical movement of 24 px or more as a sheet gesture, with no direction lock, no velocity check and no scroll awareness.
- With the sheet expanded, content such as note, flight and client notes can exceed the viewport and the document scrolls.
- A driver who scrolls back up by dragging down with a finger that starts on the time/status head (a large touch target) collapses the sheet mid-scroll.
- A diagonal drag counts too, because only `dy` is used.
- There is no `touchcancel` handler either.
- Scroll gestures starting on the head are common, so this is a reproducible misfire on the main screen.

**Fix:** Apply the gesture only where it cannot conflict with scrolling.
- Restrict the swipe to the handle button, and give it `touchAction: 'none'`.
- Or require `Math.abs(dy) > 2 * Math.abs(dx)` and, when collapsing, `window.scrollY === 0`.
- Also reset `swipeStartY` on `onTouchCancel`.

### WR-05: CRM guard trusts HMAC identity validation on the Drivers inbox, but nothing configures or verifies it

**File:** `lib/driver-help-contract.ts:7-9` (assumption), `infra/chatwoot/inboxes.json:48`, `infra/chatwoot/sync.mjs:370-377`
**Issue:** The contract comment justifies trusting the `driver:` prefix "only because the widget inbox enforces HMAC identity validation". `inboxes.json` sets `hmac_mandatory: true` only for the config-as-code Website inbox.
- The managed `Drivers` entry carries `enable_auto_assignment`, `greeting_enabled` and `csat_survey_enabled`, and nothing about HMAC or `allowed_domains`.
- The sync change deliberately excludes the Website inbox from the fallback, so Drivers is created and configured by hand.
- If the owner creates it with `hmac_mandatory` off, anyone holding that inbox's public website token can call `setUser('driver:<uuid>')` unsigned. That suppresses CRM Lead and Contact creation for their chat (the "at most suppress a Lead" case the contract accepts) and lets them impersonate a driver contact.
- Nothing in the repo or the 87-20 summary records or checks the setting.

**Fix:** Do at least one of these.
- Add a post-sync assertion in `infra/chatwoot/inspect.mjs` that the Drivers inbox reports `hmac_mandatory=true` and an `allowed_domains` limited to the site.
- Extend the `managed` schema so `sync.mjs` applies `hmac_mandatory` to web-widget entries.
- Add a runbook line to 87-20 (and the README) so the check is explicit.

### WR-06: Unsent driver note is lost when Help opens the chat page

**File:** `app/(internal)/driver/trip/[token]/TripScreen.tsx:157, 359`, `TripDetails` draft prop
**Issue:** The note draft lives only in React state ("survives collapsing the sheet and `router.refresh()`"). Help now leaves with a full page load (`location.assign`, deliberately not the Next router).
- The draft is destroyed on the way out.
- "Back to trip" then restores the page from bfcache only when eligible. Dynamic pages sent with `Cache-Control: no-store` typically are not, so the driver comes back to an empty note.
- A driver writing a note to the office and then tapping Help (the two are naturally used together) loses text silently.

**Fix:** Mirror the draft into `sessionStorage` (keyed by a hash of the token or the booking reference) on change and restore it in the `useState` initializer. Alternatively, warn before leaving when `noteDraft` is non-empty and unsent.

## Info

### IN-01: `swipedRef` can swallow the next non-touch click

**File:** `app/(internal)/driver/trip/[token]/TripScreen.tsx:589-595`
**Issue:** After a touch swipe, no click is synthesised, so `swipedRef` stays `true` until the next `touchstart`. A following mouse or keyboard activation of the handle (hybrid devices, assistive tech) is swallowed once.
**Fix:** Clear the flag with a short timeout (`setTimeout(() => { swipedRef.current = false }, 400)`) in `onTouchEnd`.

### IN-02: `buildCspDriverHelp` duplicates `buildCsp` line by line

**File:** `middleware.ts:140-152`
**Issue:** The two builders can drift on any future CSP edit. The equality test in `tests/middleware-i18n.test.ts` catches this, but only if it keeps running.
**Fix:** Optionally derive the help CSP from `buildCsp(nonce)` by appending the chat tokens to the three directives, so there is one source of truth.

### IN-03: Half-configured Drivers env pair silently falls back to the Website inbox

**File:** `app/api/driver/trip/[token]/help/route.ts:68-70`
**Issue:** `useDriverInbox` requires both values. If only one is set (typo or partial env change), driver chats quietly go to the Website inbox, which has a required-email pre-chat form and a different audience, with no log line.
**Fix:** Emit a one-time `console.warn` (names only, no values) when exactly one of the two is set.

### IN-04: Small value-handling slips in names, phones and email rows

**File:** `lib/chatwoot-identity.ts:103`, `TripScreen.tsx:838`, `lib/email.ts:1777`
**Issue:** Three separate nits.
- A name longer than about 110 characters loses the "(driver)" suffix, because `trimOrNull` truncates after concatenation.
- `phone.replace(/[^\d+]/g, '')` turns "123 ext. 5" into `tel:1235`, a wrong number.
- `passengerPhone != null` renders an empty "Passenger Phone" row for `''`.

**Fix:** Truncate the name before appending the suffix. Hide the call buttons when the phone contains letters. Use `if (data.passengerPhone)` for the row.

### IN-05: Help identity stays in `sessionStorage` for the lifetime of the tab

**File:** `lib/driver-help-contract.ts:104-123`
**Issue:** The config (including the driver's identifier HMAC) is never removed after use. It is only overwritten by the next Help tap. On a shared device a later visit to `/driver/trip/help` opens the chat as the previous driver.
**Fix:** Keep it for reload resilience, but add an expiry timestamp checked in `loadDriverHelpConfig` (for example 12 hours), or clear it on terminal trip states.

---

_Reviewed: 2026-11-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
