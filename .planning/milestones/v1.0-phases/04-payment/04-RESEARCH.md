# Phase 4: Payment - Research

**Researched:** 2026-03-30
**Domain:** Stripe Payment Element, Next.js App Router API routes, .ics calendar generation, Zustand store extension
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Step 6 Layout**
- Full booking summary replaces PriceSummary at Step 6 — PriceSummary panel is hidden on Step 6 entirely
- Narrow centered column (`max-w-[560px] mx-auto`) on desktop — checkout modal feel, not the wide 2-col layout of Steps 2-3
- Layout: booking summary block → divider → payment form → Pay button — all stacked vertically in one column
- Mobile: same stacked layout, full-width, no bottom bar at Step 6 (Pay button is inline in the form)
- Booking summary content: origin → destination, pickup date + time, vehicle class + pax count, extras list, total (CZK + EUR equivalent)
- Currency display: CZK primary, EUR secondary — e.g. "CZK 2,450 (€98)" — fixed exchange rate stored in server-side config (not hardcoded in UI components)
- Pay button label includes the amount: "Pay CZK 2,450"

**Quote Mode Flow**
- When `quoteMode: true` in Zustand store, Step 6 is skipped entirely
- BookingWizard's Next button in Step 5 routes directly to `/book/confirmation?type=quote` instead of advancing to Step 6
- On submit: call `/api/submit-quote` — a Next.js API route that saves the booking request directly to Notion and sends a manager alert email (NOTE: Notion/email is Phase 5; Phase 4 only creates the route and quote-confirmation landing)
- Quote confirmation page differs from paid booking confirmation page (separate content, same `/book/confirmation` route with `?type=quote` query param)
- Quote confirmation message: "Quote request sent — we'll be in touch within 2 hours" + booking reference (QR- prefix)

**Stripe Integration — Payment Element**
- Use Payment Element (modern all-in-one), not the classic Card Element
- Payment Element renders card + Apple Pay / Google Pay wallet buttons automatically when the browser supports them — wallet buttons enabled
- Stripe Appearance API used to match brand: dark background (#1C1C1E), copper labels and focus rings (#B87333), off-white input text (#F5F2EE), warm-grey borders (#9A958F)
- PaymentIntent created server-side via `/api/create-payment-intent` — Stripe secret key never sent to client
- Client receives only the `clientSecret` to mount the Payment Element
- On click Pay: `stripe.confirmPayment()` with `return_url` pointing to `/book/confirmation?payment_intent_client_secret=...`
- Pay button disabled immediately on click (STEP6-04) — re-enabled only if `confirmPayment` returns an error
- Payment error displayed inline below the Payment Element with a retry message (STEP6-05) — booking data in Zustand is never cleared on error

**Confirmation Page**
- Route: `/book/confirmation` (handles both paid and quote flows via query params)
- Booking reference format: `PRG-YYYYMMDD-NNNN`, generated server-side when creating the PaymentIntent and passed to the confirmation page via URL param
- Static confirmation — no polling; show booking reference and summary immediately from Stripe PaymentIntent data passed in the URL
- Content shown: booking reference (prominent), route summary, date/time, vehicle class, total paid (or "Quote request sent" for quote mode)
- Actions: Print / save as PDF (`window.print()`), Add to calendar (`.ics` file download), Contact button (placeholder)
- Confirmation page is a Next.js App Router client component (for interactivity of print/calendar buttons)
- After landing on confirmation page, Zustand store is reset

### Claude's Discretion
- Exact Stripe Appearance API token values (base them on the CSS custom properties from globals.css)
- Whether `/book/confirmation` is one page with conditional rendering or two separate routes
- Booking reference counter implementation (could use timestamp + random suffix instead of sequential NNNN)
- Exact `.ics` calendar event format and event title
- Step 6 back button behavior (returns to Step 5, does not re-trigger PaymentIntent creation)
- Whether to show a Stripe-hosted "processing..." state overlay or use the built-in Payment Element loading state

### Deferred Ideas (OUT OF SCOPE)
- Multi-currency Stripe charges — v2
- Live FX rate via external API — v2 (fixed rate sufficient for v1)
- 3D Secure / SCA handling — Stripe Payment Element handles this automatically
- Saved cards / returning customer — v2 (requires auth)
- Booking amendment / cancellation flow — v2
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STEP6-01 | Full booking summary shown before card input (route, vehicle, date, total) | BookingSummaryBlock component reads Zustand store; pricing uses existing `priceBreakdown` + `computeExtrasTotal` pattern |
| STEP6-02 | Stripe Elements card input rendered (card number, expiry, CVC) | Stripe Payment Element via `@stripe/react-stripe-js` — single `<PaymentElement />` component covers card + wallet |
| STEP6-03 | "Pay" button creates Stripe PaymentIntent and confirms payment | `/api/create-payment-intent` route (server) → `clientSecret` → `stripe.confirmPayment()` (client) |
| STEP6-04 | Pay button disabled immediately on click (no double-charge) | Disable button in `handleSubmit` before any async call; use `aria-disabled` pattern established in Phase 1 |
| STEP6-05 | Payment error displayed inline with retry option (no data loss) | `confirmPayment` returns `{ error }` when `redirect: "if_required"` or on card error — render below Payment Element, re-enable button |
| STEP6-06 | On successful payment, user redirected to /book/confirmation | `stripe.confirmPayment()` with `return_url: /book/confirmation?...` triggers browser redirect after payment completes |
| PAY-01 | Stripe PaymentIntent created server-side with calculated amount | `stripe.paymentIntents.create({ amount, currency: 'czk', automatic_payment_methods: { enabled: true } })` in `/api/create-payment-intent/route.ts` |
| PAY-02 | Stripe secret key never sent to client (only publishable key) | `STRIPE_SECRET_KEY` server-only env var in API route; `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` for client `loadStripe()` |
| PAY-03 | Stripe webhook `/api/webhooks/stripe` handles `payment_intent.succeeded` | `request.text()` raw body + `stripe.webhooks.constructEvent()` + `stripe-signature` header — App Router pattern |
| PAY-04 | Booking saved (Notion + log) only after webhook confirmation | Webhook handler is the trigger point — stub handler in Phase 4, fully implemented in Phase 5 |
</phase_requirements>

---

## Summary

Phase 4 integrates Stripe's Payment Element into the existing Next.js App Router booking wizard. The technical work is well-scoped: two new API routes, one new step component, one new page, and targeted extensions to the Zustand store and BookingWizard orchestrator. All prior phases have established clear patterns (inline validation, store extension, API route structure) that Phase 4 must follow consistently.

The primary Stripe integration uses `@stripe/stripe-js` (v9.0.0 current) and `@stripe/react-stripe-js` (v6.0.0 current) — neither is installed yet. The integration uses Payment Element (not the legacy Card Element), which automatically handles Apple Pay, Google Pay, and 3D Secure/SCA with no additional implementation work. The server-side `stripe` npm package (v21.0.1 current) is needed for API routes.

The confirmation page is the most compositionally complex new piece: it must handle two flows (paid vs. quote), provide `.ics` download via client-side Blob creation, and reset the Zustand store on mount. The webhook handler (PAY-03) only needs to be stubbed in Phase 4; full Notion/email logic is Phase 5.

**Primary recommendation:** Install three Stripe packages, follow the existing `/api/calculate-price` pattern for the new API routes, and implement `stripe.confirmPayment()` with `redirect: "if_required"` to keep the redirect logic in the component rather than relying on the URL-based return_url only.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@stripe/stripe-js` | 9.0.0 | Client-side Stripe.js loader (`loadStripe`) | Official Stripe browser SDK — required to initialize Elements |
| `@stripe/react-stripe-js` | 6.0.0 | React bindings (`Elements`, `PaymentElement`, `useStripe`, `useElements`) | Official Stripe React SDK — wraps Stripe.js for component-based integration |
| `stripe` | 21.0.1 | Server-side Stripe Node SDK (`PaymentIntent` creation, webhook verification) | Official Stripe server SDK — secret key stays server-only |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Already installed: `zustand` | 5.0.12 | Store extension for `paymentIntentClientSecret`, `bookingReference` | Add new fields to existing store |
| Already installed: `next` | 16.1.7 | App Router API routes for `/api/create-payment-intent`, `/api/submit-quote`, `/api/webhooks/stripe` | Same pattern as `/api/calculate-price` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Payment Element | Classic Card Element | Payment Element is the modern standard; handles wallets, SCA, and dynamic payment methods automatically. Card Element is deprecated in favor of Payment Element for new integrations. |
| `stripe.confirmPayment()` with `return_url` | Checkout Sessions API | CONTEXT.md locks us into PaymentIntent + Payment Element. Checkout Sessions would require a different server/client architecture. |

**Installation:**
```bash
cd prestigo && npm install @stripe/stripe-js @stripe/react-stripe-js stripe
```

**Version verification (as of 2026-03-30):**
- `@stripe/stripe-js`: 9.0.0 (verified via `npm view`)
- `@stripe/react-stripe-js`: 6.0.0 (verified via `npm view`)
- `stripe`: 21.0.1 (verified via `npm view`)

**Environment variables to add to `.env.local`:**
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Architecture Patterns

### Recommended Project Structure

New files for Phase 4:
```
prestigo/
├── app/
│   ├── api/
│   │   ├── create-payment-intent/
│   │   │   └── route.ts           # Server: create PaymentIntent, return clientSecret + bookingRef
│   │   ├── submit-quote/
│   │   │   └── route.ts           # Server: stub for Phase 5 Notion/email; returns QR- reference now
│   │   └── webhooks/
│   │       └── stripe/
│   │           └── route.ts       # Server: constructEvent, stub handler for payment_intent.succeeded
│   └── book/
│       └── confirmation/
│           └── page.tsx           # Client component: paid + quote confirmation, .ics download, print
├── components/
│   └── booking/
│       ├── BookingSummaryBlock.tsx # New: read-only summary card extracted for clarity
│       └── steps/
│           └── Step6Payment.tsx   # New: summary + Elements provider + PaymentElement + Pay button
└── lib/
    └── currency.ts                # New: CZK_TO_EUR_RATE constant (server-safe, also importable client-side)
```

Existing files modified:
```
prestigo/
├── types/booking.ts               # Add PaymentFields interface, extend BookingStore type
├── lib/booking-store.ts           # Add paymentIntentClientSecret, bookingReference fields + setters + resetBooking action
└── components/booking/
    ├── BookingWizard.tsx           # Wire Step 6, hide PriceSummary + mobile bar at step 6, quoteMode skip in step 5 nextStep
    └── PriceSummary.tsx            # Add currentStep === 6 guard to hide both desktop panel and mobile bar
```

### Pattern 1: PaymentIntent Creation (Server Route)

**What:** POST handler creates a Stripe PaymentIntent server-side and returns only the `clientSecret` + generated booking reference.
**When to use:** Called once when Step 6 mounts (or when the Pay button is first clicked — see Pitfall 3).

```typescript
// prestigo/app/api/create-payment-intent/route.ts
// Source: Stripe docs https://docs.stripe.com/payments/quickstart + existing /api/calculate-price pattern
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: Request) {
  try {
    const { amountCZK, bookingData } = await req.json()

    // Generate booking reference server-side
    const now = new Date()
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
    const suffix = String(Math.floor(Math.random() * 9000) + 1000) // 4-digit
    const bookingReference = `PRG-${datePart}-${suffix}`

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCZK * 100, // Stripe uses smallest currency unit (hellers)
      currency: 'czk',
      automatic_payment_methods: { enabled: true },
      metadata: { bookingReference, ...bookingData },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      bookingReference,
    })
  } catch (error) {
    console.error('create-payment-intent error:', error)
    return NextResponse.json({ error: 'Failed to create payment intent' }, { status: 500 })
  }
}
```

### Pattern 2: Client-Side Payment Element Flow

**What:** `Step6Payment.tsx` initializes Stripe, wraps the form in `<Elements>`, renders `<PaymentElement>`, and calls `stripe.confirmPayment()`.
**When to use:** The standard `@stripe/react-stripe-js` pattern for custom checkout UIs.

```typescript
// prestigo/components/booking/steps/Step6Payment.tsx (structure outline)
// Source: @stripe/react-stripe-js docs + WebSearch verified pattern
'use client'

import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useBookingStore } from '@/lib/booking-store'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// Outer component: fetches clientSecret on mount, wraps with Elements
export default function Step6Payment() {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  // ... fetch /api/create-payment-intent on mount, set clientSecret

  const appearance = { /* Stripe Appearance config — see Pattern 3 */ }

  if (!clientSecret) return null // or loading state

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
      <PaymentForm />
    </Elements>
  )
}

// Inner component: uses hooks (must be inside Elements)
function PaymentForm() {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!stripe || !elements) return
    setIsProcessing(true)
    setErrorMessage(null)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/book/confirmation`,
      },
      redirect: 'if_required', // Only redirects if payment method requires it (e.g. 3DS)
    })

    if (error) {
      setErrorMessage(error.message ?? 'Payment failed. Please try again.')
      setIsProcessing(false) // Re-enable button on error
    }
    // On success with redirect: 'if_required', card payments redirect automatically
    // Browser navigates to return_url — no code runs after successful confirmPayment
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
      <PaymentElement />
      {errorMessage && (
        <p style={{ color: '#C0392B', fontSize: 14, fontWeight: 300, marginTop: 8 }}>
          {errorMessage}
        </p>
      )}
      <button
        type="submit"
        className="btn-primary"
        disabled={isProcessing || !stripe}
        aria-disabled={isProcessing}
        style={isProcessing ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
      >
        PAY CZK {amount}
      </button>
    </form>
  )
}
```

### Pattern 3: Stripe Appearance API Config

**What:** Brand the Payment Element to match the project design system.
**Critical note:** The `colorPrimary`, `colorBackground`, `colorText`, and `colorDanger` variables do NOT support `rgba()` or CSS `var(--token)` syntax — use hex values only (verified in official Stripe Appearance API docs).

```typescript
// Source: Stripe Appearance API docs + 04-UI-SPEC.md tokens
const appearance = {
  theme: 'night' as const,
  variables: {
    colorBackground: '#2A2A2D',       // var(--anthracite-mid)
    colorText: '#F5F2EE',             // var(--offwhite)
    colorTextPlaceholder: '#9A958F',  // var(--warmgrey)
    colorPrimary: '#B87333',          // var(--copper)
    colorDanger: '#C0392B',
    fontFamily: "'Montserrat', 'Helvetica Neue', sans-serif",
    fontSizeBase: '14px',
    fontWeightNormal: '300',
    borderRadius: '4px',
  },
  rules: {
    '.Input': {
      border: '1px solid #3A3A3F',
      backgroundColor: '#2A2A2D',
    },
    '.Input:focus': {
      border: '1px solid #B87333',
      outline: '2px solid #B87333',
      outlineOffset: '4px',
    },
    '.Label': {
      fontFamily: "'Montserrat', 'Helvetica Neue', sans-serif",
      fontSize: '10px',
      fontWeight: '400',
      letterSpacing: '0.4em',
      textTransform: 'uppercase',
      color: '#B87333',
    },
  },
}
```

### Pattern 4: Stripe Webhook (App Router)

**What:** Raw body verification — App Router has no default body parser, so `request.text()` gives the raw string needed by `stripe.webhooks.constructEvent()`.

```typescript
// prestigo/app/api/webhooks/stripe/route.ts
// Source: WebSearch verified with official Stripe webhook docs
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(request: Request) {
  const sig = request.headers.get('stripe-signature')
  const body = await request.text() // MUST be .text() for raw body — NOT .json()

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    // Phase 5: save to Notion, send emails
    // Phase 4: stub — log only
    console.log('PaymentIntent succeeded:', paymentIntent.id, paymentIntent.metadata)
  }

  return NextResponse.json({ received: true })
}
```

### Pattern 5: .ics File Generation (Client-Side Blob)

**What:** Generate an `.ics` file from booking data and trigger a browser download — no library needed.
**When to use:** "Add to Calendar" button on the confirmation page.

```typescript
// Source: RFC 5545 (iCalendar spec) — verified via WebSearch + icalendar.dev
function generateICSContent(booking: {
  pickupDate: string      // 'YYYY-MM-DD'
  pickupTime: string      // 'HH:MM'
  origin: string
  destination: string
  bookingReference: string
}): string {
  const dt = new Date(`${booking.pickupDate}T${booking.pickupTime}:00`)
  const dtEnd = new Date(dt.getTime() + 60 * 60 * 1000) // 1-hour event
  const format = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const uid = `${booking.bookingReference}@prestigo.cz`

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PRESTIGO//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${format(new Date())}`,
    `DTSTART:${format(dt)}`,
    `DTEND:${format(dtEnd)}`,
    `SUMMARY:PRESTIGO Transfer — ${booking.bookingReference}`,
    `DESCRIPTION:Pickup: ${booking.origin}\\nDropoff: ${booking.destination}\\nRef: ${booking.bookingReference}`,
    `LOCATION:${booking.origin}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

// Trigger download:
const blob = new Blob([generateICSContent(booking)], { type: 'text/calendar' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `${booking.bookingReference}.ics`
a.click()
URL.revokeObjectURL(url)
```

### Pattern 6: QuoteMode Navigation Skip

**What:** In `BookingWizard.tsx`, detect `quoteMode` in the Step 5 → Step 6 transition and route to confirmation instead.
**When to use:** When `quoteMode === true` in the Zustand store at Step 5.

```typescript
// In BookingWizard.tsx handleNext (or replace the generic nextStep call):
const quoteMode = useBookingStore((s) => s.quoteMode)

const handleNext = () => {
  if (currentStep === 5 && quoteMode) {
    // Submit quote to /api/submit-quote, then navigate
    router.push('/book/confirmation?type=quote&ref=QR-...')
    return
  }
  nextStep()
}
```

Note: `useRouter` from `next/navigation` required for programmatic navigation. BookingWizard is already a `'use client'` component.

### Anti-Patterns to Avoid

- **Creating PaymentIntent on every re-render:** Fetch `clientSecret` once using `useEffect([])`, store in local state. Do NOT call `/api/create-payment-intent` inside the render function.
- **Using `var(--token)` in Stripe Appearance:** Stripe Appearance API rejects CSS variable syntax for color properties. Always inline hex values.
- **Parsing body as JSON in webhook route:** `await request.json()` destroys the raw body needed for `constructEvent()`. Always use `await request.text()`.
- **Clearing Zustand store on payment error:** Only reset the store on the confirmation page mount, never on error path.
- **Placing `loadStripe()` inside a component:** Call `loadStripe()` outside any component (module scope) to avoid re-creating the Stripe instance on every render.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Card input UI | Custom card fields | `<PaymentElement />` | PCI compliance, validation, 3DS, Apple/Google Pay — enormous complexity |
| Webhook signature verification | Custom HMAC check | `stripe.webhooks.constructEvent()` | Timing-safe comparison, replay attack prevention |
| Calendar file generation | Third-party `ical` library | Manual RFC 5545 string (Pattern 5 above) | The spec is simple for a single event; no library needed |
| Payment state machine | Custom loading/error/success states | Stripe's built-in loading state + `confirmPayment` return value | Stripe handles SCA, redirects, and intermediate states |

**Key insight:** Stripe's Payment Element is specifically designed to eliminate hand-rolled payment UIs. Every deviation from the standard Elements flow adds PCI scope and complexity.

---

## Common Pitfalls

### Pitfall 1: `loadStripe()` Called Inside Component
**What goes wrong:** A new Stripe instance is created on every render, causing the Payment Element to unmount and remount, losing input state.
**Why it happens:** Following examples that put `loadStripe(...)` directly in the component body.
**How to avoid:** Declare `const stripePromise = loadStripe(...)` at module scope (outside the component function), before any exports.
**Warning signs:** Payment Element flickers or resets when any parent state changes.

### Pitfall 2: Multiple `Elements` Instances
**What goes wrong:** `confirmPayment` throws `"elements should have a mounted Payment Element"`.
**Why it happens:** The `options` prop passed to `<Elements>` is a new object reference on every render, causing Stripe to create a new Elements instance.
**How to avoid:** Wrap `options` in `useMemo(() => ({ clientSecret, appearance }), [clientSecret])` or move it outside the component.
**Warning signs:** Console error about Elements instances during hot-reload or on re-render.

### Pitfall 3: PaymentIntent Created Before Amount Is Known
**What goes wrong:** PaymentIntent is created with wrong amount if called too early (before store is hydrated or price is loaded).
**Why it happens:** `useEffect([])` fires after first render, which may be before Zustand rehydrates from sessionStorage.
**How to avoid:** Guard the fetch call with a check that `priceBreakdown` and `vehicleClass` are non-null before fetching. Alternatively, accept the `amountCZK` as a prop computed by the parent after store hydration.
**Warning signs:** PaymentIntent created with `amount: 0` or NaN.

### Pitfall 4: Webhook Receives Parsed JSON Body
**What goes wrong:** `stripe.webhooks.constructEvent()` throws `"No signatures found matching the expected signature for payload"`.
**Why it happens:** Using `await request.json()` instead of `await request.text()` — JSON parsing mutates the raw bytes.
**How to avoid:** Always `await request.text()` in the webhook route. This is specific to App Router — Pages Router needed `bodyParser: false`; App Router has no body parser by default, but `request.json()` still parses.
**Warning signs:** Webhook signature errors in logs even when STRIPE_WEBHOOK_SECRET is correct.

### Pitfall 5: Zustand Store Not Reset After Confirmation
**What goes wrong:** User navigates back to `/book` and sees previous booking data pre-filled.
**Why it happens:** sessionStorage persists across navigations within the tab.
**How to avoid:** Call a `resetBooking()` store action in a `useEffect([])` on the confirmation page — this must happen client-side after hydration.
**Warning signs:** Old booking data visible on a fresh `/book` visit within the same tab.

### Pitfall 6: CZK Amount Conversion to Hellers
**What goes wrong:** Stripe charges 100x too little or raises an "amount must be at least 50 CZK" error.
**Why it happens:** Stripe requires amounts in the smallest currency unit (hellers for CZK — 1 CZK = 100 hellers).
**How to avoid:** `amount: amountCZK * 100` in the PaymentIntent creation. CZK has 2 decimal places like EUR.
**Warning signs:** Test payments in Stripe Dashboard show incorrect amounts.

---

## Code Examples

### Currency Config (server-safe, also importable client-side)
```typescript
// prestigo/lib/currency.ts
// CZK is primary charge currency; EUR shown as secondary display only
export const CZK_TO_EUR_RATE = 0.04 // 1 CZK ≈ €0.04 (fixed rate, update periodically)

export function czkToEur(czk: number): number {
  return Math.round(czk * CZK_TO_EUR_RATE)
}

export function formatCZK(amount: number): string {
  return `CZK ${amount.toLocaleString('cs-CZ')}`
}

export function formatEUR(amount: number): string {
  return `€${amount}`
}
```

### Zustand Store Extensions
```typescript
// Add to types/booking.ts
export interface BookingStore {
  // ... existing fields ...
  // Step 6 / Payment
  paymentIntentClientSecret: string | null   // NOT in partialize — never persisted
  bookingReference: string | null            // set from URL param on confirmation page
  setPaymentIntentClientSecret: (s: string | null) => void
  setBookingReference: (ref: string | null) => void
  resetBooking: () => void                   // clears all booking state on confirmation
}

// In partialize — exclude sensitive payment fields:
// DO NOT include paymentIntentClientSecret in partialize
// bookingReference can be excluded too (read from URL on confirmation page)
```

### Confirmation Page — URL Param Reading
```typescript
// prestigo/app/book/confirmation/page.tsx
// Source: Next.js App Router docs — searchParams for client components
'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { useBookingStore } from '@/lib/booking-store'

export default function ConfirmationPage() {
  const searchParams = useSearchParams()
  const type = searchParams.get('type') // 'quote' | null (null = paid booking)
  const ref = searchParams.get('ref')   // booking reference from URL

  const resetBooking = useBookingStore((s) => s.resetBooking)

  useEffect(() => {
    // Reset store on confirmation page arrival so next booking starts clean
    resetBooking()
  }, [resetBooking])

  const isQuote = type === 'quote'
  // ...
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stripe Card Element (individual card/expiry/cvc fields) | Stripe Payment Element (unified, all-in-one) | ~2022 | Handles Apple Pay, Google Pay, 3DS, local payment methods automatically |
| Pages Router `bodyParser: false` for webhooks | App Router `request.text()` for raw body | Next.js 13 | Simpler — no config export needed; `.text()` gives raw bytes |
| Client-side `stripe.createPaymentMethod()` + server confirm | `stripe.confirmPayment()` client-side with `return_url` | ~2021 | Single-step client confirmation; server creates intent, client confirms |
| Legacy `redirect: "always"` | `redirect: "if_required"` | Stripe.js recent | Allows in-page error handling for card payments that don't need 3DS |

**Deprecated/outdated:**
- Card Element (`import { CardElement }` from react-stripe-js): Stripe recommends Payment Element for all new integrations
- `stripe.confirmCardPayment()`: replaced by `stripe.confirmPayment()` with Payment Element

---

## Open Questions

1. **PaymentIntent creation timing — on Step 6 mount vs. on Pay click**
   - What we know: CONTEXT.md shows intent created server-side, `clientSecret` passed to Element
   - What's unclear: If created on mount (before user fills card), the PaymentIntent exists even if user never pays. If created on Pay click, there's a loading delay after click.
   - Recommendation: Create on Step 6 mount (standard Stripe pattern for best UX — Element needs `clientSecret` to render). The dangling intent is harmless; Stripe auto-cancels uncaptured intents.

2. **Booking reference in confirmation URL vs. Stripe metadata**
   - What we know: CONTEXT.md says reference generated server-side when creating PaymentIntent, passed to confirmation page via URL param
   - What's unclear: The `return_url` flow adds Stripe's own `payment_intent_client_secret` param; we must also include our `ref` param
   - Recommendation: Pass `ref` as a URL param from `confirmParams.return_url`: `/book/confirmation?ref=${bookingReference}` — Stripe appends its params alongside ours.

3. **Quote flow `/api/submit-quote` — Phase 4 stub or full implementation**
   - What we know: Phase 5 owns Notion + email. Phase 4 owns the route and quote confirmation UX.
   - What's unclear: Should the Phase 4 stub return a real `QR-` reference (requires generating one) or a placeholder?
   - Recommendation: Generate the `QR-YYYYMMDD-XXXX` reference in the Phase 4 stub (same logic as `PRG-` reference). Log the data. Phase 5 adds the Notion save and email on top of the same route.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 + @testing-library/react 16.3.2 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd prestigo && npx vitest run tests/booking-store.test.ts tests/Step6Payment.test.tsx` |
| Full suite command | `cd prestigo && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STEP6-01 | Booking summary renders route, vehicle, date, extras, total from store | unit | `npx vitest run tests/Step6Payment.test.tsx` | ❌ Wave 0 |
| STEP6-02 | Payment Element renders (Stripe mock) | unit | `npx vitest run tests/Step6Payment.test.tsx` | ❌ Wave 0 |
| STEP6-03 | Pay button calls confirmPayment (mocked stripe) | unit | `npx vitest run tests/Step6Payment.test.tsx` | ❌ Wave 0 |
| STEP6-04 | Pay button disabled immediately on click | unit | `npx vitest run tests/Step6Payment.test.tsx` | ❌ Wave 0 |
| STEP6-05 | Error message shown on confirmPayment error; button re-enabled | unit | `npx vitest run tests/Step6Payment.test.tsx` | ❌ Wave 0 |
| STEP6-06 | On success, router push to /book/confirmation | unit | `npx vitest run tests/Step6Payment.test.tsx` | ❌ Wave 0 |
| PAY-01 | /api/create-payment-intent creates PaymentIntent with correct amount in hellers | unit | `npx vitest run tests/create-payment-intent.test.ts` | ❌ Wave 0 |
| PAY-02 | STRIPE_SECRET_KEY not in any client bundle | manual | `grep -r "STRIPE_SECRET_KEY" prestigo/components prestigo/app --include="*.tsx" --include="*.ts" | grep -v api` | manual only |
| PAY-03 | Webhook route verifies stripe-signature and handles payment_intent.succeeded | unit | `npx vitest run tests/webhooks-stripe.test.ts` | ❌ Wave 0 |
| PAY-04 | Webhook handler stubs Notion save (Phase 5 hook point present) | unit | `npx vitest run tests/webhooks-stripe.test.ts` | ❌ Wave 0 |

### Mocking Strategy for Stripe in Tests

`@stripe/react-stripe-js` components cannot render in jsdom without a real Stripe instance. Use a module mock:

```typescript
// tests/setup.ts addition (or per-test vi.mock)
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: any) => children,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({
    confirmPayment: vi.fn().mockResolvedValue({ error: null }),
  }),
  useElements: () => ({}),
}))
```

### Sampling Rate
- **Per task commit:** `cd prestigo && npx vitest run tests/booking-store.test.ts tests/Step6Payment.test.tsx`
- **Per wave merge:** `cd prestigo && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `prestigo/tests/Step6Payment.test.tsx` — covers STEP6-01 through STEP6-06 (describe blocks by req ID)
- [ ] `prestigo/tests/create-payment-intent.test.ts` — covers PAY-01 (amount conversion, clientSecret returned)
- [ ] `prestigo/tests/webhooks-stripe.test.ts` — covers PAY-03, PAY-04 (constructEvent mock, event dispatch)
- [ ] `prestigo/tests/confirmation-page.test.tsx` — covers store reset, type=quote rendering, booking reference display
- [ ] Stripe module mock — add to `prestigo/tests/setup.ts` or `vi.mock` in each Stripe test file

---

## Sources

### Primary (HIGH confidence)
- Stripe Appearance API docs (https://docs.stripe.com/elements/appearance-api) — variable names, hex-only color restriction, `.Input`, `.Label` rule selectors
- Stripe PaymentIntent quickstart (https://docs.stripe.com/payments/quickstart) — server-side `paymentIntents.create()` shape, `automatic_payment_methods`, client-side `confirmPayment()` flow
- `npm view @stripe/stripe-js version` — 9.0.0 (verified 2026-03-30)
- `npm view @stripe/react-stripe-js version` — 6.0.0 (verified 2026-03-30)
- `npm view stripe version` — 21.0.1 (verified 2026-03-30)
- RFC 5545 (iCalendar spec) via icalendar.org — VCALENDAR, VEVENT, DTSTART, UID properties

### Secondary (MEDIUM confidence)
- WebSearch: `@stripe/react-stripe-js` confirmPayment flow — multiple consistent sources confirm `useStripe()`, `useElements()`, `elements.submit()` → `stripe.confirmPayment()` pattern
- WebSearch: Next.js App Router webhook pattern — `request.text()` for raw body — consistent across multiple verified sources including Stripe official webhook docs and Kitson Broadhurst / Max Karlsson dev posts
- WebSearch: `redirect: "if_required"` — multiple sources confirm it enables in-page error handling without unconditional redirect

### Tertiary (LOW confidence)
- None — all critical implementation details verified via official docs or npm registry

---

## Metadata

**Confidence breakdown:**
- Standard stack (Stripe packages, versions): HIGH — verified via npm registry
- Architecture (API route pattern, webhook raw body): HIGH — verified via official Stripe docs and Next.js App Router behavior
- Appearance API (hex-only color restriction): HIGH — explicit statement in official Stripe docs
- `.ics` generation: HIGH — RFC 5545 is a stable, well-documented standard
- Pitfalls (multiple Elements instances, loadStripe scope): MEDIUM — verified via WebSearch with multiple consistent sources + GitHub issues
- PaymentIntent timing decision: MEDIUM — recommended pattern from Stripe docs but discretion applies

**Research date:** 2026-03-30
**Valid until:** 2026-06-30 (Stripe SDK evolves; re-verify package versions before install if more than 90 days pass)
