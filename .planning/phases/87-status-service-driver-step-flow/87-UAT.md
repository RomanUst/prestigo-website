---
status: complete
phase: 87-status-service-driver-step-flow
source: [87-VERIFICATION.md, 87-13-PLAN.md]
started: 2026-11-03T15:59:57Z
updated: 2026-11-03T22:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Real-phone production run of the four driver steps
expected: as above (87-13 Task 3 steps 2, 3, 4, 5)
result: issue
reported: "после того как водитель нажал что принял заказ ему не пришел имеил с заказом"
severity: major
note: four-step flow and admin statuses confirmed working by the owner ("да статусы работают")
reported_2: "у кнопок навигации к пикапу или к дропоффу при нажатии должно быть на выбор гугл мапс или вейз, при нажатии кнопки хелп должен открываться чат который получит чатвоот"

### 2. Double tap and airplane-mode retry
expected: a repeated tap applies nothing twice; with no connection the control shows "No connection" and steps cannot be saved; after reconnecting the step goes through once
result: pass
note: double tap impossible by design (slider + confirm dialog after every slide) — owner confirmed; airplane-mode retry confirmed

### 3. No-show request end to end
expected: with City pickup = 1 min, "Request no-show" appears after the wait; admin shows chip + banner with driver name and time, operator email arrives (needs MANAGER_EMAIL in Vercel), Chatwoot private note appears; "Client found" clears the banner; reset City pickup to 30
result: pass

### 4. Admin change racing a driver step (incl. the Cancel button)
expected: with a step dialog open on the phone, change the status in admin; confirming on the phone shows "The office has updated this trip (...)"; admin keeps its change; the admin Cancel button on a lost race shows a clear message
result: pass
note: completed is terminal (lib/booking-transitions.ts completed: []), admin cannot change it either — owner accepts this; race tested on an active trip

### 5. Device checks E2 / E4 / accessibility
expected: Google logo and attribution fully visible at 360x640 and 390x844 with the distance chip; slide works in WhatsApp / Telegram / Instagram in-app browsers (or Enter/hold fallbacks) without triggering the iOS edge swipe; VoiceOver double tap opens exactly one dialog; 200% zoom keeps the control usable; admin no-show banner readable at 360px and 640px
result: pass

### 6. Owner decision: on_board is not pushed to GNet (D-22)
expected: owner accepts that GNet receives en route / on site / completed only (no ON_BOARD status in GNet), or asks for a follow-up after checking with GRiDD
result: pass
note: owner re-confirmed "да все верно"

### 7. Re-test gap 1 — driver accept email (87-15)
expected: after Accept a "Trip confirmed: PRG-..." email arrives with full details and OPEN TRIP; no Accept/Decline; no client price
result: pass

### 8. Re-test gap 2 — Google Maps / Waze chooser (87-16)
expected: Navigate to pickup / drop-off opens a sheet with Google Maps and Waze; each opens directions to that stop (also inside WhatsApp / Telegram / Instagram); Cancel and tapping outside close it
result: pass

### 9. Re-test gap 3 — Help opens the Chatwoot chat (87-17..87-19)
expected: Help → Chat with the office opens the chat; the message lands in the Drivers inbox from "<name> (driver)" with Chat from: driver and Driver trip: PRG-...; the trip token appears nowhere in Chatwoot; replies show on the phone; Call the office and Back to trip work
result: pass
note: owner "все работает" on booking PRG-20261103-UAT87G; orchestrator verified conversation 218 — inbox Drivers, sender "Roman (driver)", identifier driver:*, no email, custom_attributes {chat_role: driver, driver_trip_ref: PRG-20261103-UAT87G}, referer https://rideprestigo.com/driver/trip/help, no trip-token URL anywhere; chat_conversations.outcome = filtered, no espo lead/contact
open_cosmetic: widget shows the agent "Prestigo Admin" profile photo (a sail) — also visible to clients on the Website inbox; Drivers inbox has no avatar — follow-up

## Summary

total: 9
passed: 8
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "After the driver taps Accept, the driver receives an email with the full order details"
  status: resolved
  resolved_by: 87-15..87-20 (PR #85), re-tested pass 2026-11-03 (tests 7-9)
  reason: "User reported: после того как водитель нажал что принял заказ ему не пришел имеил с заказом"
  severity: major
  test: 1
  root_cause: "Pre-existing (Phase 40), not a Phase 87 regression: app/api/driver/respond/route.ts sends only sendDriverDeclineNotification on 'declined'; on 'accepted' no email is sent. The only driver email with order details is sendDriverAssignmentEmail at assign time (app/api/admin/bookings/[id]/assign/route.ts:165)."
  artifacts:
    - path: "app/api/driver/respond/route.ts"
      issue: "no email on action=accepted"
  missing:
    - "Send the driver a confirmation email with full order details (and the trip-step link) after accept, deduped via logEmail"
  debug_session: ""

- truth: "Tapping the pickup / drop-off navigation button lets the driver choose Google Maps or Waze"
  status: resolved
  resolved_by: 87-15..87-20 (PR #85), re-tested pass 2026-11-03 (tests 7-9)
  reason: "User reported: у кнопок навигации к пикапу или к дропоффу при нажатии должно быть на выбор гугл мапс или вейз"
  severity: major
  test: 1
  root_cause: "By design in D-18: lib/driver-nav-url.ts builds a Google Maps directions URL only; no Waze option, no chooser."
  artifacts:
    - path: "lib/driver-nav-url.ts"
      issue: "only googleMapsDirectionsUrl, no Waze URL"
    - path: "app/(internal)/driver/trip/[token]/TripScreen.tsx"
      issue: "nav button opens Google Maps directly"
  missing:
    - "Add wazeUrl(target) (https://waze.com/ul?ll=lat,lng&navigate=yes or ?q=address) with the same no-PII rule (T-87-37)"
    - "Nav button opens a small chooser: Google Maps / Waze"
  debug_session: ""

- truth: "Tapping Help opens a chat whose messages reach Chatwoot"
  status: resolved
  resolved_by: 87-15..87-20 (PR #85), re-tested pass 2026-11-03 (tests 7-9)
  reason: "User reported: при нажатии кнопки хелп должен открываться чат который получит чатвоот"
  severity: major
  test: 1
  root_cause: "By design in D-18: Help opens ConfirmStepDialog mode='help' with a call link (BUSINESS_TEL_URL) only; no chat on the driver trip page."
  artifacts:
    - path: "app/(internal)/driver/trip/[token]/ConfirmStepDialog.tsx"
      issue: "help mode shows phone link only"
    - path: "app/(internal)/driver/trip/[token]/TripScreen.tsx"
      issue: "Help button opens the call dialog"
  missing:
    - "Open a Chatwoot conversation from Help (reuse the Phase 77/83 Chatwoot widget/inbox), identified as the driver + booking reference, without exposing the trip token; keep the call option as fallback"
  debug_session: ""
