# Phase 77 — API Coverage Decision Matrix

Full coverage by default; every OPT-OUT carries its reason. Integrated services: Chatwoot CE v4.18.0-ce (Application API, Public widget SDK, native channels), Telegram Bot API, Hostinger mail (IMAP/SMTP), Resend (reply-to), Vercel env, Supabase Auth.

## Chatwoot

| capability | decision | reason |
|---|---|---|
| Email inbox — IMAP ingestion + SMTP sending per mailbox (info@, bookings@) | INTEGRATE | INBOX-01, D-10 (plan 77-11) |
| Email inbox via inbound forwarding domain (Action Mailbox / MX) | OPT-OUT | D-10 chose IMAP polling of the existing Hostinger mailboxes; no MX change allowed (mail stays at Hostinger) |
| Email history import | OPT-OUT | D-13: no history import; past customers arrive via the Phase 82 backfill |
| Website widget inbox (web_widget) | INTEGRATE | INBOX-02 (plans 77-03, 77-07) |
| Widget SDK click-to-load (`chatwootSDK.run`, `hideMessageBubble`, `toggle`) | INTEGRATE | D-01/D-02 brand launcher; no script before click (plan 77-10) |
| Widget locale + position + localized header (`setLocale`, `chatwootSettings.locale/position/welcomeTitle/welcomeDescription/availableMessage`) | INTEGRATE | D-03, D-08 (plans 77-05, 77-10) |
| HMAC identity validation (`hmac_mandatory`, `setUser` + `identifier_hash`) | INTEGRATE | INBOX-03, D-05 (plans 77-01, 77-07, 77-10) |
| Contact custom attributes (`setCustomAttributes`: site_locale) | INTEGRATE | D-05 passes the current site locale (plan 77-10) |
| Conversation custom attributes (`setConversationCustomAttributes`) + attribute definitions API | INTEGRATE | D-06 visit context + chat_consent record (plans 77-03, 77-07, 77-10) |
| Pre-chat form (email required, name optional) | INTEGRATE | D-04 (plan 77-03); field labels are single-language in CE — kept to "Email"/"Name" (recorded limitation) |
| Conversation continuity via email + account support_email | INTEGRATE | D-04 "never lose a lead" (plans 77-03, 77-07, verified 77-13) |
| `reply_time` enum (`in_a_few_minutes`) | INTEGRATE | D-07; enum not free text (RESEARCH Pitfall 2), copy "within a few minutes" (UI-SPEC) |
| Business hours / working hours | OPT-OUT | D-07: always online 24/7, no offline mode |
| Inbox greeting message | OPT-OUT | single-language per inbox; the localized widget header (welcomeTitle/Description via chatwootSettings) is the D-08 greeting |
| `allowed_domains` on the Website inbox | INTEGRATE | restrict embedding to rideprestigo.com; sync warns and records if v4.18.0-ce rejects the field (plan 77-07) |
| Inbox avatar upload | INTEGRATE | D-08 Prestigo logo (public/brand/logo-512.png) |
| Widget color | INTEGRATE | D-08 #0F1D2C; CE offers one color only, so gold accents stay on the site launcher |
| Telegram inbox (Chatwoot-registered webhook) | INTEGRATE | INBOX-05, D-15 (plan 77-06) |
| Canned responses (`/short_code`, variables) | INTEGRATE | OPS-01, D-17 — 5 topics × 7 locales (plans 77-03, 77-07) |
| Macros | OPT-OUT | D-17 selected canned responses; topic labelling is automation's job (D-20); a macro per topic × locale would duplicate 35 templates without adding an action |
| Labels | INTEGRATE | D-20 (11 labels) |
| Automation rules (conversation_created, message_created, conversation_updated) | INTEGRATE | OPS-02, D-20, D-21; per-keyword topic rules avoid AND/OR precedence ambiguity |
| Inbox-level auto-assignment (round robin) | OPT-OUT | assigns only to online agents; D-21 requires every conversation assigned to the owner, done by automation `assign_agent` |
| Teams + team membership | INTEGRATE | D-21 Bookings and B2B, owner member of both |
| Agent roles / ACL for more operators | OPT-OUT | CRM-05 runbook belongs to Phase 80 (D-21) |
| Native reports — inbox/label summary (volume, first response, resolution) | INTEGRATE | INBOX-06, D-22 (plans 77-09, 77-13) |
| Agent and team reports | INTEGRATE | available natively with no setup; single operator today, used when operators are added |
| CSAT surveys + CSAT reports | OPT-OUT | not in INBOX/OPS scope; post-trip feedback goes to the Google review link (review-request template) and a second survey would double-ask customers |
| Chatwoot mobile app + push notifications (push relay) | INTEGRATE | D-07 24/7 availability and D-12 operator uses web/mobile app; relay disclosed on the privacy page (plan 77-05) |
| Agent notification emails | INTEGRATE | kept to the relocated admin address, never a connected mailbox (plan 77-11 loop prevention) |
| Outbound webhooks (conversation/message events) | OPT-OUT | Phase 83 (HOOK-01..04) |
| API channel inbox | OPT-OUT | no custom channel needed in this phase; site↔Chatwoot sync is Phase 82 |
| Dashboard apps (sidebar) | OPT-OUT | Phase 84 (PANEL-01/02) |
| WhatsApp channel | OPT-OUT | Phase 78 (WA-01..03) |
| Instagram / Facebook channels | OPT-OUT | Phase 79 (SOC-01/02) |
| SMS / Twilio / Line / other channels | OPT-OUT | not requested by any v4.0 requirement |
| Help center / portals | OPT-OUT | the site's FAQ pages cover self-service; not in scope |
| Agent bots / AI assistant / auto-translation | OPT-OUT | INBOX-FUT-01 (deferred) |
| Contact import (CSV) / contact merge | OPT-OUT | Phase 82 backfill and dedup (SYNC-03/04) |
| Integrations (Slack, Dialogflow, OpenAI, Linear) | OPT-OUT | not requested; repo code owns integrations (no middleware) |
| Enterprise features (SLA, audit logs, custom roles) | OPT-OUT | Chatwoot Enterprise is out of scope (REQUIREMENTS) |

## Telegram Bot API

| capability | decision | reason |
|---|---|---|
| getMe / getWebhookInfo (safety check) | INTEGRATE | prove a brand-new, unwired bot before connecting; prove Chatwoot owns the webhook after (plan 77-06) |
| setMyName / setMyDescription / setMyShortDescription with language_code | INTEGRATE | D-15 localized profile and pre-Start text in 7 languages |
| setWebhook / message send-receive | INTEGRATE | performed by Chatwoot's Telegram inbox (no site code) |
| Profile photo | INTEGRATE | via @BotFather /setuserpic with the Prestigo logo (owner step) |
| Join groups | OPT-OUT | disabled via /setjoingroups — customer bot is 1:1 only |
| setMyCommands (command menu) | OPT-OUT | Chatwoot does not execute commands; a menu would advertise actions the inbox cannot perform |
| Content-approval bot reuse | OPT-OUT | forbidden by D-15 (lib/content/telegram.ts untouched) |

## Hostinger mail

| capability | decision | reason |
|---|---|---|
| IMAP (993 SSL) + SMTP (465 SSL) per mailbox | INTEGRATE | D-10 |
| Forwarders / autoresponders on info@ and bookings@ | OPT-OUT | D-14 one mailbox, one system — removed if found |
| Webmail | INTEGRATE | D-12 emergency-only fallback with a written rule |
| MX / DNS changes | OPT-OUT | mail stays at Hostinger; nothing to change |

## Resend (site transactional email)

| capability | decision | reason |
|---|---|---|
| `replyTo` on customer-facing sends | INTEGRATE | D-11 → bookings@ (plan 77-02) |
| Changing From addresses | OPT-OUT | D-11 changes reply routing only |

## Vercel

| capability | decision | reason |
|---|---|---|
| Production env vars (CHATWOOT_BASE_URL, CHATWOOT_WEBSITE_TOKEN, CHATWOOT_WIDGET_HMAC_SECRET) | INTEGRATE | D-05 server-side HMAC (plan 77-09) |
| Preview deployments | OPT-OUT | known to fail in this project (missing Supabase env); production is the verification environment |

## Supabase Auth

| capability | decision | reason |
|---|---|---|
| `auth.getUser()` in the identity route | INTEGRATE | D-05 identity source |
| `customer_profiles` (full_name, phone) read | INTEGRATE | D-05 attributes |
| Booking data to Chatwoot | OPT-OUT | D-05 — bookings in chat are Phase 84 |
