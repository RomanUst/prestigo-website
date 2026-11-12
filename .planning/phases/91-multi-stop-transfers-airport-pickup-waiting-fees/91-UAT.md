---
status: testing
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
source: [91-VERIFICATION.md]
started: 2026-11-12T00:00:00Z
updated: 2026-11-12T08:30:00Z
---

## Current Test

number: 2
name: Waiting select and waiting price line (needs the owner's rates)
expected: |
  On a Prague transfer the client can add 1 to 5 stops (a 6th is refused), pick addresses, remove one and reorder with up/down. The map shows the route in the same order with numbered markers and an updated km/min. Any stop change clears the cached price and promo and refetches the quote.
awaiting: owner waiting rates, then the live Stripe canary

## Tests

### 1. Wizard stops UI (desktop and phone width)
expected: On a Prague transfer the client can add 1 to 5 stops (a 6th is refused), pick addresses, remove one and reorder with up/down. The map shows the route in the same order with numbered markers and an updated km/min. Any stop change clears the cached price and promo and refetches the quote.
result: pass
verified_by: Claude in the owner's Chrome on production (rideprestigo.com), 2026-11-12, before and after PR #105
note: FIRST RUN (before #105): /book had no stops UI at all; the stops UI lived in Step1TripType, which the public wizard has not rendered since Phase 59. Fixed by PR #105 (merged, live). SECOND RUN (after #105, desktop): Add stop adds a row with address, wait select and up / down / remove; with 5 rows the Add stop button is gone and comes back after a removal; two stops with addresses (Plzen, Kladno) give a quote request with both stops in that order (309.2 km against 127.3 km without stops) and the map on step 2 shows the route through both with markers 1 and 2. SECOND ISSUE found: step 2 has its own inline route editor without stops and there is no way back to step 1, so a client cannot review, reorder or remove a stop after step 1; the same editor changes the pickup of an airport booking without its landing, which the server then refuses at checkout (PICKUP_MISMATCH). Fixed in PR #106 (route bar on step 2 returns to step 1; duplicate editor removed; test added), merged and live. THIRD RUN (after #106, live): the route bar on step 2 returns to step 1 with both stops kept, no second editor on step 2; moving stop 2 up and continuing sends a new quote in the new order (217.3 km, lower price shown on the vehicle cards). NOT observed on production: promo reset after a stop change, an airport booking edited after step 2, phone width.

### 2. Waiting select and waiting price line
expected: With no waiting rate set only 0 and 15 minutes are offered. After the owner sets a rate for a class, options up to 120 minutes in 15-minute steps appear; a class without a rate is disabled with the note and is unselected if it was selected. 15 minutes costs nothing, 30 minutes costs one block, two stops of 15 minutes cost nothing. PriceSummary and the Step 6 summary show a separate "Waiting at stops" line equal to rate times paid blocks, and the total includes it.
result: [pending]
note: Partly checked. With no rate set /api/waiting-config answers offeredClasses [] and the stop select offers only No wait and 15 min with the note that paid waiting is not available (local browser, PR #105). A quote with a 45 minute wait lists all three classes in waitingUnavailable and adds nothing. The paid part (options to 120 min, blocks, the price line) waits for the owner's rates and for #105.

### 3. Airport landing and offset UI
expected: With Prague Airport as pickup the date/time fields become landing fields and an offset picker (0/15/30/45/60/90, default 30) appears with "Your driver meets you at HH:MM". Landing 14:00 shows 14:30; landing 23:50 shows 00:20 on the next date; 2027-03-28 landing 01:50 shows 03:20; 2027-10-31 landing 02:40 gives a sensible pickup. Changing the pickup away from the airport clears the landing fields. Readable on a phone.
result: pass
verified_by: Claude in the owner's Chrome on production (rideprestigo.com), TEST booking PRG-20261112-277326 only, 2026-11-12
note: Prague Airport as pickup turns the fields into Landing date / Landing time, shows Pickup after landing with 0/15/30/45/60/90 (default 30) and the flight number field. Landing 14:00 -> 14:30, with offset 0 -> 14:00, with 90 -> 15:30. Landing 23:45 + 30 -> 'Your driver meets you on Jun 11, 2027 at 00:15'. 2027-03-28 landing 01:45 + 30 -> 03:15, + 90 -> 04:15. 2027-10-31 landing 02:45 + 30 -> 03:15, 01:45 + 60 -> 02:45. Changing the pickup to a city address brings back DATE / TIME and removes the landing fields. Notes: the landing time is a 15-minute slot list, so 14:05 cannot be entered by the client (the operator's Move pickup takes any minute). Phone width was not checked on production.

### 4. Live tamper check on production
expected: Resending the card-checkout request from devtools with distanceKm=1 and a changed isAirport stores the server distance and the quoted amount. A pickup that differs from landing plus offset is refused.
result: [pending]
note: Partly checked: the quote endpoint ignores a client distanceKm (see test 1). The checkout request itself creates a booking and a live Stripe object, so the stored-distance and PICKUP_MISMATCH checks are done together with the owner's canary (test 11).

### 5. Admin > Pricing waiting rate
expected: A waiting-rate field per class: a positive number persists, empty saves NULL (not offered), 0 or text is rejected, and saving other fields never clears a rate.
result: [pending]
note: The three 'Waiting per extra 15 min (EUR)' fields are on the page, all empty. Saving was not tried: a rate is a live price and the owner sets it.

### 6. Admin booking panel Route section and trip edit (list, board, calendar)
expected: A booking with stops shows each stop in order with wait and paid blocks plus the waiting total. An airport booking shows landing, pickup and offset. A booking without stops or landing shows no Route section. Editing price fields of a booking with stops gives the set-price-by-hand message. Editing the pickup of an airport booking to something other than landing plus an allowed offset is refused with a clear message.
result: pass
verified_by: Claude in the owner's Chrome on production (rideprestigo.com), TEST booking PRG-20261112-277326 only, 2026-11-12
note: Panel opened from the list. Route section: 'Landing 14:00, Pickup 14:30 (+30 min)', stop 1 '45 min, 2 x 15 min paid, EUR 20', stop 2 '15 min, Free waiting', 'Waiting at stops EUR 20', Move pickup button. PATCH with a price field answers 422 stops_edit_unsupported; pickup 14:40 answers 422 landing_pickup_mismatch; pickup 14:45 is accepted and the audit shows pickup_offset_min 30 -> 45. NOT observed: the two refusal messages as rendered in the Edit Trip form (covered by tests only), the panel opened from the board and the calendar (same provider), a booking without stops next to it.

### 7. Add extra charge modal
expected: The action appears only for a completed card booking made under consent 2026-11-3, not for GNet, pay-now, unfinished or old-consent bookings. Waiting mode shows minutes, blocks and the server amount; Other mode takes a description (shown to the client in the receipt) and an amount. The confirm step states the amount, the currency, that the saved card is charged now and the email receipt. The primary button carries the amount, a double click sends one request, the modal cannot be closed while submitting. The extra then appears in the panel's list of extra charges.
result: [pending]
note: Negative case checked: a manual booking (no card, no consent) shows no extra-charge action. The modal itself needs a completed card booking under consent 2026-11-3, so it is checked with the owner's canary (test 11).

### 8. Move pickup after a flight delay
expected: "Move pickup…" on an airport booking takes a new landing (prefilled from the flight estimate when known) and shows "Move pickup to HH:MM" (landing plus the stored offset) before anything is sent. After confirming, landing and pickup move together, the audit history shows readable rows, the calendar event moves, and the client gets the changed-booking email only when "Notify client" is ticked.
result: pass
verified_by: Claude in the owner's Chrome on production (rideprestigo.com), TEST booking PRG-20261112-277326 only, 2026-11-12
note: Dialog shows 'Now: landing 14:00, pickup 14:30 (+30 min)', says 'The landing is already 14:00' until the time changes, then 'Move pickup to 15:40' for landing 15:10; nothing is sent before Confirm move. Confirm sends one POST /landing (200), the panel and the list row show 15:40. Audit rows: landing_time 14:00 -> 15:10, pickup_time 14:30 -> 15:40. The ops calendar webhook answered upserted after each move. A second move with notify_client=true answered 200 (the changed-booking email goes to the owner's address; not read by Claude). A request with a wrong expected pickup answers 409 pickup_changed with the real pickup. NOT observed: prefill from a flight estimate.

### 9. Driver trip page and maps (phone)
expected: The link of a booking with 2 stops and an airport pickup shows Landing, Pickup, "Free waiting until HH:MM" (60 minutes from the pickup for the airport, 30 for the city) and each stop with address and wait. No price or fee appears. The map and km/min chip go through the stops in order. A booking without stops looks as before.
result: pass
verified_by: Claude in the owner's Chrome on production (rideprestigo.com), TEST booking PRG-20261112-277326 only, 2026-11-12
note: Trip link of the TEST booking (assignment inserted in the database, no driver email): Arrival 'Landing 15:25 / Pickup 15:55', 'Free waiting until 16:55' (60 minutes), Stop 1 and Stop 2 with address and wait, no price or currency anywhere. Map goes through both stops with markers 1 and 2, chip '208.9 km, 169 min (est.)'. Checked at desktop width (the page is a phone-width column). NOT observed: a city pickup (30 minutes) and a booking without stops.

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
passed: 5
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

- truth: "Client can add intermediate stops when booking a transfer (STOP-01)"
  status: fixed
  reason: "The public wizard renders EntryBar at step 1; the stops UI lived only in Step1TripType (used by the unused AdminBookingWizard)."
  severity: blocker
  test: 1
  fix: "PR #105 (merged 2026-11-12): EntryBar renders StopList for one-way transfers."

- truth: "An airport booking edited on the vehicle step can still be paid; stops stay visible and editable (STOP-01, STOP-05)"
  status: fixed
  reason: "Step3Vehicle had a second route editor that set the pickup without the landing (server answers PICKUP_MISMATCH at checkout) and knew nothing about stops; no way back to step 1."
  severity: blocker
  test: 1
  fix: "PR #106 (merged 2026-11-12): the route bar returns to step 1; the duplicate editor is removed."

## Observations

- Admin API answers are slow on production (2.5 to 7.5 s per request); several parallel requests from one tab timed out once (504 / no answer for 12 s) and recovered on reload. Seen in Phase 90 as well.
- The TEST booking was cancelled through the admin cancel route after the checks; its driver assignment row was deleted.

