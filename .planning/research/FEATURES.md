# Features Research — Premium Chauffeur Booking Form

## Table Stakes (Users Leave Without These)

### Trip Configuration
- Trip type selector (Transfer / Airport / Hourly / Daily) — first thing users see
- From/To address with autocomplete — no manual typing of city names
- Date + time picker — inline, touch-friendly
- Passenger count selector (1–8)
- Luggage count selector

### Pricing
- Live price shown BEFORE asking for payment details — users expect to see cost
- Price breakdown (base + extras) — transparency builds trust
- Currency display (EUR for CZ market)

### Vehicle Selection
- Photos of each vehicle class — premium clients decide visually
- Capacity displayed (max passengers, luggage)
- Price per class shown side-by-side

### Passenger Details
- Name, phone, email — minimum
- Special requests / notes field

### Airport Rides (specific)
- Flight number field
- Terminal selection
- "Meet & Greet" option (driver with name sign)

### Payment
- Card payment (Stripe Elements) — no redirect to payment page
- Booking summary before payment confirmation
- Email confirmation immediately after payment

### Progress & Navigation
- Step progress indicator (numbered, not just a bar)
- Back button that preserves filled data
- "Next" button disabled until required fields valid

---

## Differentiators (Competitive Advantage)

- **Hourly hire** with duration slider (not all competitors offer this clearly)
- **Fallback to quote** for unusual routes — better than error message
- **Real-time price update** when user changes route or vehicle
- **Step state persisted to sessionStorage** — users don't lose data on refresh
- **Mobile-first wizard** — many competitors have desktop-only forms
- **Premium design matching brand** — copper/anthracite vs generic bootstrap forms

---

## Anti-Features (Deliberately NOT in v1)

| Feature | Why Skip |
|---------|----------|
| User accounts / login | Adds auth complexity, not needed for booking |
| Flight tracking API | Nice-to-have, manual flight number sufficient for v1 |
| Multi-currency | EUR only for CZ market |
| Promo codes | Revenue optimization, not v1 |
| Multi-stop routes | Edge case, add in v2 |
| Real-time availability | No fleet management system in v1 |
| Save booking for later | Auth required, defer to v2 |
| Corporate invoicing | B2B feature, separate phase |

---

## Feature Complexity Matrix

| Feature | Complexity | Priority |
|---------|-----------|----------|
| Trip type selector | Low | P0 |
| Google Places Autocomplete | Medium | P0 |
| Date/time picker | Low-Medium | P0 |
| Live price calculation | High | P0 |
| Vehicle selection with photos | Low | P0 |
| Stripe payment | High | P0 |
| Email confirmation | Medium | P0 |
| Notion integration | Medium | P0 |
| Flight number field | Low | P0 |
| Hourly duration selector | Medium | P1 |
| Mini widget on homepage | Medium | P1 |
| Extras (child seat, etc.) | Low | P1 |
| State persistence (sessionStorage) | Low | P1 |
