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
