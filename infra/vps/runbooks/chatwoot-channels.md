# Chatwoot channels and the mailbox rules

Operator runbook for the customer channels handled in Chatwoot
(`https://chat.rideprestigo.com`, account 1). It records which channels exist,
the one-mailbox-one-system rule for the two service mailboxes, and the emergency
procedure for when Chatwoot is down. It holds hosts and names only: no mailbox
passwords, no API tokens, no bot tokens. Those stay with the owner (Chatwoot's
database inside the encrypted nightly backup, or `~/.config/prestigo/*.env`
files at mode 600 on the owner's machine).

Related: `infra/chatwoot/README.md` (templates, labels, automation rules, sync
and inspect tooling) and `infra/vps/runbooks/monitoring.md` (alerts).

## Channel inventory

| Chatwoot inbox | Type | Address / entry point | Label |
|----------------|------|-----------------------|-------|
| Website | web widget | rideprestigo.com (loads only after the visitor clicks "Chat on site") | `ch-web` |
| Email info@ | Channel::Email | info@rideprestigo.com | `ch-email` |
| Email bookings@ | Channel::Email | bookings@rideprestigo.com | `ch-email` |
| Telegram | Channel::Telegram | bot @PrestigoChauffeurBot (plan 77-06) | `ch-telegram` |
| WhatsApp | Channel::Whatsapp | the business number (`lib/contact-channels.ts`, `BUSINESS_PHONE_E164`), Cloud API only | `ch-whatsapp` |

The inbox names are a contract with `infra/chatwoot/inboxes.json` and
`infra/chatwoot/automation-rules.json`: exactly `Email info@` and
`Email bookings@`. Rename one in the Chatwoot UI and its channel rule silently
stops matching until sync is edited to follow.

WhatsApp runs as its own Chatwoot inbox on the WhatsApp Cloud API (Phase 78).
Recovery, pricing, token and PIN handling, the never-delete-without-a-backup
rule and the owner checklists are in `infra/vps/runbooks/whatsapp.md`. Until the
public number switch ships, the existing `wa.me` links on the site keep working
as before.

## Email: how it is wired

Each inbox polls its own mailbox over IMAP and replies through the same
mailbox's own SMTP, so a reply always leaves from the address the customer
wrote to.

| Direction | Host | Port | Security |
|-----------|------|------|----------|
| IMAP (in) | imap.hostinger.com | 993 | SSL |
| SMTP (out) | smtp.hostinger.com | 465 | SSL/TLS, OpenSSL verify mode `peer`, domain rideprestigo.com |

Login is the full mailbox address plus that mailbox's password. The owner typed
the passwords into Chatwoot's inbox settings; nobody else handles them. MX
stays at Hostinger (`5 mx1.hostinger.com.`, `10 mx2.hostinger.com.`), so there
is no DNS change for mail.

After an inbox is created or edited, run `node infra/chatwoot/sync.mjs`. It
patches the non-secret settings (auto assignment, business name, sender name
type) and creates the `ch-email` channel rule (label, owner, Bookings team).
A second run must print `create=0 update=0`.

## One mailbox, one system (D-14)

info@ and bookings@ are connected to Chatwoot and to nothing else.

- No forwarder and no autoresponder on either mailbox in Hostinger hPanel.
- No phone Mail app, desktop mail client, or any other IMAP client.
- Never connect them to EspoCRM. The CRM mailbox is roman@ (Phase 80).
- The site sends mail as bookings@ only through Resend (sender and reply-to).
  That is outbound only and is fine; the replies land in Chatwoot.

Audit result at go-live (2026-09-29):

| Check | Finding | Resolution |
|-------|---------|------------|
| Forwarders / autoresponders on info@, bookings@ | none | nothing to remove |
| Apps connected to the mailboxes | only the owner's desktop mail app | owner removed them |
| Third-party accounts using them as login/alert address | UptimeRobot alerts used info@ | moved to the owner's personal address |
| `MANAGER_EMAIL` in Vercel production | was a connected mailbox | changed to the owner's personal address, redeployed |
| Chatwoot administrator email | was info@ (created in Phase 76) | changed to the owner's personal address |

Rule for the future: any account that mails a connected mailbox (alerts,
logins, password resets, notifications) must use an address that is not
info@ or bookings@, otherwise its mail becomes a conversation.

## No Chatwoot agent email on a connected mailbox (loop prevention)

Chatwoot sends notifications and assignment mails to each agent's login email.
If an agent's email were info@ or bookings@, every notification would arrive in
that inbox as a new conversation, which produces another notification, and so
on. So:

- No agent or administrator account may use info@, bookings@, or any other
  mailbox that is connected to an inbox.
- Before adding an agent, check their email against the inbox list in
  `node infra/chatwoot/inspect.mjs --status`.
- roman@ is reserved for EspoCRM and is not used as an agent email either.

## Chatwoot is the only working client (D-12)

Operators answer mail in the Chatwoot web app or the mobile app (server
`https://chat.rideprestigo.com`; push notifications keep the operator reachable).
Replies typed anywhere else are invisible in the conversation thread and in the
reply-time statistics. The WhatsApp business number has no phone-app client at
all (D-13, Phase 78): it is not installed in any WhatsApp app, so Chatwoot is
the only place its messages can be read or answered.

## Webmail emergency procedure

Hostinger webmail stays available as an emergency-only fallback. Use it only
while Chatwoot is down, that is, while the "Chatwoot app" alert from
`monitoring.md` is firing and the outage is not fixed within the time a customer
can reasonably wait.

1. Confirm the outage first (`smoke.sh` from the monitoring playbook). A single
   flap of the health check is not an emergency.
2. Open Hostinger webmail for the affected mailbox and answer the urgent mail
   from that mailbox, so the reply still leaves from the right address.
3. Never delete, move or mark mail as read in a way that hides it. Chatwoot's
   IMAP polling picks up unread mail again after recovery, and deleted mail
   cannot be recovered into a conversation.
4. Do not set up a forwarder or add the mailbox to a mail app "just for now".
   Webmail in a browser tab only.
5. After Chatwoot recovers, paste every webmail reply into the matching
   Chatwoot conversation as a private note (who answered, when, and the text),
   so the thread and the history are complete.
6. Close the webmail tab. The mailbox goes back to Chatwoot as its only client.

## Mail missed during a long outage

Chatwoot's IMAP poll (v4.18, `Imap::BaseFetchEmailService#since`) searches
`SINCE today - 1 day` only. Mail that arrived more than a day before Chatwoot
(or sidekiq) came back is never fetched automatically. After any outage longer
than ~20 hours, or after connecting a mailbox:

1. Diff the mailbox against Chatwoot, read-only: in `chatwoot-rails-1`, open the
   channel's IMAP with `examine('INBOX')`, `search(['SINCE', <date>])`, fetch
   `BODY.PEEK[HEADER.FIELDS (MESSAGE-ID DATE FROM SUBJECT)]` and check
   `inbox.messages.exists?(source_id: message_id)` for each.
2. Import only the wanted messages, oldest first, through Chatwoot's own path:
   `Inboxes::FetchImapEmailsJob.new.send(:process_mail, mail, channel)` with the
   full `BODY.PEEK[]` (PEEK keeps them unread; dedup is by Message-ID, so a
   re-run is safe). Check that no outgoing message was created.

2026-10-01: 16 client mails from 24-27.09 (before the info@ connection) were
imported this way at the owner's request (7 conversations, #51-#57; Kazuaki's
replies threaded into his existing conversation). Spam and test mail stayed in
the mailbox.

## No history import (D-13)

Chatwoot shows mail from the connection date forward. Older mail stays in the
mailbox archive at Hostinger. Past customers reach the contact list through the
Phase 82 backfill, not through a mailbox import.

Go-live observation: when an inbox connects, Chatwoot's IMAP fetch may pull the
messages that were still sitting in the mailbox (about 20 for info@ on
2026-09-29, some labelled `booking-new` by the keyword rules). That is a
behaviour of the IMAP connector, not an import that was run. Do not bulk-delete
those conversations; resolve or label them like any other. To keep the mailbox
clean for a future inbox, archive old mail out of the INBOX folder before
connecting.

## Telegram and templates

The Telegram bot profile (name, description in 7 languages) is applied with
`infra/chatwoot/telegram/set-bot-profile.mjs`. The bot token lives only in
`~/.config/prestigo/telegram-chat-bot.env` and in Chatwoot. Canned-response
templates, labels and automation rules are described in
`infra/chatwoot/README.md`; they are price-free by design.

## Verified 2026-09-29 (Phase 77 UAT)

Owner UAT: steps 1–8 all pass. T0 = 2026-09-29T12:56:20Z.

| Channel | Arrived | Auto label / owner / team | Reply delivered |
|---|---|---|---|
| Website (signed-in + anonymous) | yes (#42, #43 scripted; #44 owner) | ch-web (+payment / b2b by keyword), owner assigned, team bookings / b2b | yes |
| Email bookings@ | yes (#40) | ch-email, owner, team bookings | yes — From bookings@ (owner confirmed in Gmail) |
| Email info@ | yes (#41) | ch-email, owner, team bookings | yes (#41 reply via API, owner confirmed receipt; #36 From info@ confirmed) |
| Telegram (inbox named `PrestigoChauffeurBot`) | yes (#39) | ch-telegram, owner, team bookings | yes (#39 reply via API, owner confirmed receipt in Telegram) |

- Identity (INBOX-03): `inspect --contact <owner sign-in email> --expect-identifier <Supabase auth user id>` → `contact_found=true identifier_matches=true`; no pre-chat email form for the signed-in visitor.
- Continuity (D-04): anonymous chat with an email → Chatwoot reply arrived by email → the email answer landed back in Chatwoot (owner step 5 pass).
- Canned responses (OPS-01): `/short-code` templates used from Chatwoot (owner step 4 pass).
- Reports (INBOX-06): `inspect --report --since 2026-09-28` shows conversations>0 and a first-response time for Website, Email info@, Email bookings@ and the Telegram inbox (reported under its Chatwoot name `PrestigoChauffeurBot`). Native `summary_reports` per inbox and per label show conversations, first-response and resolution times (owner step 7 pass; API readback via `inspect --report`).

Known limitations:
- Pre-chat form field labels are single-language in Chatwoot CE.
- Widget chrome in Hindi: owner reported step 8 pass (accepted as-is).
- Topic labels are additive keyword matches — the operator corrects them.
- Reply time shows "in a few minutes" because Chatwoot's `reply_time` is an enum.
- Team names are stored lower-case by Chatwoot (`bookings`, `b2b`).
- Importing a mailbox pulls its existing INBOX mail into conversations — archive old mail before connecting a new mailbox.
