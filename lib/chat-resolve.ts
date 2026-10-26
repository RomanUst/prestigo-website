import type { OutboxRow } from '@/lib/outbox-store'
import { parseHookTag, parseOutboxKey } from '@/lib/outbox'
import { retryLater, skip, type DispatchResult } from '@/lib/dispatch-outcomes'
import type { DispatchDeps } from '@/lib/lead-sync'
import type { ChatConversationRecord } from '@/lib/chat-store'
import {
  buildIntakeContext,
  DeadlineError,
  ensureIntake,
  IntakeRetryError,
  rescheduleForDeadline,
  type HookClients,
  type IntakeContext,
} from '@/lib/chat-intake'
import { conversationUrl, formatResolveNote, resolveMarker, summaryFromNotes, topicLabels } from '@/lib/chat-classify'
import {
  firstIncoming,
  postNote,
  readConversation,
  readInboxName,
  readMessagePages,
  streamHasMarker,
} from '@/lib/chat-io'

/**
 * hook.chat_resolve handler (Phase 83, HOOK-02). Runs only inside the QStash-invoked dispatcher
 * (lib/lead-sync.ts -> lib/hook-dispatch.ts), behind both config gates (D-15).
 *
 * One history entry (an EspoCRM stream Note, type Post) per resolve moment (D-10): channel and inbox,
 * opened and resolved instants (UTC), message count, topic labels, the customer's first message
 * (truncated), the operator's `Итог:` / `Summary:` private note when there is one (D-09), the
 * Chatwoot link and the marker `[cw:<id>:r<epoch>]`. Never a transcript (T-83-29), never a Chatwoot
 * write.
 *
 * State-convergent like the intake: the resolve moment comes from the key (the receiver derived it from
 * the signed payload), every run re-reads Chatwoot, and the stream marker is checked before the Note is
 * posted, so a re-delivery or a crash between post and complete writes nothing twice (T-83-31).
 *
 * Ordering (RESEARCH Pitfall 12): the intake runs first on the same code path and the same
 * per-conversation outbox mutex, so the Lead / Contact exist before the entry is written; the intake
 * row that follows changes nothing.
 *
 * Target (D-11): the person's EspoCRM Contact when one is known, otherwise the chat Lead (or the
 * adopted D-20 Lead). A customer whose Contact is not synced yet is retried (`contact_pending`),
 * never written to a guessed record (T-83-30).
 *
 * Logs carry the key, outcome and code only.
 */

/** Messages are read in pages of up to 100; 20 pages = 2000 messages, beyond that the count says `N+`. */
const MESSAGE_PAGES = 20

/** Skips ensureIntake can answer that leave no registry record to look at. */
const NO_RECORD_SKIPS: ReadonlySet<string> = new Set([
  'hooks_off',
  'before_start',
  'conversation_missing',
  'identity_erasing',
  'no_incoming_message',
  'contact_missing',
])

type Target = { parentType: 'Contact' | 'Lead'; parentId: string } | { pending: string } | null

/** D-11 / D-06: where the history entry belongs, from registry and identity links only. */
function pickTarget(rec: ChatConversationRecord): Target {
  const contact = rec.identity?.espoContactId ?? rec.espoContactId ?? rec.chatLead?.espoContactId ?? null
  if (contact) return { parentType: 'Contact', parentId: contact }
  // A customer's Contact is created by the person sync: wait for it instead of guessing.
  if (rec.identity?.customer) return { pending: 'contact_pending' }
  const lead = rec.chatLead?.espoLeadId ?? rec.espoLeadId ?? null
  if (lead) return { parentType: 'Lead', parentId: lead }
  return null
}

export async function deliverChatResolve(
  row: OutboxRow,
  d: DispatchDeps,
  clients: HookClients,
): Promise<DispatchResult> {
  const ctx = buildIntakeContext(row, d, clients)
  let result: DispatchResult
  let detail = '-'
  try {
    const tag = parseHookTag(parseOutboxKey(row.idempotency_key)?.tag)
    if (!tag || tag.conversationId === undefined || tag.resolveEpoch === undefined) {
      result = await skip(row, d, 'bad_key')
    } else {
      const outcome = await resolveEntry(ctx, tag.conversationId, tag.resolveEpoch)
      detail = outcome.detail
      if (outcome.kind === 'skip') result = await skip(row, d, outcome.code)
      else if (outcome.kind === 'retry') result = await retryLater(row, outcome.code, d)
      else {
        await d.store.complete(row.idempotency_key, 'sent', null)
        result = { outcome: 'sent' }
      }
    }
  } catch (err) {
    if (err instanceof DeadlineError) result = await rescheduleForDeadline(ctx)
    else if (err instanceof IntakeRetryError) result = await retryLater(row, err.code, d)
    else throw err
  }
  console.log(`[chat-resolve] key=${row.idempotency_key} outcome=${result.outcome} code=${result.code ?? detail}`)
  return result
}

type EntryOutcome =
  | { kind: 'sent'; detail: string }
  | { kind: 'skip'; code: string; detail: string }
  | { kind: 'retry'; code: string; detail: string }

async function resolveEntry(ctx: IntakeContext, conversationId: number, resolveEpoch: number): Promise<EntryOutcome> {
  const { cw, cwConfig, crm, chat, guard } = ctx

  // Pitfall 12: a resolve that overtook its intake runs the intake first (same path, same mutex).
  const intake = await ensureIntake(ctx, conversationId)
  let rec: ChatConversationRecord | null
  if ('skipped' in intake) {
    if (NO_RECORD_SKIPS.has(intake.skipped)) return { kind: 'skip', code: intake.skipped, detail: intake.skipped }
    // customer, known_contact, filtered, no_lead_label: nothing was created at start, but the
    // person may still have a Contact that deserves the resolution entry (D-06).
    guard()
    rec = await chat.conversation(conversationId)
    if (!rec) return { kind: 'skip', code: intake.skipped, detail: intake.skipped }
  } else {
    rec = intake
  }
  if (rec.identity?.erasing) return { kind: 'skip', code: 'identity_erasing', detail: 'identity_erasing' }

  const target = pickTarget(rec)
  if (target === null) return { kind: 'skip', code: 'no_target', detail: 'no_target' }
  if ('pending' in target) return { kind: 'retry', code: target.pending, detail: target.pending }

  // D-10: this resolve moment already has its entry (a re-delivery, or a crash after the post).
  const marker = resolveMarker(conversationId, resolveEpoch)
  guard()
  if (await streamHasMarker(crm, target.parentType, target.parentId, marker)) {
    return { kind: 'sent', detail: 'already_written' }
  }

  guard()
  const conversation = await readConversation(cw, conversationId)
  if (!conversation) return { kind: 'skip', code: 'conversation_missing', detail: 'conversation_missing' }
  const { messages, truncated } = await readMessagePages(cw, conversationId, { maxPages: MESSAGE_PAGES })
  const inbox = conversation.inboxId ? await readInboxName(cw, conversation.inboxId) : null
  const first = firstIncoming(messages)
  // Incoming, outgoing and template messages count; activity lines and private notes do not.
  const messageCount = messages.filter(
    (m) => !m.private && (m.messageType === 'incoming' || m.messageType === 'outgoing' || m.messageType === 'template'),
  ).length

  const text = formatResolveNote({
    channel: conversation.channel,
    inboxName: inbox,
    conversationId,
    openedAt: new Date(conversation.createdAtSec * 1000),
    resolvedAt: new Date(resolveEpoch * 1000),
    messageCount,
    messageCountCapped: truncated,
    topics: topicLabels(conversation.labels),
    firstMessage: first?.content ?? null,
    summary: summaryFromNotes(messages),
    url: conversationUrl(cwConfig.baseUrl, cwConfig.accountId, conversationId),
    marker,
  })
  guard()
  await postNote(crm, target.parentType, target.parentId, text)
  return { kind: 'sent', detail: target.parentType === 'Contact' ? 'note_contact' : 'note_lead' }
}
