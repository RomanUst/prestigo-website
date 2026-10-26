// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { makeWorld } from './helpers/chat-world'
import { deliverHook } from '@/lib/hook-dispatch'
import type { DispatchDeps } from '@/lib/lead-sync'

// The hook.* router: both config gates in front of the handler switch (D-15).

const INQUIRY_ID = '0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'

describe('deliverHook - config gates', () => {
  it('Chatwoot not configured -> chatwoot_unconfigured breaker and zero requests to either system', async () => {
    const w = makeWorld({ chatwootConfigured: false })

    const result = await w.dispatch(w.intakeKey(42))

    expect(result).toEqual({ outcome: 'breaker', code: 'chatwoot_unconfigured' })
    expect(w.cw.requests).toHaveLength(0)
    expect(w.espo.requests).toHaveLength(0)
    // The row is re-armed for the long breaker wait, not completed.
    expect(w.outbox.rows.get(w.intakeKey(42))?.status).toBe('pending')
  })

  it('EspoCRM not configured -> crm_unconfigured breaker and zero requests to either system', async () => {
    const w = makeWorld({ crmConfigured: false })

    const result = await w.dispatch(w.intakeKey(42))

    expect(result).toEqual({ outcome: 'breaker', code: 'crm_unconfigured' })
    expect(w.cw.requests).toHaveLength(0)
    expect(w.espo.requests).toHaveLength(0)
  })

  it('the Chatwoot gate is checked before the CRM gate', async () => {
    const w = makeWorld({ chatwootConfigured: false, crmConfigured: false })
    const result = await w.dispatch(w.intakeKey(42))
    expect(result).toEqual({ outcome: 'breaker', code: 'chatwoot_unconfigured' })
  })
})

describe('deliverHook - routing', () => {
  it('a synthetic unknown hook type completes failed with unsupported_event', async () => {
    const w = makeWorld()
    const key = w.intakeKey(42)
    w.outbox.insert(key)
    const row = await w.outbox.store.claim(key, 120)
    expect(row).not.toBeNull()

    const result = await deliverHook({ ...row!, event_type: 'hook.unknown' }, w.deps() as DispatchDeps)

    expect(result).toEqual({ outcome: 'failed', code: 'unsupported_event' })
    expect(w.outbox.calls.complete.at(-1)).toEqual({ key, status: 'failed', code: 'unsupported_event' })
  })

  it('a lead.inquiry key still takes the Phase 81 path unchanged', async () => {
    const w = makeWorld()

    // The world's outbox double holds no inquiry rows: the Phase 81 branch answers source_missing.
    const result = await w.dispatch(`lead.inquiry:${INQUIRY_ID}`)

    expect(result).toEqual({ outcome: 'skipped', code: 'source_missing' })
    expect(w.cw.requests).toHaveLength(0)
  })
})
