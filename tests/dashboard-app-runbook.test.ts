// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Phase 84-03: content guard for the Dashboard App runbook. The CVE-2025-12245 evidence (D-13) must stay in the file,
 * and the runbook (tracked in git) must carry no secret, customer address or price. Plan 84-06 extends this list
 * with the operator sections.
 */

const RUNBOOK_REL = 'infra/vps/runbooks/chatwoot-dashboard-app.md'
const runbook = fs.readFileSync(path.join(process.cwd(), RUNBOOK_REL), 'utf8')

const CVE_NAMES = [
  'CVE-2025-12245',
  'GHSA-hgg8-54gw-8v33',
  'IFrameHelper.js',
  'initPostMessageCommunication',
  'Frame.vue',
  'v4.18.0-ce',
  'installWidgetOriginGuard',
  'load-chat-widget.ts',
  'gh api /advisories/GHSA-hgg8-54gw-8v33',
]

describe('chatwoot-dashboard-app runbook: CVE-2025-12245 section (D-13)', () => {
  it.each(CVE_NAMES)('mentions %s', (name) => {
    expect(runbook).toContain(name)
  })

  it('has a CVE section and an evidence log with at least one dated row', () => {
    const start = runbook.indexOf('### Evidence log')
    expect(start).toBeGreaterThan(-1)
    const rest = runbook.slice(start)
    const next = rest.indexOf('\n### ', 5)
    const section = next === -1 ? rest : rest.slice(0, next)
    expect(section).toMatch(/^\| \d{4}-\d{2}-\d{2} \|/m)
  })

  it('states the re-check rule for version bumps', () => {
    expect(runbook).toMatch(/every Chatwoot version bump/)
  })
})

describe('chatwoot-dashboard-app runbook: no secrets, no prices, no addresses', () => {
  it('has no currency amount', () => {
    expect(runbook).not.toMatch(/€\s?\d|\d\s?€|\bEUR\s?\d|\d\s?EUR\b|\bCZK\s?\d|\$\s?\d/)
  })

  it('has no string shaped like a Chatwoot or Stripe secret', () => {
    expect(runbook).not.toMatch(/\b(sk|rk|pk|whsec)_(live|test)?_?[A-Za-z0-9]{10,}/)
    expect(runbook).not.toMatch(/\b[A-Za-z0-9_-]{32,}\b/)
  })

  it('has no email address other than example.test ones', () => {
    const emails = runbook.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
    for (const e of emails) expect(e).toMatch(/@([a-z0-9-]+\.)*example\.test$/)
  })
})
