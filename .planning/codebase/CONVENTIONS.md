# Coding Conventions

**Analysis Date:** 2026-03-31

## Naming Patterns

**Files:**
- Components: `PascalCase.tsx` (e.g., `Hero.tsx`, `BookingWizard.tsx`, `Step1TripType.tsx`)
- Utilities/modules: `camelCase.ts` (e.g., `booking-store.ts`, `supabase.ts`, `pricing.ts`)
- Test files: `[original-name].test.ts[x]` (e.g., `BookingWizard.test.tsx`, `webhooks-stripe.test.ts`)
- API routes: kebab-case directories with `route.ts` inside (e.g., `/api/create-payment-intent/route.ts`)

**Functions:**
- camelCase for all functions: `createSupabaseServiceClient()`, `calculatePrice()`, `validateStep1()`
- Handler functions use `handle` prefix: `handleNext()`, `handleOriginSelect()`, `handleDestinationClear()`
- Custom hooks use `use` prefix: `useBookingStore`

**Variables:**
- camelCase: `tripType`, `pickupDate`, `vehicleClass`, `bookingReference`
- Constants: `UPPER_SNAKE_CASE` in most cases or `PascalCase` for config objects (e.g., `RATE_PER_KM`, `PRG_CONFIG`, `VEHICLE_CONFIG`)
- State variables follow store/component naming: `origin`, `destination`, `passengerDetails`

**Types:**
- Interface/Type names: `PascalCase` (e.g., `PlaceResult`, `PassengerDetails`, `BookingStore`, `VehicleConfig`)
- Union types: descriptive names (e.g., `TripType`, `VehicleClass`)
- Branded types/discriminated unions preferred (e.g., `TripType = 'transfer' | 'hourly' | 'daily'`)

## Code Style

**Formatting:**
- ESLint config: `eslint.config.mjs` (Next.js core web vitals + TypeScript)
- No explicit Prettier config — uses ESLint defaults
- Single quotes for strings (enforced by eslint-config-next)
- Semicolons required at statement end

**Linting:**
- Framework: ESLint 9 with `eslint-config-next` core-web-vitals and TypeScript plugins
- Config file: `eslint.config.mjs`
- Run command: `npm run lint`
- Ignores: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`

**Key Rules:**
- Strict TypeScript (`"strict": true` in tsconfig)
- No unused imports enforced
- React 19/Next.js 16 patterns expected
- No `any` types without explicit justification

## Import Organization

**Order:**
1. React/Next.js core imports (`react`, `next/...`)
2. Third-party libraries (`zustand`, `stripe`, `@supabase/...`, etc.)
3. Internal utils and types (`@/lib/...`, `@/types/...`)
4. Components (`@/components/...`)

**Path Aliases:**
- `@/*` → project root (defined in `tsconfig.json` as `"@/*": ["./*"]`)
- Always use `@/` prefix for internal imports (never relative paths)

**Example:**
```typescript
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Stripe from 'stripe'
import { useBookingStore } from '@/lib/booking-store'
import type { TripType } from '@/types/booking'
import Step1TripType from '@/components/booking/steps/Step1TripType'
```

## Error Handling

**Patterns:**

1. **Try-Catch with Error Classification:**
```typescript
try {
  const result = await someOperation()
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error'
  console.error('Operation failed:', message)
  // Return error response
}
```

2. **Validation Before Operations:**
```typescript
if (!origin) errs.origin = 'Pickup location is required to continue.'
if (Object.keys(validationErrors).length > 0) {
  setErrors(validationErrors)
  return
}
```

3. **Non-Fatal Errors (Email, Optional Services):**
```typescript
try {
  await sendClientConfirmation(emailData)
} catch (err) {
  console.error('sendClientConfirmation unexpected error:', err)
  // Continue execution — email failures don't block booking
}
```

4. **Retry Logic for Critical Operations:**
```typescript
await withRetry(() => saveBooking(bookingRow), 3, 1000)
// Built-in exponential backoff: 1s, 2s, 4s delays
```

5. **Error Responses in API Routes:**
```typescript
return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
// Clear error message + appropriate HTTP status
```

## Logging

**Framework:** `console` (no external logging library)

**Patterns:**
- Log errors with context: `console.error('Supabase save failed after 3 retries:', err)`
- Use descriptive prefixes matching operation: `console.error('create-payment-intent error:', error)`
- No log levels enforced — relies on `console.error()` for errors and `console.log()` for debug (rarely used)

## Comments

**When to Comment:**
- Complex business logic with side effects (e.g., trip type mapping in pricing)
- Non-obvious API behavior (e.g., "MUST be .text() — NOT .json()" in webhook route)
- Algorithm explanations (e.g., date difference calculations)
- Workarounds or temporary solutions (marked with TODO)

**JSDoc/TSDoc:**
- Not enforced
- Types are explicit via TypeScript, not documented in comments
- Function signatures are self-documenting

## Function Design

**Size:**
- Prefer functions under 50 lines
- Longer functions split by responsibility (see `Step1TripType.tsx` with separate handlers)

**Parameters:**
- Use typed parameters: avoid `any`
- Destructure props in React components
- Use object parameters for multiple related arguments (e.g., `{ amountCZK, bookingData }`)

**Return Values:**
- Always specify explicit return types for exported functions
- Inference acceptable for internal helpers
- React components return JSX

## Module Design

**Exports:**
- One default export per file for components
- Named exports for utilities, types, constants
- Example: `export default function BookingWizard()` + `export const useBookingStore = ...`

**Barrel Files:**
- NOT used — imports are direct (e.g., `import BookingWizard from '@/components/booking/BookingWizard'`)
- Reduces bundler work, clearer dependency graph

## Client vs Server Code

**'use client' directive:**
- Required at top of interactive components: `'use client'`
- Example: `Step1TripType.tsx`, `BookingWizard.tsx`, `Hero.tsx`

**'use server' functions:**
- API routes in `app/api/` are implicitly server-only
- Utility functions (`lib/`) are server-only unless imported in client components

## React Patterns

**State Management:**
- Zustand store for booking state: `useBookingStore` with persistence to `sessionStorage`
- Local component state (`useState`) for UI state only (errors, hover, loading)
- No Redux/Context API

**Hooks:**
- Standard hooks: `useState`, `useEffect`, `useRouter`
- Custom store hook: `useBookingStore` with selector pattern: `useBookingStore((s) => s.tripType)`

**Form Handling:**
- react-hook-form for complex forms (when needed)
- Manual state for simple forms
- Zod for validation schemas

---

*Convention analysis: 2026-03-31*
