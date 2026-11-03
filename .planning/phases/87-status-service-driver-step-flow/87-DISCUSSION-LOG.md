# Phase 87: Status Service & Driver Step Flow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-03
**Phase:** 87-status-service-driver-step-flow
**Areas discussed:** Driver cabinet scope (owner-raised, with screenshots), Statuses on_board / no_show, Driver no-show button, GNet mapping, Driver screen

---

## Driver cabinet scope

Owner shared 5 Blacklane driver-app screenshots: "the driver cabinet should look roughly like this, and change statuses like this".

| Option | Description | Selected |
|--------|-------------|----------|
| 87 = trip screen | Rebuild trip page like screenshots 1–2; cabinet as a new phase after 87 | |
| Whole cabinet in 87 | Login, ride list, Offers, profile in 87 | |
| Cabinet instead of 90 | New phase right after 87 | |

**User's choice:** Free text — only the driver order page now (light theme too); the full cabinet after everything already planned.

## Start gate

| Option | Description | Selected |
|--------|-------------|----------|
| 2 h before pickup | Configurable | |
| 1 h before pickup | | |
| No limit | | |

**User's choice:** Free text — travel time from Prague centre to pickup + 2 h; if pickup is in central Prague, 2 h.

## Statuses on_board / no_show

| Question | Options | Selected |
|----------|---------|----------|
| on_board a real status? | Real status / progress-only | Real status ✓ |
| no_show in CRM lead | converted / dead | converted ✓ |
| no_show in revenue stats | Only if charged / always | Only if charged ✓ |

## Driver no-show button and mistakes

| Question | Options | Selected |
|----------|---------|----------|
| When no-show button appears | Phase 89 / already in 87 | Free text: steps appear one at a time; after a long wait a "request no-show" button appears that alerts admin to contact the client, then admin moves to no-show |
| Driver mis-taps a step | Operator fixes / 30 s undo | Free text: confirmation dialog after every step move |
| Wait threshold | 30/60 min / 15/45 min | 30 city / 60 airport ✓ |
| Alert channel | Email / admin banner / Chatwoot-WhatsApp | Admin banner + Chatwoot/WhatsApp ✓ |

## GNet mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Research API | Fallback: send nothing for on_board and no_show | ✓ |
| on_board nothing, no_show → CANCEL | | |

## Driver screen

| Question | Options | Selected |
|----------|---------|----------|
| Language | EN / EN+RU+CZ / RU | English ✓ |
| After completion | "Trip completed" screen / dead link | "Trip completed" screen ✓ |
| Theme | (stated by Claude) always light, no toggle | confirmed |

## Claude's Discretion

Prague-centre definition and travel-time source, map implementation, slide control, conflict wording, Chatwoot alert delivery, status log / completion-event mechanism.

## Deferred Ideas

- Full driver cabinet (login, ride list, Offers, profile) — new phase after 93.
- Driver page dark mode / other languages.
