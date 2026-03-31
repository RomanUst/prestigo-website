# Testing Patterns

**Analysis Date:** 2026-03-31

## Test Framework

**Runner:**
- Vitest 4.1.1
- Config: `vitest.config.ts`

**Assertion Library:**
- `@testing-library/react` 16.3.2 for component testing
- `@testing-library/user-event` 14.6.1 for user interactions
- Vitest's built-in `expect` (via `vitest` import)

**Test Environment:**
- jsdom (browser-like environment)
- Setup files: `tests/setup.ts` (shared configuration and mocks)

**Run Commands:**
```bash
npm test                 # (not configured in package.json, use vitest)
vitest                   # Run tests in watch mode
vitest run               # Run tests once
vitest run --coverage    # Generate coverage report
```

## Test File Organization

**Location:**
- Co-located in `prestigo/tests/` directory (separate from source)
- Grouped by feature/module

**Naming:**
- Exact match to source file: `BookingWizard.test.tsx` for `BookingWizard.tsx`
- API routes: `webhooks-stripe.test.ts` for `/api/webhooks/stripe/route.ts`
- Utilities: `pricing.test.ts` for `lib/pricing.ts`

**Structure:**
```
prestigo/tests/
├── setup.ts                           # Shared mocks and globals
├── BookingWizard.test.tsx             # Component tests
├── Step1TripType.test.tsx
├── BookingWidget.test.tsx
├── webhooks-stripe.test.ts            # API route tests
├── pricing.test.ts
├── booking-store.test.ts              # Store/utility tests
└── ... (20 total test files)
```

## Test Structure

**Suite Organization:**

```typescript
describe('BookingWizard', () => {
  describe('WIZD-01: wizard renders on /book', () => {
    it('renders BookingWizard with ProgressBar')
    it('renders step content for currentStep')
  })

  describe('WIZD-04: Back navigation', () => {
    it('Back button hidden on step 1')
    it('Back button visible on step 2+')
  })
})
```

**Patterns:**
- Feature-based describe blocks (one per requirement/spec)
- Requirement IDs in describe block names (e.g., `WIZD-01`, `STEP3-04`, `HOME-02`)
- One assertion per test (`it`)

**Setup/Teardown:**
```typescript
beforeEach(() => {
  vi.clearAllMocks()
  // Reset store state
  useBookingStore.setState({
    tripType: 'transfer',
    origin: null,
    // ... reset all fields
  })
  mockPush.mockClear()
  capturedOnSelect.clear()
})
```

**Async Test Pattern:**
```typescript
import { act } from '@testing-library/react'

act(() => {
  capturedOnSelect.get('Pick-up address')?.(mockOrigin)
})
```

## Mocking

**Framework:** `vi` (Vitest mocking API)

**Mocking Pattern:**
```typescript
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))
```

**Hoisted Mocks for Complex Setup:**
```typescript
const { stripeStub } = vi.hoisted(() => {
  const constructEvent = vi.fn()
  return { stripeStub: { constructEvent } }
})

vi.mock('stripe', () => {
  return {
    default: function MockStripe() {
      return { webhooks: stripeStub }
    },
  }
})
```

**Mock Ordering:**
- `vi.hoisted()` runs first (before other mocks)
- `vi.mock()` imports must come BEFORE the source file import

**What to Mock:**
- External services: Stripe, Supabase, Resend, Google Maps
- Next.js hooks: `useRouter`, `useRouter` from `next/navigation`
- DOM-heavy libraries: `@stripe/react-stripe-js`
- Components in tests of other components (except simple div/button stubs)

**What NOT to Mock:**
- Zustand store operations (use `store.setState()` to reset state)
- Internal utility functions (test with real implementation)
- React hooks like `useState`, `useEffect`
- Business logic (pricing calculations, validation)

## Fixtures and Factories

**Test Data:**
```typescript
const mockPaymentIntent = {
  id: 'pi_test_123',
  amount: 250000,
  currency: 'czk',
  metadata: {
    bookingReference: 'PRG-20260330-1234',
    tripType: 'transfer',
    // ... full metadata
  },
}

const mockOrigin: PlaceResult = {
  address: '123 Test St',
  placeId: 'place-1',
  lat: 50.08,
  lng: 14.44,
}
```

**Location:**
- Inline in test files (not externalized to separate fixture directory)
- Usually at module level or inside test function
- Complex setups isolated in helper functions: `makeRequest()`, `resetStore()`

**Reset Pattern:**
```typescript
function resetStore() {
  useBookingStore.setState({
    tripType: 'transfer',
    origin: null,
    // ... all initial values
  })
  mockPush.mockClear()
  capturedOnSelect.clear()
}

beforeEach(() => {
  resetStore()
})
```

## Coverage

**Requirements:** Not enforced (no coverage thresholds in vitest config)

**View Coverage:**
```bash
vitest run --coverage
```

**Current State:**
- Many tests are stubs (`.todo()` format)
- Full integration tests exist for: webhook handling, payment intent creation, booking widget
- Partial coverage for: pricing, confirmation page, quote submission

## Test Types

**Unit Tests:**
- Scope: Single function/hook in isolation
- Examples: `pricing.test.ts` tests `calculatePrice()` logic
- Pattern: Mock external dependencies, test return values

**Component Tests:**
- Scope: React component + its hooks/stores
- Examples: `BookingWizard.test.tsx` tests rendering, step transitions, validation
- Pattern: Render with RTL, interact with `fireEvent`/user-event, assert DOM state
- Store access: Via `useBookingStore.getState()` or reset with `setState()`

**Integration Tests:**
- Scope: Full flow including mocked services
- Examples: `webhooks-stripe.test.ts` tests webhook → Supabase save → email chain
- Pattern: Mock service SDKs, test handler with real logic, assert mock call chains
- Flow verification: Check correct data passed to each step

**E2E Tests:**
- Not present in codebase
- Would test full user journey in browser (not implemented)

## Common Patterns

**Async Testing:**
```typescript
it('returns 200 on valid event', async () => {
  const res = await POST(makeRequest())
  expect(res.status).toBe(200)
  const json = await res.json()
  expect(json).toEqual({ received: true })
})
```

**Error Testing:**
```typescript
it('returns 400 on missing stripe-signature header', async () => {
  const req = new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body: 'raw-body',
  })
  const res = await POST(req)
  expect(res.status).toBe(400)
  const json = await res.json()
  expect(json.error).toMatch(/missing stripe-signature/i)
})
```

**State Assertion:**
```typescript
const state = useBookingStore.getState()
expect(state.currentStep).toBe(3)
expect(state.completedSteps.has(1)).toBe(true)
expect(state.completedSteps.has(2)).toBe(true)
```

**Mock Function Assertion:**
```typescript
expect(buildBookingRow).toHaveBeenCalledWith(
  mockPaymentIntent.metadata,
  'pi_test_123',
  'confirmed'
)

expect(withRetry).toHaveBeenCalledWith(
  expect.any(Function),
  3,
  1000
)
```

**Conditional Rendering:**
```typescript
it('renders Book Now button', () => {
  render(<BookingWidget />)
  expect(screen.getByRole('button', { name: /BOOK NOW/i })).toBeInTheDocument()
})

it('renders DurationSelector when tripType is hourly', () => {
  useBookingStore.setState({ tripType: 'hourly' })
  render(<BookingWidget />)
  expect(screen.getByRole('button', { name: /1 hours/i })).toBeInTheDocument()
})
```

**Component Mock Callback Capture:**
```typescript
let capturedOnSelect: Map<string, (place: PlaceResult) => void> = new Map()

vi.mock('@/components/booking/AddressInput', () => ({
  default: ({ ariaLabel, onSelect }: any) => {
    capturedOnSelect.set(ariaLabel, onSelect)
    return <div>...</div>
  },
}))

// In test:
act(() => {
  capturedOnSelect.get('Pick-up address')?.(mockOrigin)
})
```

## Test Execution Strategy

**Stub Tests:**
- Many tests are marked with `.todo()` and have no implementation
- Used as specification/checklist during development
- Convert to real tests (`it()`) when implementing features

**Real Test Examples:**
- `webhooks-stripe.test.ts`: 18 real tests, comprehensive webhook coverage
- `BookingWidget.test.tsx`: 14 real tests covering rendering, validation, navigation
- Most other test files: Mix of real tests and stubs

---

*Testing analysis: 2026-03-31*
