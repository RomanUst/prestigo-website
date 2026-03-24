# Stack Research — Prestigo Booking Form

## Recommended Stack (2025)

### Form Management
- **react-hook-form v7** — best-in-class performance, minimal re-renders, native TypeScript support. Don't use Formik (heavier) or uncontrolled forms (hard to manage wizard state).
- **Zod v3** — schema validation, integrates with react-hook-form via `@hookform/resolvers`. Gives you type-safe schemas that double as TypeScript types.

### Maps & Address Autocomplete
- **@googlemaps/js-api-loader** — official Google Maps JS loader. Use for Places Autocomplete (address input) and Routes API (distance/duration calculation).
- **use-places-autocomplete** (v3) — React hook wrapping Google Places Autocomplete, handles debouncing and caching.
- **Confidence: HIGH** — Google Maps is the only real option for CZ/EU coverage + Autocomplete quality.
- ⚠️ Restrict API key by HTTP referrer in production. Enable only Places API + Routes API (Distance Matrix). Budget alert at $50/month.

### Pricing Engine
- Next.js API route (`/api/calculate-price`) that calls Google Routes API server-side (protects API key). Returns distance_km, duration_min, prices per vehicle class.
- Rate per km defined in a config file (not hardcoded in UI).

### State Management (Wizard)
- **Zustand v4** — lightweight store for booking wizard state across steps. Persist to sessionStorage with `zustand/middleware/persist` to survive page refresh.
- Don't use React Context + useReducer (boilerplate) or Redux (overkill).

### Stripe Integration
- **stripe** (Node.js SDK) — server-side for Payment Intent creation
- **@stripe/react-stripe-js** + **@stripe/stripe-js** — client-side Elements for card input
- Pattern: create PaymentIntent on Step 5 (after vehicle selected), confirm on Step 6 (payment). Never expose secret key client-side.

### Email
- **Resend** — best DX for Next.js, generous free tier (3k emails/month), React Email for templates.
- Alternative: Nodemailer + SMTP if already have email provider.

### Notion Integration
- **@notionhq/client** v2 — official Notion SDK. Call from Next.js API route after successful Stripe payment webhook.
- Rate limit: 3 req/sec — use queue or retry logic.

### Animations (Step Transitions)
- **framer-motion v11** — already common in Next.js projects, `AnimatePresence` for step transitions.
- Alternative: CSS transitions only (lighter, sufficient for simple fade/slide).

### Database (Own DB)
- **Prisma + PostgreSQL** (Vercel Postgres or Supabase) — if persistent booking storage needed beyond Notion.
- For v1: Notion as primary store is sufficient. Add Prisma in v2 if reporting/analytics needed.

## What NOT to Use
- ❌ **LimoAnywhere iframe** — replaced by custom form (no design control)
- ❌ **Formik** — heavier than react-hook-form, worse TypeScript support
- ❌ **React Query for form state** — overkill; use Zustand
- ❌ **Next.js pages router** — project already uses App Router
- ❌ **Client-side Google Maps API key** — must be server-side for Routes API calls

## Versions (March 2025)
| Package | Version |
|---------|---------|
| react-hook-form | 7.51+ |
| zod | 3.23+ |
| @hookform/resolvers | 3.3+ |
| zustand | 4.5+ |
| framer-motion | 11.x |
| stripe (server) | 15.x |
| @stripe/react-stripe-js | 2.7+ |
| resend | 3.x |
| @notionhq/client | 2.2+ |
| use-places-autocomplete | 3.x |
