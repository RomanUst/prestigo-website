# Phase 85: Statistics - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-31
**Phase:** 85-statistics
**Areas discussed:** What counts as conversion, B2B Account, Repeat customers, Period and page layout

---

## What counts as conversion

| Question | Options | Selected |
|---|---|---|
| Inquiry (top of funnel) | Chat + forms + abandoned checkout / Chat + forms only / Every Chatwoot conversation | Chat + forms + abandoned checkout |
| Booking (bottom) | Paid/confirmed (not unpaid, not cancelled) / Any created except abandoned | Paid/confirmed |
| Linking inquiry → booking | Same identity, 90-day window / Explicit link only / Same identity, no window | Same identity, 90-day window |
| Chat channel source | Persist channel at intake (+ backfill) / Read Chatwoot API at render / No chat channel split | Persist channel at intake |

## B2B Account

| Question | Options | Selected |
|---|---|---|
| Which Accounts | Site corporate accounts / EspoCRM Accounts / Site accounts + segment field | Site corporate accounts |
| Bookings without inquiry | Separate "direct" rows without % / Funnel only | Separate direct rows |
| Columns per Account | Bookings, revenue, avg value, last trip / Bookings + revenue only / Plus unpaid | Bookings, revenue, avg value, last trip |

## Repeat customers

| Question | Options | Selected |
|---|---|---|
| Definition | 2+ paid per identity / 2+ paid per email / Returned on a different day | 2+ paid per identity |
| Rate for period | Among period's customers, full history / Only within period | Among period's customers, full history |
| Top list | Top 10 by revenue / Top 10 by trips / All, sortable | Top 10 by revenue |
| GNet | Exclude / Include | Exclude |

## Period and page layout

| Question | Options | Selected |
|---|---|---|
| Period | Presets + custom range / Presets only | Presets + custom range |
| Date semantics | Funnel by inquiry date, revenue by trip date / All by booking created_at | Funnel by inquiry date, revenue by trip date |
| Currency | EUR / CZK / Both | EUR |
| Old KPIs | Tabs / One long page / Replace | Tabs |

## Claude's Discretion

- SQL/RPC vs route-handler aggregation; round-trip grouping key; channel mapping and column location; backfill
  mechanics; empty states and small-n display; optional sparklines.

## Deferred Ideas

- EspoCRM Accounts / segment field for B2B; conversation metrics (response time); CSV export; debtors per Account.
