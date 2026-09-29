# Phase 78: WhatsApp Cloud API Channel (Coexistence) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-29
**Phase:** 78-whatsapp-cloud-api-channel-coexistence
**Areas discussed:** Onboarding & Meta assets, Outbound templates, Phone ↔ Chatwoot rules, Cost & runbook
**Language:** Discussion held in Russian at the owner's request.

---

## Onboarding & Meta assets

| Option | Description | Selected |
|--------|-------------|----------|
| Existing BM + new app | Dedicated messaging app, Marketing-API app untouched | ✓ |
| Existing BM + Prestigo v2 app | Add WhatsApp product to 2040893807310032, must go Live | |
| Unsure about verification, check | Decide after checking BM status | |

| Option | Description | Selected |
|--------|-------------|----------|
| Direct Cloud API, coexistence | Embedded Signup QR, no BSP; fallback manual flow / upgrade | ✓ |
| Via BSP (360dialog) | Easier onboarding, ~monthly fee, third party | |

| Option | Description | Selected |
|--------|-------------|----------|
| Calm window + checklist | Backup, two-direction tests, rollback | ✓ |
| As soon as ready | Faster, risk to active chats | |

| Option | Description | Selected |
|--------|-------------|----------|
| Prestigo | Matches site, easiest approval | |
| Prestigo Chauffeur Prague | Descriptive | |
| Keep current app name | | |

**User's choice (display name):** free text: "Prestigo - Premium Chauffeur Service Prague"
**Fallback on rejection:** "Ask me" (not auto-fallback to "Prestigo")

**Verification:** The owner questioned whether it was needed ("you said it stays in dev mode"). Claude clarified that only the old Marketing-API app stays in dev mode, and that the new messaging app must be Live to receive webhooks. The owner then chose "Only if it doesn't work without it" over "Submit now anyway" and "Already verified".

---

## Outbound templates

| Option | Description | Selected |
|--------|-------------|----------|
| 4 required | booking change, payment help, review, trip reminder | ✓ |
| + Driver details | | ✓ |
| + Re-open conversation | | ✓ |
| + Invoice / payment received | | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| All 7 site languages | Like Phase 77 canned responses | ✓ |
| EN + RU now | | |
| EN + RU + DE | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Code in repo + script | Graph API submit, status report | ✓ |
| Manual in WhatsApp Manager | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Manual sends now, auto later | | ✓ |
| Auto reminders now | Scope creep | |

| Option | Description | Selected |
|--------|-------------|----------|
| Invoice with PDF header | Fallback: text + attachment in window | ✓ |
| Text only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Quick reply + URL where fitting | | ✓ |
| No buttons | | |

---

## Phone ↔ Chatwoot rules

| Option | Description | Selected |
|--------|-------------|----------|
| Chatwoot primary, phone fallback | | ✓ |
| Wherever convenient | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Import history if Chatwoot supports it | | ✓ |
| Don't import | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep app auto-replies, no Chatwoot greeting | | ✓ |
| Move all to Chatwoot | | |
| No auto-replies today | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Built-in indicator + label | | ✓ |
| Built-in only | | |

---

## Cost & runbook

| Option | Description | Selected |
|--------|-------------|----------|
| Card in BM, EUR | | ✓ |
| CZK | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Estimate in runbook + monthly manual check | | ✓ |
| Threshold alert | | |

Runbook extras (multi-select): VPS down ✓, token/app rotation ✓, number quality & bans ✓, rollback to phone-only ✓

---

## Claude's Discretion

- Template categories and wording, template-as-code layout and script design
- Choice among the Chatwoot-native coexistence flow, Meta-side onboarding plus the manual flow, and a pinned upgrade (after research)
- Window-expiry label name and rule, optional spend script

## Deferred Ideas

- Automatic booking-triggered WhatsApp sends (post-Phase 82, needs opt-in)
- Spend alerting
- Proactive business verification (revisit before Phase 79)
- Chatwoot greeting for WhatsApp
