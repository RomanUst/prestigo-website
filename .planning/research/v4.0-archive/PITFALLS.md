# Pitfalls Research

**Domain:** Self-hosted helpdesk (Chatwoot) + CRM (EspoCRM) on a new Hostinger VPS, two-way linked to an existing Next.js/Supabase/Stripe production site via Supabase outbox + QStash
**Researched:** 2026-09-27
**Confidence:** MEDIUM (cross-checked across official Chatwoot/Meta/EspoCRM docs, Chatwoot GitHub issues/discussions, CVE databases, and GDPR legal sources; a few findings — e.g. the "5 production failures" blog post — are single-source and flagged LOW individually but corroborated by official docs/issues elsewhere)

## Critical Pitfalls

### Pitfall 1: WhatsApp number "migration" done as a hard cutover, killing the existing +420 number's history and app access

**What goes wrong:**
Team disconnects the existing WhatsApp Business App number and re-registers it directly on the Cloud API, losing chat history and the ability to also use the phone app, or worse, gets the number stuck mid-migration (registered nowhere) for hours.

**Why it happens:**
Older tutorials and most BSP (Twilio/360dialog/Zoho) guides describe "migration," not the newer "coexistence" path. Meta shipped **WhatsApp Coexistence** (rolled out May 6, 2025) specifically so a number can stay in the WhatsApp Business App *and* be added to the Cloud API at the same time, syncing both directions via "Messaging Echoes." Coexistence only works if the number is still registered to the **app** (not already claimed by another BSP/API) — if a competitor BSP already has it, it must first be explicitly disconnected via Business App > Settings > Account > Business Platform before re-onboarding.

**How to avoid:**
Use Embedded Signup with the Coexistence flow (not a full migration) so +420725986855 stays usable from the phone (for the owner to see/send messages directly) while Chatwoot receives everything via Cloud API. Confirm before starting: is the number *currently* on the Business App only (not connected to any BSP)? If yes, coexistence is a straight path. If it was ever hooked to a third-party WhatsApp tool, that must be unlinked first. Do this migration during a low-traffic window and verify inbound test messages land in both Chatwoot and the phone app before declaring done.

**Warning signs:**
Number shows "pending" or "unable to verify" in Meta Business Manager for more than a few minutes; test message sent to the number doesn't appear in Chatwoot; existing chat history in the Business App disappears after starting the flow.

**Phase to address:** WhatsApp/Chatwoot channel setup phase (before any other channel is connected — this is the highest-business-risk step since a botched migration can drop the live number Prestigo customers already use).

---

### Pitfall 2: Meta Business verification / display-name rejected, blocking WhatsApp Cloud API + Instagram/Facebook launch

**What goes wrong:**
Business verification or the WhatsApp display name gets rejected, sometimes repeatedly, stalling the whole helpdesk rollout by days to weeks — this is one of the most common WhatsApp Cloud API onboarding failures.

**Why it happens:**
Meta requires the display name to closely match the legal entity/brand as it appears publicly (website, socials) — generic words, slogans, a bare location, emojis, or a name not visible on rideprestigo.com get rejected. Business verification separately fails when legal document details (chelautotrans s.r.o., IČO 05650801) don't exactly match what's submitted, or documents aren't clearly viewable.

**How to avoid:**
Submit the display name as exactly "Prestigo" (matches the site brand, not the legal entity name) with supporting evidence (rideprestigo.com, social profiles) visible and consistent. Submit business verification with the exact legal entity name/IČO used on the website's legal/imprint pages, before starting WhatsApp/IG/FB onboarding — verification is a prerequisite gate, not something to parallelize. Budget slack time (days, not hours) in the phase plan.

**Warning signs:**
Rejection email/in-account note citing "name doesn't match business" or "documents not viewable" — re-read the specific reason (Meta always states one) rather than resubmitting unchanged.

**Phase to address:** WhatsApp/Chatwoot channel setup phase, as a gating pre-step before WhatsApp Cloud API + Instagram/Facebook inboxes are configured.

---

### Pitfall 3: Instagram permissions requested in a Messenger-only Chatwoot app review, causing a circular rejection loop

**What goes wrong:**
Chatwoot's default Facebook/Instagram OAuth flow historically requested `instagram_basic`/`instagram_manage_messages` scopes even when only Messenger was being reviewed, causing App Review to stall or reject — and the fix requires either removing scopes from a patched Chatwoot build or running Instagram and Messenger through **separate** app-review submissions.

**Why it happens:**
Instagram messaging permissions (`instagram_business_basic`, `instagram_business_manage_messages`) require their own use-case-specific review, distinct from Messenger's (`pages_messaging`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`, `business_management`). Chatwoot's stock inbox flow mixes them, which is a known open issue in the Chatwoot repo (tracked in GitHub issues #8434 and #13860).

**How to avoid:**
Check the installed Chatwoot version's changelog for the Instagram/Messenger OAuth scope fix before starting app review; if unpatched, submit Instagram and Facebook/Messenger as two separate App Review requests with only the relevant scopes, following Chatwoot's own "Instagram App Review" developer-docs template and screen-recording requirements. Do not request Instagram scopes at all if IG/FB is deferred past initial launch (per PROJECT.md's target-feature list, Telegram/Instagram/Facebook can ship after WhatsApp+email+widget are stable).

**Warning signs:**
App Review stuck "In Review" for >7 days with no reviewer note; rejection citing "permissions not used in submitted use case."

**Phase to address:** Instagram/Facebook channel phase (sequence this *after* WhatsApp + email + widget are live and stable, not in the same phase — reduces blast radius if Meta review stalls).

---

### Pitfall 4: 24-hour customer service window expiring mid-conversation, and template messages not pre-approved before launch

**What goes wrong:**
Chatwoot agents try to reply to a customer more than 24 hours after that customer's last message and the send silently fails (WhatsApp rejects free-form messages outside the window) — or the team hasn't pre-approved any templates, so there's no fallback and a lead goes cold.

**Why it happens:**
WhatsApp only allows free-form replies within 24 hours of the customer's last inbound message; after that, only a pre-approved template (Highly Structured Message) can re-open contact, and template approval itself takes up to 24 hours and can be rejected on category/content grounds. This directly replaces the current ad hoc `send-*.mjs` scripts workflow (send-payment-help-email, send-time-change-email, etc.) called out as an explicit v4.0 target — those flows must become approved WhatsApp templates, not first drafted live.

**How to avoid:**
Before go-live, submit and get approval for the standard set of outbound templates Prestigo already sends ad hoc today (payment reminder, time-change notice, vehicle-change notice, post-trip review request, invoice) — treat this as a v4.0 deliverable, not an afterthought. In Chatwoot, configure the 24h-window indicator so agents see remaining time on a conversation; add automation that flags conversations approaching the 24h boundary needing a template-based follow-up instead of assuming free text will work.

**Warning signs:**
Agent-sent message shows "failed" in Chatwoot with an error referencing the messaging window; template stuck in "pending"/"rejected" review status in the WhatsApp Manager.

**Phase to address:** WhatsApp/Chatwoot channel setup phase (template submission should start in parallel with number onboarding, since approval can take days) — and explicitly the phase that retires the manual `send-*.mjs` scripts.

---

### Pitfall 5: Per-message WhatsApp pricing changes (service messages no longer free from Oct 1 2026) not budgeted, and category miscounted

**What goes wrong:**
Cost model built assuming the old free-service-window behavior breaks: since July 1 2025, WhatsApp bills per delivered template message (not per conversation), and **starting October 1 2026, service messages within the 24h window also start costing money** (offset by a free monthly tier of 1,000 service messages per number). A team that doesn't re-check pricing at build time under-budgets or gets a billing surprise right after this milestone ships.

**Why it happens:**
Meta's WhatsApp Business Platform pricing model changed materially in 2025–2026 (conversation-based → per-message, with a new October 2026 charge on previously-free service/utility templates); documentation written before mid-2025 is stale.

**How to avoid:**
Price the WhatsApp channel using the **current** (per-message, category + country-rate) model, not older "conversation-based" assumptions; account for the Oct 1 2026 service-message charge and 1,000/month free tier per number when estimating monthly WhatsApp spend for the +420 number. Re-verify pricing right before launch since it changed twice in the 15 months prior to this research.

**Warning signs:**
WhatsApp Business Platform invoice line items don't match the cost model built into the phase plan; sudden cost increase after Oct 1 2026 without warning.

**Phase to address:** WhatsApp/Chatwoot channel setup phase — verify pricing during planning, not after launch.

---

### Pitfall 6: Chat widget added to marketing/booking pages without deferring load, tanking LCP/INP on the pages that convert bookings

**What goes wrong:**
The Chatwoot widget script (or any live-chat widget) loads eagerly on every page, including the booking flow and landing pages that currently convert visitors — some chat widgets ship 500KB+ of JS that blocks or competes for main-thread time, directly hurting LCP (competes for network/render) and INP (script execution blocks input responsiveness). For Prestigo this is a real business risk since Core Web Vitals and conversion are explicitly load-bearing (SEO health score tracked, LCP-animation H1 already a known audit item per project memory).

**Why it happens:**
Default embed snippets from most helpdesk widgets (Chatwoot included) inject and boot immediately on `DOMContentLoaded`, and teams add the snippet globally via a layout component without measuring impact first.

**How to avoid:**
Load the Chatwoot SDK **after** the page's `load` event (or via `requestIdleCallback`), and/or use a facade pattern (a lightweight static chat-bubble button that only injects the real Chatwoot script on first user interaction/click). Gate the widget behind cookie-consent (see Pitfall 8) — this naturally means it never loads pre-consent, which also protects LCP/INP on first paint. Explicitly exclude the widget from `/book` and other conversion-critical routes if analytics ever show LCP/INP regression there, or lazy-load it only after the booking wizard's critical steps. Add a Lighthouse/CWV check to the phase's UAT gate comparing before/after.

**Warning signs:**
Field or lab Core Web Vitals (GSC / PageSpeed Insights) show LCP or INP regression on pages that had the widget added; Vercel Analytics/GA4 shows a drop in booking conversion rate correlated with the widget deploy.

**Phase to address:** Website chat widget phase — must include a CWV before/after measurement as an explicit UAT/verification step, not just "widget works."

---

### Pitfall 7: Chatwoot widget (and Dashboard App iframe) breaks the existing strict CSP nonce middleware, or gets added by loosening CSP too broadly

**What goes wrong:**
Either the widget silently fails (blocked script/connect/frame directives) in production because the existing nonce-based CSP middleware isn't updated, or — worse — the team "fixes" it by adding a blanket `'unsafe-inline'`/wildcard `*.chatwoot.com` style rule that weakens CSP for the whole site, undoing prior CSP-nonce hardening work.

**Why it happens:**
Chatwoot's widget needs `script-src` (widget bundle), `connect-src` including `wss://` (WebSocket for live typing/realtime), `frame-src` (the actual chat iframe), `img-src` (avatars/attachments), and `style-src`/`font-src` for its own CSS — all pointed at the Chatwoot subdomain, not the app's own domain. Prestigo's middleware already composes CSP nonce + Supabase session + CSRF into one pipeline (a fragile, previously-broken-and-fixed area per project memory — the static-extension matcher bug already caused two production incidents). Any change here risks a repeat.

**How to avoid:**
Add the exact Chatwoot subdomain (not a wildcard) to `script-src`, `connect-src` (with explicit `wss://<subdomain>`), `frame-src`, `img-src`, `style-src`, `font-src` in `middleware.ts`, keeping the nonce mechanism intact for first-party scripts. Update `scripts/qa/baselines/csp_baseline.json` (explicitly named as a required touch-point in PROJECT.md) as part of the same change, and re-run the CSP regression check before merge. Test in a Preview-equivalent environment (Vercel Preview is known broken per project memory, so this needs local/staging verification) that the widget actually renders and connects over WebSocket without console CSP errors.

**Warning signs:**
Browser console shows `Refused to connect/load/frame ... because it violates the following Content Security Policy directive` for a chatwoot.* origin; widget bubble renders but chat never connects (silent CSP block on `connect-src`/`wss:`).

**Phase to address:** Website chat widget phase — CSP update and baseline-file update should be a single reviewed diff, tested against the CSP regression suite before the widget is enabled in production.

---

### Pitfall 8: Chat widget cookies load before consent, or the DPA with the VPS-hosted Chatwoot instance is never actually executed

**What goes wrong:**
The widget sets identifying cookies (session/visitor ID) and loads before the visitor has made a cookie-consent choice, breaching GDPR in the same way a rogue analytics script would — Prestigo already has a working `CookieBanner.tsx` + consent-mode pattern for GA4/Meta Pixel, but the widget is a *new* processor and is easy to forget to wire into that same gate. Separately, since Chatwoot/EspoCRM here are self-hosted by Prestigo itself (not a SaaS vendor), the "DPA with a third party" framing doesn't directly apply — but the *sub-processors* Chatwoot/EspoCRM may still call out to (e.g., Meta's WhatsApp/Instagram/Facebook APis, any email-relay, Redis/Postgres backups off-VPS) still need documenting in the privacy policy/RoPA even though the primary controller-processor question resolves in-house.

**Why it happens:**
Teams treat "self-hosted" as "no GDPR processor question," when GDPR concerns (lawful basis, consent for non-essential cookies, listing the data flows) apply regardless of who operates the server — the data is still personal data, still processed, still needs a documented basis and retention/erasure story. The widget cookie itself is easy to miss because it's added by a different team/phase than the original consent banner work.

**How to avoid:**
Route the Chatwoot widget's script injection through the **same** `CookieBanner.tsx` consent-gate/consumer pattern already used for GA4/Meta Pixel (do not load the SDK until "functional/chat" consent category is accepted) — this is both a CWV win (Pitfall 6) and a compliance requirement. Update the cookie policy / privacy policy to name Chatwoot (self-hosted, EU-based VPS) and EspoCRM explicitly, list what's collected (name, email/phone, conversation content, IP), state where the VPS is physically hosted (Hostinger data-center region — pick an EU region to avoid an international-transfer question), and state retention/erasure handling (Pitfall 9).

**Warning signs:**
Widget cookie appears in browser dev tools before the consent banner has been interacted with; privacy policy's sub-processor list doesn't mention Chatwoot/EspoCRM/Hostinger after this milestone ships.

**Phase to address:** Website chat widget phase (consent-gating) + a dedicated compliance/legal-content phase (privacy policy + RoPA update) that should not be treated as "later" — GDPR applies from first production use, not from when it's convenient to document.

---

### Pitfall 9: Right-to-erasure request only deletes the Supabase row, leaving the person's data live in Chatwoot conversations and EspoCRM contact/lead records

**What goes wrong:**
A customer asks to be forgotten; the team deletes their `customer_profiles`/booking rows in Supabase (source of truth) but the same person still exists as a Chatwoot contact with full conversation history and as an EspoCRM contact/lead/opportunity, because the sync was built one-directional (Supabase → CRM) and no one built the reverse "propagate deletion" path.

**Why it happens:**
GDPR Article 17 obliges the controller to communicate erasure to every downstream recipient the data was disclosed to (Article 19) — but most "sync bookings/leads into CRM" integration work is built for the happy path (create/update), and deletion propagation is the kind of edge case that gets skipped under deadline pressure, especially with three systems (Supabase, Chatwoot, EspoCRM) involved instead of two.

**How to avoid:**
Design the outbox/QStash sync from day one with an explicit `erasure_requested` event type (not just create/update/status-change) that fans out a delete-or-anonymize call to both Chatwoot's API (delete/anonymize contact + optionally the conversation) and EspoCRM's REST API (delete/anonymize Contact + related Lead/Opportunity records), and log completion so a Data Subject Request can be closed with evidence. Maintain a simple internal RoPA-style map (which system holds what field) so a manual DSR doesn't require guesswork about where to look. Decide up front: does an erasure request also delete audit-relevant records that Prestigo must legally retain for the currently-open invoice/booking (Czech accounting law) — if so, anonymize display-identifying fields rather than hard-delete transaction records, and document that policy.

**Warning signs:**
No `erasure`/`deletion` event type exists in the outbox schema; support only knows how to delete the Supabase row when asked to "forget" a customer; EspoCRM/Chatwoot searches still surface the customer's name/email/phone after a stated deletion.

**Phase to address:** Sync/integration phase (outbox event schema design) — erasure propagation should be part of the initial sync contract, not bolted on later; verify with an end-to-end DSR test before calling that phase done.

---

### Pitfall 10: Chatwoot webhooks trusted without signature verification, or replay-vulnerable, letting a spoofed webhook create fake bookings/leads

**What goes wrong:**
The Next.js API route that receives Chatwoot webhooks (conversation created/updated, message sent) accepts any POST that hits the URL without verifying it actually came from the Chatwoot instance, because Chatwoot's per-webhook HMAC signing is a relatively new/still-maturing feature (a known bug exists where the API-exposed `secret` field doesn't match the internal `hmac_token` actually used to sign — tracked in Chatwoot issue #13809 — and full per-webhook signature headers only merged recently, not yet in every stable release depending on the installed version).

**Why it happens:**
Teams assume "it's my own webhook, on my own domain, nobody else knows the URL" is sufficient security — it isn't, since webhook URLs leak via logs, browser history, or brute-forceable paths, and an attacker who discovers the URL could POST fabricated conversation/contact events that create bogus Supabase records or trigger unwanted actions.

**How to avoid:**
Check which Chatwoot version is deployed and whether its webhook HMAC signature (`X-Chatwoot-Signature`, `sha256=HMAC-SHA256(secret, "{timestamp}.{raw_body}")`) is trustworthy for that version before relying on it; if the version has the known `hmac_token`/`secret` mismatch bug, treat the endpoint as unauthenticated by header and add a compensating control (shared-secret query param combined with an allowlist of the VPS's outbound IP, or an internal-only webhook path not linked from anywhere public) until it's fixed. Verify using the **raw** request body (not re-parsed JSON) with constant-time comparison. Deduplicate by Chatwoot's delivery UUID/event ID to guard against replay. Apply the same signature-verification rigor to EspoCRM webhooks (EspoCRM signs via `webhookId:base64(HMAC-SHA256(payload))` in the `Signature` header, renamed from `X-Signature` around v9.0 — check the installed version uses the current header name).

**Warning signs:**
Webhook handler code has no signature check, or checks a `secret` value fetched from the Chatwoot API rather than the actual signing key; no dedup/idempotency key stored per processed event; unexpected Supabase records appear that don't correspond to a real Chatwoot conversation.

**Phase to address:** Sync/integration phase (webhook receiver implementation) — this is a security-relevant change per CLAUDE.md's "Security work... run tests, commit with `security:` prefix" rule and should get the same treatment as auth/CSRF work.

---

### Pitfall 11: Bidirectional sync creates an infinite echo loop (site → CRM → webhook → site → CRM → ...)

**What goes wrong:**
A booking status change is pushed from Supabase to EspoCRM via the outbox; EspoCRM (or a workflow inside it) fires a webhook back toward the site on that same field change; the site's webhook handler writes the "update" back to Supabase, which re-triggers the outbox, which pushes to EspoCRM again — looping, spamming both systems and Chatwoot conversation history with duplicate activity, and potentially racking up API rate-limit errors or duplicate notification emails to the customer.

**Why it happens:**
It's the single most common bug in any bidirectional CRM sync (well-documented across HubSpot/Salesforce integration guides) — naive "receive webhook, write it back" logic has no way to distinguish "a genuine external change" from "the echo of a change I made a second ago."

**How to avoid:**
Since PROJECT.md already locks Supabase as the **sole source of truth**, design the sync so it is conceptually one-directional-with-feedback rather than truly bidirectional: outbound (Supabase → outbox → Chatwoot/EspoCRM) writes should tag the written record/field with an origin marker (e.g., a `source: 'prestigo-outbox'` custom field or a fingerprint hash of what was just written, stored keyed by record ID); inbound webhooks from Chatwoot/EspoCRM should check "did I just write this value from this source" and skip processing if so (an echo), only writing back to Supabase for genuinely CRM-originated changes (e.g., an agent manually changing a Lead stage in EspoCRM, which per PROJECT.md's decisions *should* flow back for the B2B pipeline). Keep write paths narrow: Chatwoot/EspoCRM should never be able to write to `bookings`/`payments` core state — only to derived/CRM-side fields (Lead stage, contact notes, conversation summary).

**Warning signs:**
Same record updated many times in a short window in Supabase's audit log or EspoCRM's stream; QStash retry/delivery counts spike; customer receives duplicate notification emails for one status change.

**Phase to address:** Sync/integration phase (outbox + webhook design) — the origin-tagging/fingerprint mechanism should be part of the initial architecture, not a patch after a loop is discovered in production.

---

### Pitfall 12: Duplicate contacts across channels because phone numbers/emails aren't normalized before matching

**What goes wrong:**
The same customer messages via WhatsApp (+420 725 986 855 formatted with spaces from their phone's contact card), fills the website contact form (`420725986855` no plus), and later books with a Stripe-collected phone number in yet another format — Chatwoot and/or EspoCRM create three separate contact records for one real person, breaking conversation history, repeat-customer detection, and B2B pipeline accuracy (all explicit v4.0 goals: "every customer who ever booked," "repeat customers" stats).

**Why it happens:**
WhatsApp Cloud API only accepts/returns E.164 (`+420725986855`), but web forms, Stripe, and manually-typed CRM entries can contain any format; without a single normalization step applied everywhere contacts are matched/created, lookups miss.

**How to avoid:**
Normalize every phone number to E.164 (using a proper library such as `libphonenumber-js`, with CZ as the default region for local-format inputs) at the single point where contacts are matched or created in the outbox sync layer — never trust the raw string from any channel. Apply the same lowercase-and-trim normalization to email before matching. Before creating a new Chatwoot `contact_inbox` or EspoCRM Contact, always look up by normalized phone/email first; only create new if no match. Backfill/dedupe existing data (e.g., the ad hoc `send-*.mjs` recipient lists) once during initial sync rather than importing them as-is.

**Warning signs:**
Same customer shows up as 2+ separate contacts in Chatwoot's contact list or EspoCRM; "repeat customer" statistics undercount because bookings link to different contact IDs.

**Phase to address:** Sync/integration phase (contact-matching logic) — write this as a shared, tested utility function used by every sync path (WhatsApp, email, widget, booking, contact-form), not duplicated per-channel.

---

### Pitfall 13: The Hostinger VPS becomes a real single point of failure despite the "public site must never depend on VPS uptime" constraint

**What goes wrong:**
The constraint correctly protects booking/payment flow (those stay on Vercel/Supabase), but the team still ends up with a real operational SPOF: if the VPS goes down, **all customer support visibility disappears** — no one sees new WhatsApp messages, emails, or widget chats until it's back up, and the outbox queue silently backs up (QStash retries help, but only up to its retry/DLQ window) with no alerting that anyone's watching.

**Why it happens:**
"The site keeps working" gets treated as "we're safe," but a helpdesk going dark for hours-to-days is itself a business risk (missed bookings, angry customers, WhatsApp response-time SLAs from Meta that affect the account's quality rating) even if payments never fail.

**How to avoid:**
Set up uptime monitoring on the VPS (and each Docker service — Chatwoot web, Sidekiq, Postgres, Redis, EspoCRM) independent of the VPS itself (an external monitor like UptimeRobot/Better Stack, not something running only on the VPS). Alert to a channel that doesn't itself depend on the VPS (e.g., email/SMS/Telegram bot on a different host). Confirm QStash's retry/dead-letter behavior for outbox deliveries — know exactly how long a message survives if the VPS is down for N hours before it's dropped, and add a periodic reconciliation job (compare Supabase outbox `pending` rows against Chatwoot/EspoCRM state) so nothing is silently lost. Document a documented "VPS is down" runbook (who checks WhatsApp manually via the phone app as fallback — coexistence from Pitfall 1 actually helps here).

**Warning signs:**
No alert fires when Docker containers restart-loop or the VPS is unreachable; outbox `pending`/`failed` row count grows with nobody reviewing it; no documented fallback for "helpdesk is down, how do we still respond to WhatsApp."

**Phase to address:** VPS infrastructure phase (monitoring + alerting must ship in the same phase as the VPS itself, not deferred) and the sync/integration phase (reconciliation job).

---

### Pitfall 14: Backups taken from Postgres and attachment storage at different times, producing a restore that references files that don't exist

**What goes wrong:**
A disaster-recovery drill (or a real recovery) restores the Chatwoot/EspoCRM Postgres database from a nightly `pg_dump` but the attachment files (Docker volume or S3-equivalent) were backed up at a different time or not at all — conversations reference attachment IDs that 404, and some restores additionally hit **silent** structural traps: a `BEFORE INSERT` trigger overwrites explicit `display_id` values, unique indexes don't show up in `pg_constraint` so conflicts aren't obviously caught, and orphaned `contact_inbox_id` references can 500 the entire UI after "successful" restore.

**Why it happens:**
Attachments in Chatwoot live in ActiveStorage on a Docker volume (or external S3-compatible storage), never in Postgres — a backup strategy that only dumps the database looks complete but isn't. This is corroborated by Chatwoot's own deployment guidance (nightly `pg_dump` + a synchronized copy of `/app/storage` or the S3 bucket, "from the same moment or you get conversations referring to attachments that do not exist") and independently by community reports of restore-time `display_id`/orphaned-reference failures.

**How to avoid:**
Configure Chatwoot to use S3-compatible object storage (Hostinger or a separate provider) from day one rather than local Docker-volume storage — this decouples attachment durability from the VPS disk and makes backup coordination simpler (object storage has its own versioning/replication). If local storage is used anyway, snapshot the Postgres dump and the storage volume as close to atomically as possible (stop write traffic briefly, or use filesystem/volume-level snapshots) and store both with the same timestamp. Test an actual restore (not just "the backup file exists") on isolated infrastructure with outbound network blocked, before trusting it, checking specifically for `display_id` sequence correctness and orphaned `contact_inbox_id` references post-restore.

**Warning signs:**
Backup job only touches `pg_dump`, no attachment/storage backup exists; no restore has ever actually been tested end-to-end; restore completes "successfully" but the UI throws 500s or shows broken image links.

**Phase to address:** VPS infrastructure phase (backup strategy) — must include a scheduled, tested restore drill as an explicit verification step, not just "backup script runs."

---

### Pitfall 15: Deleting a Chatwoot inbox (e.g., to reconfigure WhatsApp during setup) silently cascades and destroys all its conversation/contact history

**What goes wrong:**
During setup or reconfiguration, someone deletes an inbox in the Chatwoot admin UI (e.g., to fix a misconfigured channel) expecting it to just unlink the channel — instead it's a Rails-level cascading delete that silently destroys every conversation, message, and `contact_inbox` row tied to that inbox, with no confirmation proportional to the impact and no database-level safety net.

**Why it happens:**
Chatwoot models this as a normal `has_many ... dependent: :destroy` relationship; the UI's delete confirmation doesn't communicate the blast radius (potentially thousands of messages during an active support period).

**How to avoid:**
Treat inbox deletion as a destructive, backup-first operation always — never delete/recreate an inbox as a "quick fix" during live operation without a fresh backup immediately before. During initial setup (before real customer data exists), this is low-risk and fine to iterate on; after go-live, add a team rule requiring explicit sign-off before any inbox deletion.

**Warning signs:**
Conversation/message counts drop unexpectedly after an admin action; no one internally knows inbox deletion is destructive until it happens once.

**Phase to address:** WhatsApp/Chatwoot channel setup phase — call this out explicitly in the phase's runbook/checklist so it's known before the team is operating with real customer data.

---

### Pitfall 16: Chatwoot Dashboard App (showing Supabase bookings in the conversation sidebar) inherits known iframe/postMessage vulnerabilities if not hardened

**What goes wrong:**
Chatwoot's Dashboard App mechanism delivers conversation/contact context to an embedded iframe via `postMessage`, and the stock implementation has had real, disclosed vulnerabilities: **CVE-2025-12245** (origin validation error in `IFrameHelper.js`'s `initPostMessageCommunication`, affecting Chatwoot up to 4.7.0, allowing a malicious page to spoof communication with the widget/dashboard iframe) and a separately reported token-hijack/DOM-XSS issue where an unvalidated `postMessage` handler lets an attacker read conversation content or inject code, compounded by a session token (`cw_conversation`) that doesn't expire. Building the "show Supabase bookings in the sidebar" Dashboard App on top of this without hardening exposes booking/customer data through the same channel.

**Why it happens:**
Dashboard Apps were designed as a lightweight extension point (just a name + URL, historically no built-in authentication provision), and because it's an iframe, the *browser* — not the Chatwoot server — makes the request to the app, so the dashboard app endpoint is reachable by anyone who can reach the agent's browser network, not gated by Chatwoot's own auth by default.

**How to avoid:**
Verify the installed Chatwoot version has patched CVE-2025-12245 (origin validation in `IFrameHelper.js`) before relying on Dashboard Apps for anything showing real customer/booking data; upgrade if not. On the Dashboard App side (the Next.js/Supabase-backed endpoint that renders inside the iframe), independently validate `event.origin` against an explicit allowlist (the Chatwoot instance's exact origin) rather than trusting any postMessage, and add Chatwoot's provided signed/short-lived token or a shared-secret handshake if the installed version supports it, rather than relying on the iframe URL alone being "unguessable." Put the Dashboard App endpoint behind the same auth/session checks used elsewhere in the admin surface if feasible, and restrict it to being embeddable only from the Chatwoot origin via its own `X-Frame-Options`/CSP `frame-ancestors`.

**Warning signs:**
Dashboard App renders booking data for any iframe embed regardless of `event.origin`; no expiry on whatever token/session identifies the conversation to the Dashboard App; Chatwoot version predates the CVE-2025-12245 fix.

**Phase to address:** Dashboard App phase (should be sequenced *after* core Chatwoot/EspoCRM sync is stable and the Chatwoot version is confirmed patched) — treat this as security-relevant work per CLAUDE.md's security-commit rule.

---

### Pitfall 17: Service mailbox connected in two places at once (Chatwoot IMAP + something else still polling it), causing duplicate tickets or lost replies

**What goes wrong:**
`info@`/`booking@` gets connected to Chatwoot via IMAP, but an old forwarding rule, another tool, or a second IMAP client (e.g., someone's personal mail client still logged in and marking things "read"/moving them to folders) keeps interacting with the same mailbox — Chatwoot either creates duplicate conversations from re-fetched messages, or misses messages that got moved out of the polled folder by the other client. PROJECT.md's explicit decision ("service mail only in Chatwoot... never one mailbox connected to both systems") already anticipates this risk category for the Chatwoot/EspoCRM split — the same discipline needs to extend to *any* other historical access to these mailboxes (webmail clients, old scripts, phone mail apps).

**Why it happens:**
IMAP is a shared, stateful protocol — two independent clients polling/mutating the same mailbox (moving to read, filing into folders, deleting) race each other, and Chatwoot's ingestion depends on messages staying visible in the polled folder (typically INBOX) in a consistent state.

**How to avoid:**
Before connecting `info@`/`booking@` to Chatwoot, audit and remove every other client/integration/forwarding rule touching that mailbox (Hostinger webmail auto-login sessions, phone Mail app accounts, any old script). Decide explicitly whether the owner still needs occasional read-only access (e.g., via a dedicated read-only IMAP app password or Chatwoot's own UI) rather than a second general-purpose mail client. Apply the same audit to `sales@`/`roman@` before wiring them into EspoCRM only.

**Warning signs:**
Duplicate conversations for the same email in Chatwoot; a message the team remembers arriving is missing from Chatwoot; unread counts in the phone Mail app and Chatwoot disagree persistently.

**Phase to address:** Email channel setup phase (both Chatwoot's info@/booking@ and EspoCRM's sales@/roman@ mailbox wiring) — do the access audit as a pre-step before connecting either mailbox.

---

### Pitfall 18: Outbound mail from the VPS (Chatwoot/EspoCRM notification emails, or any new transactional path) lands in spam because SPF/DKIM/DMARC aren't configured for the new sending source

**What goes wrong:**
The VPS starts sending mail (Chatwoot notification emails to agents, EspoCRM system emails, or anything the integration layer sends directly rather than via Resend) from a brand-new IP with no sending reputation and DNS records that don't authorize it — landing in spam or getting outright rejected by Gmail/Microsoft, even if SPF/DKIM/DMARC records exist for the domain's *primary* mail flow (Resend, Hostinger mail) already.

**Why it happens:**
SPF only allows a fixed list of authorized senders per domain — adding a new sending source (the VPS) without updating the SPF record's `include`/`ip4` mechanisms means it's unauthorized by definition; DKIM requires the new source to sign with its own selector; a new IP has zero reputation and needs warm-up (start at 50–100 emails/day, double weekly). A too-strict DMARC policy (`p=reject`) applied before everything is correctly aligned can silently block legitimate mail instead of just flagging it.

**How to avoid:**
Decide explicitly whether Chatwoot/EspoCRM should send email **through Resend** (reusing the already-configured, already-warmed-up sending reputation and existing SPF/DKIM/DMARC alignment) rather than sending directly from the VPS — this avoids the whole cold-IP problem and keeps one source of truth for outbound mail auth. If direct VPS sending is unavoidable for some notification type, add that IP/hostname to the domain's SPF record, configure a distinct DKIM selector for it, and keep DMARC at `p=quarantine` (not `p=reject`) until alignment is verified via DMARC aggregate reports over at least a couple of weeks. Never introduce a second, conflicting DMARC record — there must be exactly one at the domain root.

**Warning signs:**
Chatwoot/EspoCRM notification emails to staff land in spam; DMARC aggregate reports show `fail` for the VPS's sending IP; a new SPF `include` pushes the record over the 10-DNS-lookup limit, causing a permerror that breaks SPF for *all* senders including Resend.

**Phase to address:** VPS infrastructure phase or Email channel setup phase (decide the sending-path architecture — via Resend vs. direct — before any notification email type goes live), with DNS changes reviewed against the existing SPF/DKIM/DMARC records at Hostinger DNS (per project memory, DNS is centrally managed there).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Skip Dashboard App origin/token hardening, ship the stock iframe embed | Faster sidebar feature | Booking/customer data exposed via unvalidated postMessage (CVE-class issue) | Never for production; only in a throwaway local dev spike |
| Local Docker-volume attachment storage instead of S3-compatible object storage | No extra service to configure at setup | Disk fills silently, backup/restore becomes fragile and two-part | Only for the very first internal test deploy before any real customer data flows through |
| Treat webhook URLs as secret-by-obscurity instead of signature-verifying | Faster initial wiring, no crypto code to write | Spoofable endpoint that can inject fake bookings/leads | Never once the VPS is internet-reachable |
| Build sync as one-directional only, defer erasure/deletion propagation | Simpler v1 outbox schema | GDPR Article 17/19 non-compliance discovered only when a real DSR arrives | Never — erasure event type must exist even if rarely exercised initially |
| Skip phone/email normalization "for now," normalize later | Ship channel connections faster | Duplicate contacts corrupt exactly the "repeat customer" stat that's a stated v4.0 goal | Only acceptable if a one-time backfill/dedupe pass is explicitly scheduled before stats go live |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-------------------|
| WhatsApp Cloud API (existing +420 number) | Full "migration" disconnect, losing history/app access | Use Coexistence onboarding; verify the number isn't already claimed by another BSP first |
| WhatsApp templates | Building outbound flows (payment reminder, time-change, etc.) as free-form text, discovering the 24h-window failure in production | Pre-submit and get approval for every outbound template before retiring the `send-*.mjs` scripts |
| Instagram/Facebook (Chatwoot) | Requesting Instagram scopes in a Messenger-only App Review | Submit Messenger and Instagram as separate, scope-minimal App Review requests; verify Chatwoot version has the scope-mixing fix |
| Chatwoot webhooks → Next.js | Trusting payload without verifying `X-Chatwoot-Signature`, or trusting the API-exposed `secret` field that (in some versions) doesn't match the real signing key | Verify against raw body with constant-time comparison; confirm which field is actually the signing key for the installed version; dedupe by delivery ID |
| EspoCRM webhooks | Checking the old `X-Signature` header on EspoCRM ≥ v9 (renamed to `Signature`) | Confirm installed EspoCRM version's header name; verify `webhookId:base64(HMAC-SHA256(payload))` format |
| Chatwoot Dashboard App | Trusting any `postMessage` sender / relying on an unguessable iframe URL as the only access control | Validate `event.origin` explicitly; confirm CVE-2025-12245 is patched; add token/signature handshake if available |
| Chatwoot ↔ EspoCRM ↔ Supabase sync | Writing inbound webhook data straight back to Supabase without origin/fingerprint checks | Tag every outbound write with an origin marker; skip processing inbound events that match a recent outbound fingerprint |
| Mail (info@/booking@ IMAP) | Leaving a second mail client (webmail/phone app) polling the same inbox Chatwoot now owns | Audit and remove all other access before connecting the mailbox to Chatwoot |
| Outbound VPS email | Sending Chatwoot/EspoCRM notification mail directly from the VPS without updating SPF/DKIM for that IP | Prefer routing through the already-warmed-up Resend sending path; only add direct VPS sending with proper SPF/DKIM/DMARC staging |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Eager, render-blocking widget script on every page including `/book` | LCP/INP regression in GSC/PSI; conversion-rate dip | Defer load past page `load`, gate behind consent, consider a facade button | Immediately on first deploy if not deferred — no scale threshold needed |
| Local ActiveStorage on the VPS Docker volume | Disk usage climbs (observed real-world: tens of GB/month with active WhatsApp/Instagram media) while DB-only monitoring shows "fine" | Use S3-compatible storage from day one; monitor the storage volume directly, not just DB size | Weeks to a couple months of active multichannel support traffic |
| Duplicate blob storage (Chatwoot creates a new file on disk per send even for identical bytes) | Storage grows faster than message volume alone would suggest | Dedupe by checksum+byte_size within accounts if storage becomes a real cost | Noticeable once templated/repeat outbound media (e.g., fleet photos) is sent often |
| Sidekiq/Redis memory growth over long uptimes | Memory usage climbs slowly on the VPS over weeks; known upstream Sidekiq memory-leak-class issues | Monitor Sidekiq process memory; schedule periodic (e.g., weekly) controlled restarts; keep worker and web processes on separate containers | Becomes visible after weeks of continuous operation on a resource-constrained VPS |
| A slow `NOT EXISTS`/`OR` query pattern in Chatwoot's message search as conversation volume grows | Search/list views slow down disproportionately as history accumulates | Not directly actionable pre-launch, but budget for DB index/query tuning once conversation volume is meaningful; keep Postgres on adequate VPS resources | Reported at tens of thousands of messages / tens of millions of scanned rows |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Unauthenticated/unverified Chatwoot or EspoCRM webhook endpoint | Attacker forges booking/lead-creating events | Signature verification with raw-body + constant-time compare + delivery-ID dedup, per the version-specific caveats noted above |
| Dashboard App relying on iframe-URL secrecy | Booking/customer data exposed via CVE-class postMessage/origin issues | Explicit origin allowlist check, confirm CVE-2025-12245 patched, add auth handshake |
| `.env`/secrets committed or left world-readable on the VPS | Full compromise of WhatsApp/Meta tokens, Chatwoot/EspoCRM DB creds, EspoCRM API keys | `.gitignore` for all env files (already enforced repo-side per CLAUDE.md's pre-commit secret scan), 600/400 permissions on the VPS, consider Docker secrets or a vault for production-grade rotation |
| Overly permissive CSP change to accommodate the widget (wildcard origins, `unsafe-inline`) | Regresses the site's existing CSP-nonce XSS protection | Scope every new CSP allowance to the exact Chatwoot subdomain; update `csp_baseline.json` and re-run the CSP regression test |
| Trusting `changeSource`/webhook payload fields without independent origin verification for loop-prevention | A forged event could be crafted to bypass echo-detection and trigger unwanted writes | Combine origin-tagging with cryptographic webhook verification — don't rely on payload content alone to prove authenticity |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Widget appears immediately on page load, before consent, in a visitor's non-EN locale mismatched with `next-intl` locale | Visitor sees an English-only or wrong-locale chat prompt on an RU/AR/ES page, or a jarring pre-consent popup | Localize the widget's greeting/labels per the active `next-intl` locale; only render after consent, matching the existing `CookieBanner.tsx` first-visit pattern |
| Agent replies outside the 24h window with no visible warning until the send fails | Customer thinks they were replied to; the message never actually arrives | Surface the 24h countdown/expired state directly in the Chatwoot conversation UI (built-in, but confirm it's enabled) so agents template-fallback proactively |
| Widget rendered without RTL-awareness for Arabic visitors | Chat bubble/position/text direction looks broken for `/ar/` visitors, undermining an already-hardened RTL implementation | Verify (do not assume) the Chatwoot widget respects `dir="rtl"` in Arabic pages; test explicitly since the rest of the site required dedicated RTL work |

## "Looks Done But Isn't" Checklist

- [ ] **WhatsApp channel:** Often missing pre-approved templates for existing manual flows (payment/time/vehicle-change/review) — verify every current `send-*.mjs` use case has a corresponding approved template before those scripts are retired.
- [ ] **Widget CSP:** Often missing the `wss://` explicit entry in `connect-src` (plain `https://` isn't enough for the realtime WebSocket) — verify the browser console shows zero CSP violations *and* that live typing/realtime actually connects, not just that the bubble renders.
- [ ] **Backups:** Often missing a synchronized attachment/object-storage backup alongside the Postgres dump, and almost always missing an actual tested restore — verify a real restore succeeds on isolated infra, not just that a backup file exists.
- [ ] **Erasure/DSR support:** Often missing propagation to Chatwoot and EspoCRM entirely (deletes only the Supabase row) — verify an end-to-end test DSR removes/anonymizes the person from all three systems.
- [ ] **Webhook security:** Often missing real signature verification (checks a `secret` field that doesn't match the actual signing key, or skips verification altogether) — verify against the specific installed Chatwoot/EspoCRM version's documented signing mechanism, not generic webhook advice.
- [ ] **Duplicate mailbox access:** Often missing an audit of pre-existing IMAP/webmail/phone-app access to info@/booking@ before Chatwoot takes ownership — verify no other client is still polling that mailbox after go-live.
- [ ] **Contact deduplication:** Often missing phone/email normalization at the point contacts are created — verify by testing the *same* real person contacting via WhatsApp, email, and the website widget all resolve to one Chatwoot contact and one EspoCRM contact.
- [ ] **VPS monitoring:** Often missing alerting that doesn't itself depend on the VPS being up — verify the alert path (email/SMS/Telegram) is reachable during a simulated VPS outage.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|-----------------|
| WhatsApp number migration botched (Pitfall 1) | HIGH | Contact Meta Business support with the Business Manager ID; if the number is stuck unregistered, re-attempt Embedded Signup after confirming disconnection from any competing BSP; worst case, temporarily fall back to the phone app only until resolved |
| Meta display-name/business-verification rejected (Pitfall 2) | LOW–MEDIUM | Re-read the specific rejection reason, correct the exact mismatch (name/legal docs), resubmit — usually resolved within another review cycle (up to a few days) |
| Sync echo loop discovered in production (Pitfall 11) | MEDIUM | Pause the outbox worker, clear/replay the backlog after adding origin-tagging, manually dedupe any records that were corrupted by repeated writes |
| Duplicate contacts discovered post-launch (Pitfall 12) | MEDIUM | Run a one-time normalization + merge pass in both Chatwoot and EspoCRM (both support contact-merge), then add the missing normalization step going forward |
| Restore tested and found broken (Pitfall 14) | HIGH | Fix backup coordination (sync DB + storage snapshot timing) immediately, re-test restore before the next real incident — do not wait for an actual disaster to discover this again |
| Inbox accidentally deleted (Pitfall 15) | HIGH if post-launch, LOW pre-launch | Restore from the most recent full backup (DB + storage) taken before the deletion; if no backup exists, data is unrecoverable — this is the strongest argument for backups shipping before any real customer data flows through |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| WhatsApp number migration (1) | WhatsApp/Chatwoot channel setup | Test messages land in both Chatwoot and the Business App; no history loss |
| Meta verification/display name (2) | WhatsApp/Chatwoot channel setup (pre-step) | Verification + display name approved before other channel work starts |
| Instagram scope-mixing App Review (3) | Instagram/Facebook channel (sequenced after WhatsApp/email/widget) | Separate, scope-minimal App Review submissions approved |
| 24h window / template approval (4) | WhatsApp/Chatwoot channel setup | All current `send-*.mjs` use cases have approved templates before scripts are retired |
| WhatsApp pricing model (5) | WhatsApp/Chatwoot channel setup | Cost model checked against current Meta pricing docs at launch time |
| Widget CWV regression (6) | Website chat widget | Before/after Lighthouse/PSI comparison on `/book` and key landing pages |
| CSP breakage (7) | Website chat widget | Zero CSP console violations; `csp_baseline.json` updated and regression-tested |
| Consent-gating / DPA-equivalent documentation (8) | Website chat widget + compliance/legal-content phase | Widget cookie absent until consent given; privacy policy names Chatwoot/EspoCRM/Hostinger |
| Erasure propagation (9) | Sync/integration (outbox schema design) | End-to-end test DSR removes/anonymizes data in Supabase, Chatwoot, and EspoCRM |
| Webhook signature verification (10) | Sync/integration (webhook receiver) | Forged/unsigned payloads rejected; verified against raw body with constant-time compare |
| Sync echo loop (11) | Sync/integration (outbox + webhook design) | No repeated-write storms in audit logs under a manual bidirectional-change test |
| Duplicate contacts / phone normalization (12) | Sync/integration (contact-matching logic) | Same real person across 3 channels resolves to one Chatwoot + one EspoCRM contact |
| VPS single point of failure (13) | VPS infrastructure | External monitoring alerts fire correctly during a simulated outage |
| Backup/restore integrity (14) | VPS infrastructure | A real restore drill succeeds on isolated infra with correct `display_id`/no orphaned references |
| Inbox deletion cascade (15) | WhatsApp/Chatwoot channel setup (runbook) | Team briefed on the destructive-delete behavior; backup exists before any inbox deletion post-launch |
| Dashboard App iframe security (16) | Dashboard App (sequenced after core sync is stable) | CVE-2025-12245 confirmed patched; `event.origin` validated; security-reviewed per CLAUDE.md's security-commit rule |
| Dual mailbox access (17) | Email channel setup | No other IMAP/webmail/phone client still polling info@/booking@ after Chatwoot connects |
| VPS outbound mail deliverability (18) | VPS infrastructure / Email channel setup | DMARC aggregate reports show alignment; notification emails land in inbox, not spam |

## Sources

- [WhatsApp Coexistence | 360Dialog](https://docs.360dialog.com/partner/onboarding/whatsapp-coexistence)
- [Onboard WhatsApp Business app users | Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)
- [WhatsApp Coexistence vs Migration (2026) | Dualhook](https://dualhook.com/whatsapp-coexistence-vs-migration)
- [Meta Business Verification for WhatsApp API | 2026 Fix Guide](https://zaple.ai/blog/meta-business-verification-whatsapp/)
- [WhatsApp Business Integration | Chatwoot](https://www.chatwoot.com/features/whatsapp-for-business)
- [Whatsapp templates | User Guide | Chatwoot](https://www.chatwoot.com/hc/user-guide/articles/1754940076-whatsapp-templates)
- [Pricing on the WhatsApp Business Platform | Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [WhatsApp Business API Pricing in 2026 | Blueticks](https://blueticks.co/blog/whatsapp-business-api-pricing-2026)
- [Instagram: instagram_manage_messages Facebook approval rejected · Issue #8434 · chatwoot/chatwoot](https://github.com/chatwoot/chatwoot/issues/8434)
- [Facebook Messenger inbox OAuth flow includes invalid Instagram scopes · Issue #13860 · chatwoot/chatwoot](https://github.com/chatwoot/chatwoot/issues/13860)
- [Instagram App Review - Chatwoot Developer Docs](https://developers.chatwoot.com/self-hosted/instagram-app-review)
- [Introduction to Email Channel Configuration - Chatwoot Developer Docs](https://developers.chatwoot.com/self-hosted/configuration/features/email-channel/introduction)
- [10 Common Mistakes When Setting Up SPF DKIM and DMARC - DoHost](https://dohost.us/index.php/2026/09/04/10-common-mistakes-when-setting-up-spf-dkim-and-dmarc/)
- [Email Deliverability Troubleshooting Tutorial (2026) | HostMyCode](https://www.hostmycode.com/tutorials/email-deliverability-troubleshooting-tutorial-2026-fix-spf-dkim-dmarc-rdns-helo-vps)
- [Widget API Reference - Chatwoot](https://merkurcode-nauto-console.mintlify.app/developers/widget-apis)
- [Data Processing Agreement Guide: GDPR Article 28 DPA | Kukie.io](https://kukie.io/blog/data-processing-agreement-guide)
- [Art. 17 GDPR – Right to erasure | gdpr-info.eu](https://gdpr-info.eu/art-17-gdpr/)
- [Forgotten @ Scale: right to be forgotten in large-scale systems (arXiv)](https://arxiv.org/pdf/1910.13784)
- [Which Third-Party Scripts Hurt Core Web Vitals? | PageSpeedFix](https://www.pagespeedfix.com/blog/third-party-scripts-core-web-vitals/)
- [Load a chat widget with perfect Core Web Vitals | corewebvitals.io](https://www.corewebvitals.io/pagespeed/chat-widget-perfect-core-web-vitals)
- [Webhook X-Chatwoot-Signature cannot be verified · Issue #13809 · chatwoot/chatwoot](https://github.com/chatwoot/chatwoot/issues/13809)
- [HMAC Verification and Identity Validation | chatwoot/chatwoot | DeepWiki](https://deepwiki.com/chatwoot/chatwoot/11.4-hmac-verification-and-identity-validation)
- [How to properly verify the signature in webhooks? - EspoCRM Forum](https://forum.espocrm.com/forum/developer-help/110181-how-to-properly-verify-the-signature-in-webhooks)
- [Webhooks - EspoCRM Documentation](https://docs.espocrm.com/administration/webhooks/)
- [The Architect's Guide to Bi-Directional API Sync (Without Infinite Loops) | Truto](https://truto.one/blog/the-architects-guide-to-bi-directional-api-sync-without-infinite-loops/)
- [Normalize phone numbers to E.164 for a CRM · Apify](https://apify.com/apivault_labs/whatsapp-number-validator/examples/normalize-phone-numbers-to-e164-for-a-crm)
- [Docker Chatwoot Production deployment guide - Chatwoot Developer Docs](https://developers.chatwoot.com/self-hosted/deployment/docker)
- [System Requirements - Chatwoot Developer Docs](https://developers.chatwoot.com/self-hosted/deployment/requirements)
- [Sidekiq Redis memory growth issues · sidekiq/sidekiq (GitHub)](https://github.com/sidekiq/sidekiq/issues/2812)
- [Self-Hosted Chatwoot: 5 Failures the Docs Don't Warn You About - DEV Community](https://dev.to/achiya-automation/self-hosted-chatwoot-5-failures-the-docs-dont-warn-you-about-47c3) (single-source, LOW confidence individually; corroborated on storage/backup points by official Chatwoot docs)
- [Storage folder filling up fast · chatwoot Discussion #12634](https://github.com/orgs/chatwoot/discussions/12634)
- [CVE-2025-12245 : chatwoot Widget IFrameHelper.js origin validation - GitHub Advisory Database](https://github.com/advisories/GHSA-hgg8-54gw-8v33)
- [Token Hijack via Unvalidated postMessage Handler in Chatwoot Widget | HackWare](https://hckwr.com/blog/multiple-vulnerabilities-in-chatwoot/)
- [Securing Dashboard Apps? · chatwoot Discussion #5878](https://github.com/orgs/chatwoot/discussions/5878)
- [Docker Secrets Best Practices | Collabnix](https://collabnix.com/docker-secrets-best-practices-protecting-sensitive-information-in-containers/)

---
*Pitfalls research for: Self-hosted Chatwoot + EspoCRM helpdesk/CRM integration (Prestigo v4.0)*
*Researched: 2026-09-27*
