# Phase 77: Chatwoot Deployment + Core Channels - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-28
**Phase:** 77-chatwoot-deployment-core-channels
**Areas discussed:** Chat button on site, Email migration to Chatwoot, Telegram bot, Templates/labels/automation, Chatwoot↔CRM↔site integration (user-added)

---

## Chat button on site

| Option | Description | Selected |
|--------|-------------|----------|
| One floating button with menu | Chat / WhatsApp / Telegram in one launcher | ✓ |
| Separate chat button | WhatsApp links stay where they are | |
| Chat instead of WhatsApp in Hero | Chat becomes the primary CTA | |

| Option | Description | Selected |
|--------|-------------|----------|
| Click = consent | Nothing loads before click | ✓ |
| Only after CookieBanner consent | Stricter, loses inquiries | |

| Option | Description | Selected |
|--------|-------------|----------|
| Email required, name optional | Reply reaches visitor even offline | ✓ |
| No form | Less friction, anonymous | |
| Email or phone | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Everywhere except /admin, /driver | Including /book | ✓ |
| Also exclude payment step | | |
| Marketing pages only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Online 24/7 with reply-time | | ✓ |
| Business hours + auto-reply | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Email + name + phone + locale (identity) | Supabase user id identifier | ✓ |
| Email + name only | | |
| + booking count / B2B flag | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Branded navy + gold + logo | | ✓ |
| Chatwoot default | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Visit context (page, locale, UTM, /book route) after click | | ✓ |
| Page + locale only | | |

**Notes:** Visit-context question came from the owner's "collect max info for analytics" goal.

---

## Email migration to Chatwoot

| Option | Description | Selected |
|--------|-------------|----------|
| Two separate inboxes | | ✓ |
| One inbox, forward info@ → booking@ | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Customer transactional emails reply-to → booking@ | roman@ stays for EspoCRM | ✓ |
| Keep roman@ | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Remove from phone/Mail, Chatwoot only | | |
| Keep webmail as emergency access | | ✓ (after clarification) |

**User's choice:** Asked "is keeping webmail critical?" — explained reading is harmless, replying/deleting breaks threads/stats. Then chose "keep as emergency access" with rule: no replies/deletes except when VPS is down.

| Option | Description | Selected |
|--------|-------------|----------|
| No history import | From connection date | ✓ |
| Import last 30 days | | |

---

## Telegram bot

**User's choice:** Asked "what do we need this bot for?" — explained Chatwoot connects Telegram only via a bot; clients write to the bot, operator answers in Chatwoot. Then chose: new dedicated bot under Chatwoot, shown in the floating launcher menu only.

| Option | Description | Selected |
|--------|-------------|----------|
| Launcher menu | | ✓ |
| Footer and /contact | | |
| Booking confirmation emails | | |

---

## Templates, labels, automation

| Option | Description | Selected |
|--------|-------------|----------|
| All 7 locales | | ✓ |
| en + ru | | |
| en/ru/es/fr | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Repo + sync script | | ✓ |
| Chatwoot UI only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Base label set (channel + 8 topics) | | ✓ |
| Minimum booking/b2b/complaint | | |

| Option | Description | Selected |
|--------|-------------|----------|
| All to owner + Bookings/B2B teams now | | ✓ |
| Owner only, no teams | | |

---

## Chatwoot ↔ CRM ↔ site integration (user-added area)

Redirected: bulk of this is Phases 82–84. In-phase question:

| Option | Description | Selected |
|--------|-------------|----------|
| Template + operator pastes link | | ✓ |
| Build link generation now | Overlaps Phase 84 | |

Owner priorities (multi-select, all chosen + free text): never lose a lead; collect maximum data for analytics; improve customer experience; bookings visible in chat; every chat → CRM lead; one customer = one card; create/modify bookings from chat (conflicts with Out of Scope → deferred).

---

## Claude's Discretion

- Launcher visual details, consent-log entry on click, reply-time copy, keyword rules, config-as-code layout, CWV measurement method.

## Deferred Ideas

- Create/modify bookings from chat (conflicts with Supabase-source-of-truth rule) — own phase/backlog
- One-click link generation from Chatwoot — Phase 84
- Telegram link in footer/contact/emails — later
- Chatwoot AI / auto-translate — INBOX-FUT-01
