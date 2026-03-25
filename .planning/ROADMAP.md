# Roadmap: Prestigo Booking Form

## Overview

Six phases deliver a complete multi-step booking wizard for rideprestige.com. The build flows from foundation outward: wizard shell and trip entry first, then pricing engine, then booking details, then payment, then the backend that records everything, and finally the homepage widget and mobile polish. Each phase delivers a coherent, independently verifiable capability. No frontend step can advance to payment before the backend is ready to receive it.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Trip Entry** - Zustand store, types, wizard shell, Step 1 (trip type + route)
- [ ] **Phase 2: Pricing & Vehicle Selection** - Google Routes API pricing engine, Steps 2-3 (date/time + vehicle)
- [ ] **Phase 3: Booking Details** - Steps 4-5 (extras + passenger details) with inline validation
- [ ] **Phase 4: Payment** - Stripe integration, Step 6, confirmation page
- [ ] **Phase 5: Backend & Notifications** - Stripe webhook, Notion save, confirmation and manager emails
- [ ] **Phase 6: Homepage Widget & Polish** - Mini booking widget, mobile QA, accessibility

## Phase Details

### Phase 1: Foundation & Trip Entry
**Goal**: A user can open /book, navigate a 6-step wizard shell, and complete Step 1 — selecting trip type and entering origin/destination with Google Places Autocomplete
**Depends on**: Nothing (first phase)
**Requirements**: ARCH-01, ARCH-02, ARCH-03, WIZD-01, WIZD-02, WIZD-03, WIZD-04, WIZD-05, WIZD-06, STEP1-01, STEP1-02, STEP1-03, STEP1-04, STEP1-05, STEP1-06, STEP1-07
**Success Criteria** (what must be TRUE):
  1. User can open /book and see a 6-step wizard with a visible progress bar showing Step 1 active
  2. User can select any of the 5 trip types and see the form fields adapt (e.g., duration slider for Hourly, airport auto-fill for Airport rides)
  3. User can type in origin/destination fields and see Google Places Autocomplete suggestions
  4. User can click Back on any step and return to the previous step with all previously entered data intact
  5. User can click Next and it remains disabled until all required fields in the current step are filled
**Plans:** 5/6 plans executed

Plans:
- [ ] 01-00-PLAN.md — Wave 0: Vitest + Testing Library infrastructure and test stubs
- [ ] 01-01-PLAN.md — Install deps, define types, create Zustand store with sessionStorage
- [x] 01-02-PLAN.md — Wizard shell, ProgressBar, StepStub, /book page wiring
- [ ] 01-03-PLAN.md — TripTypeTabs, Stepper, DurationSelector components
- [ ] 01-04-PLAN.md — AddressInput (Google Places), Step1TripType assembly, validation
- [ ] 01-05-PLAN.md — Build verification and human visual checkpoint

### Phase 2: Pricing & Vehicle Selection
**Goal**: After entering a route, a user can select a pickup date/time and choose a vehicle class with a live price displayed
**Depends on**: Phase 1
**Requirements**: STEP2-01, STEP2-02, STEP2-03, STEP3-01, STEP3-02, STEP3-03, STEP3-04, STEP3-05, PRICE-01, PRICE-02, PRICE-03, PRICE-04, PRICE-05, PRICE-06
**Success Criteria** (what must be TRUE):
  1. User can pick a date from a calendar (no past dates selectable) and a time in 15-minute increments
  2. User sees 3 vehicle cards (Business, First Class, Business Van) each with photo, capacity, and a calculated price
  3. When user switches between vehicle classes, the price panel updates in real time without a page reload
  4. For an unmappable route, the price panel shows "Request a quote" instead of a number
  5. The Google Maps API key is never visible in browser network requests from the client
**Plans:** 3/5 plans executed

Plans:
- [ ] 02-00-PLAN.md — Wave 0: test stubs for Phase 2 requirements
- [ ] 02-01-PLAN.md — Store extension, pricing module, API route, shimmer CSS
- [ ] 02-02-PLAN.md — Step2DateTime: react-day-picker calendar + time slot list
- [ ] 02-03-PLAN.md — Step3Vehicle: VehicleCard grid + PriceSummary panel
- [ ] 02-04-PLAN.md — BookingWizard wiring + visual verification checkpoint

### Phase 3: Booking Details
**Goal**: A user can add optional extras and fill in passenger details, with fields validated inline as they type
**Depends on**: Phase 2
**Requirements**: STEP4-01, STEP4-02, STEP4-03, STEP5-01, STEP5-02, STEP5-03, STEP5-04
**Success Criteria** (what must be TRUE):
  1. User can toggle extras (Child Seat, Meet & Greet, Extra Luggage) and see each extra's price reflected in the running total
  2. User fills First Name, Last Name, Email, Phone and sees validation errors appear on blur (not on submit)
  3. For airport rides, a Flight Number field appears and is required before Next is enabled
  4. User can type a special request of up to 500 characters with no form submission errors
**Plans**: TBD

### Phase 4: Payment
**Goal**: A user can review their full booking summary and pay with a card, reaching a confirmation page on success
**Depends on**: Phase 3
**Requirements**: STEP6-01, STEP6-02, STEP6-03, STEP6-04, STEP6-05, STEP6-06, PAY-01, PAY-02, PAY-03, PAY-04
**Success Criteria** (what must be TRUE):
  1. User sees a full booking summary (route, vehicle, date, extras, total) before entering card details
  2. User can enter card details in an embedded Stripe Elements input and click Pay
  3. After clicking Pay, the button is immediately disabled — clicking again does not trigger a second charge
  4. On payment failure, an inline error message appears and the user can correct card details without losing booking data
  5. On successful payment, user is redirected to /book/confirmation showing a booking reference number
**Plans**: TBD

### Phase 5: Backend & Notifications
**Goal**: Every confirmed payment reliably triggers a Notion record, a client confirmation email, and a manager alert email
**Depends on**: Phase 4
**Requirements**: BACK-01, BACK-02, BACK-03, BACK-04, BACK-05
**Success Criteria** (what must be TRUE):
  1. After a successful Stripe payment, a new row appears in the Notion bookings database with complete booking details
  2. Client receives a confirmation email with booking summary within seconds of payment
  3. Manager receives a new-booking alert email with all booking details within seconds of payment
  4. If the Notion API fails on first attempt, it retries up to 3 times before the booking is considered lost
  5. The /book/confirmation page displays a booking reference that matches the Notion record
**Plans**: TBD

### Phase 6: Homepage Widget & Polish
**Goal**: A mini booking widget on the homepage lets users pre-fill key fields and jump into the wizard, and the full flow works flawlessly on mobile
**Depends on**: Phase 5
**Requirements**: HOME-01, HOME-02, HOME-03, UX-01, UX-02, UX-03, UX-04, UX-05
**Success Criteria** (what must be TRUE):
  1. Homepage shows an embedded booking widget with trip type selector, address fields (or hours for Hourly), date/time, and a CTA button
  2. Clicking the CTA carries the widget's data into the /book wizard, landing the user at Step 2 or Step 3 with fields pre-filled
  3. The full booking flow is usable on a 375px mobile screen — CTA buttons remain visible above the keyboard at every step
  4. All interactive elements (buttons, inputs, selects) are reachable by keyboard in correct tab order
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Trip Entry | 5/6 | In Progress|  |
| 2. Pricing & Vehicle Selection | 3/5 | In Progress|  |
| 3. Booking Details | 0/TBD | Not started | - |
| 4. Payment | 0/TBD | Not started | - |
| 5. Backend & Notifications | 0/TBD | Not started | - |
| 6. Homepage Widget & Polish | 0/TBD | Not started | - |
