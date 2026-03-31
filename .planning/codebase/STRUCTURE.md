# Codebase Structure

**Analysis Date:** 2026-03-31

## Directory Layout

```
prestigo/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/               # Server-side API route handlers
│   │   ├── health/        # Health check endpoint
│   │   ├── calculate-price/
│   │   ├── create-payment-intent/
│   │   ├── submit-quote/
│   │   └── webhooks/stripe/
│   ├── book/              # Booking pages
│   │   ├── page.tsx       # Main booking wizard page
│   │   └── confirmation/  # Post-payment confirmation
│   ├── contact/           # Contact form page
│   ├── about/             # About page
│   ├── fleet/             # Fleet showcase page
│   ├── services/          # Services listing page
│   ├── routes/            # Routes map page
│   ├── faq/               # FAQ page
│   ├── corporate/         # Corporate/business offerings page
│   ├── layout.tsx         # Root layout with fonts, GA, metadata
│   ├── page.tsx           # Homepage
│   ├── not-found.tsx      # 404 page
│   ├── sitemap.ts         # Dynamic sitemap for SEO
│   └── globals.css        # Global Tailwind imports and custom variables
│
├── components/            # Reusable React components
│   ├── booking/           # Booking-specific components
│   │   ├── steps/         # 6-step wizard components
│   │   │   ├── Step1TripType.tsx
│   │   │   ├── Step2DateTime.tsx
│   │   │   ├── Step3Vehicle.tsx
│   │   │   ├── Step4Extras.tsx
│   │   │   ├── Step5Passenger.tsx
│   │   │   ├── Step6Payment.tsx
│   │   │   └── StepStub.tsx
│   │   ├── BookingWizard.tsx    # Orchestrator for 6-step flow
│   │   ├── BookingWidget.tsx    # Quick-book form (homepage widget)
│   │   ├── BookingSummaryBlock.tsx
│   │   ├── PriceSummary.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── Stepper.tsx
│   │   ├── TripTypeTabs.tsx
│   │   ├── AddressInput.tsx     # Google Places autocomplete wrapper
│   │   ├── DurationSelector.tsx
│   │   └── VehicleCard.tsx
│   ├── Hero.tsx                 # Homepage hero section
│   ├── HeroTypewriter.tsx
│   ├── HowItWorks.tsx           # 3-step process section
│   ├── Services.tsx             # Service offerings section
│   ├── Fleet.tsx                # Vehicle showcase section
│   ├── Routes.tsx               # Route map section
│   ├── Testimonials.tsx         # Customer testimonials section
│   ├── ContactForm.tsx          # Contact form component
│   ├── Nav.tsx                  # Navigation header
│   ├── Footer.tsx               # Footer
│   └── BookingSection.tsx       # Homepage booking widget section
│
├── lib/                   # Utilities and business logic
│   ├── booking-store.ts   # Zustand store with booking state + persistence
│   ├── pricing.ts         # Rate tables, price calculation logic
│   ├── currency.ts        # CZK↔EUR conversion utilities
│   ├── extras.ts          # Extra services config (child seat, meet & greet)
│   ├── email.ts           # Email template builders (Resend integration)
│   └── supabase.ts        # Supabase client, retry wrapper, booking row builder
│
├── types/                 # TypeScript type definitions
│   └── booking.ts         # All booking-related types (TripType, VehicleClass, etc.)
│
├── tests/                 # Vitest unit and integration tests
│   ├── setup.ts           # Test environment setup (Stripe mocks)
│   ├── BookingWizard.test.tsx
│   ├── BookingWidget.test.tsx
│   ├── AddressInput.test.tsx
│   ├── Step1TripType.test.tsx
│   ├── Step2DateTime.test.tsx
│   ├── Step3Vehicle.test.tsx
│   ├── Step4Extras.test.tsx
│   ├── Step5Passenger.test.tsx
│   ├── Step6Payment.test.tsx
│   ├── PriceSummary.test.tsx
│   ├── ProgressBar.test.tsx
│   ├── Stepper.test.tsx
│   ├── TripTypeTabs.test.tsx
│   ├── booking-store.test.ts
│   ├── pricing.test.ts
│   ├── calculate-price.test.ts
│   ├── create-payment-intent.test.ts
│   ├── submit-quote.test.ts
│   ├── webhooks-stripe.test.ts
│   └── confirmation-page.test.tsx
│
├── public/                # Static assets
│   └── vehicles/          # Vehicle images (business.jpg, first-class.jpg, business-van.jpg)
│
├── design-system/         # Design system and brand guidelines (outside app)
│
├── tsconfig.json          # TypeScript compiler config with @ path alias
├── vitest.config.ts       # Vitest test runner config
├── next.config.ts         # Next.js build config
├── eslint.config.mjs      # ESLint configuration
├── postcss.config.mjs      # PostCSS config (Tailwind)
├── package.json           # Dependencies and scripts
└── .env.local             # Local env vars (NOT committed; use .env.example)
```

## Directory Purposes

**app/**
- Purpose: Next.js App Router structure; defines routes, pages, and API endpoints
- Contains: Page components (`.tsx`), API routes (`.ts`), layout definitions, metadata
- Key files: `page.tsx` (homepage), `layout.tsx` (root layout), `app/book/page.tsx` (booking page)

**components/**
- Purpose: Reusable React components organized by domain
- Contains: UI components, form components, layout components
- Subdir `booking/`: Booking-specific components including 6-step wizard + orchestrator
- Subdir `booking/steps/`: Individual step components (Step1, Step2, etc.)

**lib/**
- Purpose: Shared utilities, business logic, external service integrations
- Contains: Zustand store, pricing logic, email templates, Supabase wrapper, currency conversion
- Key files: `booking-store.ts` (state), `pricing.ts` (rates and calculations), `email.ts` (Resend), `supabase.ts` (data persistence)

**types/**
- Purpose: Centralized TypeScript type definitions for type safety across codebase
- Contains: `booking.ts` with all booking-related types, vehicle configs, constants
- Single file: All types imported from `@/types/booking` throughout the app

**tests/**
- Purpose: Unit and integration tests using Vitest
- Contains: Component tests (`.test.tsx`), API tests (`.test.ts`), store tests
- Setup: `setup.ts` mocks Stripe components globally for all tests
- Run: `npm run test` (via package.json) or `vitest watch`

**public/**
- Purpose: Static assets served at root URL
- Contains: Vehicle images in `public/vehicles/`
- Accessed via: `/vehicles/business.jpg` in code

## Key File Locations

**Entry Points:**
- `app/page.tsx`: Homepage with marketing sections and booking widget
- `app/book/page.tsx`: Booking wizard page (6-step flow)
- `app/layout.tsx`: Root layout with fonts, analytics, metadata setup
- `app/api/health/route.ts`: Health check for monitoring

**Configuration:**
- `tsconfig.json`: TypeScript settings with `@/*` path alias pointing to root
- `vitest.config.ts`: Test runner config with jsdom environment
- `next.config.ts`: Next.js build settings
- `eslint.config.mjs`: ESLint rules
- `.env.local`: Local environment variables (secrets, API keys)

**Core Logic:**
- `lib/booking-store.ts`: Zustand store (single source of truth for booking state)
- `lib/pricing.ts`: Rate tables, price calculation, trip type logic
- `types/booking.ts`: All booking type definitions and configs
- `app/api/create-payment-intent/route.ts`: Stripe payment intent creation
- `app/api/webhooks/stripe/route.ts`: Stripe webhook handler (saves bookings, sends emails)

**Testing:**
- `tests/setup.ts`: Global test setup with Stripe mocks
- `tests/booking-store.test.ts`: Store action tests
- `tests/pricing.test.ts`: Price calculation tests
- `tests/BookingWizard.test.tsx`: Multi-step wizard integration test
- `tests/webhooks-stripe.test.ts`: Webhook processing tests

## Naming Conventions

**Files:**
- Pages: `page.tsx` (Next.js convention)
- Components: PascalCase (e.g., `BookingWizard.tsx`, `Step1TripType.tsx`)
- Utilities/services: camelCase (e.g., `booking-store.ts`, `supabase.ts`)
- API routes: Match URL structure (e.g., `app/api/calculate-price/route.ts` → `/api/calculate-price`)
- Tests: `{filename}.test.{ts,tsx}` co-located with source or in `tests/` directory

**Directories:**
- Feature-specific: kebab-case (e.g., `booking/`, `api/`, `steps/`)
- Component groups: camelCase subdirectory names (e.g., `booking/steps/`)

**Functions/Classes:**
- Components: PascalCase
- Hooks: camelCase with `use` prefix (e.g., `useBookingStore()`)
- Utilities: camelCase (e.g., `calculatePrice()`, `buildBookingRow()`)
- Constants: UPPER_SNAKE_CASE (e.g., `RATE_PER_KM`, `VEHICLE_CONFIG`)

**Types:**
- Interfaces: PascalCase (e.g., `BookingStore`, `PlaceResult`, `PassengerDetails`)
- Unions: PascalCase or camelCase (e.g., `TripType`, `VehicleClass`)
- Type aliases: PascalCase

## Where to Add New Code

**New Page/Route:**
1. Create folder in `app/your-new-page/`
2. Add `page.tsx` for public route or `route.ts` for API route
3. Import and compose components from `components/`
4. Add metadata if needed (for SEO)

**New Feature Component:**
1. Primary code: `components/{feature-name}/{FeatureName}.tsx`
2. Sub-components: `components/{feature-name}/{SubComponent}.tsx`
3. Tests: `tests/{feature-name}.test.tsx` or co-locate in `components/`

**New Booking Step (Step 7+):**
1. Create: `components/booking/steps/Step{N}{Name}.tsx`
2. Update: `types/booking.ts` → add state fields to `BookingStore` interface
3. Update: `lib/booking-store.ts` → add actions for new state fields
4. Update: `components/booking/BookingWizard.tsx` → add step render and validation logic
5. Create test: `tests/Step{N}{Name}.test.tsx`

**New Utility/Business Logic:**
- Pricing logic: `lib/pricing.ts`
- Currency/formatting: `lib/currency.ts`
- Store logic: `lib/booking-store.ts`
- Email templates: `lib/email.ts`
- Supabase operations: `lib/supabase.ts`
- Type definitions: `types/booking.ts` (don't scatter types)

**New API Endpoint:**
1. Create: `app/api/{endpoint-name}/route.ts`
2. Export `POST` or `GET` function
3. Use `NextResponse.json()` for responses
4. Add tests: `tests/{endpoint-name}.test.ts`
5. Call from client with `fetch()` in components

**New External Service Integration:**
1. Create wrapper/client in `lib/` (e.g., `lib/resend.ts`, `lib/stripe-client.ts`)
2. Encapsulate SDK initialization and error handling
3. Export typed functions for use in routes/components
4. Add env var documentation in `.env.example`

## Special Directories

**public/**
- Purpose: Static assets (images, fonts, etc.)
- Generated: No
- Committed: Yes
- Accessed: Via `/path-from-public` in code (e.g., `/vehicles/business.jpg`)
- Contains: Vehicle images referenced in `types/booking.ts` VEHICLE_CONFIG

**.next/**
- Purpose: Build output directory
- Generated: Yes (by Next.js build)
- Committed: No (.gitignore)
- Ignore: Don't edit manually

**node_modules/**
- Purpose: Installed dependencies
- Generated: Yes (by npm/yarn)
- Committed: No (.gitignore)
- Refresh: `npm install`

**design-system/**
- Purpose: Externally maintained design system reference
- Generated: No
- Committed: Yes
- Used by: Tailwind CSS custom theme

**tests/**
- Purpose: Vitest test files
- Generated: No
- Committed: Yes
- Run: `npm test` or `npm run test:watch`
- Coverage: Run `npm run test:coverage` (if configured)

---

*Structure analysis: 2026-03-31*
