# Phase 78 — API Coverage Decision Matrix

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Integrated services: Meta WhatsApp Cloud API / Graph API v25.0 (new dedicated number, new WABA in the existing Prestigo portfolio, new "Prestigo Messaging" app), Chatwoot CE v4.18.0-ce WhatsApp Cloud channel (manual flow, `manual_setup_v2`), plus the site's own public-number surfaces (no API). Replanned 2026-09-29 for the dedicated-number scope; Coexistence is not used.

## Meta WhatsApp Cloud API / Graph API

| capability | decision | reason |
|---|---|---|
| Add phone number + request/verify one-time code (SMS or voice) | INTEGRATE | D-03, owner step in the App Dashboard "API Setup" (plan 78-11) |
| Register number with the owner's own two-step PIN (`POST /{phone-id}/register`) | INTEGRATE | D-03 + RESEARCH Pattern 1 step 4; owner-run `whatsapp-channel.mjs --register` with a hidden TTY prompt (plans 78-09, 78-11) |
| Change / reset the two-step PIN (`POST /{phone-id}` with `pin`) | INTEGRATE | recovery procedure in `infra/vps/runbooks/whatsapp.md` (plan 78-05); owner-run, never scripted with a stored PIN |
| Phone number status read (status, name, quality, limit tier, display number) | INTEGRATE | `whatsapp-channel.mjs --number` prints enums only, plus the `--expect-e164` typo guard for the site switch (plans 78-09, 78-11, 78-14) |
| WABA read (`currency`, `phone_numbers`) | INTEGRATE | D-18 EUR check and number-belongs-to-WABA check in `--number` (plans 78-09, 78-11) |
| Deregister number (`POST /{phone-id}/deregister`) | OPT-OUT | rollback-only, one-off, documented as an owner step in the runbook; no script so it can never run by accident (inbox/number teardown hazard, D-20) |
| Display name submission and change requests | INTEGRATE | D-05 exact string, owner submits in the App Dashboard; `name_status` read by `--number`; on DECLINED stop and ask the owner (plans 78-11, 78-16) |
| WhatsApp business profile (about, description, website, email, photo) | INTEGRATE | owner sets it in WhatsApp Manager during onboarding with the brand logo and site URL (plan 78-11 checklist); single-language, one-time, no drift to sync |
| Business verification (portfolio) | INTEGRATE | D-04, started in parallel by the owner with chelautotrans s.r.o. / IČO exactly as on the legal pages; not a launch blocker |
| Message templates — create (`POST /{waba}/message_templates`) | INTEGRATE | D-09 templates as code, 8 × 7 = 56 submissions (plans 78-03, 78-13) |
| Message templates — list/status with paging (`GET /{waba}/message_templates`) | INTEGRATE | idempotence key name + language, `--status` table (plan 78-03) |
| Message templates — edit (`POST /{template-id}`) | INTEGRATE | rejected templates re-submitted automatically; approved/paused only behind `--allow-edit` (edit budget 1/24 h, 10/30 d) (plan 78-03) |
| Message templates — delete | OPT-OUT | deleting blocks the name for 30 days; the script never deletes (RESEARCH Pattern 2) |
| Template category UTILITY | INTEGRATE | D-07 "utility wherever Meta allows"; Meta's re-categorization is recorded, not fought (plan 78-13) |
| Template category MARKETING | OPT-OUT | no promotional template in D-07; a UTILITY template Meta re-classifies is accepted and priced accordingly (runbook pricing) |
| Template category AUTHENTICATION | OPT-OUT | no one-time-password use case |
| Template named parameters (`parameter_format: NAMED`, body examples) | INTEGRATE | readable in the Chatwoot composer; confirmed at the first live send (plan 78-15, assumption A7) |
| Template text header | OPT-OUT | the brand opens the body; a header would add a second 60-character limit per locale without customer value |
| Template media header (DOCUMENT for the invoice) | OPT-OUT | Chatwoot v4.18 sends media headers only from a public URL and invoices are private (Pitfall 7); the D-10 checkpoint in plan 78-10 rewrites this row if the owner picks the header |
| Template footer | OPT-OUT | the Prestigo sign-off lives in the body; no second length limit to maintain in 7 locales |
| Buttons — QUICK_REPLY | INTEGRATE | D-11, reopens the 24 h window |
| Buttons — static URL | INTEGRATE | D-11, the Google review link in the review request |
| Buttons — URL with a variable suffix | OPT-OUT | per-booking links (payment links) are generated in Phase 84; no per-customer URL exists in this phase |
| Buttons — PHONE_NUMBER (call business) | OPT-OUT | customers reply in the same WhatsApp thread; a call button would copy the business number into 56 templates and each change would cost a review cycle |
| Buttons — COPY_CODE / OTP / FLOW / catalog / multi-product | OPT-OUT | no authentication, Flows or commerce use case |
| Send/receive text, media, documents and templates | INTEGRATE | performed by Chatwoot on the Cloud API (D-12 manual sending, D-06 image and PDF both directions) |
| Media upload/download (attachments) | INTEGRATE | via Chatwoot (D-06 matrix, invoice PDF as a normal attachment per D-10 fallback) |
| Inbound non-text types (image, document, audio, location, contacts, stickers) | INTEGRATE | rendered by Chatwoot as far as v4.18 supports them; image + document proven in D-06 |
| Interactive free-form messages (list / reply buttons outside templates) | OPT-OUT | the Chatwoot composer sends text and attachments; no bot flow in this phase |
| Read receipts / delivery statuses | INTEGRATE | Chatwoot processes `statuses` webhooks; delivery shown per message and checked by `inspect --activity` |
| Typing indicators | OPT-OUT | not exposed by the Chatwoot composer; no customer value at this volume |
| Webhooks — `messages` field (messages + statuses) | INTEGRATE | Chatwoot subscribes the app to the WABA and sets the phone-number callback override (plan 78-12) |
| Webhook signature `X-Hub-Signature-256` | INTEGRATE | `provider_config.app_secret` on the manual channel + unsigned/wrong/signed probes (plans 78-09, 78-12) |
| Webhooks — template status/category, number quality, account update fields | OPT-OUT | Chatwoot v4.18 does not consume them; the runbook's weekly `inspect --whatsapp` and `whatsapp-templates.mjs --status` cover the same facts |
| Webhooks — `smb_message_echoes` / Coexistence | OPT-OUT | Coexistence rejected by the owner 2026-09-29; the number is API-only |
| Embedded Signup | OPT-OUT | manual flow chosen (fewer Meta-side unknowns, no Tech Provider question); kept as a documented fallback in the runbook |
| Analytics endpoints (conversation / pricing analytics) | OPT-OUT | D-19 lightweight cost control: monthly owner glance at WhatsApp Manager; spend alerting is a deferred idea |
| Block users API | OPT-OUT | no abuse at current volume; Chatwoot contact blocking covers the need |
| QR codes / short links (`message_qrdls`) | OPT-OUT | the `wa.me` URL from `lib/contact-channels.ts` covers printed QR codes (D-24 checklist) |
| Calling API (WhatsApp voice on the business number) | OPT-OUT | deferred idea in 78-CONTEXT.md |
| Second phone number on the WABA | OPT-OUT | one dedicated number; unverified portfolios are capped at 2 anyway |

## Chatwoot CE v4.18.0-ce — WhatsApp Cloud channel

| capability | decision | reason |
|---|---|---|
| Manual inbox creation (`manual_setup_v2`: WABA ID, phone number ID, token) | INTEGRATE | D-03 onboarding path chosen by research (plan 78-12, owner types the token) |
| `provider_config.app_secret` via admin inbox PATCH (merged hash) | INTEGRATE | enforces webhook signatures on a manual channel; `whatsapp-channel.mjs --harden`, `rails runner` fallback (plans 78-09, 78-12) |
| Inbox health endpoint (`/inboxes/:id/health`) | INTEGRATE | `inspect --whatsapp` enums and booleans only (plan 78-04) |
| Synced templates listing (`/inboxes/:id/message_templates`) | INTEGRATE | `inspect --whatsapp` template counts by status (plan 78-04) |
| Force template sync (`POST /inboxes/:id/sync_templates`) | INTEGRATE | `whatsapp-channel.mjs --sync-templates` after submission (plans 78-09, 78-13, 78-15) |
| Webhook re-registration (`POST /inboxes/:id/register_webhook`) | INTEGRATE | recovery lever, `whatsapp-channel.mjs --register-webhook` + runbook (plans 78-05, 78-09) |
| Token rotation ("Update API key" field, keeps the rest of `provider_config`) | INTEGRATE | runbook token-rotation procedure (plan 78-05) |
| Template sending from the composer and the New Conversation dialog | INTEGRATE | D-12 manual sending, WA-02 acceptance (plan 78-15) |
| 24 h window indicator + template-only enforcement | INTEGRATE | built in (D-16) |
| Delayed automation (`execution_delay`, `delayed_automations` feature flag) | INTEGRATE | D-16 `wa-window-closing` label, optional rule skipped when the flag is off (plans 78-04, 78-15) |
| Channel rule, `ch-whatsapp` label, Bookings team, owner assignment + membership | INTEGRATE | D-17 Phase 77 conventions (plan 78-04) |
| Inbox greeting / away message / working hours on the WhatsApp inbox | OPT-OUT | D-15 Claude's discretion: none at launch (24/7 operator, single-language greeting would not match the customer's language) |
| CSAT survey on WhatsApp | OPT-OUT | Chatwoot auto-creates a CSAT template on WhatsApp; post-trip feedback goes to the review-request template instead |
| Embedded Signup reauthorization banner | OPT-OUT | manual channel; token health is watched with `inspect --whatsapp` (Pitfall 14) |
| Inbox deletion | OPT-OUT | deletion tears down webhooks and deregisters the number; hard rule "never without a fresh backup" in the runbook (D-20) |
| WhatsApp history import | OPT-OUT | D-14: the new number starts empty; the personal number's history stays on the owner's phone |
| Cross-channel contact dedup / E.164 normalization | OPT-OUT | Phase 82 (SYNC) |
| Conversation → CRM lead webhooks | OPT-OUT | Phase 83 (HOOK) |
| Automatic booking-triggered WhatsApp sends | OPT-OUT | deferred: needs the Phase 82 outbox and an opt-in design |
