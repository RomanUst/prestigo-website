// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: vi.fn() }))

import { createWebhookStore } from '@/lib/webhook-store'
import { OutboxStoreError } from '@/lib/outbox-store'

function store(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
  return { rpc, store: createWebhookStore({ rpc } as unknown as SupabaseClient) }
}

const ingestInput = {
  source: 'chatwoot' as const,
  deliveryId: 'delivery-0001',
  entityKey: 'cw:conv:42',
  fuseLimit: null,
  eventType: 'hook.chat_intake',
  aggregateType: 'chat_conversation',
  aggregateId: '0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f',
  key: 'hook.chat_intake:0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f:c42',
  availableAt: new Date('2026-10-26T10:00:00.000Z'),
}

describe('webhook store', () => {
  it('ingest maps the arguments and returns the outcome', async () => {
    const { rpc, store: s } = store({ data: 'queued' })
    await expect(s.ingest(ingestInput)).resolves.toBe('queued')
    expect(rpc).toHaveBeenCalledWith('webhook_ingest', {
      p_source: 'chatwoot',
      p_delivery_id: 'delivery-0001',
      p_entity_key: 'cw:conv:42',
      p_fuse_limit: null,
      p_event_type: 'hook.chat_intake',
      p_aggregate_type: 'chat_conversation',
      p_aggregate_id: ingestInput.aggregateId,
      p_key: ingestInput.key,
      p_available_at: '2026-10-26T10:00:00.000Z',
    })
  })

  it.each([
    ['an RPC error', { error: { message: 'boom' } }],
    ['an unknown outcome', { data: 'weird' }],
    ['a non-string result', { data: 7 }],
  ])('ingest throws OutboxStoreError(db_error) on %s', async (_n, result) => {
    await expect(store(result).store.ingest(ingestInput)).rejects.toMatchObject({
      name: 'OutboxStoreError',
      code: 'db_error',
    })
  })

  it('ingest turns a client factory failure into db_error', async () => {
    const s = createWebhookStore({
      rpc: () => {
        throw new Error('no env')
      },
    } as unknown as SupabaseClient)
    await expect(s.ingest(ingestInput)).rejects.toBeInstanceOf(OutboxStoreError)
  })

  it('ingestEspo maps the single returned row', async () => {
    const { rpc, store: s } = store({
      data: [{ outcome: 'queued', idempotency_key: 'hook.espo_contact:x:b1m5', available_at: '2026-10-26T10:00:30+00:00' }],
    })
    const res = await s.ingestEspo({
      deliveryId: 'espo-hash-0001',
      espoContactId: 'bbbbbbbbbbbbbbbbb',
      fuseLimit: 20,
      bucketSeconds: 30,
      tagSuffix: 'm5',
    })
    expect(res.outcome).toBe('queued')
    expect(res.key).toBe('hook.espo_contact:x:b1m5')
    expect(res.availableAt?.toISOString()).toBe('2026-10-26T10:00:30.000Z')
    expect(rpc).toHaveBeenCalledWith('webhook_ingest_espo', {
      p_delivery_id: 'espo-hash-0001',
      p_espo_contact_id: 'bbbbbbbbbbbbbbbbb',
      p_fuse_limit: 20,
      p_bucket_seconds: 30,
      p_tag_suffix: 'm5',
    })
  })

  it('ingestEspo returns null key and date for outcomes that enqueue nothing', async () => {
    const { store: s } = store({ data: [{ outcome: 'unlinked', idempotency_key: null, available_at: null }] })
    const res = await s.ingestEspo({ deliveryId: 'espo-hash-0002', espoContactId: 'aaaaaaaaaaaaaaaaa', fuseLimit: null, bucketSeconds: 30, tagSuffix: 'm1' })
    expect(res).toEqual({ outcome: 'unlinked', key: null, availableAt: null })
  })

  it.each([[[]], [null], [[{ outcome: 'weird' }]], [[{ outcome: 'queued', available_at: 'not a date' }]]])(
    'ingestEspo throws db_error on an empty or unexpected shape (%j)',
    async (data) => {
      await expect(
        store({ data }).store.ingestEspo({ deliveryId: 'espo-hash-0003', espoContactId: 'aaaaaaaaaaaaaaaaa', fuseLimit: null, bucketSeconds: 30, tagSuffix: 'm1' }),
      ).rejects.toMatchObject({ code: 'db_error' })
    },
  )

  it('purge returns the deleted count and rejects a bad shape', async () => {
    const ok = store({ data: 12 })
    await expect(ok.store.purge({ chatwootDays: 7, espoDays: 30 })).resolves.toBe(12)
    expect(ok.rpc).toHaveBeenCalledWith('webhook_purge', { p_chatwoot_days: 7, p_espo_days: 30 })
    await expect(store({ data: 'x' }).store.purge({ chatwootDays: 7, espoDays: 30 })).rejects.toMatchObject({ code: 'db_error' })
  })
})
