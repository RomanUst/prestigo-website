// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildRoleSpecs } from '../infra/espocrm/sync.mjs'

/**
 * Phase 80-11 (CRM-05, D-15, D-23, D-11, D-24): guard for the CRM operator runbook.
 *
 * The role table in the runbook is pinned to infra/espocrm/roles.json (the file sync.mjs applies),
 * so the documented permissions cannot drift from the applied ones. The Chatwoot team names come
 * from infra/chatwoot/teams.json. The runbook is tracked in git, so it must carry no secret and
 * no customer data.
 */

const ROOT = process.cwd()
const RUNBOOK_REL = 'infra/vps/runbooks/crm-operators.md'
const RUNBOOK = path.join(ROOT, RUNBOOK_REL)

const REQUIRED_HEADINGS = [
  '## Systems and identities',
  '## Config as code',
  '## Roles and permissions (EspoCRM)',
  '## Chatwoot role mirror',
  '## Adding an operator',
  '## Removing an operator',
  '## Sales mailbox (roman@)',
  '## Follow-ups, reminders and the pipeline',
  '## Booking history mirror',
  '## Unique index overlay',
  '## Partner accounts seeding',
  '## Verification',
  '## Recovery',
]

const runbookExists = fs.existsSync(RUNBOOK)
const text = runbookExists ? fs.readFileSync(RUNBOOK, 'utf8') : ''
const lines = text.split('\n')

interface Section {
  heading: string
  line: number
  body: string[]
}

/** Heading/body parser. Lines inside fenced code blocks are never headings. */
function parseSections(src: string[]): Section[] {
  const all: Section[] = []
  let inFence = false
  let current: Section | null = null
  src.forEach((raw, i) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence
      if (current) current.body.push(raw)
      return
    }
    if (!inFence && /^#{1,6}\s+\S/.test(raw)) {
      current = { heading: raw.trimEnd(), line: i, body: [] }
      all.push(current)
      return
    }
    if (current) current.body.push(raw)
  })
  return all
}

const sections = parseSections(lines)

function sectionBody(heading: string): string[] {
  return sections.find((s) => s.heading === heading)?.body ?? []
}

function readJson(rel: string) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
}

const rolesJson = readJson('infra/espocrm/roles.json')
const fieldsJson = readJson('infra/espocrm/fields.json')
const teamsJson = readJson('infra/chatwoot/teams.json')

/** Markdown table rows (header first, separator dropped) of the first table whose header starts with `headerStart`. */
function parseTable(headerStart: string): string[][] {
  const start = lines.findIndex((l) => l.trim().startsWith(headerStart))
  if (start < 0) return []
  const rows: string[][] = []
  for (let i = start; i < lines.length; i++) {
    const l = lines[i].trim()
    if (!l.startsWith('|')) break
    if (/^\|[\s:|-]+\|$/.test(l)) continue
    rows.push(l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
  }
  return rows
}

type ScopeRule = boolean | { create?: string; read?: string; edit?: string; delete?: string } | undefined

/** Cell rule of the plan: false -> "no access"; missing -> "-"; true -> "yes"; object -> "create c, read r, edit e, delete d". */
function cellFor(rule: ScopeRule): string {
  if (rule === undefined) return '-'
  if (rule === false) return 'no access'
  if (rule === true) return 'yes'
  return `create ${rule.create}, read ${rule.read}, edit ${rule.edit}, delete ${rule.delete}`
}

const ROLE_COLUMNS = ['Dispatcher', 'Sales manager', 'Sync writer']

describe('CRM runbook: location', () => {
  it('lives under infra/vps/runbooks/', () => {
    expect(RUNBOOK_REL.startsWith('infra/vps/runbooks/')).toBe(true)
    expect(runbookExists).toBe(true)
  })
})

describe('CRM runbook: structure', () => {
  it.each(REQUIRED_HEADINGS)('has "%s" exactly once', (heading) => {
    expect(sections.filter((s) => s.heading === heading)).toHaveLength(1)
  })

  it.each(REQUIRED_HEADINGS)('"%s" is followed by a non-empty, non-heading line', (heading) => {
    const section = sections.find((s) => s.heading === heading)
    expect(section, `missing heading ${heading}`).toBeDefined()
    expect((section?.body ?? []).some((l) => l.trim() !== '' && !/^#{1,6}\s/.test(l))).toBe(true)
  })

  it('lists the required headings in the specified order', () => {
    const order = REQUIRED_HEADINGS.map((h) => sections.find((s) => s.heading === h)?.line ?? -1)
    expect(order.every((n) => n >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('has no other level-2 heading', () => {
    const level2 = sections.filter((s) => /^##\s/.test(s.heading)).map((s) => s.heading)
    expect(level2).toEqual(REQUIRED_HEADINGS)
  })
})

describe('CRM runbook: role table is pinned to roles.json', () => {
  const rows = parseTable('| Scope |')
  const [header, ...body] = rows

  const roles = rolesJson.roles as Array<{ name: string; data: Record<string, ScopeRule> }>
  const scopes = [...new Set(roles.flatMap((r) => Object.keys(r.data)))]

  it('roles.json declares exactly the three documented roles', () => {
    expect(roles.map((r) => r.name)).toEqual(ROLE_COLUMNS)
  })

  it('has the header "| Scope | Dispatcher | Sales manager | Sync writer |"', () => {
    expect(header).toEqual(['Scope', ...ROLE_COLUMNS])
  })

  it('has one row per scope that appears in any role', () => {
    expect(body.map((r) => r[0]).sort()).toEqual([...scopes].sort())
  })

  it.each(scopes)('scope %s: every cell equals the roles.json rule', (scope) => {
    const row = body.find((r) => r[0] === scope)
    expect(row, `no row for ${scope}`).toBeDefined()
    ROLE_COLUMNS.forEach((roleName, i) => {
      const role = roles.find((r) => r.name === roleName)
      expect(row?.[i + 1], `${scope} / ${roleName}`).toBe(cellFor(role?.data[scope]))
    })
  })
})

describe('CRM runbook: Dispatcher hidden Account fields', () => {
  const rows = parseTable('| Hidden Account field |')
  const listed = rows.slice(1).map((r) => r[0])
  const specs = buildRoleSpecs(rolesJson, fieldsJson) as unknown as Array<{
    name: string
    fieldData: Record<string, Record<string, unknown>>
  }>
  const dispatcher = specs.find((s) => s.name === 'Dispatcher')
  const hidden = Object.keys(dispatcher?.fieldData?.Account ?? {})

  it('hides at least one commercial field (guards against an empty comparison)', () => {
    expect(hidden.length).toBeGreaterThan(0)
  })

  it('lists exactly the fields buildRoleSpecs hides for the Dispatcher', () => {
    expect([...listed].sort()).toEqual([...hidden].sort())
  })
})

describe('CRM runbook: Chatwoot teams come from teams.json', () => {
  const teamNames = (teamsJson.teams as Array<{ name: string }>).map((t) => t.name)

  it('teams.json still declares Bookings and B2B', () => {
    expect(teamNames).toEqual(expect.arrayContaining(['Bookings', 'B2B']))
  })

  it.each(['Bookings', 'B2B'])('"Chatwoot role mirror" names team %s', (team) => {
    const body = sectionBody('## Chatwoot role mirror').join('\n')
    expect(body).toContain(team)
  })
})

describe('CRM runbook: tools, files and facts the phase added', () => {
  it('has enough content to be a runbook (at least 150 lines)', () => {
    expect(lines.length).toBeGreaterThanOrEqual(150)
  })

  it('names every tool, flag, file, identity and fact', () => {
    for (const needle of [
      'sync.mjs',
      'overlay.mjs',
      'verify-acl.mjs',
      'inspect.mjs',
      'backfill.mjs',
      '--dry-run',
      '--relink',
      '--audit',
      'account-candidates.mjs',
      'seed-accounts.mjs',
      'espocrm-config.env',
      'espocrm-sync.env',
      'prestigo-config',
      'prestigo-sync',
      'prestigo-admin',
      'Personal Email Account',
      'roman@rideprestigo.com',
      'Fetch Since',
      'Reminders',
      'notifications@rideprestigo.com',
      'Dispatcher',
      'Sales manager',
      'Sync writer',
      'agent',
      'administrator',
      'chatwoot-channels.md',
      'backup-restore.md',
      'Restore Drill Canary',
      'CBooking',
      'supabaseBookingId',
      'authApiUserLogDisabled',
    ]) {
      expect(text, `runbook must mention ${needle}`).toContain(needle)
    }
  })
})

describe('CRM runbook: operator steps (D-23)', () => {
  const adding = sectionBody('## Adding an operator').join('\n')
  const removing = sectionBody('## Removing an operator').join('\n')
  const mirror = sectionBody('## Chatwoot role mirror').join('\n')

  it('states that Chatwoot CE has only agent and administrator and that no agents exist yet', () => {
    expect(mirror).toContain('agent')
    expect(mirror).toContain('administrator')
    expect(mirror).toMatch(/no agents? (exist|has been created|have been created)/i)
  })

  it('"Adding an operator" covers both systems and ends with verify-acl.mjs', () => {
    expect(adding).toContain('EspoCRM')
    expect(adding).toContain('Chatwoot')
    expect(adding).toContain('verify-acl.mjs')
    expect(adding).toContain('inspect.mjs --status')
  })

  it('"Removing an operator" covers both systems and the reassignment of open work', () => {
    expect(removing).toContain('EspoCRM')
    expect(removing).toContain('Chatwoot')
    expect(removing).toMatch(/reassign/i)
    expect(removing).toContain('Task')
    expect(removing).toContain('Opportunit')
  })
})

describe('CRM runbook: mailbox rules (D-11, D-24)', () => {
  const mailbox = sectionBody('## Sales mailbox (roman@)').join('\n')

  it('says roman@ is a Personal Email Account and cites chatwoot-channels.md', () => {
    expect(mailbox).toContain('Personal Email Account')
    expect(text).toContain('chatwoot-channels.md')
  })

  it('tells sales users to send partner mail from the Opportunity (D-24)', () => {
    expect(mailbox).toMatch(/from the Opportunity/)
  })

  it('every line naming "Group Email Account" also says never or not', () => {
    const hits = lines.filter((l) => l.includes('Group Email Account'))
    for (const l of hits) expect(l, l).toMatch(/\b(never|not)\b/i)
  })

  it('every line naming roman@ together with Chatwoot says never or not', () => {
    const hits = lines.filter((l) => /roman@/i.test(l) && /chatwoot/i.test(l))
    expect(hits.length).toBeGreaterThan(0)
    for (const l of hits) expect(l, l).toMatch(/\b(never|not|no)\b/i)
  })

  it('every line pairing a connected mailbox address with an agent or Chatwoot says never, not or no (T-80-36)', () => {
    const hits = lines.filter((l) => /\b(roman|info|bookings)@/i.test(l) && /(agent|chatwoot)/i.test(l))
    expect(hits.length).toBeGreaterThan(0)
    for (const l of hits) expect(l, l).toMatch(/\b(never|not|no)\b/i)
  })
})

describe('CRM runbook: booking mirror and admin exception', () => {
  const mirror = sectionBody('## Booking history mirror').join('\n')

  it('documents the admin exception and the overwrite on the next backfill', () => {
    expect(mirror).toMatch(/owner can edit/i)
    expect(mirror).toMatch(/overwrit/i)
    expect(mirror).toContain('--relink')
    expect(mirror).toContain('--audit')
  })

  it('documents the phone rules operators need to know', () => {
    expect(mirror).toContain('E.164')
  })
})

describe('CRM runbook: no secrets and no customer data (T-80-35)', () => {
  const ALLOWED_LOCAL_PARTS = new Set(['roman', 'info', 'bookings', 'notifications'])
  const emails = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g) ?? []

  it('mentions only the rideprestigo.com role addresses', () => {
    expect(emails.length).toBeGreaterThan(0)
    for (const e of emails) {
      const [local, domain] = e.split('@')
      expect(domain.toLowerCase(), e).toBe('rideprestigo.com')
      expect(ALLOWED_LOCAL_PARTS.has(local.toLowerCase()), e).toBe(true)
    }
  })

  it.each([
    ['an ESPOCRM_ key followed by = and a value', /ESPOCRM_[A-Z_]+\s*=\s*\S+/],
    ['a 32+ character hex run', /\b[0-9a-fA-F]{32,}\b/],
    ['a 32+ character base64-like run', /[A-Za-z0-9+]{32,}/],
    ['the word password followed by : or = and a value', /password\s*[:=]\s*\S+/i],
    ['a smtp password assignment', /(RESEND|SMTP)_[A-Z_]*(PASSWORD|KEY)\s*=\s*\S+/],
    ['an API key header value', /X-Api-Key:\s*\S+/i],
  ])('has no %s', (_label, re) => {
    for (const l of lines) expect(l, l).not.toMatch(re)
  })

  it('has no phone number', () => {
    for (const l of lines) {
      expect(l, l).not.toMatch(/\+\d{7,}/)
      expect(l, l).not.toMatch(/\b\d{9,}\b/)
    }
  })
})
