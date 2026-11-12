---
status: testing
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
source: [91-VERIFICATION.md]
started: 2026-11-12T00:00:00Z
updated: 2026-11-12T00:00:00Z
---

## Current Test

number: 1
name: Wizard stops UI (desktop and phone width)
expected: |
  On a Prague transfer the client can add 1 to 5 stops (a 6th is refused), pick addresses, remove one and reorder with up/down. The map shows the route in the same order with numbered markers and an updated km/min. Any stop change clears the cached price and promo and refetches the quote.
awaiting: user response

## Tests

### 1. Wizard stops UI (desktop and phone width)
expected: On a Prague transfer the client can add 1 to 5 stops (a 6th is refused), pick addresses, remove one and reorder with up/down. The map shows the route in the same order with numbered markers and an updated km/min. Any stop change clears the cached price and promo and refetches the quote.
result: [pending]

### 2. Waiting select and waiting price line
expected: With no waiting rate set only 0 and 15 minutes are offered. After the owner sets a rate for a class, options up to 120 minutes in 15-minute steps appear; a class without a rate is disabled with the note and is unselected if it was selected. 15 minutes costs nothing, 30 minutes costs one block, two stops of 15 minutes cost nothing. PriceSummary and the Step 6 summary show a separate "Waiting at stops" line equal to rate times paid blocks, and the total includes it.
result: [pending]

### 3. Airport landing and offset UI
expected: With Prague Airport as pickup the date/time fields become landing fields and an offset picker (0/15/30/45/60/90, default 30) appears with "Your driver meets you at HH:MM". Landing 14:00 shows 14:30; landing 23:50 shows 00:20 on the next date; 2027-03-28 landing 01:50 shows 03:20; 2027-10-31 landing 02:40 gives a sensible pickup. Changing the pickup away from the airport clears the landing fields. Readable on a phone.
result: [pending]

### 4. Live tamper check on production
expected: Resending the card-checkout request from devtools with distanceKm=1 and a changed isAirport stores the server distance and the quoted amount. A pickup that differs from landing plus offset is refused.
result: [pending]

### 5. Admin > Pricing waiting rate
expected: A waiting-rate field per class: a positive number persists, empty saves NULL (not offered), 0 or text is rejected, and saving other fields never clears a rate.
result: [pending]

### 6. Admin booking panel Route section and trip edit (list, board, calendar)
expected: A booking with stops shows each stop in order with wait and paid blocks plus the waiting total. An airport booking shows landing, pickup and offset. A booking without stops or landing shows no Route section. Editing price fields of a booking with stops gives the set-price-by-hand message. Editing the pickup of an airport booking to something other than landing plus an allowed offset is refused with a clear message.
result: [pending]

### 7. Add extra charge modal
expected: The action appears only for a completed card booking made under consent 2026-11-3, not for GNet, pay-now, unfinished or old-consent bookings. Waiting mode shows minutes, blocks and the server amount; Other mode takes a description (shown to the client in the receipt) and an amount. The confirm step states the amount, the currency, that the saved card is charged now and the email receipt. The primary button carries the amount, a double click sends one request, the modal cannot be closed while submitting. The extra then appears in the panel's list of extra charges.
result: [pending]

### 8. Move pickup after a flight delay
expected: "Move pickup…" on an airport booking takes a new landing (prefilled from the flight estimate when known) and shows "Move pickup to HH:MM" (landing plus the stored offset) before anything is sent. After confirming, landing and pickup move together, the audit history shows readable rows, the calendar event moves, and the client gets the changed-booking email only when "Notify client" is ticked.
result: [pending]

### 9. Driver trip page and maps (phone)
expected: The link of a booking with 2 stops and an airport pickup shows Landing, Pickup, "Free waiting until HH:MM" (60 minutes from the pickup for the airport, 30 for the city) and each stop with address and wait. No price or fee appears. The map and km/min chip go through the stops in order. A booking without stops looks as before.
result: [pending]

### 10. Emails and calendar as rendered
expected: Client confirmation (pay-now and card flow), driver assignment, driver-accepted and manager alert show stops with waits, a waiting amount in the booking currency (client mail) and Landing / Pickup rows for an airport pickup; nothing extra appears without stops. The extra_charged receipt renders in all 7 locales in the waiting and the other variant. The ops Google Calendar event lists landing and stops.
result: [pending]

### 11. Live Stripe canary after deploy (plan 91-16 Task 3, owner)
expected: The owner sets a waiting rate per class. A production booking with one stop shows the waiting line, stores the server distance and a booking_stops row, and the hold amount includes waiting. After completing it, a 1 EUR "Other" extra on the owner's own card creates a separate PaymentIntent with kind=card_extra, booking_extra_charges.status=charged, ledger admin_action then extra_charged, and one receipt email; bookings.payment_intent_id and payment_state are unchanged. Refunding it in Stripe does not change the booking's own payment state.
result: [pending]

### 12. Live Stripe extra-charge failure paths (review CR-01, WR-02)
expected: A declined card answers declined with no retry and the PaymentIntent is cancelled. A card requiring authentication ends declined and cancelled, never left requires_action. A lost synchronous answer leaves the row charging; a second click answers payment_busy; resume works only after the lease and asks Stripe first. A PaymentIntent that succeeds after its row was marked failed raises the late-success operator alert and no second charge. The webhook finalises a still-charging row exactly once.
result: [pending]

## Summary

total: 12
passed: 0
issues: 0
pending: 12
skipped: 0
blocked: 0

## Gaps
