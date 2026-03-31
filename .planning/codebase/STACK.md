# Technology Stack

**Analysis Date:** 2026-03-31

## Languages

**Primary:**
- TypeScript 5.x - Entire codebase including frontend components, API routes, and utilities
- JSX/TSX - React components throughout `prestigo/components/` and `prestigo/app/`
- JavaScript - Configuration files and scripts

**Secondary:**
- SQL - Database migrations in `supabase/migrations/0001_create_bookings.sql`

## Runtime

**Environment:**
- Node.js (LTS) - Inferred from Next.js 16 requirements

**Package Manager:**
- npm
- Lockfile: `prestigo/package-lock.json` present

## Frameworks

**Core:**
- Next.js 16.1.7 - Full-stack React framework with App Router
  - API routes at `prestigo/app/api/*`
  - Frontend routes at `prestigo/app/*`
  - Image optimization via `next.config.ts`

**UI & Styling:**
- React 19.2.3 - Component framework
- React DOM 19.2.3 - DOM rendering
- Tailwind CSS 4 - Utility-first CSS via `@tailwindcss/postcss`
- Lucide React 1.6.0 - Icon library

**Forms & Validation:**
- React Hook Form 7.72.0 - Form state management
- @hookform/resolvers 5.2.2 - Validation resolver integration
- Zod 4.3.6 - Schema validation (runtime type checking)

**State Management:**
- Zustand 5.0.12 - Lightweight state management at `prestigo/lib/booking-store.ts`

**Maps & Geolocation:**
- @googlemaps/js-api-loader 2.0.2 - Google Maps JS API loader
- use-places-autocomplete 4.0.1 - Places Autocomplete for address input

**Date & Time:**
- react-day-picker 9.14.0 - Calendar/date picker component

**Testing:**
- Vitest 4.1.1 - Unit test framework
- @testing-library/react 16.3.2 - React component testing utilities
- @testing-library/jest-dom 6.9.1 - Extended DOM matchers
- @testing-library/user-event 14.6.1 - User interaction simulation
- jsdom 29.0.1 - DOM implementation for Node.js tests

**Build & Dev:**
- Vite (via Vitest) - Test runner bundler
- @vitejs/plugin-react 6.0.1 - React plugin for Vite
- PostCSS 4 - CSS transformation

**Linting:**
- ESLint 9.x - Code linting via `prestigo/eslint.config.mjs`
  - eslint-config-next 16.1.7 - Next.js ESLint config
    - Includes Core Web Vitals rules
    - TypeScript support

**Type Definitions:**
- @types/node 20.x - Node.js type definitions
- @types/react 19.x - React type definitions
- @types/react-dom 19.x - React DOM type definitions

## Key Dependencies

**Critical:**
- Stripe 21.0.1 - Payment processing server-side SDK at `prestigo/app/api/create-payment-intent/route.ts` and webhook handling
- @stripe/stripe-js 9.0.0 - Stripe client-side library for payment UI
- @stripe/react-stripe-js 6.0.0 - React wrapper for Stripe.js

- @supabase/supabase-js 2.101.0 - PostgreSQL database client at `prestigo/lib/supabase.ts`

- Resend 6.9.4 - Transactional email service at `prestigo/lib/email.ts`

## Configuration

**Environment:**
- `.env.local` - Local development configuration (git-ignored)
- `.env.example` - Template for required environment variables:
  - NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (client-side)
  - GOOGLE_MAPS_API_KEY (server-side)
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - STRIPE_SECRET_KEY
  - STRIPE_WEBHOOK_SECRET
  - RESEND_API_KEY
  - MANAGER_EMAIL

**Build:**
- `prestigo/tsconfig.json` - TypeScript configuration with Next.js plugin
  - Target: ES2017
  - Module resolution: bundler
  - Path alias: `@/*` → `./`
  - Strict mode enabled
  - JSX: react-jsx

- `prestigo/next.config.ts` - Next.js configuration
  - Image optimization with Unsplash remote pattern

- `prestigo/postcss.config.mjs` - PostCSS configuration for Tailwind CSS

- `prestigo/vitest.config.ts` - Vitest configuration
  - Environment: jsdom
  - Globals enabled
  - React plugin enabled
  - Setup file: `prestigo/tests/setup.ts`

## Platform Requirements

**Development:**
- Node.js LTS
- npm
- TypeScript 5.x
- Modern browser with ES2017 support

**Production:**
- Vercel (inferred from `.vercel/` directory and `vercel.json`)
- Node.js server runtime for API routes
- HTTPS support for Stripe webhooks and external APIs

---

*Stack analysis: 2026-03-31*
