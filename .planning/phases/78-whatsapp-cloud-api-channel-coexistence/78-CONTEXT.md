# Phase 78: WhatsApp Cloud API Channel (Coexistence) - Context

**Gathered:** 2026-09-29
**Status:** Ready for planning

<domain>
## Phase Boundary

The existing WhatsApp Business number **+420 725 986 855** becomes a Chatwoot inbox through the Meta **Cloud API in Coexistence mode**.

- Customers' WhatsApp messages arrive in Chatwoot and are answered from Chatwoot.
- The WhatsApp Business app on the owner's phone keeps working with the same number and its full history. There is no hard-cutover migration.
- Pre-approved outbound templates let the operator reach a customer outside the 24-hour window.
- A runbook covers recovery, current per-message pricing, the never-delete-an-inbox-without-a-fresh-backup rule, and the related operating procedures.

Requirements: WA-01, WA-02, WA-03.

NOT in this phase:
- Instagram / Facebook inboxes (Phase 79). The new Meta app created here is reused there.
- Automatic, booking-triggered WhatsApp sends such as reminders or driver details (needs the outbox, Phase 82, plus an opt-in design).
- Contact dedup / E.164 normalization across channels (Phase 82).
- Conversation → CRM lead webhooks (Phase 83).
- Booking sidebar / one-click payment-link generation (Phase 84).
- Changes to the site's `wa.me/420725986855` links. The number is unchanged, so the links keep working as they are.

</domain>

<decisions>
## Implementation Decisions

### Meta assets & onboarding path (WA-01)
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

### Outbound templates (WA-02)
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

### Phone ↔ Chatwoot operating rules
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

### Cost & runbook (WA-03)
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope & requirements
- `.planning/ROADMAP.md` §"Phase 78: WhatsApp Cloud API Channel (Coexistence)": goal and 4 success criteria
- `.planning/REQUIREMENTS.md`: WA-01..03, and the Out of Scope row "Hard WhatsApp number migration" (Coexistence only)
- `.planning/PROJECT.md`: v4.0 constraints (VPS independence, secrets only in env, Supabase source of truth)

### Research (milestone-level)
- `.planning/research/PITFALLS.md`:
  - Pitfall 1: hard cutover vs Coexistence
  - Pitfall 2: Meta verification / display-name rejection
  - Pitfall 4: 24h window and template pre-approval
  - Pitfall 5: per-message pricing, the 2026-10-01 service-message charge and the 1,000 free tier
  - Pitfall 15: inbox deletion cascade
  - Recovery table
- `.planning/research/FEATURES.md`: Chatwoot WhatsApp Cloud API inbox row (Coexistence, Tech Provider / manual fallback needs phone number ID, WABA ID, token, webhook)
- `.planning/research/SUMMARY.md`: key risk #1 and #2
- External links collected there (researcher to re-verify, since 2025–2026 info changes fast):
  - Meta "Onboard WhatsApp Business app users" (embedded-signup coexistence)
  - Meta WhatsApp pricing
  - Chatwoot WhatsApp embedded-signup developer docs
  - Chatwoot WhatsApp manual-flow guide
  - Chatwoot WhatsApp templates guide
  - chatwoot/chatwoot#15695

### Prior phases (what this builds on)
- `.planning/phases/77-chatwoot-deployment-core-channels/77-CONTEXT.md`: D-12 (one working client, webmail emergency rule, mirrored here for phone vs Chatwoot), D-17/D-18 (7-locale templates as code, price-free, synced), D-20/D-21 (labels, auto-assign, teams)
- `.planning/phases/76-vps-infrastructure/76-CONTEXT.md`: pinned Chatwoot version, backups, monitoring/alerts, VPS isolation guard
- `infra/vps/chatwoot/compose.yml`: deployed Chatwoot `v4.18.0-ce` (the version to check for coexistence and template support)
- `infra/vps/runbooks/chatwoot-channels.md`: channel inventory and mailbox rules. Extend it with WhatsApp; it currently says "WhatsApp is not a Chatwoot inbox yet".
- `infra/vps/runbooks/upgrade.md`: the only allowed path if a Chatwoot upgrade is needed
- `infra/vps/runbooks/backup-restore.md`, `infra/vps/runbooks/monitoring.md`: backup-before-inbox-change rule, VPS-down alert
- `infra/vps/runbooks/app-deploy.md`: notes that Chatwoot must receive Meta/WhatsApp webhooks (public reachability of chat.rideprestigo.com)
- `infra/chatwoot/README.md`, `infra/chatwoot/sync.mjs`, `infra/chatwoot/lib/client.mjs`, `infra/chatwoot/inboxes.json`, `infra/chatwoot/labels.json`, `infra/chatwoot/automation-rules.json`, `infra/chatwoot/canned-responses/*.json`: config-as-code pattern and price-free guard to extend
- `tests/infra-vps-isolation-guard.test.ts`: must stay green. No site code path calls Chatwoot/Meta synchronously.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `infra/chatwoot/sync.mjs` + `lib/client.mjs`: idempotent config sync with token redaction. Add the WhatsApp inbox settings, the `ch-whatsapp` label and the channel/window rules here.
- `infra/chatwoot/canned-responses/{time-change,vehicle-change,payment-help,review-request,login-help}.json`: existing 7-locale texts, the source wording for the WhatsApp templates (booking change, payment help, review).
- `.husky/pre-commit` currency guard on `infra/chatwoot/**` `.json`/`.md`: extend it to cover the template source.
- `lib/contact-channels.ts` (`WHATSAPP_CHAT_URL`): the site's WhatsApp link, unchanged.
- Invoice PDFs come from `generate_invoice_*.py` in the owner's ops folder (`~/Desktop/founder prestigo/`, outside this repo). Their output is what the operator attaches to the invoice template.

### Established Patterns
- Git is the source of truth for Chatwoot config. UI-only edits are drift; `--dry-run` comes first, and a second run must show no changes.
- Secrets only in env/owner config (`~/.config/prestigo/*.env`, mode 600). Owner types tokens into the Chatwoot UI. Pre-commit secret scan.
- Owner-performed external steps (Meta UI, BotFather, hPanel) are delivered as exact checklists (`76-OWNER-ACTIONS.md` style).
- No hard-coded prices anywhere in templates.

### Integration Points
- Meta webhooks → `https://chat.rideprestigo.com` (Chatwoot's WhatsApp webhook endpoint). Caddy/TLS from Phase 76 must expose it.
- Meta Graph API (WABA message_templates) is used by the template script from the owner's machine only.
- Chatwoot WhatsApp inbox → automation (label, assignment) → reports (per-channel stats from Phase 77 D-22 now include WhatsApp).

</code_context>

<specifics>
## Specific Ideas

- Display name exactly "Prestigo - Premium Chauffeur Service Prague". On rejection, ask the owner.
- The owner wants none of the live number's history or reachability lost. The two-direction test plus rollback is the acceptance gate.
- Template set and languages mirror the Phase 77 canned responses, so the operator sees the same wording on every channel.
- The owner's broader priorities (from Phase 77) still apply: never lose a lead, collect maximum data for analytics, one customer = one card (Phase 82).

</specifics>

<deferred>
## Deferred Ideas

- **Automatic WhatsApp sends triggered by bookings** (trip reminder, driver details, payment received): needs the Phase 82 outbox and a customer opt-in design. Candidate for a post-82 phase.
- **Spend alerting** (Telegram alert when monthly WhatsApp spend exceeds a threshold): not needed now. Revisit if volume grows.
- **Business verification** proactively, if it turns out not to be required now. Revisit before Phase 79 if IG/FB App Review needs it.
- **Chatwoot greeting/away messages for WhatsApp**: not used while the phone app's auto-replies stay active.

</deferred>

---

*Phase: 78-whatsapp-cloud-api-channel-coexistence*
*Context gathered: 2026-09-29*
