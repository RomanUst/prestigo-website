# Pitfalls Research

**Domain:** Adding round-trip booking to an existing single-leg chauffeur booking system (Next.js App Router + Stripe + Supabase + Zustand)
**Researched:** 2026-04-04
**Confidence:** HIGH — based on direct source inspection of the live codebase

---

## Critical Pitfalls

### Pitfall 1: UNIQUE constraint on `payment_intent_id` breaks with two booking rows per charge

**What goes wrong:**
The `bookings` table has `payment_intent_id` declared with a UNIQUE constraint. `saveBooking()` uses `upsert([row], { onConflict: 'payment_intent_id', ignoreDuplicates: true })`. A single Stripe PaymentIntent funds both the outbound and return legs. If both rows are inserted with the same `payment_intent_id`, the second insert silently fails (ignored duplicate). Only the outbound booking is persisted. The return leg disappears with no error surfaced to the webhook or the operator.

**Why it happens:**
The UNIQUE constraint was deliberately designed for idempotent dedup: one PaymentIntent = one booking row. The `ignoreDuplicates: true` flag means the conflict produces a no-op, not an error. Developers adding round-trip naturally reuse the same `payment_intent_id` on both rows without realising the constraint blocks the second insert.

**How to avoid:**
Three options — choose one before writing any webhook code:

1. **Preferred:** Store `payment_intent_id` on the outbound row only. The return row gets `payment_intent_id = NULL` and links to the outbound via a FK column (e.g. `linked_booking_id`). The UNIQUE constraint remains valid (NULL is not unique-constrained in PostgreSQL by default).
2. **Alternative:** Suffix the return row's value: `payment_intent_id = pi_xxx_return`. The constraint still protects dedup, and the webhook can strip `_return` to find the Stripe object.
3. **Do not:** Remove the UNIQUE constraint entirely — it protects against webhook replay.

The DB schema change (adding `linked_booking_id` FK column, migration) must land **before** the webhook is modified.

**Warning signs:**
- Admin dashboard shows one booking row after a round-trip payment completes.
- No DB error in Vercel logs (because `ignoreDuplicates: true` swallows the conflict silently).
- `withRetry` retries succeed on all attempts but the second row never appears.

**Phase to address:** Database schema phase (first phase of v1.4) — schema must be correct before any webhook or wizard logic is written.

---

### Pitfall 2: Promo code consumed once but discount silently not applied to return leg price

**What goes wrong:**
The current flow atomically claims the promo code inside `create-payment-intent` using the `claim_promo_code` RPC, which increments `current_uses`. The server recomputes the discount independently and applies it to `totalEur`. For a round trip, if the discount is computed only on the outbound price (or only on `totalEur` without adding the return leg's price first), the promo code is consumed but the client pays more than the displayed discounted total. Alternatively, if the wizard shows a discounted combined total but `create-payment-intent` computes outbound + return separately with two discount applications, `claim_promo_code` is called once — the second application has no code to claim and the discount on the return leg is silently skipped.

**Why it happens:**
The server re-computes price independently of the client display (correct anti-tamper design). But the round-trip price is the sum of outbound + discounted return. The discount % (from `promoDiscount` in the store) is currently applied to a single-leg total. Developers may apply the promo discount to each leg's partial total without summing first, or sum first but forget to include the return leg's base before the discount computation.

**How to avoid:**
In `create-payment-intent`, compute: `outboundTotal + returnTotal` to get `combinedTotal`, then apply the promo discount once to `combinedTotal`. The return leg's operator discount (return %) is separate and is applied to `returnTotal` before it enters the `combinedTotal`. Order of operations must be documented in a code comment:

```
returnBase = calculatePrice(returnRoute) * returnDiscountCoefficient
combinedTotal = outboundTotal + returnBase
finalTotal = combinedTotal * (1 - promoDiscountPct / 100)
```

Never apply the promo discount per-leg and sum — it double-discounts.

**Warning signs:**
- Stripe PaymentIntent amount does not match the price shown in Step 6 of the wizard.
- `claim_promo_code` logs show a successful claim but `appliedDiscountPct` in metadata is 0 for return leg.
- Client receives an email with a different total than what they paid.

**Phase to address:** Payment intent creation phase — pricing calculation logic, before any Stripe charge goes live.

---

### Pitfall 3: Cancelling one leg issues a full Stripe refund and cancels both legs

**What goes wrong:**
The current cancel route (`/api/admin/bookings/cancel`) fetches the booking by `id`, reads `payment_intent_id`, and calls `stripe.refunds.create({ payment_intent: ... })` — which refunds the **full** PaymentIntent amount. If outbound and return share a single PaymentIntent and the operator cancels only the return leg, the client receives a full refund for the entire combined charge. Alternatively, cancelling the outbound leg also triggers a full refund even though the return may still happen.

**Why it happens:**
The cancel endpoint was built for single-leg semantics: one booking row = one PaymentIntent = one full refund. With two linked rows sharing one PaymentIntent, the refund amount must be a partial refund for the leg being cancelled. Stripe supports partial refunds via the `amount` parameter on `stripe.refunds.create`. The current code does not pass `amount`.

**How to avoid:**
When cancelling a round-trip leg:
1. Look up the linked sibling booking to determine which legs remain active.
2. Compute the refund amount = price of the cancelled leg only (stored as `amount_eur` on the booking row).
3. Call `stripe.refunds.create({ payment_intent: pi_xxx, amount: cancelledLegAmountCents })`.
4. Update only the cancelled leg's status to `cancelled`; leave the sibling row at its current status.
5. The `charge.refunded` webhook handler currently sets all rows to `cancelled` via `.eq('payment_intent_id', ...)` — this must be changed to only cancel matching rows when a full (not partial) refund occurs, or to set only the correct leg based on refund metadata.

**Warning signs:**
- Stripe Dashboard shows refund amount equal to full PaymentIntent amount when operator intended to cancel only one leg.
- After operator cancels return leg, outbound booking also shows `cancelled` status.
- `charge.refunded` webhook fires and the handler updates all rows with that `payment_intent_id` to `cancelled`.

**Phase to address:** Admin cancel/refund phase — must be implemented in the same phase as the linked booking row design.

---

### Pitfall 4: `charge.refunded` webhook handler bulk-cancels all rows for a PaymentIntent

**What goes wrong:**
The webhook handler contains:

```ts
await supabase.from('bookings').update({ status: 'cancelled' }).eq('payment_intent_id', charge.payment_intent)
```

This updates every booking row that matches the `payment_intent_id`. For round-trip, if the outbound has `payment_intent_id = pi_xxx` and the return has `NULL` or `pi_xxx_return`, the bulk update hits outbound only (return is not affected) — but if the return also stores `pi_xxx` (the naive approach), both rows are cancelled on any refund, including partial refunds for one leg.

This is a direct consequence of Pitfall 3 but deserves separate treatment because the `charge.refunded` event fires for partial refunds too. Stripe sends `charge.refunded = true` only when the charge is fully refunded. Partial refunds also fire `charge.refunded` but with `charge.refunded = false`. The current webhook handler correctly gates on `charge.refunded` being truthy for the full-cancel path — but there is no handler for partial refunds. Developers miss this because the Stripe docs show `charge.refunded` as the obvious event and do not prominently surface the partial-refund case.

**How to avoid:**
Add a `charge.refund.updated` handler or inspect `charge.amount_refunded` vs `charge.amount` inside the `charge.refunded` handler. For partial refunds, cancel only the leg whose `amount_eur` matches the refund amount. Store the per-leg amount in the booking row (already done via `amount_eur`) to enable this lookup.

**Warning signs:**
- Partial refund from Stripe Dashboard does not reflect in booking status in admin.
- Operator expects the return leg to show `cancelled` after partial refund but it remains `confirmed`.

**Phase to address:** Webhook phase — same phase as cancel logic, must be tested with both full and partial refund scenarios.

---

### Pitfall 5: Zustand store field `returnDate` is shared between Daily Hire and Round Trip — leads to stale/wrong state

**What goes wrong:**
The current store has `returnDate: string | null` used by Daily Hire to mark the hire end date. Round Trip will also need a return pickup date and time. If Round Trip reuses `returnDate` without adding `returnTime`, the return leg has no time field. If `setTripType` changes from `round_trip` back to `daily` or another type, the store reset does not clear `returnDate` (only `priceBreakdown`, `distanceKm`, and `quoteMode` are cleared on type change — see `setTripType` in `booking-store.ts`). A returning user who had a Round Trip session and then starts a Daily Hire session will find `returnDate` already populated with the previous round-trip return date.

**Why it happens:**
The field name is reused without trip-type scoping because it fit both use cases superficially. The bug is that `setTripType` was written before Round Trip existed and only clears fields that affect pricing.

**How to avoid:**
Add separate `returnTime: string | null` for Round Trip's return pickup time. Update `setTripType` to clear `returnDate` and `returnTime` when switching away from `round_trip` (and away from `daily`). Update the TypeScript `BookingStore` interface and add `setReturnTime` action. Update `partialize` to include `returnTime` in sessionStorage. Update `resetBooking` to reset `returnTime`.

**Warning signs:**
- Step 2 shows a pre-filled return date when the user did not select Round Trip.
- `returnDate` appears in the sessionStorage object under `prestigo-booking` for non-round-trip bookings.
- TypeScript does not catch this because `returnDate` already exists on the type.

**Phase to address:** Zustand store extension phase — first wizard phase, before Step 2 UI is built.

---

### Pitfall 6: `partialize` does not persist new round-trip fields — return booking data lost on page refresh

**What goes wrong:**
The `partialize` function explicitly lists which store fields survive sessionStorage. Any new field added to the store (e.g. `returnTime`, `returnDistanceKm`) that is not added to `partialize` is silently dropped on page refresh. The user loses their return leg inputs mid-wizard and must re-enter them. Because `priceBreakdown` is intentionally excluded (to force fresh fetch), the same pattern should apply to a `returnPriceBreakdown` — but developers may accidentally include or exclude it incorrectly, copying the outbound pattern.

**Why it happens:**
`partialize` is an opt-in allowlist that requires manual maintenance. Adding a field to the store type and store initialiser is not enough — it must also be added to `partialize` and the `onRehydrateStorage` handler (if it requires type coercion like `completedSteps`).

**How to avoid:**
When adding any new field to `BookingStore`: (1) add to the interface in `types/booking.ts`, (2) add to the store initialiser default values, (3) add to `resetBooking`, (4) decide whether it should persist (add to `partialize` if yes), (5) check if it needs `onRehydrateStorage` coercion (only needed for non-JSON-safe types like `Set`).

**Warning signs:**
- Return date and time disappear after page refresh in Step 2.
- Console shows that the rehydrated store has `returnTime: undefined` instead of `null`.
- TypeScript types pass but runtime values are `undefined` (TypeScript does not validate rehydrated JSON shape).

**Phase to address:** Zustand store extension phase — immediately after adding new fields, write a test that rehydrates the store from a serialised snapshot and asserts all round-trip fields are present.

---

### Pitfall 7: Stripe metadata key limit (50 keys, 500 chars/value) exceeded by round-trip data

**What goes wrong:**
The current `create-payment-intent` already uses ~25 metadata keys for a single-leg booking. Round trip must carry return leg data: `returnOriginAddress`, `returnDestinationAddress`, `returnPickupDate`, `returnPickupTime`, `returnDistanceKm`, `returnAmountEur`, `returnAmountCzk`, `returnDiscountPct`, `returnBookingReference`. That adds ~9 keys, putting the total at ~34 — still under 50. However, if address strings are long (e.g. "Václav Havel Airport Prague (PRG), Aviatická, 161 00 Praha 6-Ruzyně, Czechia"), they approach the 500-character limit per value. Exceeding either limit causes Stripe to reject the PaymentIntent creation with a 400 error.

**Why it happens:**
The Stripe metadata limit is not enforced at the TypeScript level. Developers add keys without tracking the count. Long Czech address strings with full postal format are the most common vector for the 500-char limit violation.

**How to avoid:**
Audit total key count before shipping. For address fields, truncate to 400 chars before assigning to metadata. For the return leg, consider encoding return leg data as a compact JSON blob in a single key (`returnLeg: JSON.stringify({...})`), using one key for all return data. Always count keys in a PR review comment.

**Warning signs:**
- `create-payment-intent` returns 400 with message "metadata key count exceeds limit" or "value too long".
- Long address strings that work for single-leg fail when doubled for round-trip.

**Phase to address:** Payment intent creation phase — count and measure metadata before implementation, not after.

---

### Pitfall 8: Confirmation email built for single-leg — return leg silently omitted

**What goes wrong:**
`sendClientConfirmation` calls `buildConfirmationHtml(data: BookingEmailData)`, which renders one "YOUR JOURNEY" section with origin, destination, date, and time. There is no concept of a second leg. The `BookingEmailData` interface has `returnDate?: string` but it is currently used only by Daily Hire to show a "Return Date" row. For Round Trip, the client expects to see both legs clearly: outbound route + time, and return route + time, with separate prices shown.

If the webhook simply passes the outbound `emailData` object without round-trip awareness, the client receives an email that shows only the outbound leg. The return leg is confirmed (payment taken) but not acknowledged in the email. This is a customer service problem — the client thinks they only booked one way.

The ICS calendar link (`buildGoogleCalendarUrl`) generates a single event for the outbound pickup. A round-trip confirmation should offer two calendar events.

**Why it happens:**
`BookingEmailData` was designed for single-leg. Developers add round-trip data to metadata but do not update the email interface or template, because the email still sends successfully (no type error — `returnDate` is already optional).

**How to avoid:**
Extend `BookingEmailData` with explicit round-trip fields: `isRoundTrip: boolean`, `returnPickupDate?: string`, `returnPickupTime?: string`, `returnAmountCzk?: number`. Update `buildConfirmationHtml` to render a second "RETURN JOURNEY" section when `isRoundTrip === true`. Add a second `buildGoogleCalendarUrl` call for the return leg. Update the manager alert text to include return leg details.

**Warning signs:**
- Client confirmation email subject says "confirmed" but body shows only one route.
- Manager alert text does not mention return leg pickup time (operator may miss a pickup).
- `returnPickupDate` and `returnPickupTime` are in the Stripe metadata but not in the sent email.

**Phase to address:** Email phase — must be addressed in the same phase as webhook/booking creation, not deferred to polish.

---

### Pitfall 9: Admin bookings list shows return booking as an unrelated orphan row

**What goes wrong:**
The admin bookings list fetches all rows with `select('*')` ordered by `created_at` descending. A round-trip will create two adjacent rows (outbound, return). Without a `linked_booking_id` column displayed in the UI, the operator sees two rows with the same client, same vehicle, but different routes and dates — with no indication they are linked. The operator may cancel one thinking it is a duplicate, triggering a partial (or full) refund unintentionally.

Even with a `linked_booking_id` column in the DB, if the admin UI does not surface the link (e.g. a "RETURN" badge, or a nested "linked leg" row), the operator cannot tell at a glance which rows belong to a single booking session.

**Why it happens:**
The bookings list was built for independent rows. Relationship rendering (parent/child or sibling display) requires either a JOIN or two-pass rendering with grouping logic. Developers may add the DB column but defer the UI grouping as "nice to have" — and operators encounter confusing duplicate-looking rows in production.

**How to avoid:**
In the admin bookings list, annotate linked bookings:
- Add a `linked_booking_id` column to the DB and populate it (return row links to outbound row's `id`).
- In the admin UI, when a row has a non-null `linked_booking_id`, render a "RETURN LEG" badge in the trip type column.
- In the expandable row view, show the sibling booking reference so the operator can navigate between legs.

**Warning signs:**
- Operator reports seeing "duplicate bookings" in the dashboard after the first round-trip.
- Cancel is called on the outbound row when operator intended to cancel the return.
- Support tickets from clients who received a full refund when they only wanted to cancel the return.

**Phase to address:** Admin bookings UI phase — the badge/label must ship in the same phase as the webhook creates the linked rows.

---

### Pitfall 10: `buildBookingRow` cannot link the return row at webhook time — outbound `id` not available yet

**What goes wrong:**
`buildBookingRow(meta, paymentIntentId, bookingType)` maps Stripe metadata keys to DB columns. The return booking row's `linked_booking_id` must be the outbound booking's `id` (a Supabase UUID assigned at insert time). But the outbound row's `id` does not exist until the first insert completes. If both rows are built from metadata and inserted in parallel (or if `buildBookingRow` is called before the first insert), the return row cannot reference the outbound `id`.

**Why it happens:**
`buildBookingRow` is a pure function that transforms metadata into a row object. It has no mechanism to receive a dynamically generated FK. The current `saveBooking` uses `upsert` with `ignoreDuplicates: true` — upsert with ignore does not return the inserted row, so capturing the `id` requires a change to the persistence logic.

**How to avoid:**
Change the webhook flow for `payment_intent.succeeded` when `meta.tripType === 'round_trip'`:
1. Build and insert outbound row; use `.select()` after upsert to capture the returned `id` (note: upsert with `ignoreDuplicates: true` may not return the row on conflict — switch to `.insert().select()` for the outbound row if idempotency is handled via a different mechanism).
2. Build return row with `linked_booking_id = outboundId`.
3. Insert return row.
Wrap both inserts in a Supabase DB function (RPC) if atomicity is required — Supabase client does not support multi-statement transactions.

**Warning signs:**
- Return booking row has `linked_booking_id = null` even though the webhook ran successfully.
- `saveBooking` with `ignoreDuplicates: true` returns empty data on the upsert (no `id` to capture).

**Phase to address:** Webhook / database phase — change `saveBooking` to return the inserted row's `id` before any round-trip webhook logic is written.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store `payment_intent_id` on both rows (violates UNIQUE) | No DB migration needed | Second row is silently dropped; requires removing UNIQUE constraint (breaks dedup protection) | Never |
| Apply promo discount to outbound only, ignore return | Simpler price calculation | Client overpays vs displayed total; trust damage | Never |
| Cancel endpoint issues full refund regardless of which leg is cancelled | No partial-refund logic needed | Full refund when only one leg cancelled; financial loss to operator | Never |
| Add return leg fields to Stripe metadata without counting keys | Fast implementation | PaymentIntent creation fails in production for long Czech addresses | Never |
| Defer "RETURN LEG" badge in admin UI to a later phase | Skip UI work in current phase | Operator cancels wrong booking; customer support burden | Never — must ship same phase as the linked rows |
| Reuse `returnDate` from Daily Hire for Round Trip return date | Reuse existing field | Stale Daily Hire date appears in Round Trip wizard; wrong return leg time sent to Stripe | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Stripe partial refund | Call `stripe.refunds.create({ payment_intent })` without `amount` when cancelling one leg | Pass `amount` in cents equal to the cancelled leg's price only |
| Stripe metadata | Add return leg fields as individual keys, approaching 50-key limit | Encode return leg as a single JSON blob key, or audit key count before implementing |
| Supabase UNIQUE constraint on `payment_intent_id` | Insert return row with same `payment_intent_id` | Store `payment_intent_id` only on outbound row; return row uses `linked_booking_id` FK |
| Supabase upsert with `ignoreDuplicates: true` | Assume the returned data contains the inserted row `id` | Use `.insert().select()` for outbound row to capture `id`; separate idempotency handling |
| Stripe `charge.refunded` webhook | Treat partial refund event as full cancel trigger (check only `charge.refunded === true`) | Also handle partial refunds: check `charge.amount_refunded < charge.amount` |
| Resend email | Pass single-leg `BookingEmailData` for round-trip without adding return fields | Extend interface; add conditional second-leg section in HTML template |
| `claim_promo_code` RPC | Call RPC before computing the combined total, apply discount to outbound only | Compute `outboundTotal + returnTotal` first; apply promo discount to combined total |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Sequential outbound + return DB inserts in webhook without atomicity | Partial state: outbound saved, return insert fails, no rollback | Use a Supabase RPC that inserts both rows atomically | Any time the DB is under load or times out mid-webhook |
| Two `getPricingConfig()` calls in `create-payment-intent` (one per leg) | Doubled DB reads per checkout | Call once, pass `rates` to both outbound and return price calculations | From day one — unnecessary cost even at low volume |
| Webhook handler times out on Vercel Hobby (10s default) due to two sequential inserts + two email sends | Stripe marks webhook as failed; retries; dedup via UNIQUE saves from duplicates but emails may send twice | Dedup is already in place; ensure email sends are non-blocking with `Promise.allSettled` | At any load level |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Computing return leg price client-side and trusting it in `create-payment-intent` | Client manipulates return price, pays less | Server recomputes return price independently using route data from metadata |
| Applying return discount % from client payload instead of DB | Client sends `returnDiscountPct=100`, gets free return leg | Read `return_discount_pct` from `pricing_globals` DB row server-side only |
| Trusting `isRoundTrip: true` from client to trigger different pricing path | Client activates round-trip pricing branch for a single-leg booking to get the return discount | Gate on `tripType === 'round_trip'` from metadata, set by server at PaymentIntent creation |
| Refunding full PaymentIntent when operator clicks "cancel return leg" | Full financial loss for that booking's combined charge | API computes refund amount from the booking row's stored per-leg `amount_eur` |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Step 6 shows a single combined price with no breakdown of outbound + return | Client does not know how much each leg costs; confusion at checkout | Show price breakdown: "Outbound: €X + Return: €Y (10% off) = €Z" |
| Confirmation page at `/book/confirmation` shows only one booking reference | Client thinks only one leg was booked | Show both booking references on the confirmation page, or one combined reference with both legs listed |
| "Add to Calendar" button generates one calendar link | Client misses the return leg appointment | Generate two separate calendar events |
| Return date/time field appears for all trip types when `returnDate` state is not cleared on type switch | Client books a transfer and sees a confusing return date field | Clear `returnDate` and `returnTime` in `setTripType` for all non-round-trip types |
| Step 2 collects return time but does not validate it is after pickup time | Return is set for earlier than outbound (e.g. same day, earlier hour) | Cross-field validation: return datetime must be strictly after pickup datetime |

---

## "Looks Done But Isn't" Checklist

- [ ] **Round-trip DB schema:** `linked_booking_id` FK column added AND populated by webhook — verify both rows exist with correct link after a test payment.
- [ ] **UNIQUE constraint:** Return row does NOT share `payment_intent_id` with outbound row — verify in Supabase table view.
- [ ] **Promo discount:** Combined total (outbound + return) is discounted, not just outbound — verify PaymentIntent `amount` in Stripe Dashboard equals discounted combined total.
- [ ] **Partial refund cancel:** Cancelling only the return leg refunds only the return leg's price — verify refund amount in Stripe Dashboard equals `returnAmountEur * 100` cents.
- [ ] **Webhook dedup:** Replaying the `payment_intent.succeeded` event does not create a third row — verify `ignoreDuplicates: true` (or equivalent) still works after schema change.
- [ ] **Email:** Client email shows both legs with correct dates, times, routes, and prices — manually verify email content after a test payment.
- [ ] **Admin badge:** Return leg row shows "RETURN" badge in admin bookings list — verify visually at 375px and desktop.
- [ ] **Store reset:** Changing trip type from `round_trip` to `transfer` clears `returnDate` and `returnTime` — verify in browser devtools sessionStorage.
- [ ] **Metadata key count:** PaymentIntent metadata has fewer than 50 keys — count all keys in `create-payment-intent` after adding round-trip keys.
- [ ] **Stripe metadata char limit:** All metadata values (especially address fields) are under 500 chars — add truncation guard for address fields.
- [ ] **Return time validation:** Step 2 rejects a return time that is earlier than or equal to pickup time on the same day.
- [ ] **`saveBooking` returns `id`:** After refactoring to capture outbound `id`, the return row has a non-null `linked_booking_id` — verify in DB after a test webhook.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Return row not inserted (UNIQUE conflict swallowed) | MEDIUM | Query Stripe for PaymentIntent metadata; manually insert return row in Supabase with correct `linked_booking_id`; send return leg confirmation email manually via Resend API |
| Promo applied to outbound only, client overpaid | HIGH | Issue manual partial refund from Stripe Dashboard for the discount difference; update DB `amount_eur` on booking row; send apology email to client |
| Full refund issued when only one leg cancelled | HIGH | Refund is irreversible; re-charge client for the retained leg if they agree; operator absorbs the loss if client declines; reputational risk |
| Both legs cancelled by `charge.refunded` bulk update | MEDIUM | Change return leg status back to `confirmed` in Supabase manually; send apology email; no financial impact if refund amount was correct |
| Email missing return leg | LOW | Send corrected email manually via Resend API; no financial impact |
| Metadata key count exceeded, PaymentIntent creation fails | MEDIUM | Client sees payment error in Step 6; no charge made; fix and redeploy; client must re-enter payment details |
| `linked_booking_id` null on return row | LOW | Run SQL UPDATE in Supabase to set `linked_booking_id` from the matching outbound row via booking reference prefix |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| UNIQUE constraint on `payment_intent_id` | Phase 1: DB schema | Query both booking rows after test webhook; confirm different `payment_intent_id` values and correct `linked_booking_id` |
| `buildBookingRow` cannot link return row | Phase 1: `saveBooking` refactor | After webhook fires, query DB; confirm return row has non-null `linked_booking_id` matching outbound row `id` |
| Zustand `returnDate` field collision | Phase 2: Zustand store extension | Switch trip type in browser; open devtools; confirm `returnDate` is null for non-round-trip |
| `partialize` missing new fields | Phase 2: Zustand store extension | Refresh page at Step 2 with return time filled; confirm value survives |
| Promo applied to wrong total | Phase 3: PaymentIntent creation + pricing | Compare Stripe `amount` to wizard-displayed combined discounted total |
| Stripe metadata key/char limit | Phase 3: PaymentIntent creation | Count keys in code; measure address length with a long Czech address; test PaymentIntent creation |
| Full refund on partial cancel | Phase 4: Admin cancel endpoint | Cancel only return leg in admin; verify Stripe refund amount = return leg price only |
| `charge.refunded` bulk-cancels all rows | Phase 4: Webhook `charge.refunded` handler | Issue partial refund via Stripe Dashboard; verify only intended leg changes to `cancelled` |
| Email missing return leg | Phase 5: Email | Send test booking; inspect email for both leg sections and two calendar links |
| Admin shows orphan rows | Phase 6: Admin UI | Create round-trip booking; check admin list for "RETURN" badge on return row |

---

## Sources

- Direct source inspection: `/prestigo/lib/supabase.ts` — `saveBooking`, `buildBookingRow`, `withRetry`
- Direct source inspection: `/prestigo/app/api/webhooks/stripe/route.ts` — `payment_intent.succeeded` and `charge.refunded` handlers
- Direct source inspection: `/prestigo/app/api/create-payment-intent/route.ts` — metadata construction, `claim_promo_code` RPC call, price computation
- Direct source inspection: `/prestigo/app/api/admin/bookings/cancel/route.ts` — Stripe refund logic
- Direct source inspection: `/prestigo/lib/booking-store.ts` — Zustand store fields, `partialize`, `setTripType`, `resetBooking`
- Direct source inspection: `/prestigo/types/booking.ts` — `BookingStore` interface, `TripType` union
- Direct source inspection: `/prestigo/lib/email.ts` — `BookingEmailData`, `buildConfirmationHtml`, `sendManagerAlert`
- Direct source inspection: `/prestigo/lib/pricing-config.ts` — `PricingGlobals`, `PricingRates` (no `returnDiscountPct` field yet)
- Stripe documentation (HIGH confidence): PaymentIntent metadata limits — 50 keys max, 500 chars per value — https://stripe.com/docs/api/payment_intents/object#payment_intent_object-metadata
- Stripe documentation (HIGH confidence): Partial refunds via `amount` parameter on `stripe.refunds.create` — https://stripe.com/docs/api/refunds/create
- Stripe documentation (HIGH confidence): `charge.refunded` fires for partial refunds with `charge.refunded = false`; only `true` when fully refunded — https://stripe.com/docs/api/charges/object#charge_object-refunded
- PostgreSQL documentation (HIGH confidence): NULL values are not considered equal by UNIQUE constraints — https://www.postgresql.org/docs/current/indexes-unique.html

---
*Pitfalls research for: round-trip booking addition to Prestigo chauffeur service (Next.js + Stripe + Supabase + Zustand)*
*Researched: 2026-04-04*
