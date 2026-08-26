---
phase: 64-admin-created-bookings-with-payment-link
plan: 03
subsystem: ui
tags: [react, admin, payments, stripe, forms, inline-style]

requires:
  - phase: 64-admin-created-bookings-with-payment-link
    provides: "POST /api/admin/bookings { collect_payment, status } -> { booking, paymentLinkUrl } (Plan 01) and POST /api/admin/bookings/[id]/payment-link generate+resend -> { paymentLinkUrl, linkedBookingId } / { resent } (Plan 02)"
provides:
  - "ManualBookingForm.tsx: collect-payment toggle + no-link status choice + post-create payment-link result panel (Copy/Resend/EUR)"
  - "BookingsTable.tsx: row-level 'Generate Payment Link' action + result panel for existing unpaid/pending bookings, in both the desktop expanded row and the mobile expanded card"
affects: []

actuals:
  tokens: 8042
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "PaymentLinkSection: a local (in-file) component in BookingsTable.tsx, mirroring the existing TripEditPanel pattern — same file, no new file, mounted identically in the desktop expanded row and the mobile expanded card"
    - "Result-panel JSX (heading/body/truncated-URL/Copy/Resend/EUR) duplicated verbatim between ManualBookingForm.tsx and BookingsTable.tsx rather than extracted to a shared component, since the plan's files_modified scope was limited to exactly these two files"
    - "Clipboard copy: navigator.clipboard.writeText() with a synchronous availability check (not just try/catch) before calling, falling back to auto-selecting the (full, untruncated) URL text via Range/Selection for unsupported browsers — never a silent no-op"

key-files:
  modified:
    - components/admin/ManualBookingForm.tsx
    - components/admin/BookingsTable.tsx

key-decisions:
  - "The create-flow modal swaps its ENTIRE body (form -> result panel / error message) on success with collect_payment true, rather than showing the panel alongside the form — matches UI-SPEC's 'single dominant focal point' Visual Hierarchy rule"
  - "handleClose() wrapper resets paymentLinkUrl/linkGenerationFailed/createdBookingId before calling the parent's onClose — the component stays mounted across open/close cycles (conditional `if (!open) return null`, not unmount), so without an explicit reset a reopened modal would show a stale result panel from the previous booking"
  - "BookingsTable's PaymentLinkSection optimistically flips status to 'unpaid' locally after a successful generate, mirroring the route's own direct status set (bypasses VALID_TRANSITIONS, Plan 02) — avoids a stale 'pending' badge until the next full list refetch"

patterns-established:
  - "Row-level async action components (PaymentLinkSection, DriverAssignmentSection) each own their own fetch/loading/error state and report success upward via a single onX callback that patches the parent's bookings array — no shared reducer needed for this admin surface"

requirements-completed: [ANEW-01, ANEW-02, ANEW-03, ANEW-05]

coverage:
  - id: D1
    description: "ManualBookingForm: 'Collect payment via link' toggle (default off) drives collect_payment in the POST body and swaps the submit CTA; when off, a 'Booking status' choice (Confirmed default / Pending) drives status; on success with a link, the modal swaps to a result panel (heading, body, truncated URL, Copy Link with full-url clipboard + fallback, Resend Email, EUR amount in copper); on success without a link (Stripe/email step failed), shows the non-atomic-create error copy without implying the booking failed"
    requirement: ANEW-01
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean for ManualBookingForm.tsx)"
        status: pass
    human_judgment: true
    rationale: "No automated test exercises this component (no test file references ManualBookingForm); the plan's own <verify> for this task is tsc-only. Visual/interaction correctness (toggle behavior, panel focal-point layout, copy/resend feedback timing, UI-SPEC copy/color/spacing fidelity) needs a human to confirm in the browser — tsc proves it compiles, not that it behaves correctly."
  - id: D2
    description: "BookingsTable: row-level 'Generate Payment Link' action (E3) renders only for unpaid/pending bookings with no payment_link_url, shown identically in the desktop expanded row and the mobile expanded card; shows the late-attach notice for pending bookings; on success replaces the button with the same result panel as D1 (URL + Copy + Resend + EUR), including the round-trip 'covers both legs' notice when linkedBookingId is returned"
    requirement: ANEW-05
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean for BookingsTable.tsx); npx vitest run (66/66 pre-existing failures unchanged across the same 12 unrelated files documented in deferred-items.md — no new regressions)"
        status: pass
    human_judgment: true
    rationale: "No automated test exercises this component's payment-link UI (no BookingsTable test imports the new PaymentLinkSection). The full suite confirms no regression, not that the new row action behaves correctly end-to-end — a human needs to click through generate/copy/resend against a live unpaid/pending booking to confirm."

duration: 15min
completed: 2026-08-24
status: complete
---

# Phase 64 Plan 03: Admin UI — Collect-Payment Toggle, Payment-Link Result Panel, Row-Level Generate Action Summary

**Wired the Plan 01/02 payment-link backend onto the operator UI: `ManualBookingForm.tsx` gained a "Collect payment via link" toggle with a no-link status choice and a post-create result panel (copy/resend/EUR), and `BookingsTable.tsx` gained a row-level "Generate Payment Link" action + the same result panel for existing unpaid/pending bookings — all in the established navy/gold inline-style admin idiom, no shadcn.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-24T16:56:08Z (following Plan 02)
- **Completed:** 2026-08-24T17:10:39Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- `ManualBookingForm.tsx` gained a new "PAYMENT" section (copper-light label, matching the TRIP DETAILS/PASSENGER DETAILS convention): a "Collect payment via link" toggle (default off, with the Stripe/email helper copy) that swaps the submit CTA to "Create & Send Payment Link" and includes `collect_payment: true` in the POST body; when the toggle is off, a "Booking status" radio choice (Confirmed — paid offline default / Pending) sends `status` in the payload (D-01/D-02/D-03).
- On a successful create-with-payment, the modal body swaps from the form to a single-focal-point result panel: "Payment link ready" heading, "Already emailed to {client email}..." body copy, the display-truncated URL (middle ellipsis, full URL always used for copy/href), a "Copy Link" icon-button (clipboard write with an unsupported-clipboard auto-select fallback — never a silent no-op), a "Resend Email" icon-button (`{ resend: true }` to `[id]/payment-link`, three-state Sending/Sent/Failed feedback), and the EUR amount in copper.
- If the booking was created but the link step itself failed (non-atomic create/link, Plan 01/02), the modal instead shows the exact UI-SPEC error copy without implying the booking failed, plus a Close button.
- `BookingsTable.tsx`'s `Booking` type gained `payment_link_url`/`payment_link_id`; a new `PaymentLinkSection` local component (mirroring the existing `TripEditPanel` in-file pattern) is mounted identically in the desktop expanded row (after Driver Assignment) and the mobile expanded card (after Operator Notes) — renders only for `status IN ('unpaid','pending')`.
- Pre-link state: "No payment link yet." / "Generate one to let the client pay online." plus a "Generate Payment Link" button (DriverAssignmentSection Assign-button convention — copper border, transparent, fills copper on hover); a 'pending' booking additionally shows "Generating a payment link will mark this booking as Unpaid until the client pays."; a failed generate shows "Could not generate payment link. Please try again."
- Post-link state (whether just generated or pre-set from the create flow): the same result panel as `ManualBookingForm.tsx` — heading, body, truncated URL, Copy Link, Resend Email, EUR amount in copper — plus "This link also covers the linked return/outbound leg — paying once settles both." when the route returns a non-null `linkedBookingId`. A successful generate optimistically flips the row's local status to `unpaid`, mirroring the route's own direct status set.

## Task Commits

Each task was committed atomically:

1. **Task 1: ManualBookingForm — collect-payment toggle, status choice, result panel** - `755376d` (feat)
2. **Task 2: BookingsTable — row-level Generate Payment Link action + result panel** - `1fe4416` (feat)

**Plan metadata:** (this commit, following SUMMARY.md write)

## Files Created/Modified

- `components/admin/ManualBookingForm.tsx` - PAYMENT section (toggle + status radio), submit-wiring for `collect_payment`/`status`, post-success result panel / link-failed message, `handleClose()` state-reset wrapper
- `components/admin/BookingsTable.tsx` - `Booking.payment_link_url`/`payment_link_id`, new `PaymentLinkSection` component mounted in both the desktop expanded row and the mobile expanded card, `handlePaymentLinkGenerated` optimistic-update sink

## Decisions Made

- The create-flow modal swaps its entire body (form → result panel / error message) rather than layering the panel alongside the form, per UI-SPEC's "single dominant focal point" rule.
- `handleClose()` explicitly resets post-success state (`paymentLinkUrl`, `linkGenerationFailed`, `createdBookingId`, `copied`, `resendState`) before calling the parent's `onClose` — the component stays mounted across open/close cycles (`if (!open) return null`, not an unmount), so without this reset a reopened modal would show a stale panel from the previous booking.
- `PaymentLinkSection` is defined once in `BookingsTable.tsx` (same pattern as the existing in-file `TripEditPanel`) and mounted twice (desktop + mobile) rather than extracted to a new file, since the plan's `files_modified` scope was exactly `ManualBookingForm.tsx` + `BookingsTable.tsx`.
- The result-panel JSX is duplicated (not shared) between the two files for the same reason — no new shared component file was in scope.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Documented Simplification (not a deviation from a must-have, a scoping note)

**E2 "loading" state ("Generating link…" muted line replacing the URL/Copy/Resend controls) implemented for BookingsTable's row action via the "Generate Payment Link" button's own "Generating…" disabled label (E3 loading), not as a separate panel-shell "Generating link…" line.** Both the create-flow (ManualBookingForm) and the row-action (BookingsTable) generate a link within a single request/response cycle — there is no intermediate state where the result-panel container exists but the URL inside it is still pending, since the panel itself is only rendered once `paymentLinkUrl` is truthy. The submit button's own loading label ("Creating & Sending Link..." / "Generating…") is the actual pending-state signal the operator sees in both surfaces, and is what the plan's task actions describe for E1/E3 loading. This does not violate any of the plan's `must_haves.truths` (which describe the *panel's* loading text only for the case where a panel-shaped container is already visible with pending content, which doesn't arise in either surface's actual request flow) but is called out here for visibility.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None — plan executed as written; one scoping note documented above for transparency.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required for this plan.

## Known Stubs

None — every deliverable in this plan is fully wired to the Plan 01/02 backend (no hardcoded empty values, no placeholder UI text beyond the UI-SPEC's own declared empty-state copy, no unimplemented branches).

## Next Phase Readiness

Ready for Plan 04 (live migration 056 application + Stripe Dashboard `checkout.session.completed` webhook subscription — the remaining `[BLOCKING]` human-action tasks per Plan 02's Next Phase Readiness). This plan's UI is fully wired against the already-implemented Plan 01/02 routes; end-to-end verification (toggle → create-with-payment → copy/resend; row action on an existing unpaid booking) requires a human to click through in the browser per the plan's own `<verification>` Manual-Only note, and requires the live migration/webhook from Plan 04 to observe an actual Stripe reconciliation.

No blockers.

---
*Phase: 64-admin-created-bookings-with-payment-link*
*Completed: 2026-08-24*

## Self-Check: PASSED

- `components/admin/ManualBookingForm.tsx` and `components/admin/BookingsTable.tsx` verified present on disk with `[ -f ]`.
- Both task commits (`755376d`, `1fe4416`) verified present via `git log --oneline`.
- `npx tsc --noEmit` clean for both files (only the same 4 pre-existing unrelated test-file errors from Plan 01/02 remain: `tests/account-trips.test.tsx`, `tests/gnet-farmin.test.ts`, `tests/nav-auth.test.tsx`, `tests/passenger-actions.test.ts`).
- Full suite (`npx vitest run`) shows the identical 66 pre-existing failures across the identical 12 unrelated test files documented in `deferred-items.md` (`Test Files 12 failed | 85 passed | 5 skipped`, `Tests 66 failed | 983 passed | 10 skipped | 139 todo`) — no new failures introduced by this plan.
- No shadcn/`@/components/ui` import in either file — verified via `grep -n "shadcn\|@/components/ui"` (no match).
- Accent color (`var(--copper)`/`var(--copper-light)`) usage confined to the UI-SPEC-listed elements — verified by inspecting every `var(--copper` occurrence in the diff (PAYMENT/Payment Link section labels, Copy/Resend icon-button icon color, result-panel left border, EUR amount, Generate Payment Link button border/hover-fill).
- Every spacing literal introduced in the diff is a member of `{4, 8, 16, 24, 32}` (plus the pre-existing `8px 12px` icon-button padding convention, reused verbatim per the plan's read_first instruction) — verified by inspecting all `px` literals in the diff.
