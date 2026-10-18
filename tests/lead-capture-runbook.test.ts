// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Phase 81-11: guard for the lead-capture runbook.
 *
 * The names an operator needs (Vercel env, Vault secrets, the go-live config key) are extracted from
 * the code that reads them, so the runbook cannot silently drift from it. The runbook is tracked in
 * git, so it must carry nothing that looks like a secret.
 */

const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const RUNBOOK_REL = 'infra/vps/runbooks/lead-capture.md'
const runbook = read(RUNBOOK_REL)

const unique = (xs: string[]) => [...new Set(xs)].sort()

const espoEnv = unique([...read('lib/espocrm-client.ts').matchAll(/\b(ESPOCRM_[A-Z_]+)\b/g)].map((m) => m[1]))
const kickEnv = unique([...read('app/api/integrations/kick/route.ts').matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]))
const sweepEnv = unique([...read('app/api/cron/outbox-sweep/route.ts').matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]))
const vaultNames = unique([...read('supabase/migrations/067_bookings_lead_outbox.sql').matchAll(/name = '([a-z_]+)'/g)].map((m) => m[1]))
const configKeys = unique(
  ['supabase/migrations/067_bookings_lead_outbox.sql', 'supabase/migrations/068_outbox_sweep.sql'].flatMap((f) =>
    [...read(f).matchAll(/c\.key = '([a-z_]+)'/g)].map((m) => m[1]),
  ),
)

describe('lead-capture runbook: location', () => {
  it('lives under infra/vps/runbooks/', () => {
    expect(fs.existsSync(path.join(ROOT, RUNBOOK_REL))).toBe(true)
  })
})

describe('lead-capture runbook: names come from the code', () => {
  it('extracts the expected sets (guards the extraction itself)', () => {
    expect(espoEnv).toEqual(['ESPOCRM_API_KEY', 'ESPOCRM_BASE_URL', 'ESPOCRM_LEAD_ASSIGNEE_ID'])
    expect(kickEnv).toContain('OUTBOX_KICK_SECRET')
    expect(sweepEnv).toContain('CRON_SECRET')
    expect(vaultNames).toEqual(['outbox_kick_secret', 'outbox_kick_url'])
    expect(configKeys).toEqual(['lead_capture_start'])
  })

  it.each([...espoEnv, 'OUTBOX_KICK_SECRET', 'CRON_SECRET', ...vaultNames, ...configKeys])('mentions %s', (name) => {
    expect(runbook).toContain(name)
  })

  it('names the QStash variables and the EU QStash URL', () => {
    for (const n of ['QSTASH_URL', 'QSTASH_TOKEN', 'QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY']) expect(runbook).toContain(n)
    expect(runbook).toContain('https://qstash-eu-central-1.upstash.io')
  })

  it('documents the switches, the drill commands and a drill log table', () => {
    expect(runbook).toMatch(/delete from public\.integration_config where key = 'lead_capture_start'/)
    expect(runbook).toContain('crm_unconfigured')
    expect(runbook).toContain("sudo docker compose stop app'")
    expect(runbook).toContain("sudo docker compose start app'")
    expect(runbook).toMatch(/### Drill log\s+\| Date \(UTC\)/)
  })
})

describe('lead-capture runbook: no secrets', () => {
  it('has no 32+ character hex string', () => {
    expect(runbook.match(/\b[0-9a-f]{32,}\b/gi) ?? []).toEqual([])
  })

  it('has no base64-looking token (32+ chars of base64 alphabet with a digit and a letter)', () => {
    const hits = (runbook.match(/[A-Za-z0-9+/=_-]{32,}/g) ?? []).filter((s) => /\d/.test(s) && /[A-Za-z]/.test(s))
    expect(hits).toEqual([])
  })

  it('has no QStash signing key or JWT-looking value', () => {
    expect(runbook).not.toMatch(/sig_[A-Za-z0-9]{8,}/)
    expect(runbook).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/)
  })
})
