# Research Summary — Prestigo Booking Form

## Recommended Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Form | react-hook-form v7 + Zod v3 | Best performance, TypeScript-first |
| State | Zustand v4 + sessionStorage persist | Lightweight, survives refresh |
| Maps | Google Places Autocomplete + Routes API (server-side) | Best EU coverage |
| Pricing | Next.js API route proxying Google Routes API | Protects key, consistent pricing |
| Payment | Stripe Elements + webhook | Industry standard, PCI compliant |
| Email | Resend + React Email | Best Next.js DX, free tier sufficient |
| Notion | @notionhq/client v2 from API route | Official SDK, rate-limit safe |
| Animations | framer-motion AnimatePresence | Smooth step transitions |

## Table Stakes (Must Have)

1. Trip type selector as first UI element
2. Google Places Autocomplete for addresses
3. Live price shown before payment details
4. Vehicle photos + capacity in selection step
5. Progress indicator with step numbers
6. Back button that preserves data
7. Stripe card payment (no redirect)
8. Immediate email confirmation

## Key Architecture Decisions

- **Wizard state in Zustand** persisted to sessionStorage — survives refresh
- **All pricing server-side** — price used for PaymentIntent == price shown to user
- **Stripe webhook as source of truth** — emails + Notion save triggered by webhook, not client redirect
- **Airport addresses use hardcoded coordinates** — not Places API result for PRG

## Critical Pitfalls to Avoid

1. **Expose Google Maps Routes API key client-side** — must be server-side only
2. **Save booking before Stripe confirms** — use webhook, not client callback
3. **Multiple PaymentIntents** — disable Pay button on click, reuse existing intent
4. **Wrong pricing formula for hourly/daily** — branch pricing logic by trip type
5. **Notion rate limit silently drops booking** — retry + email first

## Build Order

```
Phase 1: Foundation (Zustand store, types, wizard shell, Step 1 UI)
Phase 2: Pricing engine (Google Routes API, PriceSummary, Steps 2-3)
Phase 3: Booking details (Steps 4-5, form validation)
Phase 4: Payment (Stripe, Step 6, confirmation page)
Phase 5: Backend (webhook, Notion, emails)
Phase 6: Homepage widget + polish (mini-widget, mobile QA, edge cases)
```
