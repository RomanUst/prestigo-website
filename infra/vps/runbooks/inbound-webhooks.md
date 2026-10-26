# Runbook: Inbound webhooks, Chatwoot and EspoCRM to the site (Phase 83)

Owner-facing. Capture is OFF until the go-live switch (`integration_config.chat_hooks_start`) is set, see section 4.
Companion to [crm-sync.md](crm-sync.md) (Phase 82: site to CRM sync, outbox, erasure) and
[lead-capture.md](lead-capture.md) (Phase 81: form leads, QStash, daily sweep). Names only below: no secret value,
no customer address and no price ever goes into this file (a test pins that).

## 1. What it does

```
Chatwoot account webhook ──► /api/webhooks/chatwoot ─┐   verify the signature, drop echoes and noise,
EspoCRM Contact.update   ──► /api/webhooks/espocrm  ─┤   record the delivery, write ONE outbox row (ids only)
                                                     ▼
                                   outbox hook.* row ──► QStash ──► dispatcher (the only code that talks to the CRMs)
```

- The receivers only verify and enqueue (D-15). They never call Chatwoot or EspoCRM. The dispatcher re-reads the
  current state of both systems on every run, so a late or repeated delivery cannot write stale data.
- Five outbox event types carry the work (shown on /admin/outbox as readable names):

| Event type | Shown as | Trigger | Result |
|---|---|---|---|
| `hook.chat_intake` | Chat intake | first incoming message of a conversation | identity, EspoCRM Contact and one chat Lead (or an append) |
| `hook.chat_resolve` | Chat resolved | conversation resolved | one history Note on the Contact (or the Lead) |
| `hook.chat_label` | Chat no-lead label | label `no-lead` added | the chat Lead is set to Dead |
| `hook.chat_contact` | Chatwoot contact edit | operator adds an email or phone to a Chatwoot contact | Contact found or created, open chat Lead linked |
| `hook.espo_contact` | EspoCRM contact edit | human edit of name, phone or company in EspoCRM | pushed to the linked Chatwoot contact |

- Secrets and ids (names only): `CHATWOOT_WEBHOOK_SECRET`, `CHATWOOT_WEBHOOK_SECRET_PREVIOUS`, `ESPOCRM_WEBHOOK_SECRET`,
  `ESPOCRM_WEBHOOK_SECRET_PREVIOUS`, `ESPOCRM_WEBHOOK_ID`, all in Vercel Production. Go-live switch: `chat_hooks_start`.
- Delivery records live in `public.webhook_deliveries` (ids and hashes only, no names, no message text). The daily
  sweep (`/api/cron/outbox-sweep`) purges them: Chatwoot rows after 7 days, EspoCRM rows after 30 days. A purge
  problem shows as `webhook_purge_failed` in the sweep response `errors`; the sweep reports the number of deleted
  rows as `webhook_purged` and every other sweep step still runs.
- Verification (HMAC) differs per system. Chatwoot: signature over timestamp plus body, timestamp window 300 s, delivery
  id dedup. EspoCRM carries no timestamp and no delivery id, so the replay protection is a content-hash dedup of each
  item (1 hour, EspoCRM's retry horizon; migration 079), the handlers re-reading current state, a narrow event surface (Contact edits only) and `skipOwn`
  (D-19).

## 2. When a chat becomes a Lead

The rules are applied by the dispatcher (`hook.chat_intake`), never by the receiver:

- A Lead is created on the customer's first incoming message (D-03). A conversation where nothing was written creates
  nothing. The first message goes into the Lead description, shortened.
- "Unknown person" means no site booking, no site account and no existing EspoCRM Contact (D-01). A known customer
  starting a chat creates nothing at the start (D-06); only the resolve history entry is written later.
- One open chat Lead per person (D-02): further conversations of the same person are appended to it as a note and a
  reference. After the Lead is Converted or Dead, the next conversation creates a new Lead.
- No email and no phone (for example Telegram): the Lead is created without a Contact (D-04). The Contact appears once
  the operator types an email or phone into the Chatwoot contact (D-12). A Contact is never created from a name alone.
- A paid site booking with the same email or phone later converts the open chat Lead to Converted (D-05).
- Capture is forward-only: conversations that started before `chat_hooks_start` are skipped (`before_start`).

### Deviation from D-07 (spam filter), decided as D-18

The original idea was to filter bulk mail by mail headers (`Precedence`, `List-Unsubscribe`). Chatwoot drops those
headers before the webhook, so they cannot be used. What is filtered automatically instead:

- messages Chatwoot itself flags as an auto-reply (`filtered_auto_reply`);
- senders that look like a no-reply address (`filtered_no_reply`);
- senders on our own domain (`filtered_own_domain`).

Everything else that is not a real enquiry (newsletters, notifications) needs the owner or an operator to add the
Chatwoot label `no-lead` to the conversation. The label moves an already created chat Lead to Dead; it never touches
a Lead that came from the website form. If the label is added before the Lead exists, no Lead is created
(`no_lead_label`). The label is created from `infra/chatwoot/labels.json` by `node infra/chatwoot/sync.mjs --only labels`.

### Deviation from D-02 (one chat Lead only), decided as D-20

If the same email already has an open Lead from the website form (not a chat Lead) created in the last 7 days, the
chat does not create a second Lead. It is added to that form Lead as a note with the conversation reference, so one
enquiry stays one Lead. After 7 days a new chat Lead is created as usual.

## 3. Summary note convention

When an operator resolves a conversation, the history entry in EspoCRM shows: channel, dates, message count, topics,
the customer's first message and a link to the conversation. No transcript is copied (D-08).

To add a human summary, write a **private note** in the conversation that starts with `Итог:` or `Summary:` right
before pressing Resolve (D-09). The prefix is removed and the text becomes the `Summary:` line of the entry. If there
are several such notes the last one wins; with no such note there is simply no summary line. Nothing is summarised
automatically. Reopening and resolving again writes a second entry (D-10); a repeated delivery writes nothing.

## 4. Go-live

Do everything in one sitting. All commands run from the repo root on the owner machine; secrets only ever travel
through pipes (never typed, never printed).

1. Apply the config as code (all idempotent):
   - `node infra/chatwoot/sync.mjs --only labels` (creates the `no-lead` label)
   - `node infra/espocrm/sync.mjs --only enums` (chat Lead source values)
   - `node infra/espocrm/sync.mjs --only roles` (Sync writer gets the Webhook scope and stream access)
   - `node infra/espocrm/verify-acl.mjs --role "Sync writer"` must pass.
2. Register the EspoCRM webhook as the API user `prestigo-sync` with `skipOwn` (an admin-created webhook silently loses
   `skipOwn` and would echo every sync write): `node infra/espocrm/webhook.mjs create` prints `webhook=created` and
   `skipOwn=true`. `node infra/espocrm/webhook.mjs list` shows it afterwards.
3. Register the Chatwoot account webhook: `node infra/chatwoot/webhook.mjs ensure` (four subscriptions:
   `message_created`, `conversation_status_changed`, `conversation_updated`, `contact_updated`). A second run prints
   `webhook=unchanged`.
4. Hand the values to Vercel Production through pipes, marked sensitive:
   - `node infra/espocrm/webhook.mjs --print id | vercel env add ESPOCRM_WEBHOOK_ID production --yes`
   - `node infra/espocrm/webhook.mjs --print secret | vercel env add ESPOCRM_WEBHOOK_SECRET production --sensitive --yes`
   - `node infra/chatwoot/webhook.mjs --print secret | vercel env add CHATWOOT_WEBHOOK_SECRET production --sensitive --yes`

   The two `_PREVIOUS` names stay unset until a rotation (section 6). `--print` refuses to run on a terminal.
5. Ship the receivers (merge to main) or redeploy: `vercel redeploy <latest prod url> --target production`.
   Environment values are read only at deploy time.
6. Prove both signature round trips against production:
   - `node infra/espocrm/webhook.mjs probe` must print `verdict=ok`
   - `node infra/chatwoot/webhook.mjs probe` must print `verdict=ok` (status line `200,401,401`).
   Any other verdict: do not switch on; fix first (a redirecting host shows as a non-200 first status).
7. Switch capture on (forward-only from this instant):

```sql
insert into public.integration_config (key, value) values ('chat_hooks_start', now()::text);
```

8. Smoke test with a test conversation from an address you own, then check /admin/outbox for the `hook.*` rows and
   EspoCRM for the Lead. Delete the test Lead and test Contact afterwards.

## 5. Switch off

```sql
delete from public.integration_config where key = 'chat_hooks_start';
```

- The receivers keep verifying signatures and answer `off` (HTTP 200, nothing recorded); they never answer a status
  that makes EspoCRM delete the webhook.
- Rows already queued are skipped by the handlers with `hooks_off` (not an error).
- Events that arrive while off are NOT captured and cannot be replayed. Use section 7 for the gap.
- Resuming means inserting `chat_hooks_start` again. Conversations that started while it was off are skipped
  (`before_start`).
- To stop only one direction: delete that system's webhook (`node infra/chatwoot/webhook.mjs delete <id>` or
  `node infra/espocrm/webhook.mjs delete <id>`; ids from `list`).

## 6. Secret rotation

The receivers accept the current and the `_PREVIOUS` secret of each system, so a delivery signed with the old secret
still verifies while the new one rolls out. Run `probe` after every rotation.

**Chatwoot** (details in `infra/chatwoot/README.md`):

1. Save the current secret as the previous one: `node infra/chatwoot/webhook.mjs --print secret | vercel env add CHATWOOT_WEBHOOK_SECRET_PREVIOUS production --sensitive --yes`.
2. `node infra/chatwoot/webhook.mjs rotate` (deletes and recreates the webhook; Chatwoot generates the new secret).
3. Replace the current value: `vercel env rm CHATWOOT_WEBHOOK_SECRET production --yes`, then pipe the new
   `--print secret` into `vercel env add CHATWOOT_WEBHOOK_SECRET production --sensitive --yes`.
4. Redeploy production, run `node infra/chatwoot/webhook.mjs probe` until `verdict=ok`.
5. A day later remove `CHATWOOT_WEBHOOK_SECRET_PREVIOUS` (redeploy at the next release).

Known gap: from step 2 until the redeploy in step 4 is live, Chatwoot already signs with the new secret while the site
still verifies with the old one. Deliveries in that window answer 401 and Chatwoot never retries them. Keep steps 2 to
4 back to back in a quiet hour and recover anything missed with section 7.

**EspoCRM** (details in `infra/espocrm/README.md`): `create` is idempotent per event and URL, so the new webhook is
registered under a marked URL (the receiver ignores the query string), which leaves no gap:

1. `node infra/espocrm/webhook.mjs create --url "https://rideprestigo.com/api/webhooks/espocrm?v=2"` (overwrites the
   local env file; Vercel still holds the old values).
2. In Vercel copy the old `ESPOCRM_WEBHOOK_SECRET` to `ESPOCRM_WEBHOOK_SECRET_PREVIOUS`, then set the new
   `ESPOCRM_WEBHOOK_ID` and `ESPOCRM_WEBHOOK_SECRET` through the `--print` pipes from section 4.
3. Redeploy, run `node infra/espocrm/webhook.mjs probe` until `verdict=ok`.
4. `node infra/espocrm/webhook.mjs delete <old id>` (id from `list`), later remove the `_PREVIOUS` value.

## 7. Lost events (Chatwoot is at-most-once)

Chatwoot account webhooks are **at-most-once** (D-21): a 5 second timeout, no retry. A receiver outage, a deploy at the
wrong moment, a rejected request or the rotation gap is a lost event. There is no reconcile job yet (backlog item
999.10 in `.planning/ROADMAP.md`); recovery is by hand:

| Lost event | What you notice | Recovery |
|---|---|---|
| `message_created` (intake) | a customer wrote, but there is no Lead in EspoCRM and no `hook.chat_intake` row in /admin/outbox | the next incoming message in the same conversation creates the row again (the handler re-reads the whole conversation). If the customer does not write again, create the Lead in EspoCRM by hand |
| `conversation_status_changed` (resolve) | a resolved conversation has no history entry on the Contact or Lead | reopen the conversation and resolve it again: one new entry is written for the new resolve moment |
| `contact_updated` (D-12) | an email or phone was added to a Chatwoot contact but the chat Lead has no Contact link | change the field and save again (for example remove the email, save, type it again, save) |
| `conversation_updated` (label) | `no-lead` was added but the Lead is still open | remove the label and add it again |
| `Contact.update` from EspoCRM | a name, phone or company edit in EspoCRM did not reach Chatwoot | EspoCRM retries a failed delivery 4 times, every 10 minutes. If all fail, edit the Contact again (any real change). If the webhook itself is gone or disabled, `node infra/espocrm/webhook.mjs list`, and re-create it with `node infra/espocrm/webhook.mjs create` |

Gaps while capture was switched off (section 5) cannot be replayed; use the same table.

## 8. Loop fuse ALERT

Chatwoot contact events carry a fuse: more than 20 deliveries for one entity within 10 minutes are not queued
(outcome `fused`); the same limit applies to one EspoCRM contact. Each fused delivery writes one line to the Vercel
function log:

```
[webhook] ALERT webhook_loop_fused source=<chatwoot|espocrm> entity=<cw:contact:ID|espo:contact:ID>
```

It means two systems keep overwriting each other, or an operator is bulk-editing. The line carries ids only. To look:

- /admin/outbox: recent `hook.chat_contact` / `hook.espo_contact` rows and their codes (`echo` rows are normal).
- Count deliveries per entity (ids and counts only, never read payloads):

```sql
select source, entity_key, count(*) as deliveries
from public.webhook_deliveries
where received_at > now() - interval '1 hour'
group by source, entity_key
order by deliveries desc
limit 10;
```

If one entity dominates, open that contact in both systems and look for an automation or a second integration changing
the same field. To stop the loop at once, switch capture off (section 5). A single ALERT after a bulk edit needs no
action; repeated ALERTs for one entity do.

## 9. Known limitation: same-value re-edit

EspoCRM deliveries are deduplicated by a content hash for 1 hour (migration 079; it was 30 days at go-live). An
EspoCRM edit that produces the same item as one seen in the last hour, for example name X changed to Y and then back to
X within the hour, is dropped as `duplicate`, and Chatwoot keeps the middle value. Any other edit of that Contact (or
repeating the edit after an hour) recovers it. The delivery records themselves are still kept 30 days for the audit;
only the dedup decision looks at the last hour. This does not apply to Chatwoot deliveries (they carry a delivery id).

## 10. Outbox codes

Shown on /admin/outbox (column code) for `hook.*` rows; "skipped" rows are normal outcomes, not failures.

| Code | Meaning | What to do |
|---|---|---|
| `hooks_off` | `chat_hooks_start` is not set | nothing, or switch on (section 4, step 7) |
| `before_start` | conversation started before `chat_hooks_start` | nothing (forward-only) |
| `conversation_missing` | the conversation no longer exists in Chatwoot | nothing |
| `no_incoming_message` | no customer message in the conversation | nothing |
| `no_lead_label` | the `no-lead` label was already on when the first message arrived | nothing, by design |
| `filtered_auto_reply` | Chatwoot flagged the message as an auto-reply | nothing |
| `filtered_no_reply` | sender is a no-reply address | nothing |
| `filtered_own_domain` | sender is on our own domain | nothing |
| `customer` | the person is a site customer; no chat Lead (D-01) | nothing; the resolve entry still lands on their Contact |
| `known_contact` | the person already is an EspoCRM Contact; no chat Lead | nothing |
| `identity_erasing` | the person is being erased | nothing, the row finishes or drops when the erasure ends |
| `contact_pending` | the customer Contact is not synced to EspoCRM yet | nothing, it retries automatically; if it ends as `contact_pending_exhausted`, check the `sync.espo` row of that person |
| `no_target` | resolve found neither a Contact nor a Lead to write the entry on | nothing for filtered or no-lead conversations; otherwise create the Lead by hand |
| `bad_key` | the outbox key is malformed | ask for a code fix |
| `contact_missing` | the Chatwoot contact no longer exists | nothing |
| `echo` | the change was our own write coming back | nothing, this is the loop guard working |
| `no_contact_data` | the Chatwoot contact has no usable email or phone yet | nothing, add one in Chatwoot to link a Contact |
| `cw_ambiguous` | several Chatwoot contacts match one person | merge the duplicates by hand in Chatwoot, then Retry the row |
| `email_owned_elsewhere` | the typed email belongs to another person; nothing was changed | merge or split by hand on /admin/identities |
| `no_label` | the `no-lead` label was removed again before processing | nothing |
| `no_chat_lead` | the conversation has no chat Lead of its own (customer, or the Lead came from the website form) | nothing |
| `lead_not_open` | the Lead was already Converted, Recycled, Dead or deleted | nothing |
| `unlinked` | the EspoCRM Contact is not linked to a Chatwoot contact | nothing |
| `cw_unprocessable` | Chatwoot refused the change | read the contact in Chatwoot, fix the value (a phone already used by another contact is the usual cause), Retry |
| `lead_pending` | another conversation of the same person is still creating the Lead | nothing, it retries automatically |
| `identity_missing` | the EspoCRM Contact has no identity yet | nothing |
| `unsupported_event` | the event type is not handled | ask for a code fix |

Receiver outcomes (Vercel log line `[webhook] source=... outcome=<code>`, never any body content): `queued` (row
written), `exists` (row already there), `duplicate` (delivery seen before), `fused` (loop fuse, see section 8), `off`
(capture switched off), `ignored` (event is not relevant, for example a private note), `echo` (our own write coming
back), `unlinked` (EspoCRM contact without a Chatwoot link), `erasing` (person is being erased). HTTP 401 only ever
means failed authentication (bad signature, stale timestamp or a missing secret in Vercel); 503 means the database call failed and the sender will retry.

## 11. Erasure checklist addition

The erasure (`/admin/erasure`, see crm-sync.md) now also removes the person's chat Leads, chat-created Contacts, history
Notes and registry rows. The EspoCRM step of the audit row reports `notes_deleted` and `notes_skipped`:

- `notes_deleted`: history Notes the system removed.
- `notes_skipped`: Notes the Sync writer is not allowed to delete because a person wrote them by hand. They stay in
  EspoCRM until deleted by hand: open the erased person's former record in EspoCRM as an administrator (or search the
  Notes list), delete those Notes, and note it in the erasure log. A non-zero `notes_skipped` means the erasure is not
  complete until this is done.

## Live contract

What the live systems actually do, confirmed at go-live on 2026-10-26 (plans 83-14 and 83-15). If a later Chatwoot or
EspoCRM upgrade breaks one of these facts, the matching handler degrades and this list is the place to look first.

- **Capture switch.** `chat_hooks_start` was set at 2026-10-26 15:38 UTC. Events older than that are ignored.
- **Receiver latency.** Both receivers answer in well under a second (0.2–0.7 s) on `https://rideprestigo.com`, with
  no redirect. Chatwoot's limit is 5 seconds.
- **Chatwoot payloads.** An incoming visitor message arrives as `message_created` and is queued; a private agent note
  arrives as `message_created` and is ignored with code `private`. Resolving a conversation arrives as
  `conversation_status_changed` and produces the history Note with the right resolved minute. Adding the `no-lead`
  label arrives as `conversation_updated`; label-free updates are ignored with code `no_label`.
- **Website-chat visitors give their email after the first message.** The first message creates the Lead and Contact
  as soon as the email is known; a later `contact_updated` with the email is handled as `hook.chat_contact`.
- **Fingerprint attribute.** Chatwoot accepts and keeps the custom attribute `site_sync_fp` on contacts. Our own
  contact writes come back as `contact_updated` and are ignored (`irrelevant_change` or `echo`).
- **History Note.** The Sync writer can post a Note on a Contact and read the stream, so the duplicate-marker check
  works. The Note's Chatwoot link opens the conversation in the Chatwoot app (account 1, conversation id).
- **EspoCRM webhook.** EspoCRM 10.0.8 sends only the changed attributes of a Contact (an owner name edit produced the
  name-only change mask). The webhook is owned by the Sync writer with `skipOwn` on, so the site's own EspoCRM writes
  never come back. The Sync writer cannot see `userId` on its webhook; `webhook.mjs` checks the owner through
  `createdById`.
- **EspoCRM delivery delay.** The owner's edit reached the site within about a minute.
- **no-lead label.** One label click moved the chat Lead to Dead in EspoCRM and closed the registry row as `dead`.
- **No loop.** In the go-live window every `hook.*` row was sent on the first attempt, no entity had more than two
  deliveries, and there was no `ALERT webhook_loop_fused` line.
