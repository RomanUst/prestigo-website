// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Phase 82-15: guard for the CRM/Chatwoot sync runbook. The names an operator needs must appear, and the
 * runbook (tracked in git) must carry nothing that looks like a secret or a customer address.
 */

const ROOT = process.cwd()
const RUNBOOK_REL = 'infra/vps/runbooks/crm-sync.md'
const runbook = fs.readFileSync(path.join(ROOT, RUNBOOK_REL), 'utf8')

const NAMES = [
  'CHATWOOT_BASE_URL',
  'CHATWOOT_ACCOUNT_ID',
  'CHATWOOT_API_TOKEN',
  'CHATWOOT_ADMIN_API_TOKEN',
  'ERASURE_HMAC_KEY',
  'ESPOCRM_API_KEY',
  'crm_sync_start',
  'sync.booking',
  'sync.signup',
  'sync.espo',
  'sync.chatwoot',
  'erase.person',
]
const CODES = [
  'chatwoot_unconfigured',
  'crm_unconfigured',
  'cw_ambiguous',
  'identity_erasing',
  'booking_unmapped',
  'erasure_unverified',
  'deadline',
  'digest_failed',
]

describe('crm-sync runbook: names and codes', () => {
  it.each([...NAMES, ...CODES])('mentions %s', (name) => {
    expect(runbook).toContain(name)
  })

  it('each event-type and code name is still used in the code', () => {
    const src = ['lib/lead-sync.ts', 'lib/outbox.ts', 'lib/chatwoot-sync.ts', 'lib/crm-sync.ts', 'lib/erasure.ts', 'lib/sync-resolve.ts', 'app/api/cron/outbox-sweep/route.ts']
      .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
      .join('\n')
    for (const n of [...CODES, 'sync.espo', 'sync.chatwoot', 'erase.person']) expect(src, n).toContain(n)
    expect(fs.readFileSync(path.join(ROOT, 'supabase/migrations/069_identity_core_sync_triggers.sql'), 'utf8')).toContain('crm_sync_start')
  })

  it('documents the switches, the backfill re-run and a drill log table', () => {
    expect(runbook).toContain("delete from public.integration_config where key = 'crm_sync_start'")
    expect(runbook).toContain("crm_backfill_enqueue('bf2', 5)")
    expect(runbook).toMatch(/### Drill log\s+\| Date \(UTC\)/)
  })
})

describe('crm-sync runbook: no secrets, no customer data', () => {
  it('has no 32+ character hex string', () => {
    expect(runbook.match(/\b[0-9a-f]{32,}\b/gi) ?? []).toEqual([])
  })

  it('has no base64-looking token', () => {
    const hits = (runbook.match(/[A-Za-z0-9+/=_-]{32,}/g) ?? []).filter((s) => /\d/.test(s) && /[A-Za-z]/.test(s))
    expect(hits).toEqual([])
  })

  it('has no email address other than rideprestigo.com role addresses', () => {
    const addrs = runbook.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
    expect(addrs.filter((a) => !a.endsWith('@rideprestigo.com'))).toEqual([])
  })
})
