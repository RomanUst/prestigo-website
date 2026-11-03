---
status: testing
phase: 87-status-service-driver-step-flow
source: [87-VERIFICATION.md, 87-13-PLAN.md]
started: 2026-11-03T15:59:57Z
updated: 2026-11-03T15:59:57Z
---

## Current Test

number: 1
name: Real-phone production run of the four driver steps
expected: |
  Trip link opens light, header PRESTIGO + Help only; one control at a time: On my way -> I have arrived -> Passenger on board -> Complete trip, each behind a confirm dialog ("Not yet" cancels). Admin shows En Route / On Location / On Board / Completed after a reload. Completed screen shows booking, date and completed time only; reopening the link shows "Trip completed" with no details.
awaiting: user response

## Tests

### 1. Real-phone production run of the four driver steps
expected: as above (87-13 Task 3 steps 2, 3, 4, 5)
result: [pending]

### 2. Double tap and airplane-mode retry
expected: a repeated tap applies nothing twice; with no connection the control shows "No connection" and steps cannot be saved; after reconnecting the step goes through once
result: [pending]

### 3. No-show request end to end
expected: with City pickup = 1 min, "Request no-show" appears after the wait; admin shows chip + banner with driver name and time, operator email arrives (needs MANAGER_EMAIL in Vercel), Chatwoot private note appears; "Client found" clears the banner; reset City pickup to 30
result: [pending]

### 4. Admin change racing a driver step (incl. the Cancel button)
expected: with a step dialog open on the phone, change the status in admin; confirming on the phone shows "The office has updated this trip (...)"; admin keeps its change; the admin Cancel button on a lost race shows a clear message
result: [pending]

### 5. Device checks E2 / E4 / accessibility
expected: Google logo and attribution fully visible at 360x640 and 390x844 with the distance chip; slide works in WhatsApp / Telegram / Instagram in-app browsers (or Enter/hold fallbacks) without triggering the iOS edge swipe; VoiceOver double tap opens exactly one dialog; 200% zoom keeps the control usable; admin no-show banner readable at 360px and 640px
result: [pending]

### 6. Owner decision: on_board is not pushed to GNet (D-22)
expected: owner accepts that GNet receives en route / on site / completed only (no ON_BOARD status in GNet), or asks for a follow-up after checking with GRiDD
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
