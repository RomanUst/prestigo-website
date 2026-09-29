# Phase 78 — API Coverage Decision Matrix

Full coverage by default; every OPT-OUT carries its reason. Integrated services: Meta WhatsApp Business Platform (Cloud API in coexistence mode, Business Management API for message templates, Embedded Signup), Chatwoot CE v4.18.0-ce (WhatsApp channel, Application API), Meta App Dashboard / Business Manager (owner UI steps).

## Meta WhatsApp Cloud API (messaging, via Chatwoot)

| capability | decision | reason |
|---|---|---|
| Receive messages webhook (`messages` field) | INTEGRATE | WA-01; Chatwoot subscribes the WABA at Embedded Signup (plan 78-08) |
| Coexistence echoes (`smb_message_echoes`) — phone-app replies appear in Chatwoot | INTEGRATE | WA-01, D-13 phone fallback; Chatwoot v4.18 subscribes and stores them as outgoing `external_echo` messages |
| Webhook signature verification (X-Hub-Signature-256 with the app secret) | INTEGRATE | Embedded Signup channel enforces it; unsigned-POST 401 probe before and after cutover (plans 78-01, 78-08) |
| Send free-form text inside the 24-hour window | INTEGRATE | WA-01 replies from Chatwoot |
| Send media attachments (document/image) inside the window | INTEGRATE | D-10 fallback: invoice PDF sent as an attachment after the customer's reply (plans 78-07, 78-10) |
| Send template messages with NAMED body variables | INTEGRATE | WA-02; operator picks the template in the Chatwoot composer (D-12) |
| Template quick-reply buttons | INTEGRATE | D-11; one tap reopens the 24-hour window |
| Template URL buttons (static and suffix variable) | INTEGRATE | D-11; Stripe Payment Link suffix and the static Google review link |
| Template document/media header | OPT-OUT | D-10 fallback confirmed at the 78-07 checkpoint: Chatwoot v4.18 sends headers only from a public URL and invoice PDFs are private; a header variant is at most a recorded follow-up |
| Message status updates (sent/delivered/read/failed) | INTEGRATE | shown natively by Chatwoot; used in the cutover and UAT checks |
| Inbound location, contacts, reactions, stickers | INTEGRATE | handled natively by Chatwoot v4.18 as received; no configuration |
| Interactive non-template messages (lists, reply buttons) | OPT-OUT | the Chatwoot composer does not send them; not requested by WA-01..03 |
| Sending reactions / typing indicators | OPT-OUT | not requested; no Chatwoot composer support needed |
| WhatsApp Business Calling API | OPT-OUT | not requested; calls stay on the phone |
| WhatsApp Flows | OPT-OUT | not requested by any v4.0 requirement |
| Catalog / commerce messages | OPT-OUT | not requested; bookings run through the site |
| Marketing broadcast / bulk sends (incl. Marketing Messages API, Chatwoot campaigns) | OPT-OUT | D-12 manual sending only; automatic/booking-triggered sends deferred (needs the Phase 82 outbox and opt-in) |
| Authentication (OTP) templates | OPT-OUT | site sign-in uses Supabase email flows; not requested |
| Groups API | OPT-OUT | coexistence does not sync groups; not requested |
| Block users API | OPT-OUT | not requested; blocking stays available in the phone app |

## Meta Business Management API / platform

| capability | decision | reason |
|---|---|---|
| `POST /{WABA}/message_templates` (create) | INTEGRATE | D-09 templates as code (plans 78-03, 78-09) |
| `GET /{WABA}/message_templates` (list, status, category, paging) | INTEGRATE | D-09 idempotence and status report |
| `POST /{TEMPLATE_ID}` (edit) | INTEGRATE | rejected/paused fixes; approved drift only with `--allow-edit` (edit budget) |
| Template delete | OPT-OUT | a deleted name is blocked for 30 days; the script refuses DELETE by design |
| `message_template_status_update` webhook | OPT-OUT | status is read by `--status` and Chatwoot's 3-hourly sync; no webhook consumer needed at this volume |
| Resumable Upload API (sample header handle) | OPT-OUT | only needed for a document header, which is out per the D-10 decision |
| Embedded Signup with `featureType: whatsapp_business_app_onboarding` (coexistence) | INTEGRATE | D-03, run by Chatwoot's native flow (plans 78-01 rehearsal, 78-08) |
| Manual channel setup (phone number id + token) | OPT-OUT | Chatwoot marks coexistence unsupported in the manual flow and manual channels skip signature checks (RESEARCH Q1, Pitfall 4) |
| Phone number registration / deregistration / two-step PIN | OPT-OUT | coexistence numbers are pre-registered; a PIN or registration risks taking the number off the phone app |
| WABA subscribed_apps + per-WABA callback override | INTEGRATE | done by Chatwoot's WebhookSetupService at onboarding |
| App-level webhook (`/bot` + FB_VERIFY_TOKEN, field `messages`) | INTEGRATE | prerequisite for the per-WABA override (plan 78-01); reused by Phase 79 |
| Phone number health: quality rating, messaging limit tier, status, coexistence flag, name status | INTEGRATE | read via Chatwoot's health endpoint in `inspect --whatsapp` (plan 78-05) |
| Display name review | INTEGRATE | D-05 exact name only if Meta asks or offers; stop-and-ask on rejection (plans 78-08, 78-10) |
| Business profile API (about, address, photo, websites) | OPT-OUT | the profile stays managed in the WhatsApp Business app, which remains the source for coexistence numbers |
| History sync (`history` webhook) | OPT-OUT | D-14: Chatwoot v4.18 has no consumer (PRs 12149/15713 open); owner declines history sharing |
| App state / contacts sync (`smb_app_state_sync`) | OPT-OUT | same as history; contacts and dedup belong to Phase 82 |
| Business-scoped user ids (BSUID) handling | OPT-OUT | cross-channel identity and dedup are Phase 82 (SYNC-03/04) |
| Pricing / conversation analytics endpoints | OPT-OUT | D-19 lightweight cost control: monthly WhatsApp Manager check; the endpoint was not verified (RESEARCH "Pricing") |
| Billing / payment method APIs | OPT-OUT | D-18: the owner adds the card in WhatsApp Manager; Claude never handles card data |
| System User token management | INTEGRATE | owner-created least-privilege token for the template script (plan 78-09) |
| Tech Provider onboarding / app review | INTEGRATE | owner track in plan 78-01 (Meta requires Tech Provider for coexistence onboarding) |

## Chatwoot WhatsApp channel (v4.18.0-ce)

| capability | decision | reason |
|---|---|---|
| Embedded Signup inbox (coexistence) | INTEGRATE | WA-01 (plan 78-08) |
| Composer template picker + 24-hour window enforcement | INTEGRATE | WA-02, D-16 built-in indicator |
| Template sync (3-hour scheduler, `POST /inboxes/:id/sync_templates`) | INTEGRATE | `--sync-chatwoot` in the template script |
| Inbox health endpoint | INTEGRATE | `inspect --whatsapp` weekly check |
| Reauthorize + `register_webhook` recovery | INTEGRATE | runbook recovery section (plan 78-05) |
| Inbox settings via Application API (auto-assign off, greeting off, CSAT off, working hours off) | INTEGRATE | D-15, D-17 via sync.mjs (plan 78-04) |
| Automation: channel rule + delayed window rules (`execution_delay`) | INTEGRATE | D-16, D-17 (plan 78-04); delayed rule optional until `delayed_automations` is on |
| Inbox greeting message | OPT-OUT | D-15: the phone app's greeting stays the only one |
| CSAT survey on WhatsApp | OPT-OUT | would create and send an extra CSAT template; post-trip feedback uses the review-request template |
| Business hours / away message | OPT-OUT | Phase 77 D-07 always online; the phone app's away message stays |
| Chatwoot one-off WhatsApp campaigns | OPT-OUT | D-12 manual sending; automatic sends deferred |
| Contact import / history import | OPT-OUT | D-14 (no upstream support) and Phase 82 |
| Agent bots on WhatsApp | OPT-OUT | INBOX-FUT-01 deferred |
