# Design References — v1.2 Operator Dashboard

Used as input for Phase 15 (UI Design Contract via `/gsd:ui-phase 15`).

---

## Ref 1: Requests Dashboard (Hotel/Service Operator)

**What it shows:** Operator request management panel — filterable table of service requests with status tracking.

**Key patterns to adopt:**
- **Left sidebar** — two-section nav: "Pinned" (high-priority categories with badge counts) + "Categories" (full list with icons). Dark background (`#1a2035`), light text.
- **Quick filter chips** — horizontal row: Today ✕ · Tomorrow · Open · Confirmed · Ongoing · In house. Active chip = filled (blue/brand color). Dismissible active filters.
- **Search bar** — three fields (First Name, Last Name, Date) + Search button. Top-right shows logged-in user avatar + email.
- **Data table** — columns: DATE · REQUEST · NAME · IN HOUSE · STATUS · DEPARTMENT · Action link. Clean alternating rows, no heavy borders.
- **Status badges** — pill style, soft background + colored text:
  - Open → salmon/red background
  - Confirmed → green background
  - Ongoing → orange background
- **Action** — "View Details" as a text link (no button), right-aligned column.

---

## Ref 2: Chauffeur Admin Wireframe (TAYLOR brand)

**What it shows:** Full chauffeur service admin dashboard — KPI overview + charts + bookings table + trip detail view.

**Key patterns to adopt:**
- **KPI cards row** — 6 cards across top: Booking Conversion Rate · Avg Response Time · Total Number of Bookings · Revenue · Passenger Satisfaction · On-Time Performance. Each card: label + large metric value + trend indicator (↗ arrow).
- **Dual-chart section** — "Booking Volume" with period selector (This Year ▾). Left: bar chart. Right: line chart. Side by side.
- **Upcoming Bookings table** — Passenger · Date · Status columns. Compact rows, status as text badge.
- **Recent Activity Log** — Activity · Details · Date columns. Chronological log of system events (Booking Closed, Booking Accepted, etc.).
- **Trip Detail view** — Point to Point map visual, Chauffeur Details card, Cost Summary, Trip Info (Body Type/Color/Engine/Capacity), Notes sections for both Chauffeur and client.
- **Left sidebar** — narrow icon+label nav: Dashboard · Bookings · Lost & Found · Settings.

---

## Synthesis for PRESTIGO Admin

Combining both references for PRESTIGO brand (anthracite/copper/Cormorant + Montserrat):

| Element | Pattern | From |
|---------|---------|------|
| Page layout | Sidebar (260px) + main content | Both refs |
| Sidebar style | Dark (#1a1a1a / anthracite) matching booking site | Ref 1 |
| Top of main | KPI cards row (4 cards: today's bookings, this week revenue, this month revenue, total bookings) | Ref 2 |
| Bookings page | Filter chips (Today/Open/Confirmed) + table + expand | Ref 1 |
| Stats page | Dual charts + KPI cards | Ref 2 |
| Status badges | Pill shape, 3 colors: Open (red) / Confirmed (green) / Pending (orange) | Ref 1 |
| Table style | Clean rows, minimal borders, "View Details" action | Ref 1 |
| Copper accent | Used for active filter chips, primary buttons, sidebar active state | PRESTIGO brand |
