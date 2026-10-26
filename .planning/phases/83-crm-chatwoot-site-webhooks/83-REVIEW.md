---
phase: 83-crm-chatwoot-site-webhooks
reviewed: 2026-10-26T18:10:29Z
depth: standard
files_reviewed: 35
files_reviewed_list:
  - app/api/cron/outbox-sweep/route.ts
  - app/api/webhooks/chatwoot/route.ts
  - app/api/webhooks/espocrm/route.ts
  - infra/chatwoot/labels.json
  - infra/chatwoot/webhook.mjs
  - infra/chatwoot/webhooks.json
  - infra/espocrm/enums.json
  - infra/espocrm/roles.json
  - infra/espocrm/verify-acl.mjs
  - infra/espocrm/webhook.mjs
  - lib/chat-classify.ts
  - lib/chat-contact.ts
  - lib/chat-intake.ts
  - lib/chat-io.ts
  - lib/chat-payload.ts
  - lib/chat-resolve.ts
  - lib/chat-store.ts
  - lib/chatwoot-sync.ts
  - lib/crm-sync.ts
  - lib/erasure.ts
  - lib/espo-contact-hook.ts
  - lib/espo-payload.ts
  - lib/espocrm-client.ts
  - lib/hook-dispatch.ts
  - lib/identity-store.ts
  - lib/lead-mapping.ts
  - lib/lead-sync.ts
  - lib/outbox-labels.ts
  - lib/outbox.ts
  - lib/sync-origin.ts
  - lib/webhook-store.ts
  - lib/webhook-verify.ts
  - supabase/migrations/076_inbound_webhooks.sql
  - supabase/migrations/077_identity_chat.sql
  - supabase/migrations/078_chat_registry.sql
findings:
  critical: 3
  warning: 7
  info: 5
  total: 15
status: issues_found
---

# Phase 83: Code Review Report

**Reviewed:** 2026-10-26T18:10:29Z
**Depth:** standard (diff against 9c2dcaf4, called functions traced where a finding depended on them)
**Files Reviewed:** 35
**Status:** issues_found

## Summary

The signed-webhook layer is in good shape:
- HMAC is checked over the raw bytes with a constant-time compare.
- Chatwoot has a two-sided 300 s window.
- The receivers fail closed when a secret is missing.
- Size is capped, and only a verified body is parsed.
- One SECURITY DEFINER RPC sits behind each receiver, with an event-type allowlist inside it.
- Every new function has a per-function `REVOKE ... FROM PUBLIC, anon, authenticated` plus `GRANT ... TO service_role`.
- Logs are allowlisted and contain ids only.

I found no problems in the verification primitives themselves.

The defects are in the data layer behind the receivers:

1. **Identity hijack (security).** The chat identity resolver feeds an unverified, visitor-supplied phone into core rule 4. That attaches an attacker-chosen email to another person's (customer) identity.
2. **Silently dropped EspoCRM edits.** The EspoCRM delivery id is a content hash kept for 30 days, so a legitimate repeat of an earlier edit is discarded as a "duplicate".
3. **Wrong-person deletion in GDPR erasure.** The chat erasure scope matches registry rows by Chatwoot contact id with no identity guard. It can delete another identity's EspoCRM Lead and Contact.

The warnings cover:
- Outbox keys that fire once per conversation and can strand the `no-lead` label.
- Races that create duplicate EspoCRM Contacts.
- A partial-failure path that misrecords a chat conversion.
- A rotation procedure that loses webhook deliveries.
- Formatted (Markdown) text in CRM notes written by the visitor.
- Erasure silently skipping stream scrubbing when stream reads return 403.
- An uncapped deadline-reschedule loop.

## Critical Issues

### CR-01: A chat visitor's unverified phone can attach an attacker email to another person's identity (rule-4 merge)

**File:** `supabase/migrations/077_identity_chat.sql:84-112`, `lib/chat-intake.ts:386`, `lib/chat-contact.ts:194`
**Issue:** `identity_resolve_chat` calls `identity_resolve_core(p_email_raw, p_phone_raw, 'chat', NULL)`. In core rule 4 (072), a *new* email plus an un-shared phone owned by exactly one identity J makes the email join J (`basis 'phone'`). The signup guard does not apply because `p_user_id` is NULL, so J can be a customer with an account.

Neither value is verified:
- **Email:** for a web-widget visitor it comes from the pre-chat form. For an Email inbox it is the `From` header.
- **Phone:** `contact.phone` (`lib/chat-intake.ts:282`). The pre-chat form or the visitor sets it.

An attacker who knows a customer's phone number opens the widget, enters their own email and the victim's phone. `identity_resolve_chat` then permanently adds the attacker's email to the victim's identity. What follows:
- `res.customer` is true, so the conversation is recorded as `customer` under the victim (`chat-intake.ts:388-391`).
- Resolve notes containing the attacker's messages land on the victim's EspoCRM Contact (`chat-resolve.ts:67`).
- The next `sync.espo` for the victim adds the attacker's address to the victim's EspoCRM Contact (a channel for booking correspondence).
- An erasure or split keyed on that email now targets the victim.

The migration's own header (lines 18-22) refuses rule 4 for *operator* input ("an operator typo must never join two people"). Visitor input is less trustworthy than operator input, yet it goes through rule 4. The same applies to the operator path `lib/chat-contact.ts:194` for a contact that is not linked yet, which contradicts that header.

**Fix:** Never let chat-sourced data trigger rule 4. Resolve the email alone, then attach the phone only when nobody owns it:
```sql
-- identity_resolve_chat
SELECT r.identity_id, r.outcome INTO v_id, v_outcome
  FROM public.identity_resolve_core(p_email_raw, NULL, 'chat', NULL) r;   -- no phone: rule 4 unreachable
IF v_id IS NOT NULL AND v_outcome = 'resolved' THEN
  v_phone := public.identity_normalize_phone(p_phone_raw);
  IF v_phone IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.phone_flags f WHERE f.phone = v_phone AND f.shared)
     AND NOT EXISTS (SELECT 1 FROM public.identity_phones p WHERE p.phone = v_phone AND p.identity_id <> v_id) THEN
    INSERT INTO public.identity_phones (identity_id, phone) VALUES (v_id, v_phone)
    ON CONFLICT (identity_id, phone) DO NOTHING;
  END IF;
END IF;
```
Also audit the live `identity_emails` rows with `basis = 'phone'` that were created since `chat_hooks_start`, because they may already contain such merges. Remember the `REVOKE ... FROM PUBLIC, anon, authenticated` after `CREATE OR REPLACE` (project rule).

### CR-02: EspoCRM content-hash dedup silently drops legitimate repeated edits for 30 days

**File:** `lib/espo-payload.ts:55-58`, `supabase/migrations/076_inbound_webhooks.sql:181-188`, `app/api/cron/outbox-sweep/route.ts:27`
**Issue:** EspoCRM strips `modifiedAt`/`modifiedBy` from webhook items (83-RESEARCH). An item is therefore just `{id, <changed attributes>}`, and `espoDeliveryId` is a hash of exactly that. `webhook_deliveries` keeps the row for 30 days (`espoDays: 30`).

Example: an owner corrects a phone A→B, then B→A, then A→B again within 30 days. Or a name gets a typo fix that is later redone. The third item hashes the same as the first, so `webhook_ingest_espo` answers `duplicate` and enqueues nothing. Chatwoot keeps the stale value, and no later event repairs it unless the same field is edited again.

The same happens after an `unlinked` or `erasing` outcome: the row is written before the identity lookup (lines 181-202), so the same edit made after the contact is linked is discarded.

The long window does not protect anything. The handler is state-convergent: it re-reads EspoCRM and Chatwoot and writes only differences (`espo-contact-hook.ts:120-134`). A replay of a valid signed body costs one no-op run.

**Fix:** Make the dedup window cover only EspoCRM's retry horizon (4 retries × 10 min). For example, treat an existing row older than 1 hour as new:
```sql
INSERT INTO public.webhook_deliveries (source, delivery_id, entity_key)
VALUES ('espocrm', p_delivery_id, 'espo:contact:' || p_espo_contact_id)
ON CONFLICT (source, delivery_id) DO UPDATE
   SET received_at = now()
 WHERE public.webhook_deliveries.received_at < now() - interval '1 hour';
GET DIAGNOSTICS v_rows = ROW_COUNT;   -- 0 only for a duplicate inside the hour
```
Then the 30-day retention can drop to a few days.

### CR-03: Erasure scope by Chatwoot contact id deletes another identity's CRM Leads/Contacts

**File:** `supabase/migrations/078_chat_registry.sql:405-481`, `lib/erasure.ts` (`chatScopeInput`, `findEspoContacts`, `findEspoLeads`)
**Issue:** `chat_erasure_scope` and `chat_erase` select `chat_leads` / `chat_conversations` where `chatwoot_contact_id = ANY(p_chatwoot_contact_ids)` and do not check `identity_id`.

`contact_identities.chatwoot_contact_id` is not unique (069 line 55). The code expects two identities to share one Chatwoot contact: `identity_by_chatwoot_contact` returns up to 2 rows and the handlers treat 2 as "ambiguous". This can happen through Phase 82 `sync.chatwoot` matching by phone or email, or through a race between `setChatwootContact` calls.

When identity A is erased, the chat Leads, chat-created Contacts and registry rows of identity B on the same Chatwoot contact are all in scope:
- `findEspoLeads` / `findEspoContacts` delete B's EspoCRM Lead and Contact. This is irreversible, and B's own Notes are scrubbed first.
- `chat_erase` deletes B's registry rows.

**Fix:** Match on the Chatwoot contact id only for rows that belong to no identity or to the identity being erased:
```sql
WHERE l.identity_id = p_identity_id
   OR (l.identity_id IS NULL AND l.chatwoot_contact_id = ANY (COALESCE(p_chatwoot_contact_ids, ARRAY[]::bigint[])))
   OR (l.identity_id IS NULL AND l.phone = ANY (COALESCE(p_phones, ARRAY[]::text[])))
```
Apply the same guard to the `chat_conversations` branch and the sub-selects in both functions. Also consider having the erasure saga refuse, or alert, when `identity_by_chatwoot_contact` returns 2 rows for the request's Chatwoot contact.

## Warnings

### WR-01: One-shot per-conversation outbox keys can permanently strand the `no-lead` label (orphan open Lead)

**File:** `lib/sync-origin.ts:73-79`, `lib/chat-contact.ts:390-394`, `lib/chat-intake.ts:270-273`
**Issue:** `hook.chat_intake` and `hook.chat_label` each have exactly one key per conversation (`...:c<n>`), and `outbox_enqueue` is `ON CONFLICT DO NOTHING`. Once either row is done, every later event for that conversation returns `exists` and nothing runs again.

Failure sequence:
1. An intake run creates the EspoCRM Lead and reserves the `chat_leads` row, then hits `DeadlineError` (or `lead_pending`) before `record()`.
2. The lease is released, and the `no-lead` label row (same aggregate mutex) claims next.
3. The label row sees no registry record, finishes as `skipped no_chat_lead`, and is terminal.
4. The re-run intake now sees the label (`chat-intake.ts:270`) and records `no_lead_label`.

The EspoCRM Lead created in step 1 stays open in the CRM, and its `chat_leads` row stays `open`, which blocks the person's slot. Removing and re-adding the label does nothing because the key already exists.

**Fix:** In `ensureIntake`'s `no_lead_label` branch, close any chat Lead this conversation already reserved: look up by `chatLeadRef(aggregateUuid('conversation', id))`, PUT status Dead, then `closeLead(..., 'dead')`. Also give `hook.chat_label` a time-bucketed tag (like `hook.chat_contact`) so a later label event can re-run it.

### WR-02: Concurrent handlers can create duplicate EspoCRM Contacts for one person

**File:** `lib/chat-intake.ts:400-427`, `lib/chat-contact.ts:220-258`, `lib/chat-io.ts:307-344`
**Issue:** The handlers that can create an EspoCRM Contact use different outbox aggregates:
- intake: `chat_conversation`
- chat_contact: `chat_contact`
- Phase 82 sync: `person`

Two conversations of a new person, or an intake running while an operator's `contact_updated` row runs, can both see `findContactIdByEmail` → null and both POST `/Contact`. They send `X-Skip-Duplicate-Check: true`, so EspoCRM does not stop the second one. The second `setEspoContact` overwrites the first, and the orphan Contact keeps the person's email and phone. The phone-only path (`chat-intake.ts:446-459`) has the same race.

**Fix:** Serialise Contact creation per person. One option is a `pg_advisory_xact_lock` that is held while you re-check and store the id, through a Supabase RPC that "claims" the right to create. Another option: drop `X-Skip-Duplicate-Check` on chat Contact creation and converge on the 409. At minimum, re-read `identity.espo_contact_id` after creating, and remove your own Contact if another one won.

### WR-03: `convertChatLeads` partial failure records the conversion as `closed_in_crm` and loses the Note

**File:** `lib/crm-sync.ts` (`convertChatLeads`, the Lead PUT → `postNote` → `closeLead` sequence)
**Issue:** If `postNote` or `closeLead('converted')` fails after `updateLead(status: Converted)` succeeded, the `sync.espo` retry re-reads the Lead. It is no longer open, so the retry takes the `closeLead(lead.chatLeadId, 'closed_in_crm')` branch. The conversion Note is never posted, and the registry row gets `closed_reason = 'closed_in_crm'` with `converted_booking_id = NULL`. The 078 header says Phase 85 counts chat conversions on this table, so the conversion is miscounted.
**Fix:** On re-run, a Lead whose status is `Converted` and whose `cBookingReference` equals a paid booking of this person should be finished as a conversion: post the Note if `streamHasMarker` (or a reference marker) is missing, then `closeLead(id, 'converted', booking.id)`. Alternatively, close the registry row first and make the CRM writes idempotent by marker.

### WR-04: Chatwoot webhook secret rotation drops every delivery until the redeploy

**File:** `infra/chatwoot/webhook.mjs:266-283`, `infra/chatwoot/README.md` (rotation order)
**Issue:** `rotate` deletes the webhook and creates a new one. From that moment Chatwoot signs with a new secret that the receiver does not know: `CHATWOOT_WEBHOOK_SECRET_PREVIOUS` holds the *old* secret, which Chatwoot no longer uses. Until the new secret is piped into Vercel and production is redeployed, every delivery gets a 401. The README says delivery is at most once (no Chatwoot retry), so those messages, resolves and contact edits are lost.
**Fix:** Do the rotation as create-then-switch:
1. Create a second webhook. Two webhooks with the same URL already stop `ensure` with `error=duplicate_webhooks`, so use a distinct URL such as a query suffix, or rely on the outbox key dedup.
2. Add its secret as `CHATWOOT_WEBHOOK_SECRET` with the old one as `_PREVIOUS`, and redeploy.
3. Run `probe`, then delete the old webhook.

Both deliveries of an event dedup at the outbox key (`exists`).

### WR-05: Visitor text is written into Markdown-rendered EspoCRM fields without Markdown neutralisation

**File:** `lib/chat-classify.ts:114-149`, `226-253`
**Issue:** `defang` neutralises only `<` tag openers. EspoCRM renders Markdown in stream `post` and in text fields such as `description`. A visitor's first message can therefore put these in front of the owner:
- clickable links (`[Pay deposit here](https://evil.example)`)
- remote images (`![](https://tracker.example/x.png)`, which leaks the viewer's IP when the CRM opens it)

`plainBlock` also keeps line breaks in the Lead description, so a message can add a fake `Chatwoot: https://...` line under the real one. The idempotency markers (`[cw:<id>:open]`, `[cw:<id>:r<epoch>]`) are found by substring search over stream posts that contain visitor text (`streamHasMarker`). A visitor who types a marker suppresses that Note for the same Lead.
**Fix:** Escape Markdown control characters (`[ ] ( ) ! * _ \` #` and leading `>`) in `plainLine` and `plainBlock`, or wrap visitor text in a fenced code block. Prefix each visitor line (for example `> `) so it cannot imitate a system line. Match the marker only on the *last line* of a Note, which is where the formatter puts it.

### WR-06: Erasure silently skips Note scrubbing when the stream read is forbidden

**File:** `lib/chat-io.ts:553-566`, `lib/erasure.ts` (`scrubNotes`)
**Issue:** `listStreamNotes` turns a 403 (no stream access) into `[]`. `scrubNotes` then finds no Notes, adds nothing to `notes_skipped`, and the parent is deleted. The verify pass checks only whether Contacts and Leads are gone, not Notes. If the Sync writer role loses `stream` access (roles.json drift, a manual role edit), erasure reports success while chat text and resolve summaries survive as orphan Notes. The PII is left behind without a trace.
**Fix:** Give erasure a strict variant that throws, or counts `notes_unreadable`, on 403. Make `verifyStep` fail (or at least report) when any purged record's stream could not be read.

### WR-07: Deadline reschedules have no attempt cap (possible endless 5 s loop)

**File:** `lib/chat-intake.ts:159-164` (shared by chat-contact, chat-resolve, espo-contact-hook)
**Issue:** `rescheduleForDeadline` reschedules 5 s later and never checks `isTerminalAttempt`. `retryLater` does check it. The handlers keep no partial progress: `chat-resolve` re-reads up to 20 message pages plus EspoCRM lookups on every run. If Chatwoot or EspoCRM is slow enough that a run always exceeds 45 s, the row loops forever: a QStash publish and a function invocation every ~5 s, and the row never surfaces as failed in the digest.
**Fix:** Route deadline reschedules through the attempt budget. Once `isTerminalAttempt(row.attempts)` is reached, complete with `failed` and code `deadline_exhausted`. Or grow the delay with `nextAttemptDelaySeconds(row.attempts)`.

## Info

### IN-01: `X-Chatwoot-Delivery` is not covered by the signature

**File:** `app/api/webhooks/chatwoot/route.ts:90-94`
**Issue:** The delivery id is taken from an unsigned header. Within the 300 s window, someone who captured a signed request can replay it with a fresh header value and get past `webhook_deliveries` dedup. The outbox key still dedups intake, label and resolve, and a contact replay costs one bucketed re-read, so the impact is small.
**Fix:** Use the body hash (`b<sha256(ts + body)>`) as the dedup id, or include the timestamp in it. Do not trust the unsigned header.

### IN-02: `chat_hooks_start` set to a future instant counts as "on"

**File:** `supabase/migrations/076_inbound_webhooks.sql:94-103`, `078_chat_registry.sql:105-119`
**Issue:** The gate only checks whether the value is a timestamp, not `v_start <= now()`. Only the intake compares against it (conversation `createdAt`). The contact, label and EspoCRM-contact handlers run as soon as the key exists, even if it holds a future time.
**Fix:** Return `off` when `v_start > now()`, or document that only the presence of the key matters.

### IN-03: The whole body is buffered before the size check for chunked requests

**File:** `app/api/webhooks/chatwoot/route.ts:38-49`, `app/api/webhooks/espocrm/route.ts:44-56`
**Issue:** Without `Content-Length`, `request.arrayBuffer()` reads everything before the 1 MiB check. Only the platform limit (Vercel's 4.5 MB) bounds it.
**Fix:** Stream-read with a running byte counter and abort past `MAX_BODY_BYTES`.

### IN-04: `infra/espocrm/webhook.mjs` exits with `process.exit` right after writing a piped secret

**File:** `infra/espocrm/webhook.mjs:203`, `292`
**Issue:** `--print secret|id` writes with `process.stdout.write` and then `process.exit(...)`. On macOS pipe writes can be asynchronous, so the value may be cut short before `vercel env add` reads it. The Chatwoot twin uses `process.exitCode` for exactly this reason.
**Fix:** Set `process.exitCode = await runWebhook(...)` instead of calling `process.exit`.

### IN-05: `webhook_ingest_espo` silently picks the oldest identity when several share an EspoCRM Contact

**File:** `supabase/migrations/076_inbound_webhooks.sql:190-194`
**Issue:** `ORDER BY c.created_at LIMIT 1` resolves an ambiguous `espo_contact_id` to one identity. The EspoCRM edit is then pushed into that identity's Chatwoot contact. Elsewhere this code base treats ambiguity as "skip" (`cw_ambiguous`).
**Fix:** Count the matches and return a distinct `ambiguous` outcome (logged, nothing enqueued) when there is more than one.

---

_Reviewed: 2026-10-26T18:10:29Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
