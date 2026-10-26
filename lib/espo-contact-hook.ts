import type { OutboxRow } from '@/lib/outbox-store'
import { parseHookTag, parseOutboxKey } from '@/lib/outbox'
import { retryLater, skip, type DispatchResult } from '@/lib/dispatch-outcomes'
import { SiteEspoError } from '@/lib/espocrm-client'
import { SiteChatwootError, type SiteChatwootClient } from '@/lib/chatwoot-client'
import type { DispatchDeps } from '@/lib/lead-sync'
import {
  buildIntakeContext,
  DeadlineError,
  IntakeRetryError,
  rescheduleForDeadline,
  type HookClients,
  type IntakeContext,
} from '@/lib/chat-intake'
import { plainLine } from '@/lib/chat-classify'
import { readContact, type ChatContact } from '@/lib/chat-io'
import { ESPO_MASK } from '@/lib/espo-payload'
import { normalizePhone } from '@/lib/phone'
import { postWriteFingerprint, SITE_SYNC_FP_ATTRIBUTE } from '@/lib/sync-origin'

/**
 * hook.espo_contact handler (Phase 83, HOOK-03 / D-13 / D-14). Runs only inside the QStash-invoked
 * dispatcher (lib/lead-sync.ts -> lib/hook-dispatch.ts), behind both config gates (D-15).
 *
 * The key says "this person's EspoCRM Contact was edited" and carries a mask of the edited attribute
 * groups (name 1, phone 2, company 4). The payload was a hint: every run re-reads the Contact and the
 * linked Chatwoot contact, pushes only the edited groups that differ (a human edit in EspoCRM wins,
 * D-14) and never an empty value. The write carries `site_sync_fp` of the post-write state so the
 * Chatwoot webhook that follows is recognised as the site's own echo (HOOK-04).
 *
 * Read-only towards EspoCRM and Supabase: bookings, profiles and identity data are never touched.
 * Logs carry the key, outcome and code only; never a name, email or phone.
 */

const NAME_MAX = 100
const COMPANY_MAX = 120

type Entry = { kind: 'sent'; detail: string } | { kind: 'skip'; code: string } | { kind: 'failed'; code: string }

const skipped = (code: string): Entry => ({ kind: 'skip', code })

interface WriteBody {
  name?: string
  phone_number?: string
  additional_attributes?: { company_name: string }
}

export async function deliverEspoContactHook(
  row: OutboxRow,
  d: DispatchDeps,
  clients: HookClients,
): Promise<DispatchResult> {
  const ctx = buildIntakeContext(row, d, clients)
  let result: DispatchResult
  let detail = '-'
  try {
    const parsed = parseOutboxKey(row.idempotency_key)
    const tag = parseHookTag(parsed?.tag)
    if (!parsed || !tag || tag.mask === undefined) {
      result = await skip(row, d, 'bad_key')
    } else {
      const entry = await espoContactEntry(ctx, parsed.aggregateId, tag.mask)
      if (entry.kind === 'skip') {
        detail = entry.code
        result = await skip(row, d, entry.code)
      } else if (entry.kind === 'failed') {
        detail = entry.code
        await d.store.complete(row.idempotency_key, 'failed', entry.code)
        result = { outcome: 'failed', code: entry.code }
      } else {
        detail = entry.detail
        await d.store.complete(row.idempotency_key, 'sent', null)
        result = { outcome: 'sent' }
      }
    }
  } catch (err) {
    if (err instanceof DeadlineError) result = await rescheduleForDeadline(ctx)
    else if (err instanceof IntakeRetryError) result = await retryLater(row, err.code, d)
    else throw err
  }
  console.log(`[espo-contact] key=${row.idempotency_key} outcome=${result.outcome} code=${result.code ?? detail}`)
  return result
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

async function espoContactEntry(ctx: IntakeContext, identityId: string, mask: number): Promise<Entry> {
  const { d, cw, crm, chat, guard } = ctx

  guard()
  if (!(await chat.hooksStart())) return skipped('hooks_off')

  guard()
  const person = await d.identity.person(identityId)
  if (!person) return skipped('identity_missing')
  if (person.identity.erasing_at) return skipped('identity_erasing')
  const espoContactId = person.identity.espo_contact_id
  const chatwootContactId = person.identity.chatwoot_contact_id
  if (!espoContactId || !chatwootContactId) return skipped('unlinked')

  guard()
  let espoContact: unknown
  try {
    espoContact = await crm.get(
      `/Contact/${espoContactId}?select=firstName,lastName,phoneNumber,accountName`,
    )
  } catch (err) {
    if (err instanceof SiteEspoError && err.status === 404) return skipped('contact_missing')
    throw err
  }
  if (typeof espoContact !== 'object' || espoContact === null) return skipped('contact_missing')
  const source = espoContact as Record<string, unknown>

  guard()
  const live = await readContact(cw, chatwootContactId)
  if (!live) return skipped('contact_missing')

  // D-14: only the edited groups, only non-empty values, only where Chatwoot differs.
  const body: WriteBody = {}
  if (mask & ESPO_MASK.name) {
    const name = plainLine(`${str(source.firstName)} ${str(source.lastName)}`, NAME_MAX)
    if (name !== '' && name !== live.name) body.name = name
  }
  if (mask & ESPO_MASK.phone) {
    const phone = normalizePhone(str(source.phoneNumber))
    if (phone && phone !== live.phone) body.phone_number = phone
  }
  if (mask & ESPO_MASK.company) {
    const company = plainLine(str(source.accountName), COMPANY_MAX)
    if (company !== '' && company !== live.companyName) body.additional_attributes = { company_name: company }
  }
  if (Object.keys(body).length === 0) return { kind: 'sent', detail: 'no_change' }

  return writeToChatwoot(cw, live, body)
}

function isStatus(err: unknown, status: number): boolean {
  return err instanceof SiteChatwootError && err.status === status
}

/** The fingerprint is recomputed for the body actually sent, so a dropped phone changes it (HOOK-04). */
function stamped(body: WriteBody, live: ChatContact): Record<string, unknown> {
  return {
    ...body,
    custom_attributes: { [SITE_SYNC_FP_ATTRIBUTE]: postWriteFingerprint(live, body) },
  }
}

/**
 * PUT /contacts/<id>. A 422 on the phone (taken by another Chatwoot contact) drops the phone and
 * retries once with the remaining fields; a 422 that remains is `cw_unprocessable`.
 */
async function writeToChatwoot(cw: SiteChatwootClient, live: ChatContact, body: WriteBody): Promise<Entry> {
  try {
    await cw.put(`/contacts/${live.id}`, stamped(body, live))
    return { kind: 'sent', detail: 'updated' }
  } catch (err) {
    if (!isStatus(err, 422)) throw err
    if (body.phone_number === undefined) return { kind: 'failed', code: 'cw_unprocessable' }
  }

  const { phone_number: _dropped, ...rest } = body
  void _dropped
  if (Object.keys(rest).length === 0) return { kind: 'sent', detail: 'phone_taken' }
  try {
    await cw.put(`/contacts/${live.id}`, stamped(rest, live))
    return { kind: 'sent', detail: 'updated_without_phone' }
  } catch (err) {
    if (!isStatus(err, 422)) throw err
    return { kind: 'failed', code: 'cw_unprocessable' }
  }
}
