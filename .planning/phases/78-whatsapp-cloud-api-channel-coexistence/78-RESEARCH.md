# Phase 78: WhatsApp Cloud API Channel (Dedicated Number) - Research

**Researched:** 2026-09-29 (first pass, Coexistence scope); **revised 2026-09-29** for the dedicated-number scope (CONTEXT revised the same day)
**Domain:** Meta WhatsApp Business Platform (Cloud API, new-number registration, message templates, pricing) + self-hosted Chatwoot CE v4.18.0 + config-as-code under `infra/chatwoot/` + a repo-wide public phone-number switch (Next.js / next-intl content JSON / JSON-LD / emails / llms text)
**Confidence:** MEDIUM-HIGH overall. HIGH on what Chatwoot v4.18.0 does (source read at the tag) and on the repo inventory (grep + files read this session). MEDIUM on Meta-side rules (display name, verification, limits), because Meta's help pages are JS-rendered and partly unreadable to tools; the owner's first live attempt settles them.

> Slug note: the directory still says `coexistence` for path stability. **The phase no longer uses Coexistence.** Coexistence-only material from the first pass is removed or listed under "Superseded".

<user_constraints>
## User Constraints (from CONTEXT.md, revised 2026-09-29)

### Locked Decisions

**Number & Meta onboarding (WA-01)**
- **D-01:** **Reuse the existing Meta Business Manager/portfolio** that already holds the Prestigo FB Page and ad account (act_965674215843049).
  - Create a **new, dedicated Meta app** for messaging (working name "Prestigo Messaging").
  - Do **not** add WhatsApp to the Marketing-API app "Prestigo v2" (2040893807310032).
  - The new app is reused for IG/FB in Phase 79.
  - **Reversibility:** costly. The inbox, webhook subscription and token are bound to this app.
- **D-02:** The messaging app must be in **Live mode**, because Meta delivers real-message webhooks only to live apps. A privacy-policy URL on rideprestigo.com is sufficient for Live. The owner performs the Meta UI steps from Claude's exact checklist.
- **D-03 (revised):** **New dedicated number, Cloud API only.**
  - The owner buys a **new Czech SIM or eSIM (+420, O2 / T-Mobile / Vodafone)**. It must receive SMS or voice calls for Meta's one-time verification code.
  - The number must **never be registered in any WhatsApp app**. If it was, delete that account first.
  - The owner sets a **6-digit two-step verification PIN** and stores it outside git in the password manager.
  - The same SIM is Prestigo's business line for ordinary phone calls. Only WhatsApp on it runs through the API.
  - **Onboarding path:** the researcher decides between two options by lowest risk and effort:
    - Chatwoot v4.18.0-ce **Embedded Signup** for a *new* number (not coexistence). This keeps Meta webhook signature verification via `WHATSAPP_APP_SECRET`. Verify whether it requires Tech Provider status.
    - Meta App Dashboard number registration plus the Chatwoot **manual flow** (phone number ID, WABA ID, System User token, verify token). This option **must** also enforce webhook signature verification, e.g. the app secret in the channel's provider_config. Research showed manual channels otherwise accept forged webhooks.
  - The owner supplies the actual number at execution time. **Planning and code must not invent or hard-code a placeholder number**; they read it from one constant or config (see D-22).
  - **Reversibility:** costly, not one-way. A misregistered new number can be deregistered and redone without customer impact, since nobody uses it yet.
- **D-04 (revised):** **Business verification is started in parallel but does not block launch** unless research shows Meta requires it for this path.
  - Unverified limits: about 250 business-initiated unique users per 24 h and max 2 numbers. These are sufficient for launch.
  - Verification uses the legal entity name and IČO exactly as on the site's legal pages.
  - It is likely needed for Phase 79 and to lift limits.
  - WA-01 no longer says "Meta Business verified".
- **D-05:** **Display name:** submit exactly **"Prestigo - Premium Chauffeur Service Prague"**. If Meta rejects it, **stop and ask the owner**; there is no auto-fallback. Brand spelling is Prestigo.
- **D-06 (revised):** **Go-live test.** Before the site switches, test from a second phone:
  - inbound arrives in Chatwoot;
  - a Chatwoot reply is delivered;
  - an image or document arrives in both directions;
  - an unsigned webhook POST is rejected.

  The site switch (D-21) happens only after all of these pass.

**Outbound templates (WA-02)**
- **D-07:** **Template set (8)**, all submitted for approval:
  1. booking change (time/vehicle)
  2. payment help
  3. review request
  4. trip reminder
  5. driver details: driver name/phone, car, plate, meeting point
  6. re-open conversation
  7. invoice ready
  8. payment received

  Categories: utility wherever Meta allows. Final categories are Claude's discretion within Meta rules.
- **D-08:** **All 7 site locales**: en, ru, es, fr, ar, hi, zh. That is about 56 submissions.
  - Real native-quality translations are done in-session. No stubs, no i18n GH workflow.
  - Brand-voice rules apply: plain words, no Uber comparisons.
  - **No prices or amounts.** The pre-commit currency guard covers the template source.
- **D-09:** **Templates are managed as code** under `infra/chatwoot/whatsapp-templates/`.
  - An idempotent Graph API script (WABA message_templates) submits, updates and reports status. It follows the `sync.mjs` / `lib/client.mjs` conventions: `--dry-run` first, redacted tokens, second run = no changes.
  - The script is run by Claude or the owner, never by the site at runtime.
  - The Meta token lives only in env/owner config.
- **D-10:** **Invoice template has a PDF document header**, attached at send time, if Chatwoot v4.18 can send it. Otherwise: text template first, then the PDF as a normal attachment once the reply opens the window. The planner surfaces the choice to the owner as a decision; no silent deviation.
- **D-11:** **Buttons:** quick-reply buttons to reopen the 24 h window, and URL buttons where they fit. Templates degrade to body-only if a button type is unsupported.
- **D-12:** **Sending is manual in this phase.** The operator picks the template in the Chatwoot composer.

**Operating rules**
- **D-13 (revised):** **Chatwoot is the only reply surface** for the business WhatsApp number, via the web or the Chatwoot mobile app, since the number is not in any phone app.
  - VPS-down procedure: customers can still call or SMS the SIM, and email works. Confirm Meta webhook redelivery after recovery, noting Meta's limited retry window.
  - Documented in the runbook.
- **D-14 (revised):** **No history import.** The new number starts empty. The personal number's history stays on the owner's phone.
- **D-15 (revised):** **Greeting/away for the new number is configured in Chatwoot** if wanted. Claude's discretion: probably none or a short business-hours note, reusing the Phase 77 widget copy. The personal number's transition auto-reply is separate (D-23).
- **D-16:** **24h window:** rely on Chatwoot's built-in window indicator and template enforcement. Add a delayed automation that labels conversations nearing expiry without an operator reply (`wa-window-closing`) if Chatwoot automation can express it; otherwise the indicator alone.
- **D-17:** Follow the Phase 77 conventions:
  - `ch-whatsapp` label plus a channel automation rule;
  - auto-assign to the owner; Bookings / B2B team routing as in Phase 77 D-20/D-21;
  - non-secret inbox settings in `infra/chatwoot/inboxes.json`, synced by `sync.mjs`.

**Cost & runbook (WA-03)**
- **D-18:** **Billing:** the owner adds the payment card in Business Manager. Claude never enters card data. **Currency EUR.**
  - **Reversibility:** one-way. WABA currency cannot be changed later, so it gets an owner confirmation checkpoint.
- **D-19:** **Cost control is lightweight.**
  - The runbook holds current per-message rates for CZ and the main customer countries, including the service-message pricing from 2026-10-01, and an estimated monthly spend.
  - The owner checks spend monthly. No alerting.
  - Pricing is re-verified at planning and launch time.
  - The pricing table lives outside `infra/chatwoot/`, because the currency gate blocks it there.
- **D-20:** **Runbook scope:**
  - channel recovery;
  - pricing and the monthly check;
  - **never delete a Chatwoot inbox without a fresh backup**;
  - VPS-down procedure;
  - token and app rotation;
  - number quality rating, messaging limits, rejected/paused templates;
  - the two-step PIN location and re-registration procedure;
  - SIM custody: keep the SIM active and topped up. Losing the SIM does not kill the API number, but re-verification needs it.
  - The channel inventory gains the WhatsApp row, and the off-site listings checklist from D-24 is included.

**Site number switch (WA-04)**
- **D-21:** **Replace the personal number on every public surface** with the new business number, for both WhatsApp and phone calls:
  - `wa.me` links: `lib/contact-channels.ts` `WHATSAPP_CHAT_URL`, `components/HeroWhatsApp.tsx`, `components/Footer.tsx`, `components/booking/steps/Step2DateTime.tsx`, `app/[locale]/contact/page.tsx`;
  - `tel:` links: Footer, contact page, privacy page;
  - JSON-LD `telephone`: `lib/jsonld.ts`, `app/[locale]/page.tsx`;
  - email footers in `lib/email.ts`;
  - `lib/llms-content.ts`;
  - `content/pages/{7 locales}/*.json`;
  - the `ContactForm` placeholder.

  Tests and snapshots are updated accordingly. The switch ships only after the D-06 go-live test passes.
- **D-22:** **Single source of truth for the number.** Introduce one exported constant set (e.g. E.164, display format, wa.me URL, tel: URL) in `lib/contact-channels.ts`, and make code surfaces import it instead of repeating literals. Locale content JSON may keep formatted literals if interpolation is impractical. Then a test asserts that no occurrence of `725986855` / `725 986 855` remains in `app/`, `components/`, `lib/`, `content/` or the public text files, and that all surfaces match the constant.
- **D-23:** **Transition period on the personal number, 1–3 months.**
  - The owner sets a WhatsApp Business app away/greeting message on the personal number, e.g. "Prestigo has a new number: +420 … — please write there". Claude drafts it in the main customer languages.
  - After the period, the owner converts it back to a plain personal WhatsApp.
  - Owner-performed and documented in the runbook with an end date.
- **D-24:** **Off-site listings checklist** for the owner in the runbook: Google Business Profile, directories/review sites, partner hotels, business cards and printed material, email signatures, Stripe/invoice templates in the owner's ops folder (`generate_invoice_*.py`), Telegram bot profile if it shows the number.

### Claude's Discretion
- Final template categories, variable layout and wording per language.
- Directory layout and script design for templates as code.
- Onboarding path per D-03 (Embedded Signup vs App Dashboard plus manual flow), chosen by lowest risk with signature verification enforced.
- Name/slug of the window-expiry label and rule.
- Whether to add a read-only spend/status script.
- Exact constant names in `lib/contact-channels.ts`, and whether locale JSON interpolates or keeps literals.

### Deferred Ideas (OUT OF SCOPE)
- Automatic booking-triggered WhatsApp sends: need the Phase 82 outbox plus opt-in.
- Spend alerting.
- WhatsApp Calling API on the business number.
- Coexistence on the personal number: rejected by owner decision on 2026-09-29.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WA-01 | WhatsApp messages to Prestigo's new dedicated business number (new Czech SIM, Cloud API only, never installed in a WhatsApp app) arrive in Chatwoot and can be answered from Chatwoot | Onboarding path decision: Meta App Dashboard number + Chatwoot manual flow + `app_secret` in `provider_config` (Q1, Pattern 1). Number rules (Q2). Verification/limits (Q3). Display name (Q4). Go-live matrix incl. unsigned/signed webhook probes (Pattern 5, Validation). |
| WA-02 | Operator can message a customer outside the 24-hour window using pre-approved WhatsApp templates (booking change, payment help, review request, trip reminder) | Chatwoot enforces the 24h window and sends approved templates (variables, URL buttons, public-URL media headers). Templates-as-code via Graph API on the new WABA (Pattern 2, Q7). Delayed-automation label (Pattern 3). |
| WA-03 | A documented runbook covers WhatsApp channel recovery, current per-message pricing and the rule that inboxes are never deleted without a fresh backup | Pricing (below, dated), recovery levers (`register_webhook`, `health`, token update field), inbox-delete teardown hazard, PIN/SIM custody, outage procedure with no phone-app fallback (Pitfalls, Pattern 6). |
| WA-04 | Every public contact surface (WhatsApp links, `tel:` links, JSON-LD `telephone`, email footers, `llms.txt`, page content in all 7 locales) shows the dedicated business number; the personal number is no longer published, and a transition auto-reply on the personal number points customers to the new one | Full inventory of 54 tracked files (Q5), single-source design in `lib/contact-channels.ts`, guard test, i18n manifest refresh, snapshot handling, transition auto-reply and return-to-personal (Q6). |
</phase_requirements>

## Summary

**Recommended onboarding path: Meta App Dashboard "API Setup" number registration + Chatwoot's manual flow (`manual_setup_v2`), with the app secret written into the channel's `provider_config` so Chatwoot enforces `X-Hub-Signature-256`.** It has the fewest Meta-side unknowns: no Embedded Signup configuration, no Facebook Login for Business setup, no `WHATSAPP_*` Super Admin settings, no Tech Provider question, and a non-expiring System User token (Chatwoot's own guide tells the owner to set expiration to "Never"). The one gap is that a manual channel does **not** verify webhook signatures by default. Read at tag v4.18.0: `meta_signature_verification_required?` returns true only when the channel carries an app secret in `provider_config` (`app_secret`, `app_secret_key`, `client_secret` or `api_secret`) or the channel is `embedded_signup`. Setting `provider_config.app_secret` closes the gap. It is a single admin API PATCH (or a `rails runner` line) that the owner or Claude runs once. The unsigned-webhook probe in D-06 proves it.

**Embedded Signup for a fresh number works in Chatwoot code** (non-coexistence branch registers the number with a PIN Chatwoot generates and stores in its own database). Whether Meta demands Tech Provider status for a business onboarding its own number is **not stated** on the Meta pages that could be read. Meta's access-levels page says Standard Access is automatic and applies to app users with a role on the app, so an owner-run own-business flow probably works. It adds a Facebook Login for Business configuration, allowed-domain settings, three Super Admin values, and an unknown token lifetime. The first pass found one community report that the flow only worked for a Tech Provider. Do not spend the phase on it. Keep it as a documented fallback only.

**Business verification is not required to launch on this path.** Standard Access needs no App Review. Unverified portfolios have a 250 unique-users-per-24h limit for messages sent outside a customer-service window, a 2-number cap, and the display name is not shown to customers (they see the number). User-initiated conversations are not limited. Verification stays a parallel owner track (D-04) because it lifts those limits and Advanced Access (probably needed for Phase 79) requires it. WA-04 is now the largest code change in the phase: **54 tracked files** contain the personal number (12 code/data files including `i18n/glossary.json`, 34 locale content files holding 41 occurrences, 4 golden snapshots plus 4 test files). Recommended design: a behavior-preserving refactor first (one constant set derived from one E.164 value, currently the existing number), and a one-line value flip plus scripted literal replacement in content JSON at switch time, after the D-06 go-live test. Content JSON keeps literals (a `{phone}` token would need interpolation in every FAQ renderer and every JSON-LD builder). The i18n translation manifest must be refreshed for the touched units, or a future pipeline run would treat them as stale.

**New operating risk with no fallback:** the number is in no phone app, so Chatwoot is the only place to see WhatsApp messages. A missed push or a VPS outage means a customer sees "delivered" while nobody reads it. The plan needs an explicit UAT for Chatwoot mobile push, an outage procedure, and a decision on which device answers the SIM's voice calls (the site publishes it as the business line).

**Primary recommendation:** Manual flow + `app_secret` in `provider_config` + owner registers the number with their own PIN before Chatwoot connects (so Chatwoot does not auto-register with a random PIN). Templates as code on the new WABA (unchanged design). WA-04 as three steps: constants refactor (no number change), owner go-live test, then the value flip with content replace, manifest freeze, snapshot update and the unconditional no-old-number guard test.

## Superseded (first-pass Coexistence material)

| First-pass item | Status |
|-----------------|--------|
| Chatwoot Embedded Signup coexistence flow, `smb_message_echoes` handling, `is_on_biz_app`, "Coexistence" badge | Not used. Echo code is dormant for a non-coexistence number. |
| Tech Provider gate for coexistence (Pitfall 1), Meta Verified before COEX display-name review (A12), coexistence upkeep rules (13/14-day rule), history-sharing choice, echoes counting as human replies, app greeting/away echoing into Chatwoot | Removed. None applies to an API-only number. |
| Cutover pattern with phone-app backup and Disconnect Account rollback | Replaced by Pattern 5 (registration, go-live matrix, switch, rollback = do not switch the site / deregister the unused number). |
| WhatsApp Business app 2.24.17+ prerequisite | Removed. |
| Phase 79 note "app secret via embedded source" | Replaced by `provider_config.app_secret`. |
| D-14 history import research (PRs #12149 / #15713 open) | Moot: D-14 is now "no history import". |

**Still valid and kept below:** Chatwoot v4.18 template sending, buttons and document-header limits; delayed automation and its feature flag; inbox-deletion side effects; Graph API v25 template script design; pricing; webhook signature pitfall (now with exact field names); runbook placement outside `infra/chatwoot/`; the pre-commit Meta token pattern.

## Research Answers (revised question set)

| # | Question | Answer | Confidence |
|---|----------|--------|------------|
| 1a | Does Chatwoot Embedded Signup support a fresh number (standard flow, /register + PIN)? | **Yes in code.** Non-coexistence path calls `/register` unless the number is already connected/verified, using a random 6-digit PIN Chatwoot stores in `provider_config['verification_pin']`. Self-hosted shows the option when `WHATSAPP_APP_ID` etc. are set (UI hides it only on Chatwoot Cloud without the flag). | HIGH (source) |
| 1b | Does Meta require Tech Provider / Solution Partner for Embedded Signup when a business onboards its own number via its own app? | **Not stated** on the readable Meta pages. Meta says advanced access is needed to onboard *business customers*; Standard Access is automatic for users with a role on the app. First-pass finding: one community user needed Tech Provider status (coexistence case). Cannot settle without a live attempt. **Avoid the question by using the manual flow.** | MEDIUM-LOW |
| 1c | Manual flow (`manual_setup_v2`): exact steps | App Dashboard > WhatsApp > API Setup > From selector > Add phone number > business profile > OTP by SMS or voice > copy Phone Number ID + WABA ID; Business Settings > System users > admin system user > assign app + WABA with full control > generate token, expiration **Never**, permissions `whatsapp_business_management` + `whatsapp_business_messaging`; paste in Chatwoot Add Inbox > WhatsApp > manual. | HIGH (Chatwoot's own UI strings) |
| 1d | How does manual flow enforce X-Hub-Signature-256? | `provider_config` key `app_secret` (also accepted: `app_secret_key`, `client_secret`, `api_secret`). Present -> `meta_signature_verification_required?` true -> HMAC-SHA256 over the raw body compared with `secure_compare`, against the channel secret(s) plus global `WHATSAPP_APP_SECRET`. Absent (and source not `embedded_signup`) -> **no verification**. Settable by admin `PATCH /api/v1/accounts/:id/inboxes/:inbox_id` with `channel.provider_config` (full merged hash), not by any dedicated UI field; the inbox-settings "Update API key" field spreads the existing `provider_config`, so `app_secret` survives token rotation. Fallback: `rails runner`. | HIGH (source) |
| 1e | Recommended path | Manual flow + `app_secret`; owner registers with own PIN first; verify with unsigned (401), badly signed (401) and correctly signed (200) probes. | HIGH |
| 2 | Number requirements | Owned by you, has country + area code, can receive SMS or voice; must not be active on WhatsApp (delete first); SMS or VOICE code; 6-digit two-step PIN mandatory; PIN needed to change PIN or delete the number; lost PIN can be reset through the API. Czech prepaid SIMs expire (see Q2 detail). | HIGH (Meta) / MEDIUM (CZ operator terms) |
| 3 | Business verification for this path | **Not required to launch.** Limits: 250 unique users / rolling 24 h outside a service window, 2 numbers, display name hidden from customers. Verification lifts to 2,000 and 20 numbers; Advanced Access (Phase 79) requires it. | MEDIUM-HIGH |
| 4 | Display name approval likelihood | The exact D-05 string has a real rejection risk (descriptor words, hyphen, casing differs from the site's "PRESTIGO"). Not a launch blocker. | MEDIUM-LOW |
| 5 | Site switch inventory and design | 54 tracked files (table below). Single source in `lib/contact-channels.ts`, literals kept in locale JSON, guard test, i18n manifest freeze, 4 snapshots updated. | HIGH |
| 6 | Transition auto-reply and return to personal | Business app greeting/away with "always send"; greeting is limited (about 140 chars, secondary source) and once per 14 days; away message sends each time. Return to plain WhatsApp via backup/restore on the same number. | MEDIUM |
| 7 | New number: WABA, templates, limits | New WABA in the existing portfolio (templates are per WABA, so all 56 are submitted again); pricing unchanged; unverified tier 250/24h is far above Prestigo volume. | MEDIUM |
| 8 | Validation for revised scope | See Validation Architecture. | HIGH |
| kept | Templates (media header only from public URL; quick reply, URL buttons), 24h window, delayed automation, Graph API v25 design, webhook reachability via Caddy, pricing, inbox deletion cascade | Unchanged from first pass; see sections below. | HIGH / MEDIUM |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Receiving/sending WhatsApp messages | Meta Cloud API (external) | Chatwoot on VPS (webhook receiver + sender) | Number is API-only; Chatwoot is the sole client. The site (Vercel) never touches Meta or Chatwoot (isolation guard). |
| Number registration and PIN | Meta App Dashboard + Graph API (owner-run) | Password manager (PIN) | One-time owner step; PIN never in git. |
| Webhook authenticity | Chatwoot (`MetaTokenVerifyConcern`) | Meta app secret in `provider_config` | Signature check only active when the channel holds the secret. |
| Template definition and submission | Repo (`infra/chatwoot/whatsapp-templates/`) + owner-run script | Meta Graph API | Git is source of truth; script runs from the owner's Mac only. |
| Template selection and sending | Chatwoot composer / new-conversation dialog (operator) | Meta | Manual in this phase (D-12). |
| 24h window enforcement | Chatwoot (`Conversations::MessageWindowService`) | Meta | Built in. |
| Window-closing label | Chatwoot delayed automation (config via `sync.mjs`) | — | Config-as-code. |
| Public phone number (site surfaces) | API/Backend + SSR pages (Next.js on Vercel) | Content JSON files | Code imports one constant; locale JSON keeps literals kept in sync by a guard test. |
| Structured data / llms text | SSR (`lib/jsonld.ts`, `lib/llms-content.ts`, `app/llms*.txt/route.ts`) | CDN cache (ISR, hourly) | Generated at request/revalidate time from the constant. |
| Transition auto-reply | Owner's phone (WhatsApp Business app on the personal number) | — | Not repo work; owner checklist + runbook date. |
| Voice calls to the business line | Mobile operator SIM in an owner-controlled device | Operator call forwarding | SIM voice is unaffected by API registration [ASSUMED]; someone must answer it. |
| Billing/currency | Meta WhatsApp Manager (owner) | — | Owner enters card; EUR fixed on first payment method. |
| Recovery/pricing knowledge | Runbook in `infra/vps/runbooks/` | `inspect.mjs` read-only checks | Outside `infra/chatwoot/` so the currency gate does not reject it. |

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Chatwoot CE | `v4.18.0-ce` (pinned in `infra/vps/chatwoot/compose.yml`) | WhatsApp inbox, templates picker, 24h window | Latest release 2026-09-18 [VERIFIED: `gh release list --repo chatwoot/chatwoot`, first pass]; manual flow and signature concern read at the tag this session. |
| Meta Graph API | `v25.0` for the template script | `message_templates` create/list/edit, owner-run `/register`, `/verify_code` | v25.0 released 2026-02-18, expires 2028-07-29; v26.0 exists (2026-07-29) but is young [CITED: developers.facebook.com/docs/graph-api/changelog/versions/]. Meta's own `request_code`/`register` example uses v25.0 [CITED: developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers]. |
| Node built-ins (`fetch`, `AbortSignal.timeout`, `node:fs`, `node:crypto`) | Node 24.14.1 on the owner Mac | Template script, signed-webhook probe, read-only checks | Same as `infra/chatwoot/lib/client.mjs`; zero dependencies. |
| Vitest | `^4.1.1` (package.json) | Templates, Graph client, sync extension, WA-04 guard | Existing suite pattern. |
| `lib/contact-channels.ts` | existing | Single source of truth for the public number (D-22) | Already the home of `WHATSAPP_CHAT_URL`; test-enforced to read no env and name no VPS host. |
| `scripts/i18n-freeze-manifest.mjs` | existing | Refresh `enHash` of touched content units so a future translate run does not treat them as stale | Existing tool, `--dir` and `--verify` flags. |

### Supporting
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `.husky/pre-commit` + `scripts/qa/chatwoot_price_gate.mjs` | Currency gate on `infra/chatwoot/**` | Covers `infra/chatwoot/whatsapp-templates/*.json` automatically. |
| `infra/vps/env/*.env.example` | Names of secrets feed the pre-commit `KEY=value` block list | Add `whatsapp-meta.env.example` (Pattern 4). |
| `scripts/qa/secret_gate_probe.sh` | Proves the hook blocks secrets | Add probes for new names and a Meta token shape. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual flow + `app_secret` | Chatwoot Embedded Signup (fresh number) | Works in code, but adds Facebook Login for Business configuration, allowed domains, three Super Admin values, unknown token lifetime and an unresolved Tech Provider question. Fallback only. |
| NAMED template parameters | POSITIONAL `{{1}}` | Named is readable in the composer; backend supports both. Confirm at first UI smoke test. |
| Tech Partner (Dualhook etc.) | — | Not needed for a dedicated own number; breaks the "no middleman" principle. Not researched again. |

**Installation:** none. No npm/pip/cargo packages are installed by this phase; `npm view` checks are not applicable.

**Version verification:** Chatwoot `v4.18.0` [VERIFIED: first pass, `gh api repos/chatwoot/chatwoot/git/ref/tags/v4.18.0`; live `https://chat.rideprestigo.com/api` reported 4.18.0]. Graph versions [CITED: Meta versions page].

## Package Legitimacy Audit

No external packages are installed by this phase (Node built-ins and existing repo tooling only). Audit table not applicable.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
  customer's WhatsApp ---> new business number (WABA in the Prestigo portfolio, Live-mode "Prestigo Messaging" app)
        ^  |                       (number lives ONLY in Meta Cloud API, no phone app)
        |  | inbound: Meta webhook POST + X-Hub-Signature-256 (signed with the app secret)
        |  v
        |  https://chat.rideprestigo.com/webhooks/whatsapp/+<digits>     (Caddy -> chatwoot-rails:3000, no allowlist)
        |  |
        |  v
        |  Webhooks::WhatsappController
        |     verify_meta_signature!  -- provider_config.app_secret present? --no--> NO CHECK (default for manual: forged POST accepted)
        |                                                                  --yes-> HMAC compare -> 401 if bad
        |  v  Sidekiq Webhooks::WhatsappEventsJob (dedup by source_id)
        |  incoming message -> conversation -> automation (ch-whatsapp label, team, owner assign,
        |                                        delayed rule: no human reply after N min -> wa-window-closing)
        |  v
        |  Operator (Chatwoot web / mobile app)  <--- the ONLY reply surface (D-13)
        |     in window -> free-form reply ; window closed -> template picker (synced from Meta every 3 h / manual)
        |  v
        +--- Graph API send (template / text / attachment) <--- Chatwoot, token = non-expiring System User token

  One-time owner steps (never the site):
    Meta App Dashboard: add number -> OTP (SMS/voice) -> display name review
    owner /register with own 6-digit PIN  ->  Chatwoot manual connect (phone ID, WABA ID, token)
    admin PATCH provider_config.app_secret  ->  signed/unsigned probes  ->  D-06 matrix from a second phone
    infra/chatwoot/whatsapp-templates/*.json --node script (--dry-run first)--> Graph POST/GET /{WABA}/message_templates

  Site (Vercel, separate from all of the above):
    lib/contact-channels.ts (ONE E.164 value)
       -> tel:/wa.me links, JSON-LD telephone, email footers, llms.txt/llms-full.txt (ISR 1 h), ContactForm placeholder
    content/pages/{7 locales}/*.json  (literals, guard-tested against the constant)
    Switch happens ONLY after the D-06 matrix passes:   [refactor (no number change)] -> [owner go-live test] -> [value flip + content replace + manifest freeze + snapshots + no-old-number test]

  Personal number (owner's phone, WhatsApp Business app): away message "always send" pointing to the new number for 1-3 months, then back to plain WhatsApp.
```

### Recommended Project Structure
```
lib/contact-channels.ts                       # EDIT: one E.164 source; derived display/hyphen/tel/wa.me constants + whatsappUrl(text) helper
tests/business-number-guard.test.ts           # NEW: consistency (always) + no-personal-number (added by the switch plan)
tests/telegram-bot-profile.test.ts            # EDIT: WHATSAPP_CHAT_URL assertions reference the constant, not a literal
infra/chatwoot/
├── whatsapp-templates/                       # NEW: 8 JSON files x 7 locales; price-free
├── whatsapp-templates.mjs                    # NEW: CLI (--dry-run, --status, --only <key>, --allow-edit)
├── whatsapp-webhook-probe.mjs                # NEW (optional): signed/unsigned POST probe, owner-run, secret from env
├── lib/graph.mjs                             # NEW: Graph client mirroring lib/client.mjs (fetchImpl injection, redaction, timeout, redirect:'error')
├── inboxes.json                              # EDIT: add WhatsApp entry under "managed"
├── labels.json                               # EDIT: ch-whatsapp, wa-window-closing
├── automation-rules.json                     # EDIT: channelRules entry + windowRules
├── sync.mjs                                  # EDIT: execution_delay support; ensureOwnerInboxMember for managed inboxes
└── inspect.mjs                               # EDIT: --whatsapp read-only health/templates/signature-configured view
infra/vps/env/whatsapp-meta.env.example       # NEW: names only, values empty
infra/vps/runbooks/whatsapp.md                # NEW (outside infra/chatwoot so pricing may name EUR; no personal number digits)
infra/vps/runbooks/chatwoot-channels.md       # EDIT: WhatsApp row; remove "WhatsApp is not a Chatwoot inbox yet"
.planning/phases/78-.../freeze/*.freeze       # NEW: manifest freeze patterns for the touched content units
```

### Pattern 1: Onboarding = App Dashboard number + Chatwoot manual flow + `app_secret` (RECOMMENDED)

**Owner sequence (exact order matters):**
1. Meta app "Prestigo Messaging" in the existing portfolio, WhatsApp use case, Live mode with privacy policy `https://rideprestigo.com/privacy` (site pages `/privacy`, `/terms`, `/data-deletion` returned 200 in the first pass). In API Setup, make sure a real WhatsApp Business Account belongs to the Prestigo portfolio; the auto-created test WABA and test number are ignored [ASSUMED, A1].
2. Optional but recommended before adding the number: business profile complete; business verification started (D-04).
3. API Setup > Send and receive messages > From > **Add phone number**: enter the D-05 display name, verify with the OTP by SMS (VOICE if SMS does not arrive). Meta accepts a display name change any number of times *before registration*; after registration there is a 30-day wait between change requests [CITED: docs.360dialog.com/docs/resources/phone-numbers/display-names, BSP, MEDIUM]. So let the name review settle before `/register` where Meta's UI allows it, and read `name_status` (`AVAILABLE_WITHOUT_REVIEW`, `PENDING_REVIEW`, `APPROVED`, `DECLINED`, `NONE`, `EXPIRED`) [CITED: Meta phone-numbers page].
4. **Owner registers the number with the owner's own PIN before connecting Chatwoot:** `POST /{PHONE_NUMBER_ID}/register` with `messaging_product: whatsapp` and `pin` (6 digits; Meta limits registration calls to 10 per number per 72 h) [CITED: Meta registration page]. Why: Chatwoot's manual connect calls `/register` itself with a **random** PIN when the number is not yet connected or reports `platform_type`/`throughput_level` `NOT_APPLICABLE`, and stores that PIN in `provider_config['verification_pin']` (source below). That would make the number's PIN something the owner never chose and leave it inside Chatwoot's database. After the owner's `/register`, Meta reports the number as connected and Chatwoot skips registration. Check `GET /{PHONE_NUMBER_ID}?fields=status,code_verification_status,platform_type,name_status,quality_rating` before step 6. Whether the dashboard's add-number step already leaves the number registered is unverified [ASSUMED, A16]; run the read first and only `/register` if not connected.
5. Business Settings > Users > System users: create an admin system user, assign the app and the WABA with full control, generate a token with expiration **Never** and the two permissions. Store as `META_SYSTEM_USER_TOKEN` in `~/.config/prestigo/meta-whatsapp.env` (mode 600) and password manager. The owner types it into Chatwoot; it never goes into chat or git.
6. Chatwoot > Settings > Inboxes > Add Inbox > WhatsApp > WhatsApp Cloud / manual setup: enter WABA ID, Phone Number ID and the token. Validation steps run in Chatwoot (`ManualSetupValidationService`): the phone must belong to the WABA, status `CONNECTED` or `code_verification_status` `VERIFIED`, the token must read templates and hold `whatsapp_business_messaging`, and the number must not already be an inbox. Name the inbox `WhatsApp` if the connect form has a name field. Otherwise Chatwoot names it `"<verified name or number> WhatsApp"` and `sync.mjs` resolves it by `channel_type` (the Telegram precedent) or the owner renames it in the UI.
7. **Enforce signatures (the security step):** set `app_secret` in the channel's `provider_config` (Code Examples). Owner copies the App secret from App settings > Basic into `META_APP_SECRET` in the same 600 env file. Then run the three-probe check (unsigned 401, wrong signature 401, correct signature 200).
8. Webhook: Chatwoot's setup subscribes the app to the WABA (`messages`, `smb_message_echoes` are subscribed by default; harmless) and sets a **phone-number-level callback override** to `https://chat.rideprestigo.com/webhooks/whatsapp/+<digits>` with the channel's verify token, so no app-level callback is needed. If the first inbound never arrives, set the app-level WhatsApp webhook to the same URL and verify token, subscribe `messages`, and use inbox Settings > Configuration to read the verify token [MEDIUM; the community thread in the first pass reported "Inbox is disconnected" fixed by an app-level callback].

**Evidence (all read at tag v4.18.0, `chatwoot/chatwoot`):**
```ruby
# app/controllers/concerns/meta_token_verify_concern.rb (lines 5-7)
CHANNEL_APP_SECRET_KEYS = %w[app_secret app_secret_key client_secret api_secret].freeze
META_SIGNATURE_HEADER = 'X-Hub-Signature-256'.freeze
META_SIGNATURE_PREFIX = 'sha256='.freeze

# app/controllers/webhooks/whatsapp_controller.rb
def meta_signature_verification_required?
  return true if whatsapp_channel.blank?
  return false unless whatsapp_channel.provider == 'whatsapp_cloud'
  return true if channel_meta_app_secrets(whatsapp_channel).present?

  whatsapp_channel.provider_config['source'] == 'embedded_signup'
end

# app/services/whatsapp/manual_setup_service.rb  (what a manual channel is created with)
provider_config: { api_key: @access_token, phone_number_id: preview[:phone_number_id],
                   business_account_id: preview[:waba_id], source: 'manual_setup_v2' }
```
[VERIFIED: chatwoot@v4.18.0 the three files above]

```ruby
# app/services/whatsapp/webhook_setup_service.rb  (manual connect passes no coexistence flag)
def should_register_phone_number?
  return false if @is_coexistence
  return false if @is_coexistence.nil? && health_data[:is_on_biz_app]
  !phone_number_verified? || phone_number_needs_registration?
end
def fetch_or_create_pin
  existing_pin = @channel.provider_config['verification_pin']
  return existing_pin.to_i if existing_pin.present?
  SecureRandom.random_number(900_000) + 100_000
end
```
[VERIFIED: chatwoot@v4.18.0 app/services/whatsapp/webhook_setup_service.rb] The `phone_number_verified?` comment in the same file: "A connected number is already registered even if its one-time code verification has expired." (this is why an expired OTP does not disconnect a registered number).

**Why not Embedded Signup:** see Research Answers 1a/1b. Its extra moving parts (Facebook Login for Business configuration with the JavaScript SDK toggle and `https://chat.rideprestigo.com` in allowed domains and redirect URIs, Super Admin `WHATSAPP_APP_ID`, `WHATSAPP_CONFIGURATION_ID`, `WHATSAPP_APP_SECRET`, and Meta's "60 Expiration Token" configuration template name) add risk without adding security, because the manual channel with `app_secret` gets the same signature check. Chatwoot's own UI text points a business "onboarding your own number" to the manual flow: "if you're a tech provider onboarding your own number, please use the manual setup flow" [VERIFIED: chatwoot@v4.18.0 dashboard `en/inboxMgmt.json`, key `MANUAL_FALLBACK`].

**Token rotation:** inbox Settings > Configuration has an "Update API key" field; it sends `provider_config: {...existing, api_key: <new>}`, so `app_secret` and the rest survive [VERIFIED: chatwoot@v4.18.0 `settingsPage/ConfigurationPage.vue` `updateWhatsAppInboxAPIKey`, spread of `this.inbox.provider_config`].

### Pattern 2: Templates as code (Graph API) - unchanged from first pass, now on the NEW WABA
**What:** One JSON per template key; script lists existing templates, computes the plan, creates missing ones, reports drift, never auto-edits approved templates. The new dedicated WABA starts with zero templates, so the first real run creates all 56 (8 x 7).
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
- Limits: body 1,024; header text 60; footer 60; button text 25; quick-reply max 10, URL max 2; quick replies grouped together; a URL variable only at the end of the URL; variables need example values [CITED: Meta components page].
- Idempotence: `GET /{WABA}/message_templates?fields=id,name,language,status,category,components,rejected_reason&limit=100` with paging; key by `name|language`; create only when absent; compare a **normalized subset** (text, format, button text/url) because Meta adds fields and may re-categorize; reuse `subsetEqual` semantics from `sync.mjs`.
- Approved template that differs: report `drift`, exit non-zero unless `--allow-edit`; edits via `POST /{TEMPLATE_ID}`, limited to 1 per 24 h and 10 per 30 days; category not editable [CITED: Meta template-management].
- Deleting a template blocks its name for 30 days [CITED]: the script must **never delete**.
- Output contract mirrors `sync.mjs`: one line per template-language (`create|unchanged|drift|edit|skipped`), a summary, a status table (`APPROVED|PENDING|REJECTED|PAUSED|DISABLED|IN_APPEAL`), exit 0 ok / 1 config or validation / 2 API error. A second run right after a real run prints `create=0`.
- Token custody: `META_SYSTEM_USER_TOKEN`, `META_WABA_ID` (optional `META_GRAPH_VERSION`) from env or `~/.config/prestigo/meta-whatsapp.env` (mode 600); never a CLI argument; redact the token and `Authorization` echoes; `redirect: 'error'`; 30 s timeout.
- Quota: 56 submissions is far below the 250-templates-per-WABA cap for an unverified portfolio (6,000 if verified) [CITED]. Small delay between POSTs; stop on the first rate-limit style error [ASSUMED, A5].
- **New-WABA note:** the token that manages templates is the same System User token Chatwoot uses, so a second token is optional. Keep `META_WABA_ID` from the API Setup page (the same WABA ID typed into Chatwoot).

### Pattern 3: Extend the existing sync with the WhatsApp inbox and window rules - unchanged
**Inbox (owner creates it via the manual flow; sync only patches non-secret settings):**
```json
{ "name": "WhatsApp", "channel_type": "Channel::Whatsapp",
  "settings": { "enable_auto_assignment": false, "greeting_enabled": false, "csat_survey_enabled": false, "working_hours_enabled": false } }
```
`buildInboxRefs` resolves a managed entry by `channel_type` when exactly one inbox of that type and one managed entry of that type exist (the Telegram precedent), so `"@inbox:WhatsApp"` in rules resolves regardless of the inbox's display name. Keep CSAT off: on WhatsApp Chatwoot creates a CSAT template automatically.
**Greeting (D-15 revised):** `greeting_enabled: false` is the default recommendation. If the owner wants a short away note, it is set in Chatwoot (inbox greeting / working hours) with Phase 77 widget copy; that is Claude's discretion and can stay off for launch.
**Channel rule:** add to `channelRules` `{ "name": "channel: whatsapp", "inbox": "WhatsApp", "label": "ch-whatsapp", "team": "Bookings" }` and to `labels.json` a `ch-whatsapp` label (colour `#0F1D2C` like the other `ch-*` labels).
**Owner membership gap:** the manual connect creates the inbox without inbox members. `syncInboxes` currently calls `ensureOwnerInboxMember` only for the Website inbox. Extend the managed-inbox loop to call it too (or list "add yourself as an agent" as an owner step). `assign_agent @owner` needs the owner as a member.
**Window label (D-16):** two rules (Code Examples) with `execution_delay`; requires the account feature `delayed_automations` (default `enabled: false`). `sync.mjs` has the `optional` mechanism that skips a rule on a 4xx; use it so the run does not fail before the flag is on.
**Do not leak `provider_config`:** the inbox API returns `provider_config` (including `api_key` and now `app_secret`) to administrators [VERIFIED: chatwoot@v4.18.0 `app/views/api/v1/models/_inbox.json.jbuilder`: `json.provider_config resource.channel.try(:provider_config) if Current.account_user&.administrator?`]. `sync.mjs` and `inspect.mjs` already receive that payload with an admin token. A unit test must prove neither tool ever prints `provider_config` values; `inspect --whatsapp` prints only booleans (for example `signature_secret_configured`) derived from key presence.

### Pattern 4: Secrets and custody
- Add `infra/vps/env/whatsapp-meta.env.example` listing `META_SYSTEM_USER_TOKEN=`, `META_APP_SECRET=`, `META_WABA_ID=`, `META_GRAPH_VERSION=` with empty values and custody notes. `.husky/pre-commit` derives its `KEY=value` block list from `infra/vps/env/*.env.example` names containing PASSWORD/SECRET/_KEY/TOKEN (`INFRA_SECRET_KEY_NAMES=$(grep -hoE '^[A-Z_][A-Z0-9_]*=' infra/vps/env/*.env.example ...)`), so the new names are protected automatically. **The PIN is not covered** (name would not match). Rule: the PIN is never written to any file in the repo or env example; it lives only in the password manager. Do not add `..._PIN=` to the example.
- `SECRET_RE` in the hook has no Meta token shape. Meta tokens commonly start with `EAA` [ASSUMED, A4]; add `EAA[A-Za-z0-9]{40,}` and a probe in `secret_gate_probe.sh`. A Meta app secret is 32 hex characters with no distinctive prefix, so only the name-based gate catches it. This is security work: commit with the `security:` prefix (CLAUDE.md).
- Chatwoot stores the channel token and `app_secret` inside `provider_config` (jsonb, not encrypted at the column level; only `business_management_token` is encrypted) in its Postgres, which is inside the encrypted nightly backup (Phase 76). Treat backups as secret-bearing.

### Pattern 5: Go-live and switch sequence (WA-01 acceptance, D-06, D-21)
1. Pre-flight (read-only): `GET /api` shows 4.18.0; the SIM is in a device that receives SMS/voice; the number is not on any WhatsApp app (see Pitfall 3).
2. Owner steps 1-8 from Pattern 1. Add the payment card (EUR) in WhatsApp Manager before the first template send (D-18 checkpoint, one-way).
3. Verify without messages: `GET /inboxes/:id/health` (via `inspect --whatsapp`) shows `status` CONNECTED and `messaging_limit_tier` (expect the 250 tier), `name_status`, `quality_rating`; `provider_config` carries `app_secret` (boolean).
4. Signature probes (Code Examples): unsigned 401; wrong signature 401; correct signature 200 with a payload that contains **no message** (metadata only), so nothing lands in the inbox.
5. D-06 matrix from a second phone. The owner's personal phone (old number) is a convenient second phone; delete the resulting test conversation and contact afterwards. Cases: inbound text arrives in Chatwoot; a Chatwoot reply is delivered; an image and a PDF document arrive in Chatwoot and are delivered back; unsigned POST rejected. Also test one **template send to a number that never wrote in** (outside window, works immediately, so no 24 h wait): New Conversation dialog with a WhatsApp template (`WhatsappTemplate.vue` exists in `components-next/NewConversation`). Also test Chatwoot mobile app push (see Pitfall 8).
6. Only then run the WA-04 switch plan (Pattern 6). The owner sets the away message on the personal number the same day (Q6).
7. Rollback: before the switch ships, "rollback" is not switching (nothing public changed). After: revert the constant flip commit (the refactor keeps this to one value plus the content literals) and restore the away message; the API number stays connected. Deregistering an unused number is possible (`POST /{PHONE_NUMBER_ID}/deregister`) but numbers cannot be deleted from the portfolio if they sent paid messages within 30 days [CITED: Meta phone-numbers page].

### Pattern 6: Single source of truth for the public number (WA-04, D-22)

**Constraints found:**
- `lib/contact-channels.ts` must stay plain constants: a test asserts it reads no env and names no VPS host [VERIFIED: tests/telegram-bot-profile.test.ts lines 197-203, `expect(src).not.toMatch(/process\.env/)` and `expect(src).not.toMatch(/chat\.rideprestigo\.com/)`].
- Content JSON is plain JSON read with `fs`, never through next-intl; the repo already has a `{token}` substitution helper `interpolate()` in `lib/content-interpolate.ts` used for `{ePrice}`-style tokens [VERIFIED: lib/content-interpolate.ts, regex `/\{(\w+)\}/g`]. Using it for the phone would mean touching every renderer of `faq`, `book`, `routes`, `services` and `privacy` strings plus every JSON-LD FAQPage builder that reads those strings. A missed site leaks a raw `{phone}`. **Recommendation: keep literals in locale JSON** (D-22 allows it) and guard them with a test.
- `messages/*.json` (next-intl) contain **no** occurrence of the number (grep), so no ICU/translation catalog work.
- `public/` has no text file containing the number; `llms.txt` and `llms-full.txt` are generated by `app/llms.txt/route.ts` (ISR `revalidate = 3600`) from `lib/llms-content.ts`, so they follow the constant automatically after deploy. `middleware.ts` matcher needs no change (no new static extension). `app/sitemap.ts` does not carry the number.

**Design (names are discretionary; values derived, never separately typed):**
```ts
// lib/contact-channels.ts (plain constants only: no env reads, no infrastructure hosts)
// WA-04 switch task changes ONLY this value, to the number the owner supplies. Current value = existing number.
const BUSINESS_PHONE_E164_VALUE = '+420725986855'

export const BUSINESS_PHONE_E164 = BUSINESS_PHONE_E164_VALUE                                  // JSON-LD, tel:
export const BUSINESS_PHONE_DIGITS = BUSINESS_PHONE_E164_VALUE.slice(1)                       // wa.me path
export const BUSINESS_PHONE_DISPLAY = `${BUSINESS_PHONE_E164_VALUE.slice(0, 4)} ${BUSINESS_PHONE_E164_VALUE.slice(4, 7)} ${BUSINESS_PHONE_E164_VALUE.slice(7, 10)} ${BUSINESS_PHONE_E164_VALUE.slice(10)}` // '+420 xxx xxx xxx'
export const BUSINESS_PHONE_SCHEMA_HYPHEN = BUSINESS_PHONE_DISPLAY.replace(/ /g, '-')         // contactPoint format used today
export const BUSINESS_TEL_URL = `tel:${BUSINESS_PHONE_E164_VALUE}`
export const WHATSAPP_CHAT_URL = `https://wa.me/${BUSINESS_PHONE_DIGITS}`
export const whatsappUrlWithText = (text: string) => `${WHATSAPP_CHAT_URL}?text=${encodeURIComponent(text)}`
```
`encodeURIComponent('Hello PRESTIGO, I would like to book a transfer.')` yields exactly the `Hello%20PRESTIGO%2C%20I%20would%20like%20to%20book%20a%20transfer.` string used today, so snapshots stay byte-identical during the refactor. Czech numbers are always +420 followed by nine digits grouped 3-3-3, so the derived display format is safe. The first commit (refactor) must leave every snapshot and test unchanged; that is its acceptance test.

**Inventory (git grep -lE "725[ -]?986[ -]?855|420725986855" excluding .planning; 54 tracked files):**

| Class | Files | Occurrences | Treatment |
|-------|-------|-------------|-----------|
| Code constant | `lib/contact-channels.ts:10` `export const WHATSAPP_CHAT_URL = 'https://wa.me/420725986855'` | 1 | Becomes the source (design above). |
| JSX literal / links | `app/[locale]/contact/page.tsx:50` `const WHATSAPP_NUMBER = '420725986855'`, `:101` wa.me template, `:127-128` `tel:+420725986855` + display; `app/[locale]/privacy/page.tsx:108` `tel:+420725986855`; `components/Footer.tsx:126-127` tel + display, `:132` `https://wa.me/420725986855`; `components/HeroWhatsApp.tsx:10` wa.me with text; `components/booking/steps/Step2DateTime.tsx:308` wa.me with text; `components/ContactForm.tsx:203` `placeholder="+420 725 986 855"` | 12 | Import constants; `whatsappUrlWithText` for the two prefilled-text links. |
| JSON-LD | `lib/jsonld.ts:37` `telephone: '+420725986855'`; `app/[locale]/page.tsx:89` `telephone: '+420725986855'` and `:153` `telephone: '+420-725-986-855'` (contactPoint) | 3 | `BUSINESS_PHONE_E164` and `BUSINESS_PHONE_SCHEMA_HYPHEN` (keep the hyphen format, or move contactPoint to E.164, which schema.org prefers; do not change format in the refactor commit). |
| Email HTML | `lib/email.ts` lines 275, 1090, 1222, 1372, 1746 (footer text "...or +420 725 986 855") | 5 | One module-level `const` using `BUSINESS_PHONE_DISPLAY`; tests for `email.ts` exist (`tests/email.test.ts`), none assert the number. |
| llms text | `lib/llms-content.ts` lines 107, 203, 233, 271 | 4 | Template literals with `${BUSINESS_PHONE_DISPLAY}`; `tests/llms-content.test.ts` asserts no number today. |
| Locale content JSON | `content/pages/{ar,en,es,fr,hi,ru,zh}/{book,faq,routes,services}.json` (en has 4 files; en has no `privacy.json` hit) and `privacy.json` for the six non-en locales (`contactPhoneLabel`) | 41 | Keep literals; scripted exact-string replace at switch time (all use Latin digits `+420 725 986 855`, all locales); then freeze manifest. |
| i18n | `i18n/glossary.json:10` `"phoneNumbers": ["+420 725 986 855"]` (DNT list for the translation pipeline) | 1 | Update at switch time (the DNT list must hold the new display number). |
| Tests | `tests/book-page-render.test.tsx:44` and `tests/routes-hub-render.test.tsx:49` (`DNT_TOKENS` contain `'+420 725 986 855'`), `tests/contact-form.test.tsx:131` (`getByText('+420 725 986 855')`), `tests/telegram-bot-profile.test.ts:192,194` (literal wa.me URL and `hero` contains) | 5 | Import `BUSINESS_PHONE_DISPLAY` / `WHATSAPP_CHAT_URL` instead of literals. |
| Snapshots | `tests/__snapshots__/{book-page-render,multi-day-page-render,route-page-render,routes-hub-render}.test.tsx.snap` (2, 1, 1, 4 occurrences) | 8 | Regenerate the 4 files at switch time with `-u` and inspect the diff (only phone lines). |
| Untracked (not in git grep) | root-level owner scripts `send-time-change-email.mjs`, `send-maxime-traveltime-reply.mjs`, `send-vehicle-change-email.mjs` contain the number | 3 | Owner ops scripts; list in runbook checklist; not repo work. |

Not present (verified by broader grep): `messages/*.json`, `public/*`, `infra/**`, `scripts/**`, `middleware.ts`, `app/sitemap.ts`, env examples. `wa.me`/`tel:` also appear only in a comment in `lib/localized-href.ts`.

**Snapshot and date-drift rule:** `route-page-render` normalizes `priceValidUntil` (`replace(/("priceValidUntil":")\d{4}-\d{2}-\d{2}(")/g, ...)`, tests/route-page-render.test.tsx lines 148-154) and its snapshot holds one `priceValidUntil`. The other three snapshots contain none. Regenerating must not remove that normalization (CLAUDE.md rule); review the snapshot diff for only phone-number lines.

**i18n manifest hazard (important):** `i18n/translation-manifest.json` (2,568 units) records an `enHash` per EN unit, e.g. `"content/pages/en/faq.json::metadata.title": { "enHash": "sha256:...", "lastTranslatedAt": ... }`. Editing the EN literal changes the unit's hash. `.github/workflows/i18n-translate.yml` triggers on pushes to `content/pages/en/**` (currently disabled: no API credit). If it were re-enabled, every touched unit would look stale and the pipeline could overwrite the hand-updated translations. Fix at switch time: after replacing literals in EN and the six locales, write a `.freeze` file listing the touched units (`<sourceKey>::<dotPrefix>` patterns) and run `node scripts/i18n-freeze-manifest.mjs --dir <phase-freeze-dir>`; `freezeUnits` overwrites `manifest.units[unit.unitKey] = { enHash: sha256(unit.value), lastTranslatedAt: now }` and refuses any unit whose locale value is byte-identical to EN unless it is DNT or numeric. A unit that consists only of the phone number would be identical across locales; check the glossary DNT list first. Then run with `--verify` to confirm. [VERIFIED: scripts/i18n-freeze-manifest.mjs header and `freezeUnits` lines 204-250.] Do not run `scripts/i18n-translate.mjs --dry-run` on the repo tree (CLAUDE.md).

**Guard test (`tests/business-number-guard.test.ts`, `// @vitest-environment node`):**
- Enumerate `git ls-files` (tracked only), exclude `.planning/`, `tests/__snapshots__` only for assertion B (snapshots are checked by assertion A), and the guard file itself; build the old-number needle from parts so the test never spells it: `['725','986','855']`, regex `725[ -]?986[ -]?855|420725986855`.
- **A (consistency, always on, lands with the refactor):** every phone-shaped match `(?:\+|00)?420[ -]?\d{3}[ -]?\d{3}[ -]?\d{3}` in `app/`, `components/`, `lib/`, `content/`, `i18n/`, `tests/` (excluding fixtures that intentionally differ) normalizes to `BUSINESS_PHONE_DIGITS`. This catches a half-finished replace. Also assert `businessNode().telephone === BUSINESS_PHONE_E164`, the llms builder output contains `BUSINESS_PHONE_DISPLAY`, and rendered Footer/contact links equal `BUSINESS_TEL_URL` / `WHATSAPP_CHAT_URL` prefix.
- **B (no personal number, unconditional, lands with the switch plan):** no tracked file outside `.planning/` matches the old-number regex, and each locale's `book/faq/routes/services` JSON contains `BUSINESS_PHONE_DISPLAY` at least once (proving the replace happened, not just a deletion).
- Adding B before the flip would fail the suite; adding it in the switch plan keeps the refactor commit green and makes the flip verifiable.

### Pattern 7: Personal number transition auto-reply and return (D-23)
- Use the **Away message** in the WhatsApp Business app on the personal number with schedule **"Always send"**, recipients everyone. Official help lists the scheduling options (always send, custom schedule, outside business hours) and the 14-day rule for greeting messages [CITED: faq.whatsapp.com/501866148528310]. Secondary sources: greeting text is limited to about 140 characters and is sent to first-time senders or after 14 days; away messages are not limited to once per 14 days [MEDIUM-LOW; A8]. Author the text to fit 140 characters anyway; the app shows its own counter, and the owner confirms the actual limit.
- One auto-reply cannot be localized per sender. Draft one short bilingual message (English first, plus Russian) and, if the counter allows, a second variant with the other site languages the owner chooses. The new number in the text becomes tappable in WhatsApp [ASSUMED].
- Behavior to test at go-live: send from a second phone to the personal number and confirm the away message arrives and how fast; if the phone is offline, whether it still fires is unverified [A8].
- **Return to plain WhatsApp after the period:** the same number cannot run on WhatsApp Business and WhatsApp Messenger at once; moving back works with chat backup and restore under the same phone number and the same Google Drive/iCloud account, and business-only data (business profile, catalog, labels, automated messages) does not carry over [CITED: faq.whatsapp.com/663543925287107 title; procedure per secondary sources, MEDIUM]. Owner action: back up chats first, then verify the number in WhatsApp Messenger and restore. A plain Messenger has **no** auto-reply, so the transition auto-reply ends at that moment; the runbook records an end date and a reminder. The owner can also keep the Business app permanently (labels visible to contacts) if they prefer never to lose the auto-reply.
- People who still hold the old number (saved contacts, old emails and invoices, the Google Business Profile, partner hotels) keep writing to it for months; that is why D-24 exists.

### Anti-Patterns to Avoid
- **Connecting the manual channel and stopping there:** without `app_secret` in `provider_config` any anonymous POST to `/webhooks/whatsapp/+<digits>` is accepted (the number is public), so forged customer messages could enter the inbox.
- **Letting Chatwoot register the number with its random PIN:** the owner then does not know the PIN and it sits in the Chatwoot database; register first with the owner's PIN.
- **Deleting the WhatsApp inbox to "fix" something:** cascades conversations, and for an `embedded_signup` channel `WebhookTeardownService` also clears the callback override, deregisters the number and unsubscribes the app (first-pass source read). For a manual channel the destroy still triggers `before_destroy :teardown_webhooks` [VERIFIED: chatwoot@v4.18.0 `app/models/channel/whatsapp.rb`]. Use `register_webhook` and "Update API key" instead; back up first.
- **Tokenizing locale JSON with `{phone}` now:** touches every FAQ renderer and JSON-LD builder; a missed site prints a raw token. Keep literals plus the guard test.
- **Flipping the public number before D-06 passes:** customers would message a number that does not deliver.
- **Editing approved templates by script by default:** consumes the edit budget and resets review.
- **Putting the pricing table under `infra/chatwoot/`:** `CURRENCY_RE` blocks EUR words and symbols.
- **Writing the old personal number into the runbook or any tracked file outside `.planning/`:** the guard test would fail; refer to it as "the owner's former number".
- **Using a tourist data-only eSIM:** it has no number that receives SMS or voice, so Meta cannot verify it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signature check | Own HMAC verification | Chatwoot `MetaTokenVerifyConcern` activated by `provider_config.app_secret` | Constant-time compare, raw-body HMAC, already shipped. The probe script only *tests* it. |
| Number verification and PIN | A custom registration tool | Meta App Dashboard Add phone number, plus owner `POST /register` | One-time owner step; Meta enforces the 10-per-72h registration cap. |
| 24h window logic | A window timer script | `Conversations::MessageWindowService` + composer restriction | Built in. |
| Template status polling | A cron | Chatwoot's synced templates or the script's `--status` | Chatwoot already syncs and exposes statuses. |
| Window-closing label | A polling job | Delayed automation (`execution_delay`) | Episode logic cancels on any human reply. |
| Secret scanning | A new hook | Extend `SECRET_RE` and `infra/vps/env/*.env.example` | Existing gate and probe script. |
| Phone constant propagation | Regex replace at every future change | One E.164 constant + guard test | Future number changes become one value plus a scripted content replace. |
| Manifest hash refresh | Editing `translation-manifest.json` by hand | `scripts/i18n-freeze-manifest.mjs` | Tool recomputes `enHash` and validates locale values. |
| Phone formatting variants | Separate literals per surface | Derived constants | Prevents the 3 formats seen today (`+420725986855`, `+420 725 986 855`, `+420-725-986-855`) from drifting. |
| E.164 normalization and cross-channel dedup | Anything in this phase | Phase 82 | Explicitly out of scope. |

**Key insight:** every hard part of the Chatwoot side already exists in v4.18.0; the code we own is a thin template script, a sync extension, a small config PATCH, a runbook, and the number-switch refactor. The remaining risk is Meta-side owner steps and not missing a surface.

## Runtime State Inventory

Trigger: WA-04 is a rename/migration of a string (the public phone number) across code and off-repo systems. A grep finds files, not runtime state. Answers per category:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Supabase: not inspected this session (no DB tool in this run). Likely text columns holding the number: email templates, blog/content rows, `pricing_globals`-style config. Chatwoot database: canned responses and widget copy live in git (`infra/chatwoot/canned-responses/*.json`, no number found by grep), but text typed into the Chatwoot UI is not in git. | **Code/data check at execution:** run a Supabase SQL search for the personal number's digits across text/jsonb columns (Supabase MCP), and a Chatwoot API listing of canned responses, inbox greeting and widget texts. Any hit is a **data migration** (update rows), not a code edit. |
| Live service config | Stripe Dashboard business-support phone and receipt branding; Resend has none; Vercel env has no phone/WhatsApp variable (grep of env examples: none); Telegram bot profile JSON has none; Google Business Profile, directories, partner hotels, Instagram/Facebook page contact buttons and the WhatsApp Business profile on the personal number | Owner checklist (D-24). Not repo work. Add Meta Page/Instagram contact info and the Facebook Page "WhatsApp" button to the checklist. |
| OS-registered state | None: no cron, launchd or pm2 job embeds the number (grep of `infra/`, `scripts/`: none). | None (verified by repo grep only; VPS host state not probed). |
| Secrets and env vars | No secret is named after the number. New secrets (`META_SYSTEM_USER_TOKEN`, `META_APP_SECRET`, `META_WABA_ID`) are additions, not renames. | None for the rename. |
| Build artifacts / cached output | Vercel ISR pages (route pages, `llms.txt`, `llms-full.txt` revalidate hourly) and CDN cache serve the old number until the deploy replaces them; `.next` is rebuilt by Vercel. Search engines cache JSON-LD `telephone` and FAQ text for days to weeks. Untracked owner scripts `send-*.mjs` at the repo root and `generate_invoice_*.py` in the owner's ops folder still carry the old number. Printed cards/QR codes. | Deploy = production merge to `main`; confirm with a curl on `/llms.txt` and one route page after deploy. Update the owner scripts and printed material via the checklist. Optionally request a re-crawl (IndexNow script exists: `scripts/indexnow-submit.mjs`). |

**The canonical question:** after every tracked file is updated, what still holds the old number? Owner-side off-site listings and stored text in Supabase/Chatwoot, plus search-engine caches. All are covered by D-24 and the execution-time data check.

## Common Pitfalls

### Pitfall 1: Manual channel accepts forged webhooks until `app_secret` is set
**What goes wrong:** the phone number is in the webhook path, which is public; with no channel secret and `source: manual_setup_v2`, Chatwoot skips signature verification and accepts the POST.
**How to avoid:** set `provider_config.app_secret` (Code Examples), then run the three probes. Re-check after any credential update.
**Warning signs:** the unsigned probe returns 200 instead of 401 (that is the pre-fix state, and proves the hazard).
**Confidence:** HIGH (source read at the tag).

### Pitfall 2: Chatwoot registers the number with a random PIN
See Pattern 1 step 4. **How to avoid:** owner `/register` first; after connecting, check that `provider_config.verification_pin` is absent (admin API view, do not print it). If it is present, the PIN is Chatwoot's random one: the owner should set a new PIN through the API (`POST /{PHONE_NUMBER_ID}` with `pin`) and record it, then remove reliance on the stored value [Meta: "If you don't have your PIN, you can change your PIN using the API"].
**Confidence:** HIGH (source) / MEDIUM (Meta wording).

### Pitfall 3: A "new" Czech number may already have a WhatsApp account
Operators recycle numbers; a number issued to a previous subscriber can still be registered on WhatsApp. Meta: "Numbers already in use with WhatsApp cannot be registered unless they are deleted first." **How to avoid:** at purchase, choose a SIM issued fresh if the operator allows choosing; before adding it to Meta, the owner can check by opening `wa.me/<digits>` (a not-on-WhatsApp number shows an error page) [ASSUMED, A10]. If the number is on WhatsApp: install WhatsApp on a spare phone with that SIM, verify, then Settings > Account > Delete account, wait, retry the Meta add. Never install WhatsApp on the SIM after it is on the API.
**Warning sign:** Meta's add step reports the number is already registered.

### Pitfall 4: Prepaid SIM expiry and number recycling
Operator terms found by search (press/forum summaries, may be dated; A14): O2 prepaid valid 12 months after the last top-up, then the card is blocked and the number can be reissued; T-Mobile Twist valid 12 months, a top-up of at least 200 Kč starts a new 12 months, blocked services can be unblocked within 30 days by topping up, then the credit is lost and the number cancelled; Vodafone credit valid 7 months plus 3 months to top up, deactivated with the number after 10 months without a top-up. **How to avoid:** prefer a postpaid/tariff SIM billed to the company, or a prepaid with a recurring calendar reminder and an auto top-up. Re-verify terms on the chosen operator's current price list. Losing the SIM does not stop the API registration (an expired OTP does not disconnect a connected number, per Chatwoot's source comment), but recycling the number to a stranger would let them receive the SMS code for any re-verification and calls meant for Prestigo. Runbook entry (D-20).

### Pitfall 5: Display name mismatch (D-05)
BSP documentation says the display name must match how the brand appears on the website, including capitalization and spacing, avoid extra punctuation, generic terms and slogans; declines are common for "unclear relationship between the legal entity and the name", absence from the website, or inconsistent branding [CITED: docs.360dialog.com display-names, MEDIUM]. The site writes the brand "PRESTIGO" (uppercase) in titles, llms text and JSON-LD `name: 'PRESTIGO'`, while D-05 says "Prestigo - Premium Chauffeur Service Prague" (hyphen and descriptor). The legal entity is chelautotrans s.r.o. So decline is plausible. A decline is not a launch blocker: customers see the number, not the name, until the name is approved, the business is verified and the number has sent 2,000 delivered messages to unique users outside customer service windows in 30 days [CITED: 360dialog]. **Handling:** submit exactly the D-05 string; on rejection stop and ask (D-05). To make the ask fast, prepare candidates for the owner to choose from: "PRESTIGO" (matches the site casing), "Prestigo Prague", "Prestigo Chauffeur Service". Claude never picks one.

### Pitfall 6: Chatwoot sanitizes template variables
`sanitize_parameter` strips `<`, `>`, `"` and `'` and truncates to 1,000 characters (first pass source read); Meta also restricts variable values (newlines, tabs, long space runs) [ASSUMED, A6b]. Use short single-line variables; put apostrophes in the template body.

### Pitfall 7: Media header needs a public URL
Chatwoot builds `document: { link: url, filename }`, validates only http/https, max 2,000 chars. Invoice PDFs are private. Ship `invoice-ready` as body-only with a quick reply ("Send my invoice") and send the PDF as a normal attachment in the reopened window (Chatwoot uploads attachments as media ids). Header-document variant later, after a signed-URL step exists (needs the Resumable Upload API sample handle). This deviates from D-10's first sentence but stays within its "otherwise" clause; raise it as a `checkpoint:decision`.

### Pitfall 8: No phone-app fallback: missed notification equals lost lead
With the number in no phone app, a customer's message shows "delivered" on their side even when nobody is watching. **How to avoid:** (a) UAT for Chatwoot mobile push on the owner's phone (self-hosted push relies on Chatwoot's push relay; verify, A19), (b) Chatwoot email notification for new WhatsApp conversations to the owner's personal address (never info@ or bookings@; loop rule in `chatwoot-channels.md`), (c) VPS-down procedure and the Phase 76 uptime monitor, (d) after an outage, confirm Meta's webhook redelivery; Meta retries failed webhooks for a limited window (about 7 days per the first-pass Meta webhooks page, MEDIUM), so confirm backlog processing rather than assuming.

### Pitfall 9: Template sync lag and category re-classification
Templates appear in the composer after sync: on inbox creation, every 3 h (`TemplatesSyncSchedulerJob`), the Settings > Templates button, or `POST /inboxes/:id/sync_templates`. Chatwoot sends only templates whose synced `status` is `approved` and that match name + language. Meta may re-categorize (utility requires transaction-specific, non-promotional copy; feedback tied to a specific previous order can be utility) [CITED: Meta template-categorization]. Write the review request as "about your trip {{booking_ref}}"; record the category Meta assigns.

### Pitfall 10: Payment method before the first template
Templates are billed; without a payment method on the WABA a send fails (error family "business eligibility payment issue") [ASSUMED, A6]. Add the card (EUR) before the first template test; currency cannot change afterwards (D-18).

### Pitfall 11: Registration and verification rate limits
Meta limits `/register` to 10 requests per number per 72 h [CITED]. Do not loop registration scripts; one manual call, read status first.

### Pitfall 12: Content JSON changes trip the i18n pipeline, snapshots and DNT tests
See Pattern 6: manifest freeze, 4 snapshot files, `DNT_TOKENS` in two render tests (`'+420 725 986 855'` must become the constant, or the DNT check in the locale tests fails after the flip), `contact-form.test.tsx` `getByText`. Run the four render tests, `contact-form`, `telegram-bot-profile`, `jsonld`, `llms-content`, `email` after the flip.

### Pitfall 13: Who answers the business line?
D-21 publishes the new number as `tel:` everywhere, including the footer and contact page, so the SIM must be in a device that is answered (dual-SIM or eSIM on the owner's phone, or operator call forwarding to the personal phone [ASSUMED]). The old personal phone previously took these calls. Add "who answers, hours, forwarding" to the runbook and confirm before the flip. Ordinary calls and SMS on the SIM are unaffected by API registration; in-app WhatsApp voice calls to the number do not work unless the Calling API is enabled (deferred idea) [ASSUMED, A15].

### Pitfall 14: Token invalidation silently stops sends
For a manual channel there is no OAuth reauthorization banner (the UI shows it only for `embedded_signup`). A revoked or expired token surfaces as health `authorization` errors (code 190) and failed sends. **How to avoid:** the weekly `inspect --whatsapp` check in the runbook and the "Update API key" procedure; keep the System User token at expiration Never; note that a Business Manager password change or app push back to development can also break delivery.

## Code Examples

### Set `app_secret` on the manual channel (owner or Claude, admin token from env; never echo values)
Endpoint and shape derive from Chatwoot's `InboxesController#update` (`channel: [:type, *EDITABLE_ATTRS]`, `EDITABLE_ATTRS = [:phone_number, :provider, { provider_config: {} }]`) [VERIFIED: chatwoot@v4.18.0 `inboxes_controller.rb`, `app/models/channel/whatsapp.rb`]. The request **replaces** `provider_config`, so send the full existing hash plus the new key; the model then re-validates the WABA/token pair and the `phone_number_id` remotely (`validate_provider_config?`).
```
# 1) read current provider_config (admin token) -> merge in memory -> never print it
GET   /api/v1/accounts/1/inboxes/{inbox_id}
# 2) write back the merged hash; keep source = manual_setup_v2
PATCH /api/v1/accounts/1/inboxes/{inbox_id}
      { "channel": { "provider_config": { ...existing..., "app_secret": "<META_APP_SECRET from env>" } } }
```
Fallback if the API PATCH is rejected: `rails runner` inside the rails container: `c = Channel::Whatsapp.sole; c.provider_config = c.provider_config.merge('app_secret' => ENV.fetch('X')); c.save!` (needs VPS SSH; owner allow-rule per project memory; `sole` is a Rails 7 method [ASSUMED, A21]). Add a small Node helper under `infra/chatwoot/` only if it reuses `lib/client.mjs` redaction; a test must prove it never prints `provider_config`.

### Webhook probe (owner-run; secret from env; payload contains no message)
```js
// infra/chatwoot/whatsapp-webhook-probe.mjs (sketch)
import { createHmac } from 'node:crypto'
const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: WABA_ID, changes: [{ field: 'messages',
  value: { messaging_product: 'whatsapp', metadata: { display_phone_number: DIGITS, phone_number_id: PHONE_NUMBER_ID } } }] }] })
const url = `https://chat.rideprestigo.com/webhooks/whatsapp/+${DIGITS}`
const sig = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET).update(body).digest('hex')
// expect: no header -> 401 ; header 'sha256=' + '0'.repeat(64) -> 401 ; header sig -> 200
```
`valid_meta_signature?` compares `"sha256=" + OpenSSL::HMAC.hexdigest('SHA256', secret, request.raw_post)` with `secure_compare` [VERIFIED: chatwoot@v4.18.0 `meta_token_verify_concern.rb`], so the HMAC must be over the exact raw bytes sent. Before the fix, the unsigned probe returns 200 (pre-fix evidence); after, 401. The first pass's live probe (no channel present) returned 401 for unsigned POST because `meta_signature_verification_required?` returns true when no channel resolves.

### Delayed window rules (config-as-code shape, extends `automation-rules.json`) - unchanged
```json
{
  "windowRules": [
    { "name": "window: whatsapp closing soon", "inbox": "WhatsApp", "label": "wa-window-closing", "delayMinutes": 1200 }
  ]
}
```
Expands (in `expandAutomationRules`) to two bodies. Attribute names, actions and `execution_delay` range are quoted from Chatwoot v4.18.0 `AutomationRule` (first pass) and the repo's `sync.mjs`:
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
`EXECUTION_DELAY_RANGE = (10..43_200)` minutes; "awaiting agent" episode cancels on any human reply; 1,200 minutes (20 h) leaves a 4 h margin. Feature flag `delayed_automations` (`enabled: false` in `config/features.yml`) must be enabled for account 1 (Super Admin account edit, or `rails runner`) [A9]. With no coexistence echoes now, only Chatwoot operator replies cancel the rule.

### Template creation request (per Meta component reference) - unchanged
`POST https://graph.facebook.com/v25.0/{WABA_ID}/message_templates`
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
`parameter_format` and the body wording are ours [ASSUMED, A7]; confirm with a first `--dry-run` and Meta's validation response.

### Owner read-only status checks (recommended for `inspect.mjs --whatsapp`)
```
GET /api/v1/accounts/{id}/inboxes/{inbox_id}/health              -> quality_rating, messaging_limit_tier, status, name_status, code_verification_status, platform_type
GET /api/v1/accounts/{id}/inboxes/{inbox_id}/message_templates   -> synced templates with status/category
POST /api/v1/accounts/{id}/inboxes/{inbox_id}/sync_templates     -> force refresh (mutation; not in dry-run)
POST /api/v1/accounts/{id}/inboxes/{inbox_id}/register_webhook   -> recovery (admin; mutation)
```
[VERIFIED: chatwoot@v4.18.0 `inbox_health_management.rb` (actions `sync_templates`, `message_templates`, `health`, `register_webhook`) and `Whatsapp::HealthService::PERSISTED_FIELDS`: `id display_phone_number verified_name name_status quality_rating messaging_limit_tier status account_mode code_verification_status throughput_level last_onboarded_time is_on_biz_app platform_type ...`]. The `health` action works for any WhatsApp Cloud inbox, not only embedded signup. Print booleans, enums and counts only; add `signature_secret_configured` (key presence among `app_secret`, `app_secret_key`, `client_secret`, `api_secret`) and `verification_pin_stored` (true is a warning, see Pitfall 2). Never print names, numbers or message text.

### Manifest freeze file for touched units (switch plan)
```
# .planning/phases/78-whatsapp-cloud-api-channel-coexistence/freeze/78-number-switch.freeze
# one pattern per line: <sourceKey>::<dotPrefix>  (derive the exact prefixes from the units whose EN value changed)
content/pages/en/faq.json::sections
```
Run `node scripts/i18n-freeze-manifest.mjs --dir <that dir>` then `--verify`. The planner derives real patterns by diffing units for the five affected sources (`book`, `faq`, `routes`, `services`, and `privacy` for non-en locales, whose EN source has no hit).

### Sending from Chatwoot (what the composer posts; for tests of parameter shape) - unchanged
```
processed_params: { body: { first_name: "Anna", ... }, header: { media_url, media_type, media_name }, buttons: [{ type: 'url', parameter: 'suffix' }] }
```
Quick-reply buttons without a variable need no component; URL buttons send `{ type: 'button', sub_type: 'url', index, parameters: [{ type: 'text', text }] }` (first-pass source read of `Whatsapp::WhatsappCloudService#template_body_parameters` and `TemplateProcessorService`).

## Pricing (D-19)

Model [CITED: developers.facebook.com pricing page]: charged per delivered **template** message; rate depends on template category and the recipient's country calling code; non-template messages are free inside an open customer service window (until 2026-10-01); 72-hour free entry point windows are free; supported billing currencies include EUR; volume tiers for utility/authentication aggregate per business portfolio and reset monthly. A new WABA changes none of this.

**Effective 2026-10-01** [CITED: developers.facebook.com pricing/non-template-messages]: "Meta will charge on a per-message basis for service messages"; by market the service rate equals the utility/authentication rate; no volume tiers for service messages; utility templates sent within an open 24-hour window become chargeable; the 72-hour free entry point window stays free. The **1,000 free service messages per business phone number per month** is stated by the EUR rate-card republication at edna.io and press coverage, but is **not** present in the Meta page text retrieved (first pass): MEDIUM, re-verify in WhatsApp Manager > Pricing at launch. API-sent replies from Chatwoot count as service messages. Note: this phase's launch date straddles 2026-10-01 (two days after this research), so the runbook must state which side of the change it describes.

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

The "main customer countries" list is a guess; derive real top calling codes from bookings (Supabase MCP) and use those rows [A7]. Illustrative spend (volumes are assumptions): 150 utility templates a month at 0.03 is about 4.50 EUR; 300 at the Germany rate 0.07 is about 21; 100 review requests billed as marketing at 0.11 is about 11. Expected spend is single-digit to low double-digit EUR a month; the owner check is a monthly glance at WhatsApp Manager > Billing, no script. Runbook text is date-stamped ("rates as of 2026-09-29, re-check at launch").

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Migrating a personal/app number to the API (or Coexistence) | Dedicated new number registered on Cloud API only | Owner decision 2026-09-29 | No echoes, no history, no phone-app fallback; Chatwoot is the only surface. |
| Meta help pages under `developers.facebook.com/docs/whatsapp/...` | Moved to `developers.facebook.com/documentation/business-messaging/whatsapp/...` | 2026 | Older URLs still partly resolve; cite the new paths. |
| Conversation-based pricing | Per delivered template message; service messages billable | 2025-07-01 / 2026-10-01 | Rates by category and recipient country. |
| Messaging limit tiers at 1K/10K/100K by default | New portfolios start at 250; verification or 2,000 quality template messages lift to 2,000 | 2025-2026 | 250/24h is far above Prestigo volume. |
| New portfolios: unlimited numbers | 2 numbers until verified (20 after) | current | Fine for one number. |
| Category opt-out (`allow_category_change`) | Meta may re-categorize by default | 2025-04-09 | Declare best category, accept Meta's decision, record it. |
| Embedded Signup v2 | v4 (config-based); v2 sunset 2026-10-15 | 2026 | Irrelevant to the manual path. |

**Deprecated/outdated:** Chatwoot's `WHATSAPP_API_VERSION` default is `v22.0` (Meta lists v22.0 expiring 2027-05-20); calendar a review. Chatwoot's health service enforces a minimum of v24.0 for health calls. Chatwoot's cloud service still hard-codes older versions for sending and template sync (first pass); works today.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Adding a production number in API Setup with the existing portfolio yields a real WABA in that portfolio; the auto-created test WABA/number can be ignored | Pattern 1 | Owner steps differ; may need to create the WABA in WhatsApp Manager first. |
| A2 | Business verification takes about 2 to 5 business days | Summary | Schedule optimism; not on the launch critical path now. |
| A4 | Meta access tokens start with `EAA` | Pattern 4 | Secret-gate regex misses or over-matches; the `KEY=value` name gate still works. |
| A5 | No hard hourly creation cap at 56 submissions | Pattern 2 | Script hits a rate error; add backoff. |
| A6 | Sending a template without a WABA payment method fails with a payment eligibility error | Pitfall 10 | Confusing first failure. |
| A6b | Meta rejects variable values with newlines, tabs or long space runs | Pitfall 6 | Operator-typed values fail at send. |
| A7 | `parameter_format: "NAMED"` and the body wording pass Meta validation; the country list in Pricing is representative | Code Examples, Pricing | Rework of template JSON; wrong runbook rate rows. |
| A8 | Business-app greeting limit about 140 characters (secondary source); away-message limit and offline behavior unknown | Pattern 7 | Auto-reply text truncated or not sent when the phone is off. |
| A9 | Super Admin can toggle `delayed_automations` without console access | Pattern 3 | Needs a `rails runner` on the VPS. |
| A10 | A recycled CZ number can still carry a WhatsApp account; `wa.me/<digits>` shows an error page when not on WhatsApp; deletion via a spare phone works | Pitfall 3 | The number cannot be added until cleared. |
| A11 | Business verification documents: register extract and proof of address, domain via DNS TXT at Hostinger | Owner checklist | Verification delays. |
| A12 | The D-05 display name is likely to need adjustment; Meta's exact rules for descriptors/hyphens are only known from BSP docs | Pitfall 5 | Cosmetic; customers see the number regardless at launch. |
| A13 | Meta auto-upgrades calls to expired Graph versions | State of the Art | Only if Chatwoot's hard-coded old versions stop working upstream. |
| A14 | Czech prepaid validity terms (O2 12 months, Twist 12 months + 30 days, Vodafone 7+3 months) from press summaries that may be dated | Pitfall 4 | SIM lapses earlier than the runbook says. Re-verify on the chosen operator's price list. |
| A15 | SIM voice/SMS are unaffected by API registration; in-app WhatsApp calls to the number are unavailable without the Calling API | Pitfall 13 | Customers expecting to call via WhatsApp. |
| A16 | Whether the dashboard's Add phone number step leaves the number registered (CONNECTED) or needs the owner's `/register` | Pattern 1 | Owner runs an unneeded or a missing register call; the status read settles it. |
| A19 | Chatwoot mobile push works on this self-hosted install | Pitfall 8 | Missed messages; verify in UAT. |
| A20 | Returning the number from WhatsApp Business to Messenger keeps chats via backup/restore; business-only data is lost | Pattern 7 | Chat history loss if the owner skips the backup. |
| A21 | `Channel::Whatsapp.sole` works (Rails 7) in the rails runner fallback | Code Examples | Use `.first`. |
| A22 | Webhook delivery of real messages requires the app in Live mode (D-02, not re-verified this pass) | Pattern 1 | Inbound silently absent in development mode. |

## Open Questions

1. **Does the API PATCH accept the merged `provider_config` and preserve `source`?**
   - Known: `EDITABLE_ATTRS` permits `provider_config: {}`; the UI token-update path already sends the merged hash.
   - Unclear: whether the whole-hash replace passes `validate_provider_config?` on this install without side effects.
   - Recommendation: first plan task on production is a dry read plus the PATCH on the freshly created, unused inbox (no customers yet, so a mistake is cheap), with the `rails runner` line as documented fallback.
2. **Display name outcome (D-05):** settle at the first review; owner chooses on rejection. Candidates listed in Pitfall 5.
3. **Invoice header vs attachment (Pitfall 7):** planner raises a small owner decision; recommended body-only plus attachment now.
4. **Privacy policy naming WhatsApp/Meta as a recipient.** The current privacy page has no WhatsApp or Meta wording (first-pass grep). Phase 82 (GDPR-02) owns the full update. Recommend an interim one-paragraph disclosure before launch or an explicit deferral; owner decision. Note the privacy page also holds the phone `tel:` link that WA-04 touches.
5. **Who answers the business line, during which hours, with what forwarding (Pitfall 13):** owner decision before the site switch.
6. **Chatwoot mobile push on self-hosted (A19):** settle in UAT.
7. **Supabase/Chatwoot stored text containing the old number (Runtime State Inventory):** settle with a search at execution.
8. **Order of Meta verification versus display name:** if the owner starts business verification early, Meta may re-run display-name review for the number (BSP docs say review follows verification for some flows); accept.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node (owner Mac) | Template script, sync, tests, probe | yes (first pass) | v24.14.1 | none needed |
| `gh` CLI | Upstream source checks | yes, but hit the shared API rate limit late in this pass | — | WebFetch |
| Chatwoot production | Inbox, sync, health | yes | 4.18.0 (`/api`, first pass) | none |
| Webhook path via Caddy | Meta callbacks | yes | unsigned POST 401 with no channel (first pass) | none |
| Chatwoot admin API token | `app_secret` PATCH, `inspect --whatsapp` | owner-held | — | Super Admin UI cannot set `app_secret`; `rails runner` via SSH |
| Site legal pages | Meta Live-mode URLs | yes (first pass) | `/privacy`, `/terms`, `/data-deletion` 200 | none |
| VPS SSH | Optional `rails runner` | not probed (auto-mode blocks VPS SSH per project memory) | — | admin API |
| New Czech SIM/eSIM (owner) | Verification code, business line | owner-only, not yet bought | — | none; blocks WA-01 |
| Second phone to test | D-06 matrix | owner's personal phone works | — | any other WhatsApp account |
| Meta assets (portfolio admin, app, System User token, App secret) | Everything Meta-side | owner-only, state unknown | — | none |
| Payment card on WABA | Template sends | owner-only | — | none |
| Supabase MCP / DB access | Stored-text search for the old number | not available to this research pass | — | execution-time search |

**Missing dependencies with no fallback:** the new SIM/eSIM and the owner's Meta steps (external lead time).
**Missing dependencies with fallback:** VPS SSH (use the admin API).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.1`, jsdom default, `// @vitest-environment node` for infra and guard tests |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `npx vitest run tests/business-number-guard.test.ts tests/whatsapp-templates.test.ts tests/whatsapp-graph.test.ts tests/whatsapp-runbook.test.ts tests/chatwoot-sync.test.ts tests/chatwoot-config.test.ts tests/chatwoot-inspect.test.ts` |
| Number-switch set | `npx vitest run tests/business-number-guard.test.ts tests/book-page-render.test.tsx tests/routes-hub-render.test.tsx tests/multi-day-page-render.test.tsx tests/route-page-render.test.tsx tests/contact-form.test.tsx tests/telegram-bot-profile.test.ts tests/jsonld.test.ts tests/llms-content.test.ts tests/email.test.ts tests/chat-launcher.test.tsx` |
| Full suite command | `npx vitest run` (about 90 s; `vitest related` crashes here, so name files explicitly) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WA-04 | **Refactor commit:** every phone-shaped string in `app/ components/ lib/ content/ i18n/ tests/` equals the constant; JSON-LD `telephone` (both nodes), llms output, email footer, Footer/contact/privacy `tel:` and `wa.me` links, ContactForm placeholder derive from the constant; all existing snapshots unchanged | unit/render | `npx vitest run tests/business-number-guard.test.ts` plus the number-switch set | no, Wave 0 (guard); others exist |
| WA-04 | **Switch commit:** no tracked file outside `.planning/` matches the old-number regex; each locale's `book/faq/routes/services` JSON contains the new display number; snapshots regenerated with only phone-line diffs; `priceValidUntil` normalization intact; DNT tokens use the constant | unit/render | same set | no, Wave 0 |
| WA-04 | i18n manifest refreshed for touched units; `--verify` clean | script | `node scripts/i18n-freeze-manifest.mjs --dir <phase freeze dir> --verify` | tool exists |
| WA-04 | Post-deploy: `/llms.txt`, `/llms-full.txt`, `/contact`, `/privacy`, one route page and the home JSON-LD show the new number and not the old one | live curl | `curl -s https://rideprestigo.com/llms.txt | grep -c <new digits>`; old-number count 0 | manual/owner-run after deploy |
| WA-02 | 8 templates x 7 locales; Meta language codes; name regex; body/header/footer/button limits; identical variable names across locales; no leading/trailing variable; examples present; quick replies grouped; URL variable only at end; https and allowed hosts for button URLs | unit | `npx vitest run tests/whatsapp-templates.test.ts` | no, Wave 0 |
| WA-02 | Template copy price-free and brand-safe (`hasCurrencyToken`, no Uber, no "Prestigio", no real `PRG-` refs, no promotional words in UTILITY bodies) | unit | same file | no, Wave 0 |
| WA-02 | Graph script against a fake Graph API: dry-run GET only; first run creates 56; second run 0; approved drift reported (exit 1) unless `--allow-edit`; paging; token never printed; redirect refused; exit codes 0/1/2; never DELETE | unit | `npx vitest run tests/whatsapp-graph.test.ts` | no, Wave 0 |
| WA-01 / D-17 | `inboxes.json` has the WhatsApp managed entry with no secret fields; `labels.json` has `ch-whatsapp` and `wa-window-closing`; `channelRules` has `channel: whatsapp`; sync creates then reports `create=0 update=0` on rerun against the in-memory fake; `ensureOwnerInboxMember` runs for managed inboxes | unit | `npx vitest run tests/chatwoot-sync.test.ts tests/chatwoot-config.test.ts` | files exist; add cases |
| D-16 | `expandAutomationRules` emits the delayed rule with `execution_delay` and the clearing rule; `differs` notices a changed delay; a 4xx on the delayed rule is skipped as optional | unit | same | add cases |
| WA-01 (security) | `inspect --whatsapp` prints only booleans/enums and never any `provider_config` value; reports `signature_secret_configured` and `verification_pin_stored`; webhook probe script refuses to run without `META_APP_SECRET` and never prints it | unit | `npx vitest run tests/chatwoot-inspect.test.ts` | exists; add cases |
| WA-03 | Runbook at `infra/vps/runbooks/whatsapp.md` has the required sections (recovery, pricing with date stamp, never delete an inbox without a fresh backup, VPS-down with no phone-app fallback, token/app rotation, PIN location and re-registration, SIM custody and prepaid expiry, quality/limits/templates, who answers the business line, transition auto-reply end date and return-to-personal, off-site listings checklist), lives outside `infra/chatwoot/`, contains no `KEY=value` secret and no old-number digits; `chatwoot-channels.md` inventory has the WhatsApp row and no longer says "not a Chatwoot inbox yet" | unit (file assertions) | `npx vitest run tests/whatsapp-runbook.test.ts` | no, Wave 0 |
| Security | Hook blocks a Meta-token-shaped string and a pasted `META_SYSTEM_USER_TOKEN=<value>` / `META_APP_SECRET=<value>`; allows the `.example` file | script | `sh scripts/qa/secret_gate_probe.sh` | exists; add probes |
| Guard | No site code path reaches the VPS or Meta | unit | `npx vitest run tests/infra-vps-isolation-guard.test.ts` | exists, must stay green |
| WA-01 | Number onboarded on the Cloud API, both directions, signature enforced | owner live check | checklist below | manual |

**Owner-performed live checks (UAT, each has a pass criterion):**
1. Meta: SIM/eSIM active in a device; number added, OTP verified, `name_status` recorded, registered with the owner's PIN (stored in the password manager, not in git); app Live; token expiration Never.
2. Chatwoot inbox connected via the manual flow; `inspect --whatsapp` shows status CONNECTED, `messaging_limit_tier` recorded (expect the 250 tier), `signature_secret_configured: true`, `verification_pin_stored: false`.
3. Webhook probes: unsigned 401, wrong signature 401, correctly signed 200 with a message-less payload (no conversation created).
4. D-06 matrix from a second phone: inbound text; Chatwoot reply delivered; image and PDF in both directions; unsigned POST rejected. Delete the test conversation and contact afterwards.
5. Templates: script status shows all 56 submissions with a status; booking change, payment help, review request and trip reminder APPROVED before WA-02 is declared; one real template send from the New Conversation dialog to a number that never wrote in; a quick-reply tap reopens the window and lands in Chatwoot.
6. Window rule: temporarily run the rule with `delayMinutes: 10`, send from a test number, confirm `wa-window-closing`; reply and confirm removal; restore 1200 and re-run sync (`update`, then `create=0 update=0`).
7. Chatwoot mobile push and email notification arrive for a new WhatsApp message (Pitfall 8). Business line: an ordinary call to the new number rings the intended device.
8. Payment method added in EUR before check 5.
9. Personal number: away message set with "Always send"; a test message from a second phone returns the auto-reply with the new number; end date in the runbook.
10. After the switch deploy: live curl checks (table above), a search of Google's cached JSON-LD is not expected immediately.

### Sampling Rate
- **Per task commit:** the quick run command for touched files; for WA-04 tasks the number-switch set.
- **Per wave merge:** `npx vitest run` and `sh scripts/qa/secret_gate_probe.sh` when hook or env examples changed; `npx tsc --noEmit` baseline unchanged (8 old errors in `tests/` only); `npx eslint --quiet` on touched files.
- **Phase gate:** full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/business-number-guard.test.ts`: assertion A now, assertion B added by the switch plan
- [ ] `tests/whatsapp-templates.test.ts`: covers WA-02 content rules
- [ ] `tests/whatsapp-graph.test.ts`: fake Graph API harness (model on `FakeOptions` in `tests/chatwoot-sync.test.ts`)
- [ ] `tests/whatsapp-runbook.test.ts`: covers WA-03
- [ ] `infra/vps/env/whatsapp-meta.env.example` and probe cases in `scripts/qa/secret_gate_probe.sh`
- [ ] Update `78-VALIDATION.md` (drafted for Coexistence: its 78-08 `inspect --expect-coexistence` and echo checks no longer apply)
- [ ] Framework install: none (Vitest present)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (Meta Business Manager and Chatwoot admin) | Owner-held credentials; Meta 2FA on Business Manager admins; Chatwoot CE has no 2FA (Phase 76 note), so a strong unique password |
| V3 Session Management | no (no new session code) | — |
| V4 Access Control | yes | System User token scoped to the WABA with only `whatsapp_business_messaging` and `whatsapp_business_management`; Chatwoot admin-only inbox reconfiguration |
| V5 Input Validation | yes | Template JSON schema validation before any API call; Chatwoot sanitizes variables; guard test for phone-shaped strings |
| V6 Cryptography | yes | Rely on Chatwoot's `X-Hub-Signature-256` HMAC with constant-time compare; secrets in env only; two-step PIN in the password manager |
| V7 Error handling and logging | yes | Redact tokens and never print `provider_config` (contains `api_key` and `app_secret`) |
| V8 Data protection | yes | Message content is personal data: covered by the encrypted nightly backup; the backup now also holds `app_secret` and the token; privacy wording (Open Question 4) |
| V9 Communications | yes | TLS via Caddy; `redirect: 'error'` on Graph calls; token never in a URL query (the Chatwoot code passes `access_token` in some query strings upstream: not ours to change) |
| V14 Configuration | yes | Mode-600 env files on the owner Mac; new `.env.example` names feed the pre-commit gate |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged inbound webhook (public number in the URL) on a manual channel | Spoofing/Tampering | `provider_config.app_secret`; unsigned/wrong-signature probes return 401; re-probe after credential changes |
| Meta token, app secret or PIN leaks (git, chat, logs, backups) | Information disclosure | Env/owner file only, redaction, pre-commit name gate plus `EAA` shape, `security:` commit prefix, rotate on exposure; PIN never in a file |
| Chatwoot admin API view exposes `provider_config` to admin tokens | Information disclosure | Admin tokens only in owner env; tools never print `provider_config`; test asserts it |
| Over-privileged System User token | Elevation of privilege | Only the WABA asset and two permissions; expiration Never but rotate on any doubt |
| Operator sends the wrong template or data to a customer | Tampering/Info disclosure | Templates carry no free-text PII beyond operator-typed variables; runbook check-before-send |
| Inbox deletion or `register_webhook` misuse | Denial of service | Backup-first rule; recovery via `register_webhook` and "Update API key" |
| Webhook backlog loss during VPS outage with no phone fallback | Denial of service | Uptime monitor, Meta retry window, post-outage backlog check, SIM calls as second channel |
| SIM lapse and number recycling | Spoofing/DoS | Postpaid or auto top-up; calendar reminder; PIN protects API registration; runbook |
| Stale old number on cached pages and listings (customers reach the personal number) | Information disclosure (owner privacy) | Guard test, deploy check, transition auto-reply, D-24 checklist |
| Super Admin exposure | Elevation of privilege | Owner-only account, unique password |

## Project Constraints (from CLAUDE.md)

- Brand spelling **Prestigo** / **rideprestigo.com**, never "Prestigio" (templates test for it). Note the site's own copy uses "PRESTIGO" uppercase in titles; D-05 fixes the WhatsApp display name spelling.
- No hard-coded `€` prices in `app/` or `components/`; no prices in templates (D-08); the Chatwoot currency gate scans `infra/chatwoot/**`.
- No secrets or `.env*` files in commits; never read `.env.local` (this research did not).
- Marketing content: no prices, no Uber or ride-hailing comparisons (template copy and the transition auto-reply).
- `middleware.ts` matcher must exclude every static/metadata extension: no new static file is added by this phase, so no matcher change.
- New EN strings in `messages/en.json` need translations: not applicable (no `messages/` change). Content JSON literal replaces keep every locale in sync; template translations are separate and done in-session. **Never run `scripts/i18n-translate.mjs --dry-run` on the repo tree.**
- Golden-HTML / JSON-LD snapshot tests must normalize `priceValidUntil` (route-page test does; keep it when regenerating snapshots).
- Security work (webhook verification, secret gate, tokens): run tests, commit with the `security:` prefix.
- Commands: `npx tsc --noEmit` (baseline 8 old errors in `tests/`), `npx eslint --quiet <files>`, `npx vitest run [files]`, the `verify` skill (`.claude/skills/verify`) as the full gate; `vitest related` crashes, name files explicitly.
- User-facing communication in Russian; RESEARCH.md stays English.
- Phase 76 guard: `tests/infra-vps-isolation-guard.test.ts` stays green; no site code path calls Chatwoot or Meta. `lib/contact-channels.ts` stays plain constants (no env reads, no VPS host).
- Merge to `main` is a production deploy (Vercel `prestigo-site`); the WA-04 switch commit must only merge after the D-06 go-live test passes.

## Sources

### Primary (HIGH confidence)
- Chatwoot source at tag `v4.18.0`, read this session via the GitHub API: `app/controllers/concerns/meta_token_verify_concern.rb`, `app/controllers/webhooks/whatsapp_controller.rb`, `app/services/whatsapp/{manual_setup_service,manual_setup_validation_service,webhook_setup_service,embedded_signup_service,facebook_api_client,manual_webhook_status_service,webhook_channel_finder_service,phone_info_service,health_service}.rb`, `app/services/whatsapp/providers/whatsapp_cloud_service.rb` (`validate_provider_config?`), `app/models/channel/whatsapp.rb`, `app/controllers/api/v1/accounts/inboxes_controller.rb`, `.../concerns/inbox_health_management.rb`, `app/views/api/v1/models/_inbox.json.jbuilder`, dashboard `channels/Whatsapp.vue`, `settingsPage/ConfigurationPage.vue`, `i18n/locale/en/inboxMgmt.json`.
- First-pass reads of Chatwoot at the same tag (templates, automation, teardown, message window), live probes 2026-09-29 (api 4.18.0, webhook verify path 401, unsigned POST 401, legal pages 200).
- Repo files read this session: `lib/contact-channels.ts`, `lib/content-interpolate.ts`, `lib/page-content.ts`, `lib/jsonld.ts` (lines 30-40), `app/[locale]/contact/page.tsx`, `app/[locale]/page.tsx`, `app/llms.txt/route.ts`, `lib/llms-content.ts` (lines 100-110), `components/Footer.tsx` and others via grep, `scripts/i18n-freeze-manifest.mjs`, `scripts/i18n-translate.mjs` (check mode), `i18n/glossary.json`, `i18n/translation-manifest.json` (structure), `.husky/pre-commit`, `.github/workflows/i18n-translate.yml`, `infra/chatwoot/inboxes.json`, `infra/vps/runbooks/chatwoot-channels.md`, `tests/telegram-bot-profile.test.ts` (lines 176-205), `tests/route-page-render.test.tsx` (lines 148-154), `.planning/REQUIREMENTS.md`, `78-CONTEXT.md`, first-pass `78-RESEARCH.md`.
- Inventory command executed: `git grep -nE "725[ -]?986[ -]?855|420725986855" -- . ':(exclude).planning'` plus broader variant `725[^0-9a-zA-Z]{0,3}986|986[^0-9a-zA-Z]{0,3}855|72598|9868 ?55` (no additional files) and a filesystem grep for untracked files.

### Secondary (MEDIUM confidence)
- Meta for Developers (fetched this session): `developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers` (registration steps, PIN, SMS/VOICE, numbers in use must be deleted, `name_status`, lost-PIN reset), `.../documentation/business-messaging/whatsapp/messaging-limits` (newly created portfolios start at 250; scaling paths; portfolio-level; unique users), `.../business-phone-numbers/phone-numbers` (owned, can receive SMS/voice, 2-number cap, PIN required for PIN change and deletion, no deletion within 30 days of paid sends), `.../business-phone-numbers/registration` (register call, 10 requests per 72 h), `docs/graph-api/overview/access-levels` (Standard Access automatic; role users), embedded-signup overview (advanced access needed to onboard business customers; self-onboarding not addressed). First-pass Meta pages: onboarding, templates, pricing, versions, webhooks.
- `docs.360dialog.com/docs/resources/phone-numbers/display-names` (BSP): display-name matching rules, visibility conditions, 30-day change wait after registration, common rejection reasons.
- `faq.whatsapp.com/501866148528310` (greeting/away options, 14-day rule), `faq.whatsapp.com/663543925287107` and `.../639635861080326` (moving between Messenger and Business; page bodies not fully readable).
- Czech operator terms via search summaries of MobilMania, ČTÚ and operator pages (dated).
- edna.io EUR rate card and press on the 2026-10-01 change (first pass).

### Tertiary (LOW confidence)
- Greeting message 140-character figure (search summaries), away-message limit, offline behavior of the away message, `wa.me` check for numbers not on WhatsApp, token prefix `EAA`, template creation rate caps, payment-eligibility error text, variable character restrictions, Chatwoot mobile push on self-hosted, `Channel::Whatsapp.sole` (all in the Assumptions Log).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Nothing new to install; versions verified.
- Onboarding path and signature enforcement: HIGH (source read at the tag); Meta UI steps MEDIUM (Chatwoot's own guide text plus Meta docs).
- WA-04 inventory and design: HIGH (grep plus files read); manifest and snapshot handling HIGH (tool source read).
- Meta eligibility and display name: MEDIUM to LOW (partly unreadable Meta pages, BSP sources).
- Pricing: MEDIUM. Rate card via a BSP republication; effective date is two days after this research; re-verify at launch.
- Pitfalls: MEDIUM-HIGH. Code-derived ones are HIGH; SIM/operator and Meta policy ones depend on live attempts.

**Research date:** 2026-09-29 (revised)
**Valid until:** 2026-10-06 (7 days: Meta pricing changes on 2026-10-01; Meta help pages are moving)
