# WhatsApp channel runbook (Cloud API, dedicated business number)

Operator runbook for the WhatsApp channel of Prestigo. It records how the
channel is wired, how to recover it, what must never be done to it, and the
owner-side procedures around it. It holds names and procedures only: no token,
no app secret, no two-step PIN, and never the owner's former personal number
(that one is only ever called "the owner's former number"). The business number
itself is read from one place in code: `lib/contact-channels.ts`,
`BUSINESS_PHONE_E164`.

Related: `infra/vps/runbooks/chatwoot-channels.md` (channel inventory, mailbox
rules), `infra/vps/runbooks/backup-restore.md` (backups),
`infra/vps/runbooks/monitoring.md` (alerts) and `infra/chatwoot/README.md`
(templates, labels, sync and inspect tooling).

Tools this runbook uses, all run from the owner's Mac in the repo root:

- `node infra/chatwoot/inspect.mjs --whatsapp [--expect-connected]` (read-only health view)
- `node infra/chatwoot/whatsapp-channel.mjs --number | --register | --harden | --probe | --sync-templates | --register-webhook`
- `node infra/chatwoot/whatsapp-templates.mjs --validate | --dry-run | --status | --only <key> | --allow-edit`
- `node infra/chatwoot/sync.mjs [--only ...] [--window-delay-override <minutes>]`

## Channel facts

The facts below never change without a decision recorded in the phase notes.

- The business number lives on the WhatsApp Cloud API only. It is never
  installed in any WhatsApp or WhatsApp Business app, on any phone, ever (D-03).
  A number that is active in an app cannot be registered on the API, and a
  number registered on the API cannot run in an app.
- The Meta app is "Prestigo Messaging", created in the existing Prestigo
  Business portfolio (D-01). The Marketing-API app "Prestigo v2" is not used
  for WhatsApp. The same messaging app is reused for Instagram and Facebook in
  Phase 79.
- Chatwoot side: a manual channel (`manual_setup_v2`) on the inbox named
  `WhatsApp`, labelled `ch-whatsapp`. Chatwoot is the only reply surface (D-13):
  web app or Chatwoot mobile app, nothing else.
- No history import (D-14). The number started empty; the owner's former number
  keeps its own history on the owner's phone.
- Credentials live only in `~/.config/prestigo/meta-whatsapp.env` (mode 600) on
  the owner's Mac and in the password manager. Names: `META_WA_SYSTEM_USER_TOKEN`,
  `META_WA_APP_SECRET`, `META_WA_WABA_ID`, `META_WA_PHONE_NUMBER_ID`,
  `META_WA_GRAPH_VERSION`. The tools read them from that file or the
  environment, never from a command-line argument. The two-step PIN is not in
  that file (see "Two-step PIN and re-registration").
- Chatwoot keeps the channel token and app secret inside its own database,
  which is inside the encrypted nightly backup. Treat backups as secret-bearing.
- The site (Vercel) never talks to Meta or Chatwoot. Only the owner's Mac and
  the VPS do.

## Signature enforcement

Why this matters: a manual Chatwoot channel accepts unsigned webhooks until
`provider_config.app_secret` is set on it. The webhook address contains the
business number, which is public, so without the secret anyone could post a
forged customer message into the inbox. Meta signs every real delivery with the
app secret (`X-Hub-Signature-256`); Chatwoot only checks it when it holds that
secret.

Procedure (owner or operator, from the Mac, token and secret from the env file):

1. `node infra/chatwoot/whatsapp-channel.mjs --harden` merges the app secret
   into the channel's `provider_config` (the request replaces the whole hash, so
   the tool sends the merged hash and keeps `source`). It never prints any
   `provider_config` value.
2. `node infra/chatwoot/whatsapp-channel.mjs --probe` sends three requests to the
   webhook address and expects: unsigned request gives 401, request with a wrong
   signature gives 401, correctly signed request gives 200. The signed probe
   carries a payload with no message in it, so nothing lands in the inbox.
3. `node infra/chatwoot/inspect.mjs --whatsapp` must show
   `signature_secret_configured` true.

Re-run both `--harden` and `--probe` after any credential change: a new token,
a reset app secret, an inbox that was re-created, or a Chatwoot upgrade.

If the admin API refuses the update, the fallback is a one-line `rails runner`
inside the Chatwoot rails container that merges the app secret into the
channel's provider configuration and saves it. That needs VPS SSH, which is
blocked for automated sessions unless the owner has added an allow-rule, so the
owner runs it or grants the rule first. The secret is passed through the
container environment, never typed into a command line that is logged.

## Recovery

Work through these in order. Each step is non-destructive. Stop as soon as the
channel is healthy again.

1. Read the state: `node infra/chatwoot/inspect.mjs --whatsapp`. It prints only
   booleans, enums and counts: connection status, quality rating, messaging
   limit tier, display name status, `signature_secret_configured`,
   `verification_pin_stored`, template counts. Add `--expect-connected` to make
   the exit code non-zero when the number is not connected.
2. Webhook lost or inbound stopped: `node infra/chatwoot/whatsapp-channel.mjs
   --register-webhook` re-registers the callback and the app subscription. This
   is Chatwoot's own recovery action; it does not touch conversations.
3. Sends fail with an authorization error (Meta error code 190): the token is
   revoked or expired. Rotate it (see "Token and app rotation"). In Chatwoot
   open Settings, Inboxes, WhatsApp, Configuration and use the "Update API key"
   field. That field keeps the app secret and everything else in the channel
   configuration.
4. Templates missing or stale in the composer: `node
   infra/chatwoot/whatsapp-channel.mjs --sync-templates` (Chatwoot also syncs
   them about every 3 hours by itself).
5. Number shows as not connected on Meta's side: re-register it with the
   owner's PIN (see "Two-step PIN and re-registration"). Meta allows 10
   registration calls per number per 72 hours, so read the status first and do
   not loop.
6. After every fix run `--probe` and then send one test message from a second
   phone in both directions.

Only if all of the above fail, and only after a fresh, verified backup, may
anyone consider re-creating the inbox. That is a last resort: read the next
section first.

## Never delete the WhatsApp inbox without a fresh backup

This is a hard rule.

- Never delete the WhatsApp inbox in Chatwoot, and never deregister the number,
  as a way to "fix" something. Deleting an inbox cascades: every conversation,
  message and contact history of that inbox is destroyed, and Chatwoot's
  teardown on delete tears down the webhooks and can deregister the number and
  unsubscribe the app. Customers who write next get nothing until the whole
  channel is rebuilt.
- Before any deletion or re-creation, take a fresh backup and verify it, exactly
  as `backup-restore.md` describes ("Backup-first rule before any destructive
  admin action"): run the backup on the VPS, confirm the log line ends
  `backup complete: snapshot <id>`, list the snapshot, and only then continue.
  A backup older than the last customer conversation is not fresh.
- Prefer every recovery lever in the "Recovery" section first: read the health,
  `--register-webhook`, "Update API key", `--sync-templates`, re-registration.
  None of them removes a conversation.
- If the inbox really must be re-created, export what you need from the backup
  first, expect the number to need registering again with the owner's PIN, and
  run `--harden` and `--probe` on the new inbox before telling anyone it is back.

## VPS down: no phone-app fallback

The business number is in no phone app, so while Chatwoot is unreachable nobody
sees WhatsApp messages. A customer's app still shows "delivered".

While the outage lasts:

- Customers can still call or SMS the SIM, and email still works. Answer the
  phone. Consider a short note on the site or in the Telegram bot description if
  the outage is long.
- The Phase 76 monitors alert on the Chatwoot app check (see `monitoring.md`).
  Confirm the outage with `smoke.sh` before calling it one; a single flap is not
  an outage.
- Fix the VPS using the host runbooks. Do not try to install the number in a
  WhatsApp app "just for now": that would unregister it from the API.

After recovery:

1. `node infra/chatwoot/inspect.mjs --whatsapp --expect-connected`.
2. Meta retries failed webhook deliveries only for a limited window (about 7
   days, not verified), so confirm rather than assume: run `node
   infra/chatwoot/inspect.mjs --activity` and compare the WhatsApp conversation
   count with the outage period. If the callback was lost, run
   `--register-webhook`.
3. Ask the owner to send a test message from a second phone.
4. Look for messages that arrived during the outage and answer them first;
   tell the customer about the delay.
5. Anything answered by phone or email in the meantime goes into the matching
   conversation as a private note.

## Token and app rotation

The Chatwoot channel uses a System User token from the Prestigo Business
portfolio. It is created with expiration "Never" and only two permissions:
`whatsapp_business_management` and `whatsapp_business_messaging`.

Rotate the token when it may have leaked, when someone who knew it leaves, when
sends fail with error code 190, or as part of a yearly review:

1. Business Settings, Users, System users: generate a new token for the same
   system user (expiration Never, the two permissions above). Copy it straight
   into the password manager.
2. Chatwoot: Settings, Inboxes, WhatsApp, Configuration, "Update API key". Paste
   the new token. The app secret and the rest of the configuration are kept.
3. Update `~/.config/prestigo/meta-whatsapp.env` (`META_WA_SYSTEM_USER_TOKEN`),
   mode 600, and the password manager entry.
4. Revoke the old token in Business Settings.
5. Run `--harden` and `--probe` again, then `inspect --whatsapp`.

App secret reset (App settings, Basic, reset): the old secret stops verifying
right away, so every real inbound webhook would be rejected with 401 until
Chatwoot holds the new one. Update the env file first, then run `--harden`
straight away, then `--probe`. Do this at a quiet hour and watch `--activity`.

Things that can break delivery without any change on our side: a Business
Manager password change, the system user losing its assignment on the app or
the WhatsApp account, or the app being moved out of Live mode (real-message
webhooks are delivered only to Live apps). If inbound stops and `--probe` is
green, check those three in Meta.

Chatwoot's default Graph API version is older than the one the template tool
uses; review `META_WA_GRAPH_VERSION` and the Chatwoot version when Meta announces
a version expiry.

## Two-step PIN and re-registration

The number has a 6-digit two-step verification PIN. Meta needs it to change the
PIN, to delete the number, and to re-register it.

- The PIN lives only in the owner's password manager. It is never written in a
  file, in a command-line argument, in chat, in a ticket or in Chatwoot. The
  tools ask for it interactively or take it from a variable set for that one
  command; nothing stores it.
- The owner registers the number with their own PIN before Chatwoot is
  connected (`whatsapp-channel.mjs --register`), so Chatwoot does not register it
  with a random PIN of its own.
- Check: `inspect --whatsapp` must show `verification_pin_stored` false. If it
  shows true, Chatwoot registered the number with a random PIN and stored it in
  its own database. Fix: set a new PIN through Meta (the phone-number settings
  call with a `pin` field), write it in the password manager, and note the date
  in the phase notes. Do not rely on the value Chatwoot stored.
- Re-registration (number shows as not connected, or after moving the number
  between apps): read the status first (`whatsapp-channel.mjs --number`), then
  run `--register` once with the PIN. Meta limits registration to 10 calls per
  number per 72 hours.
- Lost PIN: it can be reset through the API with the account's token; the number
  stays registered. Record the new PIN in the password manager immediately.
- An expired one-time verification code does not disconnect a number that is
  already registered.

## SIM custody and the business line

The SIM behind the business number is Prestigo's phone line as well as its
WhatsApp number. The site publishes the number for calls.

- Keep the SIM active. Prefer a postpaid or company tariff billed to the
  company. If it is prepaid, set up an automatic top-up and a recurring calendar
  reminder: Czech prepaid numbers lapse after a period without a top-up, the
  credit is lost, and the number can be recycled to someone else. The operator
  terms differ between O2, T-Mobile and Vodafone and change over time, so re-read
  the chosen operator's current terms once a year.
- Losing or damaging the SIM does not disconnect the API number, and an expired
  one-time code does not either. But any re-verification needs to receive an SMS
  or a voice call on that number, and a recycled number would send that code to a
  stranger while calls meant for Prestigo ring them. Treat a lapsed SIM as an
  emergency.
- The SIM must sit in a device that is answered. Ordinary calls and SMS on the
  SIM are not affected by the API registration; in-app WhatsApp voice calls to
  the number do not work (the Calling API is a deferred idea).
- Who answers the business line, in which hours, and any operator call
  forwarding: the owner's chosen arrangement is recorded here by plan 78-16.
  Until it is recorded, the answer is "not decided", which blocks the public
  number switch.
- If the SIM is stored in a spare phone, that phone must not have WhatsApp
  installed with this number.

## Owner onboarding checklist

The owner performs these Meta and Chatwoot steps once, in this order, from an
exact checklist. Order matters: registering the number with the owner's own PIN
must happen before Chatwoot is connected. Nothing secret is pasted into chat or
git; tokens go straight into the Chatwoot form and the password manager. The
owner facts (display-name status, probe results, messaging tier) are appended to
this section by plans 78-11 and 78-12 when the steps are done.

Before starting:

- The new Czech SIM or eSIM (+420, O2, T-Mobile or Vodafone) is active in a
  device that receives SMS and voice calls. A data-only tourist eSIM does not
  work: Meta cannot verify it.
- The number is not active on any WhatsApp app. A recycled number can still carry
  an old WhatsApp account; open the number's `wa.me` address once and check that
  WhatsApp reports it as not on WhatsApp. If it is on WhatsApp, install WhatsApp
  on a spare phone with that SIM, then delete the account from Settings,
  Account, wait, and retry. Never install WhatsApp on the SIM again once it is on
  the API.
- Prepare a password-manager entry for the PIN and one for the token.

Steps:

1. Create the Meta app "Prestigo Messaging" inside the existing Prestigo Business
   portfolio (D-01). Do not add WhatsApp to the Marketing-API app "Prestigo v2".
   Choose the WhatsApp use case. Make sure a real WhatsApp Business Account
   belongs to the portfolio; the auto-created test account and test number are
   ignored.
2. Switch the app to Live mode with the privacy policy address
   `https://rideprestigo.com/privacy` (D-02). Real-message webhooks are delivered
   only to Live apps.
3. API Setup, "From", Add phone number: enter the business number, the business
   profile, and the display name exactly
   "Prestigo - Premium Chauffeur Service Prague" (D-05). Verify with the one-time code by SMS, or by voice if SMS does
   not arrive. Record `name_status` (`inspect --whatsapp` or the Meta page).
   If Meta rejects the name, stop and ask the owner: there is no automatic
   fallback and Claude never picks a name. Candidates to offer the owner:
   "PRESTIGO" (matches the site casing), "Prestigo Prague", "Prestigo Chauffeur
   Service". Until a name is approved, customers see the number, not the name;
   that is not a launch blocker.
4. Read the state first: `node infra/chatwoot/whatsapp-channel.mjs --number`
   (status, code verification, platform type). If the number is not yet
   connected, register it with the owner's own 6-digit PIN:
   `node infra/chatwoot/whatsapp-channel.mjs --register`. The PIN is typed when
   asked and saved only in the password manager. Registration is limited to 10
   calls per number per 72 hours, so do it once.
5. Business Settings, Users, System users: create an admin system user, assign it
   the app and the WhatsApp account with full control, and generate a token with
   expiration "Never" and the two permissions `whatsapp_business_management` and
   `whatsapp_business_messaging`. Save it in `~/.config/prestigo/meta-whatsapp.env`
   (mode 600) and the password manager. Also save the app secret (App settings,
   Basic), the WhatsApp Business Account ID and the Phone Number ID there under
   the names listed in "Channel facts".
6. Chatwoot, Settings, Inboxes, Add Inbox, WhatsApp, WhatsApp Cloud, manual
   setup: type the account ID, the Phone Number ID and the token. Name the inbox
   `WhatsApp` if the form allows; otherwise `sync.mjs` finds it by channel type.
   Add yourself as an inbox agent if `sync.mjs` did not.
7. Run `node infra/chatwoot/whatsapp-channel.mjs --harden` and then `--probe`
   (see "Signature enforcement"). Both must pass before any real message.
8. Check `inspect --whatsapp --expect-connected`: status connected,
   `signature_secret_configured` true, `verification_pin_stored` false, and
   record the messaging tier (expect the 250 tier). If inbound never arrives,
   set the same callback address and verify token at app level in the Meta
   WhatsApp configuration and subscribe to `messages`.

In parallel, not blocking launch (D-04): start Meta business verification with
the legal entity name chelautotrans s.r.o. and the IČO exactly as they appear on
the site's legal pages. Unverified limits are about 250 business-initiated
unique users per 24 hours and at most 2 numbers, which is far above Prestigo's
volume; user-initiated conversations are not limited. Verification lifts those
limits and is probably needed for Phase 79.

Billing (D-18, one-way): the owner adds the payment card in WhatsApp Manager,
in EUR, before the first template send. The billing currency cannot be changed
later, so the owner confirms EUR before the card is saved. Claude never enters
card data.

Embedded Signup inside Chatwoot is only a documented fallback if the manual
route ever fails; it needs extra Meta login configuration and its Tech Provider
requirements are not confirmed.

Also test, before the site switch: a Chatwoot mobile-app push reaches the owner's
phone, and Chatwoot email notifications for new WhatsApp conversations go to the
owner's personal address (never info@ or bookings@, see `chatwoot-channels.md`).
With no phone-app fallback, a missed notification is a lost lead.

## Pricing and the monthly check

Meta charges per delivered template message. The rate depends on the template
category and on the calling code of the recipient. Non-template replies inside
an open 24-hour customer service window were free until the change below.
Messages inside a 72-hour free entry point window (a customer who starts from an
ad or page button) stay free.

Rates as of 2026-09-29, EUR per message, applying from 2026-10-01:

| Recipient market | Marketing (EUR) | Utility (EUR) | Authentication (EUR) | Service (EUR) |
|------------------|-----------------|---------------|----------------------|---------------|
| Czech Republic (priced as Rest of Central and Eastern Europe) | 0.11 | 0.03 | 0.03 | 0.03 |
| Germany | 0.17 | 0.07 | 0.07 | 0.07 |
| United Kingdom | 0.09 | 0.03 | 0.03 | 0.03 |
| France | 0.11 | 0.04 | 0.04 | 0.04 |
| Spain | 0.10 | 0.03 | 0.03 | 0.03 |
| Italy | 0.11 | 0.04 | 0.04 | 0.04 |
| Russia | 0.11 | 0.05 | 0.05 | 0.05 |
| India | 0.03 | 0.01 | 0.01 | 0.01 |
| United Arab Emirates | 0.08 | 0.02 | 0.02 | 0.02 |
| Saudi Arabia | 0.08 | 0.02 | 0.02 | 0.02 |
| United States (North America) | 0.04 | 0.01 | 0.01 | 0.01 |
| China (Rest of Asia Pacific) | 0.11 | 0.02 | 0.02 | 0.02 |

Sources and caveats for the table above:

- Meta's pricing page states the model and the current rate cards; it links
  the EUR rate card as a download, which the tools used here cannot open. The
  figures in the table come from a business-messaging provider's republication of
  Meta's EUR card, whose "after 2026-10-01" table matches the figures checked in
  the phase research on the same day. Treat them as MEDIUM confidence and confirm
  in WhatsApp Manager, Pricing.
- Service messages: from 2026-10-01 Meta charges per message for non-template
  replies inside the 24-hour window (service messages) and for utility templates
  sent inside an open window. By market the service rate equals the utility rate.
  There are no volume tiers for service messages. Replies typed by the operator
  in Chatwoot are API-sent, so they count as service messages.
- The provider's page also says the first 1,000 service messages per month are
  free. That is unconfirmed on Meta's own page. Do not rely on it; check
  WhatsApp Manager, Billing, after the first full month.
- Meta may update rates up to quarterly and publishes changes ahead of time
  (the October 2026 update was due by 2026-09-01). The provider's card may lag.
- Meta can re-categorize a template, and the price follows the category Meta
  assigns, not the one we declared.
- The rows are the countries suggested by the phase research (the site's
  locales and main traveller markets). The booking data could not be queried when
  this was written, so the top calling codes of real bookings have not been
  substituted; replace or add rows when they are known.

The table is re-verified and re-dated at launch, right after the public number
switch, by plan 78-16 (plan 78-17 is the backstop), so the date above always
says when the numbers were last checked.

Estimated monthly spend (assumed volumes, not measured): 150 utility templates a
month to Czech numbers is about 4.50 EUR; 300 utility templates to German
numbers is about 21 EUR; 100 review requests that Meta bills as marketing at the
Czech rate is about 11 EUR. Prestigo's realistic spend is single-digit to low
double-digit EUR a month, and a very busy month stays under about 40 EUR.
Service replies are the wild card from 2026-10-01: at the Czech rate, 1,000
service messages would cost about 30 EUR if none of them were free.

Monthly owner check (D-19): once a month the owner opens WhatsApp Manager,
Billing, and looks at the month's charges by category and country. If the total
is well above the estimate, look for review requests billed as marketing or for
templates sent to many recipients by mistake. There is no spend alerting.

## Templates, quality rating and messaging limits

There are 8 templates in 7 languages (56 submissions), kept as code under
`infra/chatwoot/whatsapp-templates/` and price-free by design. Meta language
codes: `ar`, `zh_CN` (the site's `zh`), `en`, `fr`, `hi`, `ru`, `es`. The
Meta name is the same for all seven languages of a template.

Workflow, run from the owner's Mac:

1. `node infra/chatwoot/whatsapp-templates.mjs --validate` (local rules: name,
   lengths, variables, examples, buttons; no network).
2. `node infra/chatwoot/whatsapp-templates.mjs --dry-run` (reads Meta, prints the
   plan, changes nothing).
3. The real run (no flag). A second run right after must report nothing to create.
4. `node infra/chatwoot/whatsapp-templates.mjs --status` for approval states, and
   `--only <key>` to work on one template.
5. `node infra/chatwoot/whatsapp-channel.mjs --sync-templates` so Chatwoot
   picks up the approved ones.

Rules:

- Never delete a template. Deleting blocks that name for 30 days.
- An approved template is never edited by default. An edit needs
  `--allow-edit`; Meta allows 1 edit per 24 hours and 10 per 30 days, and each
  edit sends it back to review. The category cannot be edited.
- Rejected: read `rejected_reason` in `--status`, fix the copy (or drop a button
  type Meta does not accept, D-11) and run again.
- Paused or disabled: Meta paused it for quality. Check recent customer feedback
  and the quality rating below before resuming.
- Meta may re-categorize a utility template as marketing; the price follows.
  Record the category Meta assigns and write requests such as review asks as
  "about your trip" so they read as utility.
- The invoice template has no PDF header: an invoice PDF is a private file and a
  header needs a public link. Send the text template, then attach the PDF as a
  normal attachment once the customer replies and the window is open.
- Templates can only be chosen by the operator in the Chatwoot composer (D-12);
  nothing sends them automatically.
- Variables must be short and single-line. Chatwoot strips angle brackets and
  quotes from variable values.

Quality rating and messaging limits: `node infra/chatwoot/inspect.mjs
--whatsapp` shows the quality rating and the messaging tier. Look at it weekly.
A falling rating (customers blocking or reporting) can pause templates and lower
the limit. The unverified tier is about 250 business-initiated unique users per
24 hours, far above Prestigo's needs.

## Window-closing label

WhatsApp only lets the operator send a free-form reply within 24 hours of the
customer's last message (D-16). Chatwoot shows the window indicator itself and
insists on a template after it closes. On top of that, a delayed automation
adds the label `wa-window-closing` to a WhatsApp conversation 20 hours (1,200
minutes) after an incoming message if no operator has replied; any operator
reply clears it. That leaves about 4 hours to answer.

- The rules and the label live in `infra/chatwoot/` and are applied by
  `node infra/chatwoot/sync.mjs`.
- Chatwoot needs the account feature flag `delayed_automations` switched on
  (it is off by default). Until it is on, `sync.mjs` skips the delayed rule
  instead of failing; the window indicator alone still works.
- 10-minute live test: run `node infra/chatwoot/sync.mjs --window-delay-override
  10`, send a message from a second phone, do not reply, and confirm the label
  appears after about 10 minutes; then reply and confirm it disappears.
- Restore the normal delay: run `node infra/chatwoot/sync.mjs` without the
  override, then run it once more and expect `create=0 update=0`. Never leave the
  10-minute override in place: it would label every conversation.

## Personal number transition

The owner's former number is being retired from every public surface (D-21).
For 1 to 3 months it stays reachable and points people to the business number
(D-23). This is owner-performed on the owner's phone, not repo work.

1. On the former number, in the WhatsApp Business app, set an Away message with
   schedule "Always send" and recipients "Everyone". A greeting message alone is
   limited (about 140 characters, sent once per 14 days per person), so use the
   away message and keep the text short anyway.
2. Text: Claude drafts one short message in the main customer languages (English
   first, then Russian and the other site languages that fit the counter), with
   no prices and no marketing, in the form "Prestigo has a new WhatsApp number:
   the business number. Please write there." The number becomes tappable in the
   chat. The final text, the end date and the business-line arrangement are
   recorded here by plan 78-16, where the owner also confirms the away message is
   live; plan 78-17 records the live date and the checklist status.
3. Test from a second phone: send a message to the former number and confirm the
   away message arrives and how quickly. Whether it still fires when the phone is
   offline is unverified.
4. Put the end date in a calendar reminder.
5. Return to plain WhatsApp after the period: first take a full chat backup, then
   install and verify plain WhatsApp on the same number with the same Google Drive
   or iCloud account and restore. Business-only data (business profile, catalog,
   labels, automated messages) does not carry over, and the auto-reply ends at that
   moment. The owner may instead keep the Business app for good if they never want
   to lose the auto-reply.
6. People who still hold the old number (saved contacts, old emails and invoices,
   partner hotels, listings) keep writing to it for months, which is why the
   off-site checklist below exists.

| Fact | Value | Recorded by |
|------|-------|-------------|
| Away message text (final) | pending | plan 78-16 |
| Transition end date | pending | plan 78-16 |
| Away message confirmed live on | pending | plan 78-16 / 78-17 |

## Off-site listings checklist

The repo cannot change these; the owner does (D-24). Until they show the
business number, keep the transition away message in place. Tick each when done
and date it.

- Google Business Profile: phone number and the WhatsApp/chat button.
- Directories and review sites (travel, chauffeur and airport-transfer
  listings, map apps): every listing that shows a phone number.
- Every place that lists the number for partners: send the new number to the
  partner hotels and other partners, and have the old one removed from their
  materials and booking sheets.
- Printed material: the business cards, flyers and any QR codes that point to
  `wa.me` with the former number. Reprint before the stock runs out.
- All email signatures, on every mailbox and mail client, and any signature in
  Chatwoot canned responses typed by hand (the ones kept in the repo are
  number-free).
- Invoice scripts in the owner's ops folder (`generate_invoice_*.py`) and their
  templates.
- The root-level owner scripts `send-*.mjs` in the repo folder (for example the
  time-change, vehicle-change and payment-help email senders). They are
  untracked owner tools and still contain the owner's former number.
- Telegram bot profile: the bot's name and description come from
  `infra/chatwoot/telegram/set-bot-profile.mjs`, which reads the site's WhatsApp
  link. Re-run it after the public switch ships so the bot shows the new number.
- Facebook Page and Instagram profile: the contact buttons, the WhatsApp button
  and the "Contact info" fields.
- Stripe: the business support phone and the receipt and invoice branding.
- The WhatsApp Business profile on the former number (the away message covers
  it, but the profile text may show the old number too).
- Search engines cache structured data and FAQ text for weeks. After the deploy,
  confirm `/llms.txt` and one route page show the new number, and request a
  re-crawl with the IndexNow script.
- Text typed into third-party tools that git does not hold: Supabase content
  rows and Chatwoot texts typed in the UI (greetings, widget copy). Search them
  once for the former number when the switch is done and update any hit.
