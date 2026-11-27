import type { OutboxRow } from '@/lib/outbox-store'
import { OutboxStoreError } from '@/lib/outbox-store'
import { skip, type DispatchResult } from '@/lib/dispatch-outcomes'
import type { SiteChatwootClient } from '@/lib/chatwoot-client'
import type { DispatchDeps } from '@/lib/lead-sync'
import { normalizePhone } from '@/lib/phone'
import { createSupabaseServiceClient } from '@/lib/supabase'

/**
 * alert.contact_inquiry handler. Runs ONLY inside the QStash-invoked outbox dispatcher (reachable from
 * lib/lead-sync.ts, never from a page render or the contact request path, which imports
 * lib/contact-inquiry-enqueue.ts instead).
 *
 * A website contact-form inquiry becomes a conversation in the "Email info@" Chatwoot inbox, so the
 * operator answers the client from Chatwoot by email instead of from the personal mailbox:
 *   find the contact by email (create it when missing) -> find this inquiry's conversation in the inbox
 *   (retry safety, tagged by additional_attributes.site_inquiry_id) or create it -> one PRIVATE note
 *   with the form fields.
 *
 * Nothing is sent to the client: the conversation is created without a message and the note is private.
 * Logs carry the key, outcome and code only: never a name, email, phone or message.
 */

export const CONTACT_INQUIRY_INBOX_NAME = 'Email info@'
export const CONTACT_INQUIRY_NOTE_PREFIX = 'Website contact form'
const MAIL_SUBJECT = 'Your enquiry to Prestigo'

export interface ContactInquiryRecord {
  id: string
  name: string | null
  email: string
  phone: string | null
  service: string | null
  message: string | null
}

export interface ContactInquiryStore {
  /** null when the inquiry no longer exists (erased) or is not a contact inquiry. Throws OutboxStoreError('db_error'). */
  load(inquiryId: string): Promise<ContactInquiryRecord | null>
}

export interface ContactInquiryChatwootDeps {
  store?: ContactInquiryStore
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** Supabase-backed store. The service client is created inside the call, never at module level. */
export function createContactInquiryStore(): ContactInquiryStore {
  return {
    async load(inquiryId) {
      try {
        const db = createSupabaseServiceClient()
        const { data, error } = await db
          .from('inquiries')
          .select('id, kind, name, email, phone, payload')
          .eq('id', inquiryId)
          .maybeSingle()
        if (error) throw new Error('read')
        if (!data || data.kind !== 'contact' || !str(data.email)) return null
        const payload = (data.payload ?? {}) as Record<string, unknown>
        return {
          id: data.id as string,
          name: str(data.name),
          email: (data.email as string).trim(),
          phone: str(data.phone),
          service: str(payload.service),
          message: str(payload.message),
        }
      } catch {
        throw new OutboxStoreError('db_error')
      }
    },
  }
}

/** The operator's private note: the form fields as the client typed them. */
export function buildContactInquiryNote(inq: ContactInquiryRecord): string {
  return [
    `${CONTACT_INQUIRY_NOTE_PREFIX} (reply here: it goes to the client by email)`,
    '',
    `Name: ${inq.name ?? '—'}`,
    `Email: ${inq.email}`,
    `Phone: ${inq.phone ?? '—'}`,
    `Service: ${inq.service ?? '—'}`,
    '',
    'Message:',
    inq.message ?? '—',
  ].join('\n')
}

type Json = Record<string, unknown>
const asObj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null)
const posInt = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null)

/** Chatwoot answers a list either as a bare array or as { payload: [...] }. */
function listOf(res: unknown): Json[] {
  const raw = Array.isArray(res) ? res : asObj(res)?.payload
  return Array.isArray(raw) ? raw.map(asObj).filter((x): x is Json => x !== null) : []
}

async function findInbox(client: SiteChatwootClient): Promise<number | null> {
  const inbox = listOf(await client.get('/inboxes')).find(
    (i) => i.name === CONTACT_INQUIRY_INBOX_NAME && i.channel_type === 'Channel::Email',
  )
  return inbox ? posInt(inbox.id) : null
}

async function findOrCreateContact(client: SiteChatwootClient, inq: ContactInquiryRecord): Promise<number | null> {
  const res = await client.post('/contacts/filter', {
    payload: [{ attribute_key: 'email', filter_operator: 'equal_to', values: [inq.email], query_operator: null }],
  })
  const wanted = inq.email.toLowerCase()
  const hit = listOf(res).find((c) => typeof c.email === 'string' && c.email.toLowerCase() === wanted)
  if (hit) return posInt(hit.id)

  const body: Json = { name: inq.name ?? inq.email, email: inq.email }
  const phone = normalizePhone(inq.phone)
  if (phone) body.phone_number = phone
  const created = asObj(await client.post('/contacts', body))
  // Chatwoot 4 wraps the new contact: { payload: { contact: {...} } }; older answers carry it directly.
  const contact = asObj(asObj(created?.payload)?.contact) ?? asObj(created?.payload) ?? created
  return posInt(contact?.id)
}

async function findConversation(client: SiteChatwootClient, contactId: number, inboxId: number, inquiryId: string) {
  const convo = listOf(await client.get(`/contacts/${contactId}/conversations`)).find(
    (c) => c.inbox_id === inboxId && asObj(c.additional_attributes)?.site_inquiry_id === inquiryId,
  )
  return convo ? posInt(convo.id) : null
}

async function hasNote(client: SiteChatwootClient, conversationId: number): Promise<boolean> {
  return listOf(await client.get(`/conversations/${conversationId}/messages`)).some(
    (m) => m.private === true && typeof m.content === 'string' && m.content.startsWith(CONTACT_INQUIRY_NOTE_PREFIX),
  )
}

export async function deliverContactInquiryToChatwoot(
  row: OutboxRow,
  d: DispatchDeps,
  deps: ContactInquiryChatwootDeps = {},
): Promise<DispatchResult> {
  const result = await run(row, d, deps)
  console.log(`[contact-inquiry-chatwoot] key=${row.idempotency_key} outcome=${result.outcome} code=${result.code ?? '-'}`)
  return result
}

async function run(row: OutboxRow, d: DispatchDeps, deps: ContactInquiryChatwootDeps): Promise<DispatchResult> {
  const client = d.chatwoot
  if (!client) return skip(row, d, 'chatwoot_unconfigured')
  const store = deps.store ?? createContactInquiryStore()

  const inquiry = await store.load(row.aggregate_id)
  if (!inquiry) return skip(row, d, 'inquiry_gone')

  const inboxId = await findInbox(client)
  if (inboxId === null) return skip(row, d, 'no_inbox')

  const contactId = await findOrCreateContact(client, inquiry)
  if (contactId === null) return skip(row, d, 'no_contact')

  let conversationId = await findConversation(client, contactId, inboxId, inquiry.id)
  if (conversationId === null) {
    const created = asObj(
      await client.post('/conversations', {
        inbox_id: inboxId,
        contact_id: contactId,
        source_id: inquiry.email,
        status: 'open',
        additional_attributes: { site_inquiry_id: inquiry.id, mail_subject: MAIL_SUBJECT },
      }),
    )
    conversationId = posInt(created?.id)
    if (conversationId === null) return skip(row, d, 'no_conversation')
  } else if (await hasNote(client, conversationId)) {
    await d.store.complete(row.idempotency_key, 'sent', null)
    return { outcome: 'already_done' }
  }

  await client.post(`/conversations/${conversationId}/messages`, {
    content: buildContactInquiryNote(inquiry),
    message_type: 'outgoing',
    private: true,
  })

  await d.store.complete(row.idempotency_key, 'sent', null)
  return { outcome: 'sent' }
}
