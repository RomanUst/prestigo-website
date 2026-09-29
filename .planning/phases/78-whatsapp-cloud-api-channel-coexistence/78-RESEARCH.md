# Phase 78: WhatsApp Cloud API Channel (Coexistence) - Research

**Researched:** 2026-09-29
**Domain:** Meta WhatsApp Business Platform (Cloud API, Coexistence, Embedded Signup, message templates, pricing) + self-hosted Chatwoot CE v4.18.0 + config-as-code under `infra/chatwoot/`
**Confidence:** MEDIUM overall. HIGH on what Chatwoot v4.18.0 does (source read at the tag). MEDIUM on Meta-side eligibility rules (Tech Provider, business verification), because Meta's own pages and community reports disagree on the fine print and only a live attempt settles it.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Meta assets & onboarding path (WA-01)**
- **D-01:** **Reuse the existing Meta Business Manager/portfolio** that already holds the Prestigo FB Page and ad account (act_965674215843049).
  - Create a **new, dedicated Meta app** for messaging (working name "Prestigo Messaging").
  - Do **not** add WhatsApp to the existing Marketing-API app "Prestigo v2" (2040893807310032). It stays in dev mode for ads scripts, so ads and messaging are not mixed.
  - The new app is intended to be reused for IG/FB in Phase 79.
  - **Reversibility:** costly. The Chatwoot inbox, webhook subscription and System User token are bound to this app, so switching apps later means re-onboarding the number.
- **D-02:** The new messaging app must be in **Live mode**. Meta delivers real-message webhooks only to live apps; dev mode is not enough. A privacy-policy URL on rideprestigo.com is sufficient for Live. The owner performs the Meta UI steps; Claude provides an exact checklist.
- **D-03:** **Onboarding path: direct Cloud API, Coexistence**, via Embedded Signup with the QR code scanned from the WhatsApp Business app. No BSP (360dialog etc.) and no monthly middleman fee.
  - Researcher must verify whether **Chatwoot v4.18.0-ce** (`infra/vps/chatwoot/compose.yml`) supports the coexistence Embedded Signup flow on self-hosted instances. See chatwoot/chatwoot#15695 and the self-hosted embedded-signup docs.
  - **Fallback if it does not:** onboard the number with coexistence through our own Meta app (Meta-side Embedded Signup / business-app onboarding). Then create the Chatwoot WhatsApp inbox via the **manual flow** with phone number ID, WABA ID, a System User token and the webhook verify token.
  - Alternatively, upgrade Chatwoot to a version that supports coexistence, strictly via `infra/vps/runbooks/upgrade.md`. The planner picks whichever is lower-risk after research.
  - **Reversibility:** one-way for the number-onboarding moment itself. A botched migration can strand the live number, so this step gets a `checkpoint:decision` / owner confirmation.
- **D-04:** **Business verification only if required.** Research determines whether Meta business verification is mandatory for Coexistence / Cloud API on our own number.
  - If it is not required, launch without it. The planner proposes softening WA-01's "Meta Business verified" wording to "verified if Meta requires it" in REQUIREMENTS.md.
  - If it is required, verification becomes the first owner step: legal entity name and IČO exactly as on the site's legal pages.
- **D-05:** **Display name:** submit exactly **"Prestigo - Premium Chauffeur Service Prague"** (owner's choice).
  - If Meta rejects it, **stop and ask the owner** before resubmitting. Do not auto-fallback to another name.
  - Brand spelling is **Prestigo** (never "Prestigio").
- **D-06:** **Cutover is done in a calm window** (evening or a day with no trips) and follows a written checklist:
  1. Pre-check that the number is on the WhatsApp Business app only and not claimed by any BSP/API.
  2. Back up WhatsApp chats on the phone.
  3. Run the onboarding.
  4. Test both directions:
     - inbound appears in both the phone and Chatwoot;
     - a Chatwoot reply is delivered and appears on the phone (echo);
     - a phone reply appears in Chatwoot.
  5. Defined rollback: back to phone-only.

  Declared done only after all tests pass.

**Outbound templates (WA-02)**
- **D-07:** **Template set (8)**, all submitted for approval:
  1. booking change (time/vehicle)
  2. payment help
  3. review request
  4. trip reminder
  5. driver details: driver name/phone, car, plate, meeting point
  6. re-open conversation: generic "we have an answer to your request, reply to continue"
  7. invoice ready
  8. payment received

  Categories: utility wherever Meta allows it. The review request is likely marketing, and Meta may re-categorize. Final categories are Claude's discretion within Meta rules.
- **D-08:** **All 7 site locales**: en, ru, es, fr, ar, hi, zh. That is about 56 template-language submissions.
  - Real native-quality translations are done in-session, as in Phase 77 D-17. No stubs and no i18n GH workflow.
  - Brand-voice copy rules apply: plain words, no Uber comparisons.
  - Templates hold **no prices or amounts**. Variables and placeholders only, and the existing pre-commit currency guard must cover the template source.
- **D-09:** **Templates are managed as code.**
  - Source lives in the repo, e.g. `infra/chatwoot/whatsapp-templates/`.
  - An **idempotent script submits and updates them via the Graph API** (WABA message_templates) and reports approval status (approved/pending/rejected/paused).
  - The script is run by Claude/owner, never by the site at runtime. It follows the `infra/chatwoot/sync.mjs` + `lib/client.mjs` conventions: `--dry-run` first, redacted tokens, second run = no changes.
  - The Meta token lives only in env/owner config, never in git.
- **D-10:** **Invoice template has a PDF document header.** The operator attaches the invoice PDF (as produced today by the `generate_invoice_*.py` scripts) at send time.
  - Researcher verifies that Chatwoot v4.18 can send media-header templates.
  - If it cannot: send the text template, then send the PDF as a normal attachment once the customer's reply opens the window.
- **D-11:** **Buttons:**
  - Quick-reply buttons (e.g. "OK" / "I have a question") so one tap re-opens the 24h window.
  - URL buttons where they fit: review link, payment/booking page.
  - Researcher confirms which button types Chatwoot v4.18 can send. Templates are designed to degrade to body-only if a button type is unsupported.
- **D-12:** **Sending is manual in this phase.** The operator picks the template in the Chatwoot composer. No automatic reminders or driver-detail sends (deferred; needs Phase 82 outbox plus consent).

**Phone ↔ Chatwoot operating rules**
- **D-13:** **Chatwoot is the primary reply surface**, web or mobile app, because labels, templates and stats live there. The WhatsApp Business app on the phone is the fallback: allowed, echoes into Chatwoot, but the exception, or used when the VPS/Chatwoot is down. Documented in the runbook, mirroring the Phase 77 D-12 email rule.
- **D-14:** **Import chat history and contacts if Chatwoot supports it.** Coexistence can sync contacts and up to about 6 months of history to the API.
  - If v4.18, or the chosen onboarding path, can import them into Chatwoot, do it.
  - If not, history stays on the phone only, which it does anyway, and this is accepted.
  - Researcher confirms.
- **D-15:** **Existing WhatsApp Business app auto-replies stay in the app** (greeting/away/quick replies), provided coexistence still honours them; researcher checks.
  - Do **not** configure a Chatwoot greeting for the WhatsApp inbox, so customers never get two greetings.
  - The website widget greeting from Phase 77 is unaffected.
- **D-16:** **24h window:**
  - Rely on Chatwoot's built-in window indicator / template enforcement.
  - Add automation that labels open WhatsApp conversations approaching window expiry without an operator reply, e.g. `wa-window-closing`, if Chatwoot automation can express it. If not, the built-in indicator alone is acceptable.
- **D-17:** Follow the Phase 77 conventions:
  - New `ch-whatsapp` label plus a channel automation rule.
  - Auto-assign to the owner; the Bookings team routing and b2b → B2B team rules apply as in D-20/D-21 of Phase 77.
  - The WhatsApp inbox's non-secret settings are added to `infra/chatwoot/inboxes.json` and synced by `sync.mjs`. Secrets are never stored there.

**Cost & runbook (WA-03)**
- **D-18:** **Billing:** the owner adds the payment card to the WhatsApp account in Business Manager. Claude never enters card data. **Currency EUR**, matching the ad account.
  - **Reversibility:** one-way. The WABA currency cannot be changed after it is set.
- **D-19:** **Cost control is lightweight.**
  - The runbook holds the current per-message rates for CZ and the main customer countries: template categories, and the service-message pricing from 2026-10-01 with its 1,000/month free tier.
  - It also holds an estimated monthly spend at Prestigo's volume.
  - The owner checks spend manually monthly, optionally with a read-only script that prints current spend.
  - No spend alerting. Pricing is re-verified against Meta docs at planning and launch time.
- **D-20:** **Runbook scope** (extend `infra/vps/runbooks/chatwoot-channels.md` or add a dedicated WhatsApp runbook):
  - Channel recovery.
  - Pricing and the monthly cost check.
  - **Never delete a Chatwoot inbox without a fresh backup.** Inbox deletion cascades and destroys all its conversations/contacts.
  - VPS-down procedure: answer from the phone, and confirm Meta webhook redelivery/backlog after recovery, noting Meta's limited retry window.
  - Token and app rotation: System User token revoked/expired, BM password change, app pushed back to dev.
  - Number quality rating, messaging limits, and handling rejected/paused templates.
  - Rollback to phone-only: detach the API side without losing the number.
  - The inventory table gains the WhatsApp row.

### Claude's Discretion
- Final template categories, variable layout and wording per language, within Meta rules and brand voice.
- Directory layout and script design for WhatsApp templates as code (under `infra/chatwoot/`).
- Choice between the Chatwoot-native coexistence flow, Meta-side onboarding plus the manual Chatwoot flow, or a pinned Chatwoot upgrade. The criterion is lowest risk to the live number, after research.
- Name/slug of the window-expiry label and its automation rule.
- Whether to add a read-only spend/status script, or document the Business Manager UI path only.

### Deferred Ideas (OUT OF SCOPE)
- **Automatic WhatsApp sends triggered by bookings** (trip reminder, driver details, payment received): needs the Phase 82 outbox and a customer opt-in design. Candidate for a post-82 phase.
- **Spend alerting** (Telegram alert when monthly WhatsApp spend exceeds a threshold): not needed now. Revisit if volume grows.
- **Business verification** proactively, if it turns out not to be required now. Revisit before Phase 79 if IG/FB App Review needs it.
- **Chatwoot greeting/away messages for WhatsApp**: not used while the phone app's auto-replies stay active.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WA-01 | WhatsApp messages to +420 725 986 855 arrive in Chatwoot and can be answered from Chatwoot, while the WhatsApp Business app keeps working with the same number and history (Coexistence onboarding; Meta Business verified) | Chatwoot v4.18.0 natively runs the coexistence Embedded Signup flow and handles `smb_message_echoes` (Q1). Meta-side prerequisites (Live app, Tech Provider, business verification) are the critical path (Q2, Q10). Webhook path is already reachable (Q9). Cutover/rollback pattern (Q11). |
| WA-02 | Operator can message a customer outside the 24-hour window using pre-approved templates (booking change, payment help, review request, trip reminder) | Chatwoot enforces the 24h window and sends approved templates with variables, URL buttons and public-URL media headers (Q3, Q6). Templates-as-code via Graph API `message_templates` (Q8). Label automation via delayed automation rules (Q6). |
| WA-03 | A documented runbook covers WhatsApp channel recovery, current per-message pricing and the rule that inboxes are never deleted without a fresh backup | Pricing (Q7), recovery levers found in Chatwoot source (`register_webhook`, `health`, reauthorization), inbox-delete teardown hazard, Meta webhook retry window, offboarding steps (Q11). |
</phase_requirements>

## Summary

**Chatwoot v4.18.0-ce is the newest release (published 2026-09-18) and already contains everything coexistence needs on the Chatwoot side; no upgrade is required and none would help.** The Embedded Signup popup runs with `featureType: 'whatsapp_business_app_onboarding'`, treats the `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` event as coexistence, skips `/register` and the health check for coexistence numbers, and subscribes the WABA to `messages` and `smb_message_echoes`. Echoes from the phone are stored as outgoing messages flagged `external_echo`. On a self-hosted install the option appears as soon as `WHATSAPP_APP_ID` is set in Super Admin (Chatwoot's own UI text and source restrict the "incident" switch to Chatwoot Cloud). Chatwoot's manual flow is **not** a viable coexistence path: Chatwoot's own UI string says numbers using coexistence "are not supported in this flow yet", and Chatwoot's manual guide says not to delete or register a number that is active in the WhatsApp Business app.

**The real risk sits on Meta's side and it sets the schedule.** Meta's coexistence page says "You must already be a Solution Partner or Tech Provider", and a self-hosted Chatwoot user reports the flow only worked after becoming a Tech Provider. Becoming one needs business verification first, then app review with advanced access to `whatsapp_business_messaging` and `whatsapp_business_management` and screen recordings. Chatwoot's own docs are silent on this and say Standard Access "works for most use cases". So: business verification should be treated as **required in practice** (D-04 resolves to "required"; keep WA-01's wording). The owner should start verification and the app on day 1, and the first Embedded Signup attempt should be made with the app in Live mode before spending time on app review, because a failed pairing does not touch the number.

**History and contact import does not exist in Chatwoot yet** (PR #12149 "coexistence app syncing" and PR #15713 "import business app chat history" are both open and unmerged). Chatwoot subscribes to no `history` or `smb_app_state_sync` field. So D-14 resolves to "history stays on the phone". The owner should decline history sharing in the Meta flow (Meta then sends a `history` webhook with error 2593109, which Chatwoot ignores), instead of accepting it and leaving Meta's "24 hours to synchronize" clock unanswered. Template sending, the 24h window, delayed automation for the window label, and the WABA status endpoints (`health`, `message_templates`, `sync_templates`, `register_webhook`) are all present in v4.18.0.

**Primary recommendation:** Use the Chatwoot-native Embedded Signup (coexistence) on the pinned v4.18.0 with a new Live-mode Meta app; start business verification + Tech Provider onboarding immediately as the critical path; ship templates as code (NAMED parameters, Graph API v25.0, `--dry-run` first, list-then-create idempotence, drift reported not auto-edited); extend `sync.mjs` with the WhatsApp managed inbox, `ch-whatsapp`, the channel rule and a delayed-automation pair for `wa-window-closing`; write the runbook under `infra/vps/runbooks/` (not `infra/chatwoot/`, where the currency gate would reject the pricing table).

## Research Answers (the 11 delegated questions)

| # | Question | Answer | Confidence |
|---|----------|--------|------------|
| 1 | Does v4.18.0-ce support coexistence Embedded Signup on self-hosted? Config needed? Manual fallback viable? | **Yes.** Needs Super Admin `WHATSAPP_APP_ID`, `WHATSAPP_CONFIGURATION_ID`, `WHATSAPP_APP_SECRET` at `/super_admin/app_config?config=whatsapp_embedded`. Coexistence-aware code confirmed at the tag (see Pattern 1). Manual flow is **not** viable for coexistence (Chatwoot says unsupported). No upgrade needed (v4.18.0 is latest). | HIGH (code) / MEDIUM (Tech Provider gate) |
| 2 | Is Meta business verification mandatory? Limits unverified? | Meta: business verification is required before app review, and coexistence onboarding is for Tech Providers, so **required in practice**. Unverified limits are not the blocker: default tier 250 unique users / 24h outside the service window, 250 templates per WABA. | MEDIUM |
| 3 | Templates with PDF header, quick-reply, URL buttons? Sync? | Media header **works but only from a public http(s) URL** (Chatwoot sends `document: {link, filename}`; no upload path for templates). Quick-reply: static ones need no send-time component. URL button: supported (`sub_type url`, suffix parameter). Sync: on inbox create, every 3 h by scheduler, manual button, and `POST /inboxes/:id/sync_templates`. | HIGH |
| 4 | History/contacts sync in v4.18 or chosen path? | **No.** Not subscribed, not handled. Upstream PRs #12149 and #15713 open. History stays on the phone. | HIGH |
| 5 | Do app greeting/away/quick replies still work under coexistence? | Meta: "No change" for auto replies, greeting, away, quick replies, labels, catalog. Side effect to test: Chatwoot treats any `external_echo` message as a human reply. | HIGH (Meta) / LOW (echo side effect) |
| 6 | 24h indicator/enforcement? Automation for "approaching expiry"? | Built in: composer shows "You can only reply using a template message due to 24-hour message window restriction"; a free-form send outside the window is marked failed. Automation **can** express it via **delayed automation** (`execution_delay` 10 to 43,200 min, `message_created`, "awaiting agent" episode), but the account feature `delayed_automations` is **off by default** and must be enabled. | HIGH |
| 7 | Current pricing (CZ etc., EUR) | See "Pricing" below. CZ (Rest of Central & Eastern Europe): utility/authentication/service 0.03, marketing 0.11 (Cloud API). From 2026-10-01 service messages and in-window utility templates become billable; first 1,000 service messages per business phone number per month free (per BSP rate-card page and press; Meta's fetched page does not state the 1,000). | MEDIUM |
| 8 | Graph API for templates | `POST /{WABA_ID}/message_templates`, `GET` list with `fields`/paging, edit `POST /{TEMPLATE_ID}` (approved: 1 per 24 h, 10 per 30 days; category not editable), delete by name (name blocked 30 days). Version: pin **v25.0** (expires 2028-07-29); latest is v26.0. | HIGH |
| 9 | Webhook reachability via Caddy | **No change needed.** Live probe: GET verify path answers 401 (wrong token), unsigned POST answers 401, `/api` reports 4.18.0. Path is `/webhooks/whatsapp/:phone_number`. | HIGH |
| 10 | Live mode requirements, System User token | Live needs icon, privacy policy URL, category (Meta). Site has `/privacy`, `/terms`, `/data-deletion` (all 200). Embedded Signup path stores its own business token in Chatwoot; the template script needs a separate owner-created System User token with the two WhatsApp permissions. | MEDIUM |
| 11 | Rollback/offboarding | Owner: WhatsApp Business app, Settings > Account > Business Platform > Disconnect Account. No deregister API for coexistence numbers. Keep the Chatwoot inbox (do not delete). | HIGH (Meta) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Receiving/sending WhatsApp messages | Meta Cloud API (external) | Chatwoot on VPS (webhook receiver + sender) | Meta owns delivery; Chatwoot is the sole API client. The site (Vercel) never touches it (isolation guard). |
| Phone app parity (echoes, history) | WhatsApp Business app on the phone | Meta coexistence sync | Phone keeps full history; Chatwoot gets only new messages via `smb_message_echoes`. |
| Coexistence onboarding (QR) | Meta Embedded Signup popup launched from Chatwoot UI | Owner's phone | One-way step; owner-performed. |
| Template definition and submission | Repo (`infra/chatwoot/whatsapp-templates/`) + owner-run script | Meta Graph API | Git is source of truth; script runs from the owner's Mac only. |
| Template selection and sending | Chatwoot composer (operator) | Meta | Manual in this phase (D-12). |
| 24h window enforcement | Chatwoot (`Conversations::MessageWindowService`) | Meta (rejects out-of-window free-form) | Built-in. |
| Window-closing label | Chatwoot delayed automation (config via `sync.mjs`) | — | Config-as-code. |
| Webhook TLS/reachability | Caddy on VPS | Meta retry (up to 7 days) | Already exposed; no allowlist (Caddyfile comment). |
| Billing/currency | Meta WhatsApp Manager (owner) | — | Owner enters card; EUR fixed on first payment method. |
| Recovery/pricing knowledge | Runbook in `infra/vps/runbooks/` | `inspect.mjs` read-only checks | Outside `infra/chatwoot/` so the currency gate does not reject it. |

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Chatwoot CE | `v4.18.0-ce` (already pinned in `infra/vps/chatwoot/compose.yml` line 56 and 78: `image: chatwoot/chatwoot:v4.18.0-ce`) | WhatsApp inbox, templates picker, 24h window, echo handling | Latest release 2026-09-18 [VERIFIED: `gh release list --repo chatwoot/chatwoot`]; contains all coexistence code paths. |
| Meta Graph API | `v25.0` for the template script | `message_templates` create/list/edit | v25.0 released 2026-02-18, expires 2028-07-29; v26.0 exists (2026-07-29) but is young [CITED: developers.facebook.com/docs/graph-api/changelog/versions/]. |
| Node built-ins (`fetch`, `AbortSignal.timeout`, `node:fs`) | Node 24.14.1 on the owner Mac | Template script and read-only checks | Same as `infra/chatwoot/lib/client.mjs`; zero dependencies. |
| Vitest | `^4.1.1` (package.json) | Tests for templates, Graph client, sync extension | Existing suite pattern (`tests/chatwoot-*.test.ts`). |
| WhatsApp Business app | 2.24.17 or higher on the phone | Coexistence prerequisite | [CITED: developers.facebook.com onboarding-business-app-users]. |

### Supporting
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `.husky/pre-commit` + `scripts/qa/chatwoot_price_gate.mjs` | Currency/price gate on `infra/chatwoot/**` `.json`/`.md` | Automatically covers `infra/chatwoot/whatsapp-templates/*.json` (scans `git diff --cached ... -- infra/chatwoot`). |
| `infra/vps/env/*.env.example` | Names of secrets feed the pre-commit `KEY=value` block list | Add a new example file for the Meta token names (see Pattern 4). |
| `scripts/qa/secret_gate_probe.sh` | Proves the hook blocks secrets against a throwaway index | Add probes for the new names and a Meta token shape. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Chatwoot-native Embedded Signup | Manual flow after Meta-side onboarding | Not viable: Chatwoot states coexistence is unsupported in the manual flow, and manual channels have no webhook signature check (see Pitfall 4). |
| Direct Meta path | Tech Partner such as Dualhook ($12/month, 1 connection, "no per-message markup", 14-day trial) | Fallback only if Tech Provider approval stalls. Breaks D-03 ("no middleman fee"), so needs a `checkpoint:decision`. Pricing page says it is for businesses connecting assets they own. [CITED: dualhook.com/pricing] LOW-MEDIUM. |
| NAMED template parameters | POSITIONAL `{{1}}` | Named is readable in the Chatwoot composer; backend supports both (`parameter_format == 'NAMED'`). Confirm the composer renders names in the first UI smoke test; fall back to positional. |

**Installation:** none. This phase installs no npm/pip/cargo packages. `npm view` checks are not applicable.

**Version verification:** Chatwoot `v4.18.0` [VERIFIED: `gh api repos/chatwoot/chatwoot/git/ref/tags/v4.18.0` returned sha `5c1487713ff2ea407188855211533a1e30e24589`; live `https://chat.rideprestigo.com/api` returned `{"version":"4.18.0",...}`]. Graph API versions [CITED: Meta versions page, fetched 2026-09-29].

## Package Legitimacy Audit

No external packages are installed by this phase (Node built-ins and existing repo tooling only). The audit table is not applicable.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                     (owner phone)
              WhatsApp Business app  <------ Coexistence (Meta syncs both ways) ------+
                     |  ^                                                             |
   customer  ---> +420 725 986 855 (WABA, our Meta portfolio, Live-mode app)  --------+
                     |                                    ^
     inbound msg +   |  smb_message_echoes                |  send: text / template / attachment
     phone echoes    v  (messages field + echoes)         |  (Graph API from Chatwoot)
        Meta webhook POST + X-Hub-Signature-256           |
                     |                                    |
                     v                                    |
        https://chat.rideprestigo.com/webhooks/whatsapp/+420725986855
                     |  (Caddy -> chatwoot-rails:3000; no allowlist)
                     v
   Webhooks::WhatsappController --verify HMAC (WHATSAPP_APP_SECRET, embedded source)--> 401 if bad
                     |
                     v  Sidekiq: Webhooks::WhatsappEventsJob (dedup by source_id, per-contact lock)
        echo?  --yes--> outgoing message, external_echo=true (counts as a human reply)
                --no---> incoming message -> conversation_created / message_created events
                     |
                     v
   Automation (sync.mjs config): ch-whatsapp label, team, owner assign
                                 delayed rule: incoming + no human reply after N min -> add wa-window-closing
                                 outgoing rule: remove wa-window-closing
                     |
                     v
   Operator (Chatwoot web/mobile) --in window--> free-form reply
                                  --window closed--> composer forces template picker
                                                     (templates synced from Meta: 3h scheduler / manual sync)

 Owner Mac (never the site):
   infra/chatwoot/whatsapp-templates/*.json --node script (--dry-run first)--> Graph API POST/GET /{WABA}/message_templates
   -> status report APPROVED/PENDING/REJECTED/PAUSED -> POST /inboxes/:id/sync_templates on Chatwoot
```

### Recommended Project Structure
```
infra/chatwoot/
├── whatsapp-templates/            # NEW: one JSON per template key (8), 7 locales each; price-free (gate scans it)
│   ├── booking-change.json
│   ├── payment-help.json
│   ├── review-request.json
│   ├── trip-reminder.json
│   ├── driver-details.json
│   ├── reopen-conversation.json
│   ├── invoice-ready.json
│   └── payment-received.json
├── whatsapp-templates.mjs         # NEW: CLI (--dry-run, --status, --only <key>, --allow-edit)
├── lib/graph.mjs                  # NEW: Graph client mirroring lib/client.mjs (fetchImpl injection, redaction, timeout, redirect:'error')
├── inboxes.json                   # EDIT: add WhatsApp entry under "managed"
├── labels.json                    # EDIT: add ch-whatsapp and wa-window-closing
├── automation-rules.json          # EDIT: channelRules entry + windowRules (new section)
├── sync.mjs                       # EDIT: expandAutomationRules learns execution_delay; differs() compares it
└── inspect.mjs                    # EDIT (optional): --whatsapp read-only health/templates view
infra/vps/env/whatsapp-meta.env.example   # NEW: names only, values empty
infra/vps/runbooks/whatsapp.md            # NEW (outside infra/chatwoot so pricing may name EUR)
infra/vps/runbooks/chatwoot-channels.md   # EDIT: add WhatsApp row, remove "not a Chatwoot inbox yet"
tests/whatsapp-templates.test.ts, tests/whatsapp-graph.test.ts, tests/whatsapp-runbook.test.ts  # NEW
```

### Pattern 1: Onboarding through Chatwoot-native Embedded Signup (coexistence)
**What:** The owner opens Chatwoot > Settings > Inboxes > Add Inbox > WhatsApp, picks the Cloud/quick-setup option, completes the Meta popup (QR scan from the Business app) and Chatwoot creates the channel with `source: 'embedded_signup'`.
**When to use:** Always for the live number (it is the only Chatwoot-supported coexistence route).
**Evidence (all read at tag v4.18.0):**
```ruby
# app/services/whatsapp/embedded_signup_service.rb
@is_coexistence = ActiveModel::Type::Boolean.new.cast(params[:is_coexistence])
...
channel.setup_webhooks(is_coexistence: @is_coexistence)
# Skip health check on reauth (avoids false disconnect emails) and on coexistence signups
check_channel_health_and_prompt_reauth(channel) if @inbox_id.blank? && !@is_coexistence

# app/services/whatsapp/webhook_setup_service.rb
# Coexistence numbers come pre-registered, so /register is redundant.
def should_register_phone_number?
  return false if @is_coexistence
def subscribed_fields
  fields = %w[messages smb_message_echoes]
```
```js
// app/javascript/dashboard/routes/dashboard/settings/inbox/channels/whatsapp/utils.js
const COEXISTENCE_FINISH_EVENT = 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';
extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' }
```
[VERIFIED: chatwoot/chatwoot@v4.18.0 the three files above]

**Preconditions the plan must schedule (owner steps):**
1. Meta app "Prestigo Messaging" created in the existing portfolio (D-01), Live mode, privacy policy `https://rideprestigo.com/privacy`, terms `https://rideprestigo.com/terms`, data deletion `https://rideprestigo.com/data-deletion` (all return 200 today), icon, category.
2. Facebook Login for Business enabled with **Login with the JavaScript SDK**, `https://chat.rideprestigo.com` in Allowed domains and Valid OAuth redirect URIs, and an Embedded Signup **Configuration** created (Meta doc lists these toggles) [CITED: developers.facebook.com embedded-signup/implementation]. Permissions: `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management` [CITED: developers.chatwoot.com self-hosted whatsapp-embedded-signup].
3. Super Admin (`/super_admin`, reachable: 302 to sign_in): set `WHATSAPP_APP_ID`, `WHATSAPP_CONFIGURATION_ID`, `WHATSAPP_APP_SECRET`. The owner types the secret in the UI; nothing goes to git or chat.
4. Meta app-level webhook: Chatwoot's docs warn the app must be subscribed to `messages` before Chatwoot overrides the callback per phone number; a community thread fixed "Inbox is disconnected" by configuring the app-level callback (`https://chat.rideprestigo.com/bot` with `FB_VERIFY_TOKEN`) and subscribing `messages` [CITED: github.com/orgs/chatwoot/discussions/12831, community, MEDIUM]. `/bot` is the Messenger mount in `config/routes.rb` (`mount Facebook::Messenger::Server, at: 'bot'`). Generate `FB_VERIFY_TOKEN` now; Phase 79 reuses it.
5. Token type: Meta's Embedded Signup configuration template is named "WhatsApp Embedded Signup Configuration With 60 Expiration Token". If the token expires, the inbox disconnects until reauthorized. Prefer the non-expiring business-token option if the configuration form offers it; otherwise schedule reauthorization (Chatwoot has a Reauthorize flow) [ASSUMED semantics, see A3].

**Owner-side decision at the QR flow:** decline chat-history sharing (see Pitfall 3).

### Pattern 2: Templates as code (Graph API)
**What:** One JSON per template key; script lists existing templates, computes the plan, creates missing ones, reports drift, never auto-edits approved templates.
**File shape (recommended):**
```json
{
  "key": "booking-change",
  "name": "prestigo_booking_change",
  "category": "UTILITY",
  "parameterFormat": "NAMED",
  "variables": [
    { "name": "first_name", "example": "Anna" },
    { "name": "booking_ref", "example": "PRG-EXAMPLE" },
    { "name": "change_summary", "example": "pickup time moved to 14:30" }
  ],
  "buttons": [{ "type": "QUICK_REPLY", "textKey": "ok" }, { "type": "QUICK_REPLY", "textKey": "question" }],
  "sourceCanned": "time-change",
  "locales": { "en": { "language": "en", "body": "...", "buttons": { "ok": "OK", "question": "I have a question" } },
               "zh": { "language": "zh_CN", "body": "..." } }
}
```
Rules the script and tests enforce:
- Meta language codes: `ar`, `zh_CN`, `en`, `fr`, `hi`, `ru`, `es` (site locale `zh` maps to `zh_CN`) [CITED: Meta supported-languages page].
- Name: lowercase alphanumeric and underscores, max 512 chars [CITED: Meta templates overview]. One name, seven languages; Chatwoot and Meta match on name + language.
- Limits: body 1,024; header text 60; footer 60; button text 25; quick-reply max 10, URL max 2; quick replies grouped together; a URL variable is allowed only at the end of the URL; variables need example values [CITED: Meta components page].
- Idempotence: `GET /{WABA}/message_templates?fields=id,name,language,status,category,components,rejected_reason&limit=100` with paging; key by `name|language`; create only when absent; compare a **normalized subset** (text, format, button text/url) because Meta adds fields (`example`, normalized parameters) and may re-categorize; reuse `subsetEqual` semantics from `sync.mjs`.
- Approved template that differs: report `drift` and exit non-zero unless `--allow-edit`; edits go through `POST /{TEMPLATE_ID}` and are limited to 1 per 24 hours and 10 per 30 days; category cannot be edited [CITED: Meta template-management]. Rejected or paused templates can be edited without a limit.
- Deleting a template blocks its name for 30 days [CITED: Meta template-management]: the script must **never delete**; a wrong name means choosing a new name.
- Output contract mirrors `sync.mjs`: one line per template-language (`create|unchanged|drift|edit|skipped`), a summary, status table (`APPROVED|PENDING|REJECTED|PAUSED|DISABLED|IN_APPEAL`), exit 0 ok / 1 config or validation / 2 API error. A second run right after a real run prints `create=0`.
- Token custody: read `META_SYSTEM_USER_TOKEN`, `META_WABA_ID` (and optional `META_GRAPH_VERSION`) from env or `~/.config/prestigo/meta-whatsapp.env` (mode 600), same loader shape as `lib/client.mjs`; never a CLI argument; redact the token and `Authorization` echoes in every error; `redirect: 'error'`; 30 s timeout.
- Rate/quota: 56 submissions is far below the 250 templates per WABA cap for an unverified portfolio (6,000 if verified) [CITED]. Add a small delay between POSTs and stop on the first rate-limit style error. Hourly creation caps are not confirmed [ASSUMED, A5].

### Pattern 3: Extend the existing sync with the WhatsApp inbox and window rules
**Inbox (owner creates it via Embedded Signup; sync only patches non-secret settings):**
```json
{ "name": "WhatsApp", "channel_type": "Channel::Whatsapp",
  "settings": { "enable_auto_assignment": false, "greeting_enabled": false, "csat_survey_enabled": false, "working_hours_enabled": false } }
```
Chatwoot names the inbox `"#{business_name} WhatsApp"` on creation (`ChannelCreationService#build_inbox_name`). `buildInboxRefs` already resolves a managed entry by `channel_type` when exactly one inbox of that type and one managed entry of that type exist (the Telegram precedent), so `"@inbox:WhatsApp"` in rules resolves without renaming. CSAT must stay off: on WhatsApp Chatwoot creates a CSAT template automatically (`csat_template_service`).
**Channel rule:** add to `channelRules` `{ "name": "channel: whatsapp", "inbox": "WhatsApp", "label": "ch-whatsapp", "team": "Bookings" }` and to `labels.json` a `ch-whatsapp` label with colour `#0F1D2C` like the other `ch-*` labels.
**Owner membership gap:** `Whatsapp::ChannelCreationService` creates the inbox without inbox members. The current `syncInboxes` only calls `ensureOwnerInboxMember` for the Website inbox. Extend the managed-inbox loop to call it too (or list "add yourself as an agent" as an owner step). `assign_agent @owner` needs the owner as a member.
**Window label (D-16):** feasible with two rules (see Code Examples) but requires enabling the account feature `delayed_automations` (default `enabled: false` in `config/features.yml`); creating a rule with `execution_delay` while it is off is rejected by the controller. `sync.mjs` already has the `optional` mechanism that skips a rule on a 4xx; use it so the run does not fail before the flag is on. Extend `expandAutomationRules` and the `differs` comparison to include `execution_delay`.

### Pattern 4: Secrets and custody
- Add `infra/vps/env/whatsapp-meta.env.example` listing `META_SYSTEM_USER_TOKEN=`, `META_WABA_ID=`, `META_GRAPH_VERSION=` with empty values and custody notes. `.husky/pre-commit` derives its `KEY=value` block list from every `infra/vps/env/*.env.example` name containing PASSWORD/SECRET/_KEY/TOKEN, so the new names are protected automatically (`INFRA_SECRET_KEY_NAMES=$(grep -hoE '^[A-Z_][A-Z0-9_]*=' infra/vps/env/*.env.example ...)`).
- `SECRET_RE` in the hook has no Meta token shape. Meta user/system tokens commonly start with `EAA` [ASSUMED, A4]; add `EAA[A-Za-z0-9]{40,}` to `SECRET_RE` and a probe in `secret_gate_probe.sh`. This is security work: commit with the `security:` prefix (CLAUDE.md).
- Chatwoot stores `WHATSAPP_APP_SECRET` and the channel token in its Postgres; both are inside the encrypted nightly backup (Phase 76). The owner types them; nothing enters the repo.

### Pattern 5: Cutover and rollback (WA-01 acceptance)
1. Pre-check (read-only): number on the Business app only, app version >= 2.24.17, number not connected to any BSP/API, app used recently (coexistence is for active accounts), no other WhatsApp linked-device dependency the owner cannot lose (companion apps are unlinked at onboarding; only supported ones can be re-linked) [CITED: Meta onboarding page; 360dialog coexistence page, MEDIUM].
2. Chat backup on the phone; payment method added in WhatsApp Manager first (currency EUR is fixed on first payment method); Chatwoot `GET /api` shows 4.18.0.
3. Run Embedded Signup; **decline history sharing**; do not accept any prompt to "migrate" or register with a PIN.
4. Verify without messages first: `GET /inboxes/:id/health` shows the coexistence flag (`is_on_biz_app`) and status; Chatwoot shows the "Coexistence" badge (i18n key `COEXISTENCE`).
5. Two-direction test from a second phone: inbound appears on phone and in Chatwoot; Chatwoot reply arrives at the second phone and appears in the owner's Business app; a reply typed on the owner's phone appears in Chatwoot as an outgoing echo.
6. Rollback: owner opens Business app > Settings > Account > Business Platform > Disconnect Account (Meta sends `account_update` `PARTNER_REMOVED`; there is no deregister API for coexistence numbers). Keep the Chatwoot inbox (rename it "WhatsApp (detached YYYY-MM-DD)", remove agents), never delete it.

### Anti-Patterns to Avoid
- **Manual flow for the live number:** unsupported for coexistence; adding the number to a Meta app through API Setup registration can take it off the phone app.
- **Deleting the WhatsApp inbox to "fix" something:** cascades conversations, and for an `embedded_signup` channel `WebhookTeardownService` also clears the callback override, calls `/deregister` on the phone number and unsubscribes the app from the WABA when it is the last inbox on that WABA (errors are only logged). Use `register_webhook` and Reauthorize instead.
- **Accepting history sharing without a consumer:** leaves Meta's "24 hours to synchronize" unanswered.
- **Editing approved templates by script by default:** consumes the 1-per-24h/10-per-30-days budget and resets review; report drift instead.
- **Putting the pricing table under `infra/chatwoot/`:** `CURRENCY_RE` matches `eur`, `€`, `euro(s)` and localized words and would block the commit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Coexistence onboarding | A custom Embedded Signup page or a manual token dance | Chatwoot's built-in Embedded Signup | It already handles the coexistence event, skips `/register`, subscribes the echoes field, stores the channel. |
| Webhook signature check | Own HMAC verification | Chatwoot `MetaTokenVerifyConcern` (`X-Hub-Signature-256`, `secure_compare`) | Only active for `embedded_signup` channels or channels with an app secret in provider_config. |
| 24h window logic | A window timer script | `Conversations::MessageWindowService` + composer restriction | Built in; failed sends are marked with the window error. |
| Template status polling | A cron | `GET /inboxes/:id/message_templates` (Chatwoot) or the script's `--status` | Chatwoot already syncs and exposes statuses. |
| Window-closing label | A polling job over the API | Delayed automation (`execution_delay`) | Episode logic cancels on any human reply; stale rows expire after 3 days. |
| Secret scanning | A new hook | Extend `SECRET_RE` and `infra/vps/env/*.env.example` | Existing gate and probe script. |
| E.164 normalization and cross-channel dedup | Anything in this phase | Phase 82 | Explicitly out of scope; note only that contacts may arrive identified by a business-scoped user id (BSUID) instead of a phone number. |

**Key insight:** every hard part of this phase is either already in Chatwoot v4.18.0 or is a Meta-side owner step; the code we own is a thin template script, a sync extension and a runbook.

## Common Pitfalls

### Pitfall 1: The Tech Provider gate discovered only at the QR step
**What goes wrong:** the popup finishes with "Error while pairing Cloud API" (community discussion #13471); the owner has spent the calm window and the calm window is wasted.
**Why:** Meta: "You must already be a Solution Partner or Tech Provider" for business-app onboarding; Chatwoot docs do not mention it.
**How to avoid:** make business verification + Tech Provider onboarding (app review with advanced access, screen recordings of template submission and message send/receive) the first owner track, in parallel with build work. Rehearse the popup earlier (a failed pairing before the QR scan does not change the number), ideally with a spare Business-app number. Treat "Tech Provider approved" as the gate for the cutover checkpoint.
**Warning signs:** popup error after the QR scan; `UNSUPPORTED_COMPLETION` string ("The Meta setup finished without a WhatsApp phone number that can be connected").
**Confidence:** MEDIUM.

### Pitfall 2: Inbox deletion deregisters and unsubscribes (worse than data loss)
See Anti-Patterns. Runbook must say: fresh backup first (`/opt/prestigo/scripts/backup.sh`), and for a coexistence number never delete at all; detach on the Meta side instead. [VERIFIED: `app/services/whatsapp/webhook_teardown_service.rb` at v4.18.0]

### Pitfall 3: History sharing choice
**What goes wrong:** if the owner shares history, Meta expects a consumer within 24 hours or "they must be offboarded and they must complete the flow again"; Chatwoot ignores `history`.
**How to avoid:** decline sharing in the flow. Meta then sends a `history` webhook with error `2593109` ("History sync is turned off by the business from the WhatsApp Business App"); not subscribed, so nothing happens. The choice is one-time; accepted by D-14. Re-check upstream PRs #12149 and #15713 before launch; if merged in a newer release, the answer changes.

### Pitfall 4: Manual channels have no webhook signature check
**What goes wrong:** for `manual_setup_v2` channels `meta_signature_verification_required?` is false unless the channel carries an app secret, and the phone number in the webhook path is public knowledge, so anyone could POST forged customer messages into the inbox. Embedded Signup channels are verified against `WHATSAPP_APP_SECRET`.
**How to avoid:** stay on Embedded Signup (already recommended). Live check today: with no channel present an unsigned POST returns 401. After onboarding, repeat the unsigned-POST probe and expect 401. [VERIFIED: source + live probe]

### Pitfall 5: Echoes count as human replies
**What goes wrong:** `Message#human_response?` treats `content_attributes['external_echo']` as a human response, so a phone-sent message (and, if the app's automatic greeting is echoed, the greeting itself) clears `waiting_since`, sets first reply time and cancels the delayed window rule.
**How to avoid:** UAT step: send a first message from a fresh test number, observe whether the greeting/away echo appears in Chatwoot and what it does to first-response time and the `wa-window-closing` rule. If distorted, the choices are owner-side (disable the app greeting, which contradicts D-15) or accept and note it in the runbook. [VERIFIED: source]; whether app auto-replies are echoed is [ASSUMED, A8].

### Pitfall 6: Chatwoot sanitizes template variables
`sanitize_parameter` strips `<`, `>`, `"` and `'` and truncates to 1,000 characters; an apostrophe in a name ("D'Angelo") or French wording disappears silently. Meta also restricts variable values (newlines, tabs, long space runs are rejected) [ASSUMED, A6b]. Design variables as short single-line values; write body text with apostrophes in the template body (Meta-side), not in variables.

### Pitfall 7: Media header needs a public URL
Chatwoot builds `document: { link: url, filename }` and validates only http/https, max 2,000 characters. Invoice PDFs are private. A signed, short-lived URL is possible but needs a generator outside this repo (the `generate_invoice_*.py` scripts live in the owner's ops folder). Recommended: ship `invoice-ready` as a body-only template with a quick reply ("Send my invoice") and send the PDF as a normal attachment inside the reopened window (Chatwoot uploads attachments as media ids, no public URL needed). Ship a DOCUMENT-header variant later, after a signed-URL step exists. This deviates from D-10's first sentence but is within its "if it cannot" clause in spirit; raise it as a small `checkpoint:decision`. Creating a header-document template also needs a sample-file handle from the Resumable Upload API [CITED: Meta components page].

### Pitfall 8: Template sync lag
Templates appear in the composer after sync: on inbox creation, every 3 hours (`TemplatesSyncSchedulerJob`), the Settings > Templates "Sync templates" button, or `POST /inboxes/:id/sync_templates`. Chatwoot only sends templates whose synced `status` is `approved` (case-insensitive) and matches name + language. The script should call `sync_templates` after a run that changed statuses.

### Pitfall 9: Category re-classification and the review template
Meta validates the category against content and may re-categorize automatically with 1 day notice; utility must be non-promotional and specific to the user's transaction; generic feedback requests are marketing; feedback specific to a previous order is listed as utility [CITED: Meta template-categorization]. Write the review request as "about your trip {{booking_ref}}", no promotional wording, and record the category Meta assigned (script status output). Cost impact is small (see Pricing).

### Pitfall 10: Payment method before the first template
Template messages are billed; without a payment method on the WABA a send fails (error family "business eligibility payment issue") [ASSUMED, A6]. Add the card (EUR) before the first template test; the WABA currency cannot change afterwards (D-18).

### Pitfall 11: Coexistence upkeep rules
Open the WhatsApp Business app regularly: Meta describes primary-device inactivity as about 14 days, 360dialog states a 13-day rule; use 13 in the runbook. Coexistence disables disappearing messages, view-once and live location for 1:1 chats, disables broadcast lists (existing lists read-only) and does not sync groups. Fixed throughput 20 messages per second is irrelevant at this volume [CITED: Meta onboarding page; 360dialog].

### Pitfall 12: Display name (D-05)
BSP documentation (360dialog, MEDIUM) says a display name "must match exactly how your brand appears on your website", with no extra punctuation, and that for COEX numbers the display name review is initiated only after the business applies for Meta Verified; customers see the name only when it is approved, the business is verified and it has sent 2,000 delivered messages to unique users in 30 days. Chatwoot shows the review state (`AVAILABLE_WITHOUT_REVIEW`, `PENDING_REVIEW`, `REJECTED`...). So the exact string "Prestigo - Premium Chauffeur Service Prague" (hyphen plus descriptor) has a real rejection risk, and a change may not be submittable at all at first. Plan it as "check status, submit only if Meta offers it, stop and ask on rejection" (D-05 already says so). Not a launch blocker: the number keeps working.

### Pitfall 13: Reauthorization silently drops webhooks
`Webhooks::WhatsappEventsJob#channel_is_inactive?` returns true for an `embedded_signup` channel that needs reauthorization, so events are discarded while the inbox is flagged; Meta still gets a 200. The phone app keeps everything, but Chatwoot loses the messages. Monitoring: add `inspect.mjs --whatsapp` (read-only `GET /inboxes/:id/health`) to the runbook's weekly check and watch the "reauthorize" banner/email. [VERIFIED: source]

## Code Examples

### Delayed window rules (config-as-code shape, extends `automation-rules.json`)
```json
{
  "windowRules": [
    {
      "name": "window: whatsapp closing soon",
      "inbox": "WhatsApp",
      "label": "wa-window-closing",
      "delayMinutes": 1200
    }
  ]
}
```
Expands (in `expandAutomationRules`) to two bodies. The condition attributes, actions, `execution_delay` range and event names below are quoted from Chatwoot v4.18.0 `AutomationRule` and the repo's own `sync.mjs` [VERIFIED]:
```json
[
  { "name": "window: whatsapp closing soon", "event_name": "message_created", "active": true, "execution_delay": 1200,
    "conditions": [
      { "attribute_key": "inbox_id", "filter_operator": "equal_to", "values": ["@inbox:WhatsApp"], "query_operator": "and" },
      { "attribute_key": "message_type", "filter_operator": "equal_to", "values": ["incoming"], "query_operator": null }
    ],
    "actions": [ { "action_name": "add_label", "action_params": ["wa-window-closing"] } ] },
  { "name": "window: whatsapp reply clears label", "event_name": "message_created", "active": true,
    "conditions": [
      { "attribute_key": "inbox_id", "filter_operator": "equal_to", "values": ["@inbox:WhatsApp"], "query_operator": "and" },
      { "attribute_key": "message_type", "filter_operator": "equal_to", "values": ["outgoing"], "query_operator": null }
    ],
    "actions": [ { "action_name": "remove_label", "action_params": ["wa-window-closing"] } ] }
]
```
Verbatim facts behind it: `EXECUTION_DELAY_RANGE = (10..43_200) # minutes: 10 min to 30 days`; `conditions_attributes` = `%w[content email country_code status message_type browser_language assignee_id team_id referer city company_name inbox_id mail_subject phone_number priority conversation_language labels private_note]`; `actions_attributes` includes `add_label` and `remove_label`; `message_type` values are enum keys via `Message.message_types[x.to_sym]`. The "awaiting agent" episode key is `awaiting_agent:<waiting_since>` and "waiting_since is cleared on agent/bot reply", so any human reply (including a phone echo) cancels the pending run. 1,200 minutes (20 h) leaves a 4 h margin before the 24 h window closes. Delayed rules do not support `attribute_changed`. The feature flag is `delayed_automations` (`enabled: false` in `config/features.yml`); enable it for account 1 in Super Admin (account edit) or with a one-line `rails runner` on the VPS [A9: the Super Admin toggle is unverified].

### Template creation request (per Meta component reference)
Source: Meta "Template components" page (fetched this session): `POST https://graph.facebook.com/v25.0/{WABA_ID}/message_templates`
```json
{
  "name": "prestigo_booking_change",
  "language": "en",
  "category": "UTILITY",
  "parameter_format": "NAMED",
  "components": [
    { "type": "BODY",
      "text": "Hi {{first_name}}, your Prestigo booking {{booking_ref}} was updated: {{change_summary}}. Reply here if anything looks wrong. — Prestigo",
      "example": { "body_text_named_params": [
        { "param_name": "first_name", "example": "Anna" },
        { "param_name": "booking_ref", "example": "PRG-EXAMPLE" },
        { "param_name": "change_summary", "example": "pickup time moved to 14:30" } ] } },
    { "type": "BUTTONS", "buttons": [ { "type": "QUICK_REPLY", "text": "OK" }, { "type": "QUICK_REPLY", "text": "I have a question" } ] }
  ]
}
```
`body_text_named_params`, `BUTTONS`, `QUICK_REPLY`, `URL` with `example` array and `header_handle` are quoted from the Meta page. The `parameter_format` request field and the body wording are ours: [ASSUMED, A7] confirm with a first `--dry-run` plus Meta's validation response.

### Sending from Chatwoot (what the composer posts; for tests of parameter shape)
```
processed_params: { body: { first_name: "Anna", ... }, header: { media_url, media_type, media_name }, buttons: [{ type: 'url', parameter: 'suffix' }] }
```
[VERIFIED: `Whatsapp::WhatsappCloudService#template_body_parameters` comment and `TemplateProcessorService`]. Quick-reply buttons without a variable need no component; URL buttons send `{ type: 'button', sub_type: 'url', index, parameters: [{ type: 'text', text }] }`.

### Read-only status commands (recommended for `inspect.mjs --whatsapp`)
```
GET /api/v1/accounts/{id}/inboxes/{inbox_id}/health              -> quality_rating, messaging_limit_tier, status, is_on_biz_app, platform_type, name_status
GET /api/v1/accounts/{id}/inboxes/{inbox_id}/message_templates   -> synced templates with status/category
POST /api/v1/accounts/{id}/inboxes/{inbox_id}/sync_templates     -> force refresh (mutation; not in dry-run)
POST /api/v1/accounts/{id}/inboxes/{inbox_id}/register_webhook   -> recovery (admin; mutation)
```
[VERIFIED: `config/routes.rb` lines 299-304 and `InboxHealthManagement`; field names from `Whatsapp::HealthService::PERSISTED_FIELDS`]. Print only booleans/enums and counts, never names, numbers or message text.

## Pricing (D-19, Q7)

Model [CITED: developers.facebook.com pricing page]: charged per delivered **template** message; rate depends on template category and the recipient's country calling code; non-template messages are free inside an open customer service window (until 2026-10-01); 72-hour free entry point windows free; supported billing currencies include EUR; volume tiers for utility/authentication aggregate per business portfolio and reset monthly.

**Effective 2026-10-01** [CITED: developers.facebook.com pricing/non-template-messages]: "Meta will charge on a per-message basis for service messages"; by market the service rate equals the utility/authentication rate; no volume tiers for service messages; utility templates sent within an open 24-hour window become chargeable; the 72-hour free entry point window stays free. The **1,000 free service messages per business phone number per month** is stated by the EUR rate-card republication at edna.io ("First 1000 service messages per month are free of charge") and by press coverage, but is **not** present in the Meta page text retrieved here: MEDIUM, re-verify in WhatsApp Manager > Pricing at launch. Messages typed in the WhatsApp Business app itself are free (secondary source). API-sent replies from Chatwoot count as service messages.

**EUR rates per message, effective 2026-10-01** [CITED: edna.io/pricing-whatsapp-cbp-eur, a WhatsApp BSP republishing Meta's EUR card; MEDIUM]:

| Recipient market | Marketing (Cloud API) | Utility | Authentication | Service |
|---|---|---|---|---|
| Czech Republic (priced as Rest of Central & Eastern Europe) | 0.11 | 0.03 | 0.03 | 0.03 |
| Germany | 0.17 | 0.07 | 0.07 | 0.07 |
| United Kingdom | 0.09 | 0.03 | 0.03 | 0.03 |
| France | 0.11 | 0.04 | 0.04 | 0.04 |
| Spain | 0.10 | 0.03 | 0.03 | 0.03 |
| Italy | 0.11 | 0.04 | 0.04 | 0.04 |
| Russia | 0.11 | 0.05 | 0.05 | 0.05 |
| India | 0.03 | 0.01 | 0.01 | 0.01 |
| UAE | 0.08 | 0.02 | 0.02 | 0.02 |
| Saudi Arabia | 0.08 | 0.02 | 0.02 | 0.02 |
| United States | 0.04 | 0.01 | 0.01 | 0.01 |
| China (Rest of Asia Pacific) | 0.11 | 0.02 | 0.02 | 0.02 |

The list of "main customer countries" is a guess; the planner should derive the real top calling codes from bookings (Supabase MCP) and use those rows [A7]. Illustrative spend (volumes are assumptions, not data): 150 utility templates a month at 0.03 is about 4.50 in EUR; 300 at the Germany rate 0.07 is about 21; even if every review request were billed as marketing at 0.11, 100 of them cost about 11. Service messages stay free below 1,000 replies per month. Conclusion for the runbook: expected spend is single-digit to low double-digit EUR per month; the owner check is a monthly glance at WhatsApp Manager > Billing, no script needed. A read-only spend script is not recommended (a `pricing_analytics` endpoint may exist but was not verified). Runbook text must be date-stamped ("rates as of 2026-09-29, re-check at launch").

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hard migration of the number to Cloud API | Coexistence (app + API on one number) | Rolled out 2025-05, worldwide by 2026 per secondary sources | The phone app and history survive; only new messages sync to the API side. |
| Conversation-based pricing | Per delivered template message | 2025-07-01 | Rates by category and recipient country. |
| Free service window | Service messages billable above 1,000 free per number per month; in-window utility templates billable | 2026-10-01 | Runbook must state this; volumes small. |
| Chatwoot coexistence "planned" | Coexistence embedded signup shipped (v4.5.0 2025-08), echoes, phone-registration skip (PR #15462 merged 2026-09-01) | v4.5.0 to v4.18.0 | Included in the pinned version. History sync still unmerged. |
| Category opt-out (`allow_category_change`) | Meta may re-categorize by default | 2025-04-09 | Declare the best category, accept Meta's decision, record the result. |
| Embedded Signup v2 | v4 (config-based); v2 sunset 2026-10-15 | 2026 | Chatwoot uses config-based Login for Business; no action, watch upstream. |

**Deprecated/outdated:** Chatwoot's `WHATSAPP_API_VERSION` default is `v22.0` (Meta lists v22.0 expiring 2027-05-20); calendar a review before then. Chatwoot's cloud service still hard-codes `v13.0` for sending and `v14.0` for template sync; that is upstream's concern and works today (Meta upgrades expired versions to the oldest available one [ASSUMED]).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Own-business coexistence through a Standard-Access app in Live mode may or may not work without Tech Provider approval; Meta says Tech Provider, Chatwoot docs are silent | Summary, Pitfall 1 | If Tech Provider is required, cutover slips by verification + app review time. Settled only by a live attempt. |
| A2 | Business verification typically takes 2 to 5 business days (secondary source) | Summary | Schedule optimism; rejections add days to weeks. |
| A3 | The Embedded Signup "60 Expiration Token" configuration yields a token that expires in 60 days, and a non-expiring option exists | Pattern 1 | Inbox disconnects every ~60 days until reauthorized; runbook must then schedule it. |
| A4 | Meta access tokens start with `EAA` | Pattern 4 | Secret-gate regex misses or over-matches; the `KEY=value` name gate still works. |
| A5 | No hard hourly creation cap problem at 56 submissions | Pattern 2 | Script hits a rate error; add retry/backoff. |
| A6 | Sending a template without a WABA payment method fails with a payment eligibility error | Pitfall 10 | Confusing failure during the first template test. |
| A6b | Meta rejects variable values containing newlines, tabs or long space runs | Pitfall 6 | Operator-typed values fail at send time. |
| A7 | Request field `parameter_format: "NAMED"` and the exact body wording pass Meta validation; main customer countries listed in Pricing are representative | Code Examples, Pricing | Rework of template JSON; wrong runbook rate rows. |
| A8 | The phone app's greeting/away auto-replies are delivered to Chatwoot as `smb_message_echoes` | Pitfall 5 | Reply-time statistics and window rule behave differently than designed. |
| A9 | Super Admin can toggle the `delayed_automations` account feature without console access | Pattern 3 | Needs a `rails runner` on the VPS (ssh, owner allow-rule per project memory). |
| A10 | Numbers with +420 are eligible for coexistence (secondary sources say all countries by 2026-05); Meta's fetched page lists no exclusions | Pitfall 1 | The popup reports the number unsupported before any change; fallback is phone-only, no BSP path solves it. |
| A11 | Business verification documents: Czech commercial register extract and proof of address, domain ownership via DNS TXT at Hostinger, confirmation via a domain email | Owner checklist | Verification delays. Confirmation mail to info@ lands in Chatwoot (fine, it is the only client). |
| A12 | Meta requires Meta Verified before a COEX display-name review (BSP doc) | Pitfall 12 | D-05 cannot be executed as written; only affects cosmetic name. |
| A13 | Meta auto-upgrades calls to expired Graph versions | State of the Art | Only matters if Chatwoot's hard-coded old versions stop working upstream. |

## Open Questions

1. **Is Tech Provider status actually enforced for a business onboarding its own number?**
   - Known: Meta says partners only; one community user succeeded after becoming a Tech Provider; Chatwoot docs say Standard Access.
   - Unclear: whether a Live app owned by the same portfolio is exempt.
   - Recommendation: start verification and the Tech Provider steps immediately, and make a rehearsal attempt as soon as the app is Live and Chatwoot has the three settings. Plan the cutover checkpoint after the outcome.
2. **Window-rule behaviour with echoes** (Pitfall 5): decide after UAT whether greeting echoes distort statistics; owner decides whether D-15 stays.
3. **Invoice header vs attachment** (Pitfall 7): planner raises a small owner decision; recommended body-only plus attachment now.
4. **Privacy policy naming WhatsApp/Meta as a recipient.** The current privacy page has no WhatsApp or Meta wording (grep found none); Phase 82 (GDPR-02) owns the full update. Recommend an interim one-paragraph disclosure before launch or an explicit deferral note in the plan; owner decision.
5. **Token expiry option** in the Embedded Signup configuration (A3): read the configuration form when creating it; record the answer in the runbook.
6. **Display name path for a COEX number** (A12): confirm in the Meta UI what is offered after onboarding.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node (owner Mac) | Template script, sync, tests | yes | v24.14.1 | none needed |
| `gh` CLI (authenticated) | Upstream source checks | yes | logged in as RomanUst | WebFetch |
| Chatwoot production | Inbox, sync, health | yes | 4.18.0 (`/api`), queue and data services "ok" | none |
| Webhook path via Caddy | Meta callbacks | yes | GET verify path 401 (wrong token), unsigned POST 401 | none |
| Chatwoot Super Admin | `WHATSAPP_*` settings, feature flag | yes (302 to `/super_admin/sign_in`) | login is the owner's | none |
| Site legal pages | Meta Live-mode URLs | yes | `/privacy`, `/terms`, `/data-deletion` return 200 | none |
| VPS SSH | Only for optional `rails runner` (feature flag) | not probed (auto-mode blocks VPS SSH per project memory) | — | Super Admin UI |
| Meta assets (portfolio, verification, Live app, System User token) | Everything Meta-side | owner-only, state unknown | — | none; critical path |
| Second phone/number to test | Two-direction test | unknown | — | owner's own second WhatsApp account |
| Payment card on WABA | Template sends | owner-only | — | none |
| WhatsApp Business app 2.24.17+ | Coexistence | owner to confirm | — | update the app |

**Missing dependencies with no fallback:** Meta business verification and Tech Provider approval (owner, external lead time).
**Missing dependencies with fallback:** VPS SSH (use Super Admin for the feature flag).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.1`, jsdom default, `// @vitest-environment node` for infra tests |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `npx vitest run tests/whatsapp-templates.test.ts tests/whatsapp-graph.test.ts tests/whatsapp-runbook.test.ts tests/chatwoot-sync.test.ts tests/chatwoot-config.test.ts` |
| Full suite command | `npx vitest run` (about 90 s; `vitest related` crashes here, so name files explicitly) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WA-02 | 8 templates x 7 locales present; Meta language codes; name regex; body/header/footer/button limits; variable count and names identical across locales; no start/end variable; examples present; quick replies grouped; URL variable only at end; https and allowed hosts for button URLs | unit | `npx vitest run tests/whatsapp-templates.test.ts` | no, Wave 0 |
| WA-02 | Template copy is price-free and brand-safe (`hasCurrencyToken`, `findForbiddenContent`-style: no Uber, no "Prestigio", no real `PRG-` refs, no promotional words in UTILITY bodies) | unit | same file | no, Wave 0 |
| WA-02 | Graph script against a fake Graph API: dry-run issues GET only; first run creates 56; second run creates 0; approved drift reported (exit 1) unless `--allow-edit`; paging; token never printed; redirect refused; exit codes 0/1/2; never issues DELETE | unit | `npx vitest run tests/whatsapp-graph.test.ts` | no, Wave 0 |
| WA-01 / D-17 | `inboxes.json` has the WhatsApp managed entry with no secret fields; `labels.json` has `ch-whatsapp` and `wa-window-closing`; `channelRules` has `channel: whatsapp`; sync creates then reports `create=0 update=0` on rerun against the in-memory fake | unit | `npx vitest run tests/chatwoot-sync.test.ts tests/chatwoot-config.test.ts` | files exist; add cases |
| D-16 | `expandAutomationRules` emits the delayed rule with `execution_delay` and the clearing rule; `differs` notices a changed delay; a 4xx on the delayed rule is skipped as optional | unit | same | add cases |
| WA-03 | Runbook exists at `infra/vps/runbooks/whatsapp.md`, contains the required sections (recovery, pricing with date stamp, never delete an inbox without a fresh backup, VPS-down, token/app rotation, quality/limits/templates, rollback, coexistence upkeep), lives outside `infra/chatwoot/`, contains no `KEY=value` secret; `chatwoot-channels.md` inventory has the WhatsApp row and no longer says "not a Chatwoot inbox yet" | unit (file assertions) | `npx vitest run tests/whatsapp-runbook.test.ts` | no, Wave 0 |
| Security | Hook blocks a Meta-token-shaped string and a pasted `META_SYSTEM_USER_TOKEN=<value>`; allows the `.example` file | script | `sh scripts/qa/secret_gate_probe.sh` | exists; add probes |
| Guard | No site code path reaches the VPS or Meta | unit | `npx vitest run tests/infra-vps-isolation-guard.test.ts` | exists, must stay green |
| WA-01 | Number onboarded in coexistence, both directions work, history intact | owner live check | see checklist below | manual |

**Owner-performed live checks (UAT, each has a pass criterion):**
1. Meta: portfolio verified; app Live; Tech Provider onboarding done (or the rehearsal popup completes).
2. Chatwoot: `GET .../inboxes/:id/health` (via `inspect.mjs --whatsapp`) shows the coexistence flag true, status CONNECTED, and the UI shows the Coexistence badge.
3. Two-direction matrix D-06 from a second phone (inbound on both; Chatwoot reply delivered and visible in the phone app; phone reply visible in Chatwoot as an outgoing echo); old chat history still on the phone.
4. App greeting or away message still fires for a new sender; note how it appears in Chatwoot (Pitfall 5).
5. Unsigned POST to the webhook path still returns 401 after onboarding.
6. Templates: script status shows all 56 submissions with a status; at least booking change, payment help, review request and trip reminder APPROVED before WA-02 is declared; one real template send to the owner's second number after the 24 h window; quick-reply tap reopens the window and lands in Chatwoot as a message.
7. Window rule: temporarily run the rule with `delayMinutes: 10`, send from a test number, wait, confirm `wa-window-closing` appears; reply and confirm removal; restore 1200 and re-run sync (`update` then `create=0 update=0`).
8. Rollback rehearsal on paper (steps written and reviewed); actual Disconnect Account only if a test fails and the owner agrees.
9. Payment method added in EUR before check 6.

### Sampling Rate
- **Per task commit:** the quick run command above for the touched files.
- **Per wave merge:** `npx vitest run` and `sh scripts/qa/secret_gate_probe.sh` when hook or env examples changed.
- **Phase gate:** full suite green, `npx tsc --noEmit` baseline unchanged (8 old errors in `tests/` only), before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/whatsapp-templates.test.ts`: covers WA-02 content rules
- [ ] `tests/whatsapp-graph.test.ts`: fake Graph API harness (model on `FakeOptions` in `tests/chatwoot-sync.test.ts`)
- [ ] `tests/whatsapp-runbook.test.ts`: covers WA-03
- [ ] `infra/vps/env/whatsapp-meta.env.example` and probe cases in `scripts/qa/secret_gate_probe.sh`
- [ ] Framework install: none (Vitest present)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (Meta and Chatwoot admin accounts) | Owner-held credentials; Chatwoot CE has no 2FA in the UI (Phase 76 note), so use a strong unique password and Meta-side 2FA on the Business Manager admin |
| V3 Session Management | no (no new session code) | — |
| V4 Access Control | yes | System User token scoped to the WABA with only `whatsapp_business_messaging` and `whatsapp_business_management`; Chatwoot admin-only inbox reconfiguration (source: `check_admin_authorization?`) |
| V5 Input Validation | yes | Template JSON schema validation in tests and in the script before any API call; Chatwoot sanitizes variables |
| V6 Cryptography | yes | Do not hand-roll: rely on Chatwoot's `X-Hub-Signature-256` HMAC with constant-time compare; secrets in env only |
| V7 Error handling and logging | yes | Redact tokens in script errors (same redactor shape as `lib/client.mjs`); never print names, numbers, message text |
| V8 Data protection | yes | Message content is personal data: covered by the encrypted nightly backup; privacy wording (Open Question 4) |
| V9 Communications | yes | TLS via Caddy; `redirect: 'error'` on Graph calls; token never in a URL query |
| V14 Configuration | yes | `.env`-style files mode 600 on the owner Mac; new `.env.example` names feed the pre-commit gate |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged inbound webhook (public phone number in the URL) | Spoofing/Tampering | Keep the channel `embedded_signup` so `WHATSAPP_APP_SECRET` signature verification is enforced; re-probe unsigned POST after onboarding |
| Meta token or app secret leaks (git, chat, logs) | Information disclosure | Env/owner file only, redaction, pre-commit name gate plus new `EAA` shape, `security:` commit prefix, rotate on exposure |
| Over-privileged System User token | Elevation of privilege | Assign only the WABA asset and the two permissions; keep separate from Chatwoot's own business token |
| Operator sends the wrong template or wrong data to a customer | Tampering/Info disclosure | Templates carry no free-text PII beyond the operator-typed variables; runbook check-before-send; conversation-scoped composer |
| Inbox deletion or `register_webhook` misuse | Denial of service | Runbook rule and backup-first; recovery uses `register_webhook` and Reauthorize |
| Webhook backlog loss during VPS outage | Denial of service | Meta retries up to 7 days; dedup by `source_id`; phone app is the fallback (coexistence) |
| Reauthorization state drops events silently | Repudiation/DoS | Weekly `inspect --whatsapp` health check and banner watch |
| Super Admin exposure (holds `WHATSAPP_APP_SECRET`) | Elevation of privilege | Owner-only account, no 2FA available in CE so unique password and no shared login |

## Project Constraints (from CLAUDE.md)

- Brand spelling **Prestigo** / **rideprestigo.com**, never "Prestigio" (templates test for it).
- No hard-coded `€` prices in `app/` or `components/` (not touched here); no prices in templates (D-08) and the Chatwoot currency gate scans `infra/chatwoot/**`.
- No secrets or `.env*` files in commits; never read `.env.local` (this research did not).
- Marketing content: no prices, no Uber or ride-hailing comparisons (template copy).
- Security work (tokens, webhook verification, secret gate): run tests, commit with the `security:` prefix.
- Commands: `npx tsc --noEmit` (baseline 8 old errors in `tests/`), `npx eslint --quiet <files>`, `npx vitest run [files]`, the `verify` skill as the full gate; `vitest related` crashes, name files explicitly.
- New EN strings in `messages/en.json` need translations in all locales: not applicable (no site strings); template translations are separate and done in-session.
- Golden-HTML/JSON-LD snapshot rule (`priceValidUntil`): not applicable.
- User-facing communication in Russian; RESEARCH.md stays English.
- Phase 76 guard: `tests/infra-vps-isolation-guard.test.ts` stays green; no site code path calls Chatwoot or Meta.

## Sources

### Primary (HIGH confidence)
- Chatwoot source at tag `v4.18.0` (sha `5c1487713ff2ea407188855211533a1e30e24589`), opened this session: `app/services/whatsapp/embedded_signup_service.rb`, `channel_creation_service.rb`, `manual_setup_service.rb`, `manual_setup_validation_service.rb`, `webhook_setup_service.rb`, `webhook_teardown_service.rb`, `facebook_api_client.rb`, `health_service.rb`, `template_processor_service.rb`, `populate_template_parameters_service.rb`, `send_on_whatsapp_service.rb`, `incoming_message_base_service.rb`, `providers/whatsapp_cloud_service.rb`; `app/jobs/webhooks/whatsapp_events_job.rb`, `app/controllers/webhooks/whatsapp_controller.rb`, `concerns/meta_token_verify_concern.rb`, `api/v1/accounts/concerns/inbox_health_management.rb`, `whatsapp/authorizations_controller.rb`, `whatsapp/manual_setup_controller.rb`; `app/models/channel/whatsapp.rb`, `automation_rule.rb`, `automation_rule_pending_execution.rb`, `message.rb`; `app/services/conversations/message_window_service.rb`; `app/listeners/automation_rule_listener.rb`; `config/routes.rb`, `config/features.yml`, `config/installation_config.yml`; dashboard `useWhatsappEmbeddedSignup.js`, `whatsapp/utils.js`, `Whatsapp.vue`, `WhatsAppTemplateParser.vue`, `en/inboxMgmt.json`, `en/conversation.json`.
- `gh search prs` on chatwoot/chatwoot: #12149 and #15713 open, #15462 merged 2026-09-01.
- Live probes 2026-09-29: `https://chat.rideprestigo.com/api` (4.18.0), webhook verify path 401, unsigned POST 401, `/super_admin` 302, site legal pages 200.
- Repo files read this session (paths above in the body): `infra/chatwoot/*`, `infra/vps/chatwoot/compose.yml`, `infra/vps/caddy/Caddyfile`, `infra/vps/runbooks/chatwoot-channels.md`, `.husky/pre-commit`, `scripts/qa/chatwoot_price_gate.mjs`, `tests/chatwoot-*.test.ts`, `tests/infra-vps-isolation-guard.test.ts`, `.planning/research/PITFALLS.md`.

### Secondary (MEDIUM confidence)
- Meta for Developers (fetched, summarized): onboarding-business-app-users, embedded-signup overview and implementation, get-started-for-tech-providers, messaging-limits, templates overview/components/template-management/template-categorization/supported-languages, webhooks overview, pricing and pricing/non-template-messages, Graph API versions, access-tokens.
- developers.chatwoot.com self-hosted WhatsApp embedded signup doc (from `chatwoot/docs` repo); Chatwoot manual-flow guide; Chatwoot v4.5.0 blog; issue #15695; discussions #12831 and #13471 (community).
- edna.io EUR rate card (BSP republication); courier.com and mixdesk summaries of the 2026-10-01 change; 360dialog coexistence and display-name docs; dualhook.com docs and pricing.

### Tertiary (LOW confidence)
- Business verification duration, token expiry semantics, `EAA` prefix, creation rate caps, payment-eligibility error, variable character restrictions (all in the Assumptions Log).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Nothing new to install; versions verified against the tag and Meta's versions page.
- Architecture: HIGH for Chatwoot behavior (source read); MEDIUM for Meta onboarding gates.
- Pitfalls: MEDIUM. Code-derived ones are HIGH; Meta policy ones depend on live attempts.
- Pricing: MEDIUM. Rate card via a BSP republication; Meta's dynamic rate card was not machine-readable; re-verify at launch.

**Research date:** 2026-09-29
**Valid until:** 2026-10-13 (14 days: Meta pricing and Chatwoot history-sync PRs move fast; pricing changes on 2026-10-01)
