# Phase 89: Cancellation Policy, Cash Guarantee & No-Show - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md.

**Date:** 2026-11-06
**Phase:** 89-cancellation-policy-cash-guarantee-no-show
**Areas discussed:** Late cancellation, Cash guarantee, No-show confirmation, Go-live and lawyer

## Late cancellation

- Who cancels: offered operator only or client too. **Owner (free text):** the confirmation email has a button to a client cabinet where they can cancel, order a new ride or change the order.
- Cabinet scope: **cancel + new order, change by request** (recommended). Rejected: full self-service, separate phase.
- Guest access: **link from the email** (recommended). Rejected: login only.
- Late client cancel: **booking cancelled, operator decides the money** (recommended). Rejected: charge at once, late only through us.
- Cancel limit: **up to pickup time, status does not matter**, against the recommended "until the driver leaves". Owner: the rule must work.
- Late cancel charge: **operator decides** (recommended). Rejected: always 100%.
- Hourly: **12 h** (recommended). Rejected: 1 h.
- Pay-now: **same rules** (recommended). Rejected: keep full refund.

## Cash guarantee

- Audience: **everyone in the card flow** (recommended). Rejected: amount limit.
- Late cancel: **as for a card** (recommended). Rejected: no-show only.
- Unpaid ride: **charge the card** (recommended). Rejected: payment link only.
- Who marks cash: **driver**, free text: the driver sees a warning and the amount, and confirms receipt. Goes beyond the recommended option: the operator does not check.
- Currency: **booking currency** (recommended). Rejected: EUR and CZK.

## No-show confirmation

- Evidence: **note required** (recommended). Rejected: optional.
- Amount: **any amount up to 100%**, against the recommended "100% or waive".
- No decision: **remind** (recommended). Rejected: waive after 72 h.

## Go-live and lawyer

- Review: **no lawyer**, against the recommended Czech lawyer. Owner accepts the risk.
- Rollout: **everyone at once**, against the recommended few known clients first.
- Public wording: **with go-live, FAQ too** (recommended plus FAQ).
- Unpaid booking: **operator decides** (recommended). Rejected: auto cancel.

## Claude's Discretion

Link token design, dialog and screen layout, client email set, change-request channel, declined charge handling.

## Deferred Ideas

Full self-service editing; staged rollout.
