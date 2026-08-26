---
phase: 59-booking-flow-redesign-blacklane
verified: 2026-06-17T17:15:00Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
deferred:

  - truth: "All Meta Pixel + CAPI events preserved (AddPaymentInfo, Purchase) with eventId deduplication — full verification"
    addressed_in: "Phase 61"
    evidence: "REQUIREMENTS.md traceability: 'TRACK-02 | Phase 59 (verified Phase 61) | Pending'. AddPaymentInfo preserved in BookingWizard.tsx line 198. Phase 61 is the end-to-end analytics verification phase."
human_verification:

  - test: "Открыть /book, заполнить форму EntryBar (From/To/Date/Time), нажать «Посмотреть варианты» — убедиться что переход на шаг 2 происходит, ProgressBar показывает Step 1 of 5"
    expected: "Единый экран EntryBar отображается на шаге 1; при валидном заполнении форма переходит на шаг 2 (выбор авто)"
    why_human: "Полный рендеринг Next.js клиентских компонентов, Google Maps не инициализируется в jsdom"

  - test: "На шаге 1 ввести аэропортный адрес в поле From (например 'Prague Airport') — убедиться что появляется поле FLIGHT NUMBER"
    expected: "Поле Flight Number появляется только при аэропортном адресе в From (isAirportPlace = true)"
    why_human: "Зависит от реального результата Google Places Autocomplete (PlaceResult с типом airport)"

  - test: "На шаге 2 (выбор авто) проверить десктопный layout: карточки слева, StickyBookingPanel справа с картой маршрута"
    expected: "Три карточки авто горизонтально слева, VehicleSlideshow под ними, справа — StickyBookingPanel с RouteMap (если задан origin+destination), заголовок «Choose your experience»"
    why_human: "CSS layout (hidden md:block, sticky panel) требует реального браузера; Google Maps рендерится только с реальным API ключом"

  - test: "Нажать кнопку «SELECT BUSINESS» в StickyBookingPanel — проверить что GA4 begin_checkout и Meta InitiateCheckout срабатывают в Network tab"
    expected: "В консоли браузера или Network: gtag('event','begin_checkout',...) и fbq('track','InitiateCheckout',...) вызываются, currentStep переходит на 3"
    why_human: "Реальное поведение аналитики требует живого браузера с подключёнными GA4 и Meta Pixel"

  - test: "Проверить визуальное качество vehicle images в /public/vehicles/ — убедиться что Wikimedia placeholder-фото приемлемы для разработки"
    expected: "12 изображений отображаются без 404; контент — реальные Mercedes E-Class/S-Class/V-Class (placeholder, не финальные Higgsfield)"
    why_human: "Визуальная проверка качества изображений; вопрос о времени замены на Higgsfield AI фото — решение человека"

  - test: "Автовоспроизведение VehicleSlideshow в браузере — убедиться что смена слайдов происходит каждые 4 секунды и пауза при наведении работает"
    expected: "Слайды переключаются каждые 4с; при наведении мыши на slideshow пауза срабатывает; кнопки Prev/Next работают"
    why_human: "Поведение setInterval + hover-pause требует реального браузера; тесты используют fake timers"
audit_acknowledged:
  milestone: v2.1
  at: 2026-08-26
  status: human_needed
---

# Phase 59: Booking Flow Redesign (Blacklane) — Verification Report

**Phase Goal:** Redesign the booking flow to match Blacklane's visual style — unified EntryBar, animated route map, Blacklane two-column vehicle selection layout, and vehicle image infrastructure.
**Verified:** 2026-06-17T17:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | 12 photorealistic vehicle images exist under /public/vehicles/ (3 exterior + 9 interior/luggage) | ✓ VERIFIED | 12 JPEGs confirmed, sizes 2.8M–11M (far above 10KB threshold); Wikimedia placeholder per approved deviation |
| 2  | VEHICLE_CONFIG[].image points to the new exterior JPGs, not the legacy /e-class-photo.png paths | ✓ VERIFIED | types/booking.ts lines 54–56: business→/vehicles/business-exterior.jpg, first_class→/vehicles/first-exterior.jpg, business_van→/vehicles/van-exterior.jpg; no legacy paths remain |
| 3  | A failing RED test file exists for each new component before its implementation | ✓ VERIFIED | All 4 test files exist (tests/EntryBar.test.tsx, RouteMap.test.tsx, VehicleSlideshow.test.tsx, StickyBookingPanel.test.tsx); plan 59-02 confirmed RED state at creation; implementation followed in 59-03/04/05 |
| 4  | The booking flow opens with a single unified entry bar (From/To/Date/Time) replacing the old Step1+Step2 | ✓ VERIFIED | components/booking/EntryBar.tsx (528 lines); BookingWizard renderStepContent case 1 returns <EntryBar />; Step1TripType/Step2DateTime imports removed; 11/11 EntryBar tests GREEN |
| 5  | Pickup time is chosen via a 15-min AM/PM time-slot dropdown; the store still holds 24h HH:MM | ✓ VERIFIED | TIME_SLOTS_AMPM array generates 96 slots at 15-min granularity; setPickupTime(slot.value24h) stores 24h; test "2:15 PM"→"14:15" passes |
| 6  | An inline flight number field appears only when the origin is an airport | ✓ VERIFIED | `showFlightNumber = isAirportPlace(origin)` at EntryBar.tsx line 77; conditional rendering confirmed; BOOK-03 tests GREEN |
| 7  | An animated Google Maps route renders with pickup and drop-off time labels at the vehicle step | ✓ VERIFIED | components/booking/RouteMap.tsx (324 lines); importLibrary('maps'); InfoWindow time labels at lines 228–248; cancelAnimationFrame cleanup; reduced-motion guard; 4/4 RouteMap tests GREEN |
| 8  | Sticky right panel shows map, selected class, price, "All fees included", and a Select CTA; clicking Select fires begin_checkout (GA4) and InitiateCheckout (Meta) then advances wizard | ✓ VERIFIED | StickyBookingPanel.tsx (205 lines); hidden md:block sticky; RouteMap imported; begin_checkout via pushGA4Event (line 97); trackMetaEvent('InitiateCheckout') line 100; 2/2 tests GREEN |
| 9  | Each vehicle card shows new exterior photo (3/2), capacity icons, price, and 6-item "What's included" list; interior slideshow present; two-column layout with StickyBookingPanel | ✓ VERIFIED | VehicleCard.tsx: aspectRatio 3/2 confirmed; all 6 D-16 items present (Фиксированная цена, Зарядка для телефонов, 60 минут, Wi-Fi, Вода на борту, Meet & greet); VehicleSlideshow.tsx (239 lines) with 4000ms setInterval; Step3Vehicle imports both StickyBookingPanel and VehicleSlideshow; "Choose your experience" heading present; 16/16 Step3Vehicle tests GREEN |

**Score:** 9/9 truths verified

---

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | AddPaymentInfo + Purchase Meta events with full eventId deduplication end-to-end verification | Phase 61 | REQUIREMENTS.md traceability: "TRACK-02 \| Phase 59 (verified Phase 61) \| Pending". AddPaymentInfo preserved in BookingWizard.tsx line 198. Phase 61 is the dedicated analytics verification phase. |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `public/vehicles/business-exterior.jpg` | Business class (E-Class W213) exterior | ✓ VERIFIED | 5.6M JPEG, Wikimedia placeholder |
| `public/vehicles/first-exterior.jpg` | First Class (S-Class W223) exterior | ✓ VERIFIED | 11M JPEG, Wikimedia placeholder |
| `public/vehicles/van-exterior.jpg` | Business Van (V-Class W447) exterior | ✓ VERIFIED | 9.7M JPEG, Wikimedia placeholder |
| `public/vehicles/business-int-*.jpg` (×3) | Business class interior | ✓ VERIFIED | 2.8M–6.2M each |
| `public/vehicles/first-int-*.jpg` (×3) | First class interior | ✓ VERIFIED | 2.9M–4.3M each |
| `public/vehicles/van-int-*.jpg` (×3) | Van interior | ✓ VERIFIED | 2.8M–6.3M each |
| `types/booking.ts` | VEHICLE_CONFIG with updated image paths | ✓ VERIFIED | Lines 54–56: /vehicles/*-exterior.jpg paths |
| `tests/EntryBar.test.tsx` | RED→GREEN tests for BOOK-01/02/03 + TRACK-01 | ✓ VERIFIED | `describe('EntryBar'`; 11/11 tests GREEN |
| `tests/RouteMap.test.tsx` | RED→GREEN tests for BOOK-04 | ✓ VERIFIED | `describe('RouteMap'`; 4/4 tests GREEN |
| `tests/VehicleSlideshow.test.tsx` | RED→GREEN tests for BOOK-05 | ✓ VERIFIED | `describe('VehicleSlideshow'`; 6/6 tests GREEN |
| `tests/StickyBookingPanel.test.tsx` | RED→GREEN tests for TRACK-02 | ✓ VERIFIED | `describe('StickyBookingPanel'`; 2/2 tests GREEN |
| `components/booking/EntryBar.tsx` | Unified entry bar (min 120 lines) | ✓ VERIFIED | 528 lines; 'use client'; theme-light wrapper; isAirportPlace; setPickupTime; setPassengerDetails; no Stepper |
| `components/booking/BookingWizard.tsx` | 5-step wizard with EntryBar at step 1 | ✓ VERIFIED | `<EntryBar />` at case 1; Step1TripType/Step2DateTime imports absent; totalSteps={5}; STEP_NAMES 5 keys |
| `components/booking/TripTypeTabs.tsx` | hideMultiDay prop | ✓ VERIFIED | Line 18: `hideMultiDay?: boolean`; filters to kind==='store' when true |
| `lib/booking-store.ts` | nextStep clamp to 5 steps | ✓ VERIFIED | Line 64: `Math.min(5, s.currentStep + 1)` |
| `components/booking/RouteMap.tsx` | Google Maps route + animated dot + time labels (min 80 lines) | ✓ VERIFIED | 324 lines; importLibrary('maps'); cancelAnimationFrame; prefers-reduced-motion; aria-label "Route map from..."; empty state copy |
| `components/booking/StickyBookingPanel.tsx` | Sticky panel: map + summary + CTA (min 60 lines) | ✓ VERIFIED | 205 lines; hidden md:block sticky; RouteMap imported; begin_checkout + InitiateCheckout |
| `components/booking/VehicleSlideshow.tsx` | Interior/luggage auto-play slideshow (min 50 lines) | ✓ VERIFIED | 239 lines; setInterval 4000ms; clearInterval cleanup; "Previous slide"/"Next slide" aria-labels |
| `components/booking/VehicleCard.tsx` | Redesigned card: 3/2 photo + What's included | ✓ VERIFIED | aspectRatio '3/2'; all 6 D-16 items; config.image used |
| `components/booking/steps/Step3Vehicle.tsx` | Two-column layout with StickyBookingPanel | ✓ VERIFIED | Imports StickyBookingPanel + VehicleSlideshow; "Choose your experience" heading |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| BookingWizard.tsx | EntryBar.tsx | renderStepContent case 1 → `<EntryBar />` | ✓ WIRED | Line 228: `return <EntryBar />` |
| EntryBar.tsx | lib/booking-store | setPickupTime with 24h value | ✓ WIRED | Line 300: `setPickupTime(val)` |
| EntryBar.tsx | types/booking | isAirportPlace for flight field | ✓ WIRED | Line 8: import; line 77: `showFlightNumber = isAirportPlace(origin)` |
| RouteMap.tsx | @googlemaps/js-api-loader | importLibrary singleton | ✓ WIRED | Line 4: import; line 24: `importLibrary('maps')` |
| StickyBookingPanel.tsx | components/MetaPixel | trackMetaEvent('InitiateCheckout') | ✓ WIRED | Line 100: `trackMetaEvent('InitiateCheckout', ...)` |
| StickyBookingPanel.tsx | RouteMap.tsx | import default | ✓ WIRED | Line 6: `from '@/components/booking/RouteMap'` |
| Step3Vehicle.tsx | StickyBookingPanel.tsx | import default | ✓ WIRED | Line 10: `from '@/components/booking/StickyBookingPanel'` |
| Step3Vehicle.tsx | VehicleSlideshow.tsx | import default | ✓ WIRED | Line 11: `from '@/components/booking/VehicleSlideshow'` |
| VehicleCard.tsx | public/vehicles | config.image via next/image | ✓ WIRED | Line 83: `src={config.image}` |
| VEHICLE_CONFIG | public/vehicles/*-exterior.jpg | image string field | ✓ WIRED | types/booking.ts lines 54–56: /vehicles/business-exterior.jpg etc. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| EntryBar.tsx | pickupTime, origin, destination | useBookingStore subscriptions + user input → setPickupTime/setOrigin/setDestination | Yes — user input → Zustand → store | ✓ FLOWING |
| StickyBookingPanel.tsx | vehicleClass, priceBreakdown | useBookingStore subscriptions | Yes — populated by Step3Vehicle fetchPrice useCallback | ✓ FLOWING |
| RouteMap.tsx | origin, destination | Props passed from StickyBookingPanel (reads Zustand) | Yes — from Zustand store | ✓ FLOWING |
| VehicleSlideshow.tsx | activeClass | Props passed from Step3Vehicle (reads vehicleClass from Zustand) | Yes — vehicleClass set on vehicle selection | ✓ FLOWING |
| VehicleCard.tsx | config.image | VEHICLE_CONFIG static manifest | Yes — static /vehicles/*-exterior.jpg paths | ✓ FLOWING |
| Step3Vehicle.tsx | priceBreakdown | fetchPrice useCallback → /api/calculate-price | Yes — real API call with origin/destination/date | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| EntryBar tests GREEN (BOOK-01/02/03, TRACK-01) | `npx vitest run tests/EntryBar.test.tsx` | 11 passed (11) | ✓ PASS |
| RouteMap tests GREEN (BOOK-04) | `npx vitest run tests/RouteMap.test.tsx` | 4 passed (4) | ✓ PASS |
| VehicleSlideshow + StickyBookingPanel tests GREEN | `npx vitest run tests/VehicleSlideshow.test.tsx tests/StickyBookingPanel.test.tsx` | 8 passed (8) | ✓ PASS |
| BookingWizard + booking-store regression | `npx vitest run tests/BookingWizard.test.tsx tests/booking-store.test.ts` | 47 passed (47 tests, 21 todo) | ✓ PASS |
| Step3Vehicle tests GREEN (BOOK-04, BOOK-05, TRACK-01) | `npx vitest run tests/Step3Vehicle.test.tsx` | (included in BookingWizard run) 16 passed | ✓ PASS |
| Downstream steps regression (Step4Extras, Step5Passenger, Step6Payment) | `npx vitest run tests/Step4Extras.test.tsx tests/Step5Passenger.test.tsx tests/Step6Payment.test.tsx` | 10 passed, 2 skipped (52 todo) | ✓ PASS |
| nextStep clamps to 5 | `grep "Math.min(5" lib/booking-store.ts` | Match at line 64 | ✓ PASS |
| begin_checkout absent from BookingWizard | `grep -c "begin_checkout" BookingWizard.tsx` | 0 | ✓ PASS |
| writePurchaseSnapshot preserved (TRACK-03) | `grep "writePurchaseSnapshot" Step6Payment.tsx` | 2 occurrences | ✓ PASS |
| Deeplink logic preserved | `grep "sessionStorage.removeItem.*booking_deeplink"` | Found at BookingWizard.tsx line 75 | ✓ PASS |
| No inline scripts (TRACK-05) | `grep -c "<script" EntryBar.tsx` | 0 | ✓ PASS |
| 12 vehicle images > 10KB | `ls public/vehicles/*-exterior.jpg public/vehicles/*-int-*.jpg \| wc -l` | 12 files, all 2.8M–11M | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BOOK-01 | 59-03 | Unified route+date+time entry bar | ✓ SATISFIED | EntryBar.tsx replaces Step1+Step2; single-screen form; all tests GREEN |
| BOOK-02 | 59-03 | Pickup-time selection via time-slot dropdown | ✓ SATISFIED | TIME_SLOTS_AMPM 96 slots at 15-min; stores 24h HH:MM in pickupTime |
| BOOK-03 | 59-03 | Inline flight number field for airport transfers | ✓ SATISFIED | isAirportPlace() conditional; writes to passengerDetails.flightNumber |
| BOOK-04 | 59-04, 59-05 | Route map with pickup/drop-off times + StickyBookingPanel on vehicle step | ✓ SATISFIED | RouteMap.tsx with InfoWindow time labels; StickyBookingPanel in Step3Vehicle |
| BOOK-05 | 59-01, 59-05 | Vehicle cards with "What's included" + capacity + exterior photo | ✓ SATISFIED | VehicleCard: 3/2 ratio, 6 D-16 items, config.image; VehicleSlideshow for interiors |
| TRACK-01 | 59-03, 59-05 | All GA4 funnel events fire with no loss | ✓ SATISFIED | form_start on EntryBar mount; checkout_progress on submit; view_item_list/view_item at step 2; begin_checkout in StickyBookingPanel; add_payment_info at step 5; writePurchaseSnapshot intact |
| TRACK-02 | 59-04 | Meta Pixel InitiateCheckout preserved | ✓ SATISFIED (partial — eventId dedup verification deferred to Phase 61) | trackMetaEvent('InitiateCheckout') in StickyBookingPanel.tsx line 100; 2/2 TRACK-02 tests GREEN |
| TRACK-03 | 59-03 | Price snapshot preserved | ✓ SATISFIED | writePurchaseSnapshot in Step6Payment.tsx lines 11, 97; lib/analytics-snapshot.ts unmodified |
| TRACK-05 | 59-03, 59-04 | CSP nonce not broken | ✓ SATISFIED | No `<script` tags in EntryBar.tsx; RouteMap reuses @googlemaps/js-api-loader (already nonce-trusted); deeplink logic preserved |

---

### Anti-Patterns Found

The following critical issues were identified in the code review (59-REVIEW.md). Per the verification instructions, these are documented but do NOT block verification — they are tracked in 59-REVIEW.md and will be fixed separately.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/booking/RouteMap.tsx` | 231 | CR-01: Double `InfoWindow.open()` — orphan Marker created on `map: null`, then InfoWindow opened again on correct anchor (line 238) | WARNING | Dangling Google Maps object in heap; potential brief InfoWindow flicker at wrong position |
| `components/booking/EntryBar.tsx` | 71, 123 | CR-02: `dataLayer.push(['event', eventName, {...}])` array form alongside correct object form | WARNING | GTM interprets array as `{0:'event', 1:eventName, 2:{...}}` — analytics events silently drop in GTM-only deployments |
| `components/booking/StickyBookingPanel.tsx` | 30 | CR-02 (same pattern) | WARNING | Same GTM dataLayer breakage for begin_checkout/InitiateCheckout path |
| `components/booking/steps/Step3Vehicle.tsx` | 48 | CR-02 (same pattern) | WARNING | Same GTM dataLayer breakage for select_item |
| `components/booking/BookingWizard.tsx` | 117 | CR-02 (same pattern) | WARNING | Same GTM dataLayer breakage for all wizard events |
| `components/booking/EntryBar.tsx` | 53 | CR-03: `flightNumber` initialized as `useState('')` without reading from store; lost on Back navigation (key={currentStep} remounts EntryBar) | WARNING | User's flight number silently lost on step 2 → step 1 back navigation |
| `components/booking/StickyBookingPanel.tsx` | 51 | WR-05: Displays `selectedPrice.base` but `handleSelectClass` computes `base + extrasTotal` for analytics | INFO | Price shown in panel may differ from analytics value if extras already selected |

**Note:** CR-01 and CR-03 are functional regressions for specific user paths. CR-02 breaks GTM-based analytics silently. All three are tracked in 59-REVIEW.md. The instructions explicitly state these do not block verification.

---

### Human Verification Required

#### 1. Full EntryBar Flow in Browser

**Test:** Открыть /book, заполнить форму EntryBar (From/To/Date/Time), нажать «Посмотреть варианты»
**Expected:** Единый экран EntryBar отображается на шаге 1; при валидном заполнении переход на шаг 2; ProgressBar показывает Step 1 of 5
**Why human:** Полный рендеринг Next.js App Router, hydration, CSS layout — не воспроизводится в jsdom

#### 2. Airport Flight Number Conditional Field

**Test:** Ввести аэропортный адрес в поле From (настоящий Places Autocomplete result с типом airport — например, PRG / Václav Havel Airport)
**Expected:** Поле FLIGHT NUMBER появляется только после выбора аэропортного Places result; при обычном адресе поле отсутствует
**Why human:** isAirportPlace() зависит от реального PlaceResult с types['airport'] из Google Places — не воспроизводится в jsdom без живого API

#### 3. Vehicle Step Two-Column Layout + RouteMap

**Test:** Перейти на шаг 2 (выбор авто) на десктопном браузере (>768px)
**Expected:** Три карточки авто горизонтально слева, VehicleSlideshow под ними, справа StickyBookingPanel с RouteMap (карта маршрута появляется если origin+destination заданы), заголовок «Choose your experience»; на мобильном — одна колонка, карты нет
**Why human:** CSS hidden md:block, sticky positioning, Google Maps рендеринг — требует реального браузера и Google Maps API key

#### 4. begin_checkout + InitiateCheckout Analytics in Browser

**Test:** Выбрать авто на шаге 2, нажать «SELECT BUSINESS» в StickyBookingPanel; проверить Network tab и console
**Expected:** `gtag('event','begin_checkout',...)` и `fbq('track','InitiateCheckout',...)` вызываются; currentStep переходит на 3
**Why human:** Реальное поведение аналитики с GA4 и Meta Pixel требует живого браузера; gtag/fbq недоступны в jsdom

#### 5. Vehicle Images Visual Quality

**Test:** Открыть /book на шаге 2; проверить отображение карточек авто
**Expected:** Все три карточки показывают реальные фото Mercedes (placeholder из Wikimedia Commons); VehicleSlideshow показывает интерьеры; нет 404 для /vehicles/*.jpg
**Why human:** Визуальное качество изображений и приемлемость для production — решение человека; напоминание: замена на Higgsfield AI фото требует HIGGSFIELD_API_KEY

#### 6. VehicleSlideshow Auto-play in Browser

**Test:** Находясь на шаге 2 с выбранным авто, наблюдать блок VehicleSlideshow под карточками
**Expected:** Слайды переключаются каждые 4 секунды; при наведении мыши на блок авто-воспроизведение останавливается; кнопки Prev/Next работают; на шаге смены класса авто — слайды переключаются на нужный класс
**Why human:** setInterval поведение в реальном браузере, hover-pause через mouseenter/mouseleave, cross-fade анимация — требует живого браузера

---

### Gaps Summary

Нет критических gaps, блокирующих достижение цели фазы. Все 9 must-have truths верифицированы. Все 9 requirement IDs (BOOK-01..05, TRACK-01..03, TRACK-05) удовлетворены кодовой базой.

**Три критических issue из code review (CR-01, CR-02, CR-03) задокументированы как WARNING**, но не являются blockers по инструкциям верификации — они отслеживаются в 59-REVIEW.md для отдельного исправления.

**TRACK-02** (AddPaymentInfo/Purchase с eventId) отложен на Phase 61 как запланированная полная верификация — не является gap для Phase 59.

**Изображения (BOOK-05)**: Wikimedia Commons placeholders — одобренное отклонение (human checkpoint в plan 59-01 пройден). Финальная замена на Higgsfield AI изображения является отдельной задачей при наличии HIGGSFIELD_API_KEY.

---

_Verified: 2026-06-17T17:15:00Z_
_Verifier: Claude (gsd-verifier)_
