// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Phase 78-05 (WA-03): structure, safety and privacy assertions for the
 * WhatsApp runbook and the Chatwoot channel inventory.
 *
 * The runbook is the operator's only safety net (the business number is in no
 * phone app), so this test keeps it complete and keeps secrets and the owner's
 * former personal number out of tracked git history.
 */

const ROOT = process.cwd()
const RUNBOOK_REL = 'infra/vps/runbooks/whatsapp.md'
const CHANNELS_REL = 'infra/vps/runbooks/chatwoot-channels.md'
const RUNBOOK = path.join(ROOT, RUNBOOK_REL)
const CHANNELS = path.join(ROOT, CHANNELS_REL)

const TASK1_HEADINGS = [
  '## Channel facts',
  '## Signature enforcement',
  '## Recovery',
  '## Never delete the WhatsApp inbox without a fresh backup',
  '## VPS down: no phone-app fallback',
  '## Token and app rotation',
  '## Two-step PIN and re-registration',
  '## SIM custody and the business line',
]

const TASK2_HEADINGS = [
  '## Owner onboarding checklist',
  '## Pricing and the monthly check',
  '## Templates, quality rating and messaging limits',
  '## Window-closing label',
  '## Personal number transition',
  '## Off-site listings checklist',
]

const REQUIRED_HEADINGS = [...TASK1_HEADINGS, ...TASK2_HEADINGS]

const runbookExists = fs.existsSync(RUNBOOK)
const text = runbookExists ? fs.readFileSync(RUNBOOK, 'utf8') : ''
const lines = text.split('\n')

interface Section {
  heading: string
  line: number
  body: string[]
}

/** Heading/body parser. Lines inside fenced code blocks are never headings. */
function parseSections(src: string[]): { headings: Section[]; all: Section[] } {
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
  return { headings: all, all }
}

const parsed = parseSections(lines)

/** Old-number needle assembled from parts: this file never spells the number. */
const OLD_PARTS = ['725', '986', '855']
const SEP = '[ \\u00A0\\u202F-]?'
const OLD_NUMBER_RE = new RegExp(
  `(?:(?:\\+|00)?420${SEP})?${OLD_PARTS.join(SEP)}`,
)

describe('WhatsApp runbook: location', () => {
  it('lives under infra/vps/runbooks/, not infra/chatwoot/', () => {
    expect(RUNBOOK_REL.startsWith('infra/vps/runbooks/')).toBe(true)
    expect(runbookExists).toBe(true)
    expect(fs.existsSync(path.join(ROOT, 'infra/chatwoot/whatsapp.md'))).toBe(false)
  })
})

describe('WhatsApp runbook: structure', () => {
  it.each(REQUIRED_HEADINGS)('has "%s" exactly once', (heading) => {
    const hits = parsed.all.filter((s) => s.heading === heading)
    expect(hits).toHaveLength(1)
  })

  it.each(REQUIRED_HEADINGS)('"%s" is followed by a non-empty, non-heading line', (heading) => {
    const section = parsed.all.find((s) => s.heading === heading)
    expect(section, `missing heading ${heading}`).toBeDefined()
    const hasBody = (section?.body ?? []).some((l) => l.trim() !== '' && !/^#{1,6}\s/.test(l))
    expect(hasBody).toBe(true)
  })

  it('lists the required headings in the specified order', () => {
    const order = REQUIRED_HEADINGS.map((h) => parsed.all.find((s) => s.heading === h)?.line ?? -1)
    expect(order.every((n) => n >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('names the recovery and operating tools it depends on', () => {
    for (const needle of [
      'inspect.mjs --whatsapp',
      '--expect-connected',
      'whatsapp-channel.mjs',
      '--number',
      '--register',
      '--harden',
      '--probe',
      '--sync-templates',
      '--register-webhook',
      'whatsapp-templates.mjs',
      '--validate',
      '--dry-run',
      '--status',
      '--allow-edit',
      'sync.mjs',
      '--window-delay-override',
      'META_WA_SYSTEM_USER_TOKEN',
      'META_WA_APP_SECRET',
      'META_WA_WABA_ID',
      'META_WA_PHONE_NUMBER_ID',
      'META_WA_GRAPH_VERSION',
      '~/.config/prestigo/meta-whatsapp.env',
      'BUSINESS_PHONE_E164',
    ]) {
      expect(text, `runbook must mention ${needle}`).toContain(needle)
    }
  })
})

function sectionBody(heading: string): string[] {
  return parsed.all.find((s) => s.heading === heading)?.body ?? []
}

describe('WhatsApp runbook: pricing (D-19)', () => {
  const body = sectionBody('## Pricing and the monthly check')
  const tableLines = body.filter((l) => l.trim().startsWith('|'))
  const isSeparator = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l)

  it('has a markdown table whose header names EUR', () => {
    expect(tableLines.length).toBeGreaterThan(2)
    expect(tableLines[0]).toMatch(/EUR/)
    expect(isSeparator(tableLines[1])).toBe(true)
  })

  it('has at least 8 data rows', () => {
    const dataRows = tableLines.slice(2).filter((l) => !isSeparator(l))
    expect(dataRows.length).toBeGreaterThanOrEqual(8)
  })

  it('covers Czechia', () => {
    expect(tableLines.join('\n')).toMatch(/Czech/)
  })

  it('has exactly one "Rates as of YYYY-MM-DD" line', () => {
    const hits = lines.filter((l) => /Rates as of \d{4}-\d{2}-\d{2}/.test(l))
    expect(hits).toHaveLength(1)
  })

  it('states the 2026-10-01 service-message billing and the monthly owner check', () => {
    const joined = body.join('\n')
    expect(joined).toContain('2026-10-01')
    expect(joined).toMatch(/WhatsApp Manager/)
    expect(joined).toMatch(/monthly/i)
  })
})

describe('WhatsApp runbook: onboarding, transition and listings', () => {
  it('holds the exact D-05 display name and the stop-and-ask rule', () => {
    const body = sectionBody('## Owner onboarding checklist').join('\n')
    expect(body).toContain('Prestigo - Premium Chauffeur Service Prague')
    expect(body).toMatch(/stop and ask/i)
  })

  it('transition section covers Always send, the return path and the end date', () => {
    const body = sectionBody('## Personal number transition').join('\n')
    expect(body).toContain('Always send')
    expect(body).toMatch(/backup/i)
    expect(body).toMatch(/restore/i)
    expect(body).toMatch(/end date/i)
  })

  it('off-site checklist names every required surface', () => {
    const body = sectionBody('## Off-site listings checklist').join('\n')
    for (const needle of [
      'Google Business Profile',
      'partner hotels',
      'business cards',
      'email signatures',
      'generate_invoice',
      'send-*.mjs',
      'Telegram',
      'Facebook',
      'Instagram',
      'Stripe',
    ]) {
      expect(body, `off-site checklist must name ${needle}`).toContain(needle)
    }
  })
})

describe('WhatsApp runbook: never-delete rule (T-78-17)', () => {
  const section = parsed.all.find(
    (s) => s.heading === '## Never delete the WhatsApp inbox without a fresh backup',
  )
  const body = (section?.body ?? []).join('\n')

  it('demands a fresh backup and links backup-restore.md', () => {
    expect(body).toContain('fresh backup')
    expect(body).toContain('backup-restore.md')
  })

  it('says deleting the inbox tears down webhooks and deregisters the number', () => {
    expect(body).toMatch(/tears? down/i)
    expect(body).toMatch(/webhook/i)
    expect(body).toMatch(/deregister/i)
  })

  it('never offers deletion as a first-line fix', () => {
    expect(body).toMatch(/recovery lever|Recovery/)
  })
})

describe('WhatsApp runbook: privacy and secrets (T-78-16)', () => {
  it('never contains the owner former number in any separator form', () => {
    expect(text).not.toMatch(OLD_NUMBER_RE)
  })

  it('the needle really matches every separator form (self-check)', () => {
    const [a, b, c] = OLD_PARTS
    const seps = [' ', ' ', ' ', '-', '']
    const prefixes = ['', '420', '+420', '00420', '+420 ', '+420 ', '+420 ', '+420-']
    for (const s of seps) {
      for (const p of prefixes) {
        expect(`${p}${a}${s}${b}${s}${c}`).toMatch(OLD_NUMBER_RE)
      }
    }
  })

  it('assigns no value to a META_WA_ name', () => {
    const offenders = lines.filter((l) => /META_WA_[A-Z0-9_]*\s*=\s*[A-Za-z0-9+/_.:-]/.test(l))
    expect(offenders).toEqual([])
  })

  it('contains no Meta access-token shaped string', () => {
    expect(text).not.toMatch(/EAA[A-Za-z0-9]{40,}/)
  })

  it('contains no PIN followed by six digits', () => {
    expect(text).not.toMatch(/pin[^\d\n]{0,3}\d{6}/i)
  })
})

describe('chatwoot-channels.md inventory', () => {
  const channels = fs.readFileSync(CHANNELS, 'utf8')

  it('has a WhatsApp inventory row with Channel::Whatsapp and ch-whatsapp', () => {
    const row = channels
      .split('\n')
      .find((l) => l.startsWith('|') && l.includes('Channel::Whatsapp'))
    expect(row, 'inventory row missing').toBeDefined()
    expect(row).toContain('ch-whatsapp')
  })

  it('points to whatsapp.md', () => {
    expect(channels).toContain('whatsapp.md')
  })

  it('no longer says WhatsApp is not a Chatwoot inbox yet', () => {
    expect(channels).not.toContain('is not a Chatwoot inbox yet')
  })

  it('states the business number has no phone-app client', () => {
    expect(channels).toMatch(/no phone-app client/i)
  })

  it('does not contain the owner former number either', () => {
    expect(channels).not.toMatch(OLD_NUMBER_RE)
  })
})
