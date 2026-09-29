# Phase 78: WhatsApp Cloud API Channel (Dedicated Number) - Context

**Gathered:** 2026-09-29
**Revised:** 2026-09-29. The owner dropped Coexistence. The current number +420 725 986 855 was originally the owner's personal number and stays personal. A **new dedicated business number** goes on the Cloud API instead.
**Status:** Ready for re-research and replanning

> The directory slug still says `coexistence` for path stability only. The phase no longer uses Coexistence.

<domain>
## Phase Boundary

A **new dedicated business number** (a new Czech SIM or eSIM) becomes a Chatwoot WhatsApp inbox through the Meta **WhatsApp Cloud API**.

- The number is API-only. It is never installed in a WhatsApp or WhatsApp Business app.
- Customers' WhatsApp messages to it arrive in Chatwoot and are answered from Chatwoot.
- The site stops publishing the owner's personal number anywhere. Every public contact surface switches to the new number.
- The personal number gets a transition auto-reply pointing customers to the new number, then returns to personal use.
- Pre-approved outbound templates let the operator reach a customer outside the 24-hour window.
- A runbook covers recovery, current per-message pricing, the never-delete-an-inbox-without-a-fresh-backup rule, and the related operating procedures.

Requirements: WA-01, WA-02, WA-03, WA-04.

NOT in this phase:
- Instagram / Facebook inboxes (Phase 79). The new Meta app created here is reused there.
- Automatic, booking-triggered WhatsApp sends such as reminders or driver details (needs the Phase 82 outbox plus an opt-in design).
- Contact dedup / E.164 normalization across channels (Phase 82).
- Conversation → CRM lead webhooks (Phase 83).
- Booking sidebar / one-click payment-link generation (Phase 84).
- Migrating or importing the personal number's WhatsApp history. It stays on the owner's phone.
- Updating off-site listings: Google Business Profile, directories, partner hotels, printed material. These go on an owner checklist in the runbook and are not repo work.

</domain>

<decisions>
## Implementation Decisions

### Number & Meta onboarding (WA-01)
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

### Outbound templates (WA-02)
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

### Operating rules
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

### Cost & runbook (WA-03)
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

### Site number switch (WA-04)
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope & requirements
- `.planning/ROADMAP.md` §"Phase 78: WhatsApp Cloud API Channel (Dedicated Number)": goal and 4 success criteria
- `.planning/REQUIREMENTS.md`: WA-01..04, and the Out of Scope row about not moving the personal number to the API
- `.planning/PROJECT.md`: v4.0 constraints

### Research
- `.planning/phases/78-whatsapp-cloud-api-channel-coexistence/78-RESEARCH.md` was written for the Coexistence approach. Its findings on Chatwoot v4.18 templates, delayed automation, inbox deletion side effects, the Graph API, pricing, the webhook signature pitfall and runbook placement still apply. Coexistence-specific sections are superseded and need re-research for the dedicated-number path.
- `.planning/research/PITFALLS.md`: Pitfall 2 (display name), 4 (24h window/templates), 5 (pricing), 15 (inbox deletion cascade)

### Prior phases
- `.planning/phases/77-chatwoot-deployment-core-channels/77-CONTEXT.md`: D-17/D-18 (7-locale templates as code, price-free), D-20/D-21 (labels, auto-assign, teams)
- `.planning/phases/76-vps-infrastructure/76-CONTEXT.md`: pinned Chatwoot version, backups, monitoring, VPS isolation guard
- `infra/vps/chatwoot/compose.yml`: Chatwoot `v4.18.0-ce`
- `infra/vps/runbooks/chatwoot-channels.md`, `upgrade.md`, `backup-restore.md`, `monitoring.md`, `app-deploy.md`
- `infra/chatwoot/*`: config-as-code pattern, price-free guard
- `tests/infra-vps-isolation-guard.test.ts`: must stay green

### Site number surfaces (WA-04)
- `lib/contact-channels.ts`, `lib/jsonld.ts`, `lib/email.ts`, `lib/llms-content.ts`
- `components/Footer.tsx`, `components/HeroWhatsApp.tsx`, `components/ContactForm.tsx`, `components/booking/steps/Step2DateTime.tsx`
- `app/[locale]/page.tsx`, `app/[locale]/contact/page.tsx`, `app/[locale]/privacy/page.tsx`
- `content/pages/{en,ru,es,fr,ar,hi,zh}/*.json`, `i18n/*`
- tests and snapshots referencing the number: `tests/book-page-render.test.tsx`, `tests/contact-form.test.tsx`, `tests/routes-hub-render.test.tsx`, `tests/telegram-bot-profile.test.ts`, `tests/__snapshots__/*`. Golden snapshots must keep normalizing `priceValidUntil`.
- Find the full list with: `git grep -lE "725[ -]?986[ -]?855|420725986855" -- . ':(exclude).planning'`

</canonical_refs>

<code_context>
## Existing Code Insights

- `infra/chatwoot/sync.mjs` + `lib/client.mjs`: idempotent config sync with token redaction; extend it for the WhatsApp inbox, `ch-whatsapp`, and the channel and window rules.
- `infra/chatwoot/canned-responses/*.json`: 7-locale source wording for the templates.
- `.husky/pre-commit`: currency guard on `infra/chatwoot/**`, plus the secret scan, which must also catch Meta tokens.
- `lib/contact-channels.ts` (`WHATSAPP_CHAT_URL`) is the natural home for the number constants (D-22).
- About 54 tracked files currently contain the personal number: code, 7-locale content, tests and snapshots.
- Secrets only in env/owner config (`~/.config/prestigo/*.env`, mode 600). The owner types tokens into the Chatwoot UI.
- Owner-performed external steps are delivered as exact checklists in `76-OWNER-ACTIONS.md` style.

</code_context>

<specifics>
## Specific Ideas

- The owner's personal number must disappear from the public site. This is the reason for the switch.
- Display name exactly "Prestigo - Premium Chauffeur Service Prague". On rejection, ask the owner.
- Template set and languages mirror the Phase 77 canned responses.
- Owner priorities still apply: never lose a lead (hence the transition auto-reply and off-site checklist), maximum analytics data, one customer = one card (Phase 82).

</specifics>

<deferred>
## Deferred Ideas

- Automatic booking-triggered WhatsApp sends: need the Phase 82 outbox plus opt-in.
- Spend alerting.
- WhatsApp Calling API on the business number.
- Coexistence on the personal number: rejected by owner decision on 2026-09-29.

</deferred>

---

*Phase: 78-whatsapp-cloud-api-channel-coexistence*
*Context gathered: 2026-09-29; revised 2026-09-29 (dedicated number)*
