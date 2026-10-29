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

const SECTIONS = [
  '## How it works',
  '## Operator setup',
  '## Permissions and revocation',
  '## What the panel shows',
  '## Troubleshooting',
  '## Registration',
  '## Go-live and UAT checklist',
  '## CVE-2025-12245 (PANEL-02 gate, D-13)',
]

const OPERATOR_NAMES = [
  'sessionStorage',
  'Access Token',
  'api-access-token',
  '/api/chatwoot/dashboard-app',
  '/embed/chatwoot-dashboard',
  'frame-ancestors',
  'sync.mjs --only dashboardApps',
  'Forget token',
  'csp_regression.py',
  'Chatwoot access token',
  'Save token',
  'chatwoot-api.env',
]

// Error rows of the UI-SPEC Copywriting Contract (84-UI-SPEC.md), verbatim: each needs a cause and a fix here.
const ERROR_COPY = [
  'Token not accepted. Copy it again from Profile settings, Access Token in Chatwoot, then paste it here.',
  "You don't have access to this conversation, so its bookings are hidden.",
  "Can't reach Chatwoot right now. Try again in a minute.",
  'Too many requests. Wait a moment, then press Refresh.',
  "The panel isn't set up yet. Ask the site owner to check the Chatwoot settings.",
  "Couldn't load bookings. Press Refresh to try again.",
  "Chatwoot didn't send the conversation. Switch to another conversation and back, or reload this page.",
  'Open this panel from a Chatwoot conversation.',
  'Unverified email - confirm identity before sharing booking details',
  'Phone matches a different customer',
  'Add an email or phone to this contact in Chatwoot to see bookings',
]

describe('chatwoot-dashboard-app runbook: operator sections (PANEL-01, PANEL-02)', () => {
  it('has every section, in order, with the CVE gate last', () => {
    const positions = SECTIONS.map((h) => runbook.indexOf(`\n${h}\n`))
    for (const p of positions) expect(p).toBeGreaterThan(-1)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it.each(OPERATOR_NAMES)('mentions %s', (name) => {
    expect(runbook).toContain(name)
  })

  it.each(ERROR_COPY)('lists the operator-visible message: %s', (message) => {
    expect(runbook).toContain(message)
  })

  it('troubleshooting table gives every error message a cause and a fix (three columns)', () => {
    const start = runbook.indexOf('\n## Troubleshooting\n')
    const end = runbook.indexOf('\n## Registration\n')
    const rows = runbook
      .slice(start, end)
      .split('\n')
      .filter((l) => l.startsWith('|') && !/^\|[-| ]+\|$/.test(l))
    // header + one row per error message (8 error rows in the UI-SPEC)
    expect(rows.length).toBeGreaterThanOrEqual(9)
    for (const row of rows) expect(row.split(' | ').length).toBeGreaterThanOrEqual(3)
  })

  it('states why persistent storage was rejected (D-02) and how revocation works (D-01, D-04)', () => {
    expect(runbook).toMatch(/same site/)
    expect(runbook).toMatch(/third-party scripts/)
    expect(runbook).toMatch(/next refresh/)
    expect(runbook).toMatch(/no admin-only gate/)
  })

  it('keeps the registered URL free of secrets', () => {
    expect(runbook).toMatch(/no query string, no fragment/)
    expect(runbook).not.toMatch(/embed\/chatwoot-dashboard[?#]/)
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
