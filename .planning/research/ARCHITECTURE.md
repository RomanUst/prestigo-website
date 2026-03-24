# Architecture Research — Prestigo Booking Form

## Component Structure

```
prestigo/
├── app/
│   ├── book/
│   │   └── page.tsx              # Full wizard page
│   └── api/
│       ├── calculate-price/
│       │   └── route.ts          # Google Routes API proxy
│       ├── create-payment-intent/
│       │   └── route.ts          # Stripe PaymentIntent
│       ├── bookings/
│       │   └── route.ts          # Save booking (Notion + DB)
│       └── webhooks/
│           └── stripe/
│               └── route.ts      # Stripe webhook (payment confirmed)
├── components/
│   ├── booking/
│   │   ├── BookingWizard.tsx     # Orchestrator: step routing, progress bar
│   │   ├── steps/
│   │   │   ├── Step1TripType.tsx # Type + route + passengers
│   │   │   ├── Step2DateTime.tsx # Date, time, extras (hourly duration)
│   │   │   ├── Step3Vehicle.tsx  # Vehicle class selection + live price
│   │   │   ├── Step4Extras.tsx   # Add-ons (child seat, meet & greet)
│   │   │   ├── Step5Passenger.tsx# Name, phone, email, flight, notes
│   │   │   └── Step6Payment.tsx  # Stripe Elements + booking summary
│   │   ├── PriceSummary.tsx      # Sticky price panel (right col / bottom mobile)
│   │   ├── AddressInput.tsx      # Google Places Autocomplete wrapper
│   │   └── ProgressBar.tsx       # Step indicator
│   └── home/
│       └── BookingWidget.tsx     # Mini form on homepage (Step1 only, then /book)
├── lib/
│   ├── booking-store.ts          # Zustand store (wizard state + sessionStorage persist)
│   ├── pricing.ts                # Price calculation logic (rate tables per class)
│   ├── stripe.ts                 # Stripe client/server instances
│   ├── notion.ts                 # Notion client + saveBooking()
│   └── resend.ts                 # Email templates + send functions
└── types/
    └── booking.ts                # BookingData, TripType, VehicleClass, etc.
```

## Data Flow

```
User fills Step 1 (route)
  → Zustand store updated
  → /api/calculate-price called (debounced 500ms)
  → Google Routes API (server-side) → distance_km returned
  → Price calculated: distance × rate[vehicleClass]
  → PriceSummary re-renders

User selects vehicle (Step 3)
  → vehicleClass set in store
  → Price recalculated immediately

User reaches Step 6 (payment)
  → /api/create-payment-intent called
  → Stripe PaymentIntent created with amount
  → client_secret returned to frontend
  → Stripe Elements rendered with client_secret

User submits payment
  → stripe.confirmPayment() called
  → On success: redirect to /book/confirmation?booking_id=xxx
  → Stripe webhook fires → /api/webhooks/stripe
  → Booking saved to Notion + DB
  → Confirmation emails sent (client + manager)
```

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/calculate-price` | POST | Google Routes API proxy → price |
| `/api/create-payment-intent` | POST | Stripe PaymentIntent creation |
| `/api/bookings` | POST | Save booking data (Notion + DB) |
| `/api/webhooks/stripe` | POST | Stripe payment confirmation handler |

## State Management (Zustand)

```typescript
interface BookingStore {
  // Step data
  tripType: 'transfer' | 'airport_pickup' | 'airport_dropoff' | 'hourly' | 'daily'
  origin: PlaceResult | null
  destination: PlaceResult | null
  date: string
  time: string
  hours?: number          // for hourly
  passengers: number
  luggage: number
  vehicleClass: 'business' | 'first' | 'van' | null
  extras: string[]
  passenger: PassengerDetails

  // Pricing
  distanceKm: number | null
  price: PriceBreakdown | null
  quoteMode: boolean       // fallback when route unknown

  // Navigation
  currentStep: number
  completedSteps: number[]
}
```

## Suggested Build Order

1. **Zustand store + types** — foundation everything depends on
2. **BookingWizard + ProgressBar** — shell with step navigation
3. **Step 1** (trip type + address inputs + Google Places)
4. **Pricing API route + PriceSummary** (critical path — users need to see price)
5. **Step 2** (date/time)
6. **Step 3** (vehicle selection + price display)
7. **Step 4** (extras)
8. **Step 5** (passenger details)
9. **Stripe PaymentIntent API + Step 6** (payment)
10. **Stripe webhook + Notion save + email**
11. **Confirmation page**
12. **Homepage mini-widget** (reuses Step 1 components)
13. **sessionStorage persistence + error handling**

## Edge Cases to Handle

- Route not found by Google Maps → show "Request a quote" flow
- Stripe payment fails → show error, allow retry without losing form data
- User goes back from payment step → PaymentIntent abandoned (OK — no charge)
- Google Places API quota exceeded → fallback to text input with warning
- Notion API rate limit → queue retry, don't fail the booking
- User refreshes mid-wizard → restore from sessionStorage
