// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as cand from '../infra/espocrm/lib/candidates.mjs'
import { parseArgs, runCandidates } from '../infra/espocrm/account-candidates.mjs'

// Synthetic rows only (example/test domains, fake companies) - T-80-07.
let n = 0
const r = (over: Record<string, unknown> = {}) => ({
  id: `row-${++n}`,
  client_email: 'someone@example.test',
  company_name: null as string | null,
  amount_eur: 100,
  amount_czk: null as number | null,
  ...over,
})

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+/

describe('grouping and qualification', () => {
  it('groups by corporate domain case-insensitively and counts distinct bookers', () => {
    const out = cand.buildCandidates([
      r({ client_email: 'a@travelexpress.test' }),
      r({ client_email: 'B@TravelExpress.test' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].domain).toBe('travelexpress.test')
    expect(out[0].bookerCount).toBe(2)
    expect(out[0].bookingCount).toBe(2)
  })

  it('the same booker twice is one booker and does not qualify alone', () => {
    const out = cand.buildCandidates([
      r({ client_email: 'a@solo.test' }),
      r({ client_email: ' A@Solo.test ' }),
    ])
    expect(out).toEqual([])
  })

  it('a single booker without company_name does not qualify', () => {
    expect(cand.buildCandidates([r({ client_email: 'one@solo.test' })])).toEqual([])
  })

  it('a single booker with company_name qualifies', () => {
    const out = cand.buildCandidates([r({ client_email: 'one@solo.test', company_name: 'Solo Ltd' })])
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Solo Ltd')
    expect(out[0].domain).toBe('solo.test')
    expect(out[0].companyNames).toEqual(['Solo Ltd'])
  })

  it('a free-mail booker with company_name becomes a company-only candidate', () => {
    const out = cand.buildCandidates([r({ client_email: 'x@gmail.com', company_name: 'TLTGO' })])
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('TLTGO')
    expect(out[0].domain).toBeNull()
    expect(out[0].key).toBe('company:tltgo')
  })

  it('company-only rows with different casing of the name form one candidate', () => {
    const out = cand.buildCandidates([
      r({ client_email: 'x@gmail.com', company_name: 'TLTGO' }),
      r({ client_email: 'y@seznam.cz', company_name: ' tltgo ' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].bookerCount).toBe(2)
  })

  it('company-only rows merge into the corporate-domain group carrying the same company name', () => {
    const out = cand.buildCandidates([
      r({ client_email: 'a@acme-travel.test', company_name: 'Acme Travel' }),
      r({ client_email: 'p@gmail.com', company_name: 'acme travel' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].domain).toBe('acme-travel.test')
    expect(out[0].bookingCount).toBe(2)
    expect(out[0].bookerCount).toBe(2)
  })

  it.each([['gmail.com'], ['seznam.cz'], ['icloud.com'], ['rideprestigo.com'], ['Outlook.com']])(
    '%s never forms a domain candidate',
    (domain) => {
      const out = cand.buildCandidates([
        r({ client_email: `a@${domain}` }),
        r({ client_email: `b@${domain}` }),
        r({ client_email: `c@${domain}` }),
      ])
      expect(out).toEqual([])
    },
  )

  it("drops the 'Restore Drill Canary' company in any case", () => {
    const out = cand.buildCandidates([
      r({ client_email: 'a@canary.test', company_name: 'restore drill canary' }),
      r({ client_email: 'b@canary.test', company_name: 'RESTORE DRILL CANARY' }),
      r({ client_email: 'c@gmail.com', company_name: 'Restore Drill Canary' }),
    ])
    expect(out).toEqual([])
  })

  it('empty input and rows without email or company give no candidate', () => {
    expect(cand.buildCandidates([])).toEqual([])
    expect(
      cand.buildCandidates([r({ client_email: null }), r({ client_email: '', company_name: '  ' })]),
    ).toEqual([])
  })

  it('ignores invalid email strings', () => {
    expect(
      cand.buildCandidates([r({ client_email: 'no-at-sign' }), r({ client_email: 'x@' })]),
    ).toEqual([])
  })
})

describe('naming and typing', () => {
  it('name is the most frequent company_name, else the capitalised domain label', () => {
    const named = cand.buildCandidates([
      r({ client_email: 'a@grp.test', company_name: 'Group A' }),
      r({ client_email: 'b@grp.test', company_name: 'Group B' }),
      r({ client_email: 'c@grp.test', company_name: 'Group B' }),
    ])
    expect(named[0].name).toBe('Group B')
    expect(named[0].companyNames).toEqual(['Group A', 'Group B'])

    const unnamed = cand.buildCandidates([r({ client_email: 'a@travelexpress.test' }), r({ client_email: 'b@travelexpress.test' })])
    expect(unnamed[0].name).toBe('Travelexpress')
  })

  it.each([
    ['Grand Hotel Prague', 'Hotel'],
    ['TravelExpress', 'Agency'],
    ['Embassy of X', 'Embassy'],
    ['Acme Corp', 'Other'],
    ['Palace Residence', 'Hotel'],
    ['City Tours DMC', 'Agency'],
    ['Corporate Events Ltd', 'Embassy'],
  ])('guessAccountType(%s) -> %s', (name, type) => {
    expect(cand.guessAccountType(name)).toBe(type)
    expect(cand.ACCOUNT_TYPE_VALUES).toContain(type)
  })

  it('suggestedType follows the candidate name', () => {
    const out = cand.buildCandidates([r({ client_email: 'a@x.test', company_name: 'Grand Hotel Prague' })])
    expect(out[0].suggestedType).toBe('Hotel')
  })
})

describe('shape, totals and ordering', () => {
  it('every candidate starts with confirm false, type null and stores no email addresses', () => {
    const out = cand.buildCandidates([
      r({ client_email: 'a@travelexpress.test' }),
      r({ client_email: 'b@travelexpress.test' }),
    ])
    for (const c of out) {
      expect(c.confirm).toBe(false)
      expect(c.type).toBeNull()
      expect(JSON.stringify(c)).not.toMatch(EMAIL_PATTERN)
      expect(Object.keys(c).sort()).toEqual(
        ['bookerCount', 'bookingCount', 'companyNames', 'confirm', 'domain', 'key', 'name', 'suggestedType', 'totalEur', 'type'],
      )
    }
  })

  it('totalEur sums amountEur of its rows, ignoring nulls and converting CZK', () => {
    const out = cand.buildCandidates([
      r({ client_email: 'a@sum.test', amount_eur: 100 }),
      r({ client_email: 'b@sum.test', amount_eur: null, amount_czk: 2500 }),
      r({ client_email: 'c@sum.test', amount_eur: null, amount_czk: null }),
    ])
    expect(out[0].totalEur).toBe(200)
    expect(out[0].bookingCount).toBe(3)
  })

  const MIXED = [
    r({ client_email: 'a@alpha.test' }),
    r({ client_email: 'b@alpha.test' }),
    r({ client_email: 'a@beta.test' }),
    r({ client_email: 'b@beta.test' }),
    r({ client_email: 'c@beta.test' }),
    r({ client_email: 'x@gmail.com', company_name: 'Zeta Co' }),
    r({ client_email: 'a@gamma.test' }),
    r({ client_email: 'b@gamma.test' }),
  ]

  it('sorts by bookingCount desc then name asc', () => {
    const out = cand.buildCandidates(MIXED)
    expect(out.map((c: { name: string }) => c.name)).toEqual(['Beta', 'Alpha', 'Gamma', 'Zeta Co'])
  })

  it('shuffling the input rows gives an identical array (metamorphic)', () => {
    const base = cand.buildCandidates(MIXED)
    const reversed = cand.buildCandidates([...MIXED].reverse())
    const rotated = cand.buildCandidates([...MIXED.slice(3), ...MIXED.slice(0, 3)])
    expect(reversed).toEqual(base)
    expect(rotated).toEqual(base)
  })
})

describe('selectConfirmed', () => {
  const base = { key: 'domain:a.test', name: 'A', domain: 'a.test', companyNames: [], bookerCount: 2, bookingCount: 2, totalEur: 0, suggestedType: 'Other' }

  it('returns only confirm:true entries', () => {
    const out = cand.selectConfirmed([
      { ...base, confirm: true, type: 'Hotel' },
      { ...base, key: 'domain:b.test', confirm: false, type: null },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('Hotel')
  })

  it.each([['Partner'], [null], [undefined], ['hotel']])('rejects confirm:true with type %s', (type) => {
    expect(() => cand.selectConfirmed([{ ...base, confirm: true, type }])).toThrow()
  })

  it('rejects the canary account name', () => {
    expect(() =>
      cand.selectConfirmed([{ ...base, name: 'restore drill canary', confirm: true, type: 'Other' }]),
    ).toThrow(/canary/i)
  })

  it('does not validate unconfirmed entries', () => {
    expect(cand.selectConfirmed([{ ...base, confirm: false, type: 'Partner' }])).toEqual([])
  })
})

describe('formatCandidateTable', () => {
  it('contains names, domains, company names and counts but never an email address', () => {
    const rows = [
      r({ client_email: 'a@travelexpress.test', company_name: 'TravelExpress s.r.o.' }),
      r({ client_email: 'b@travelexpress.test' }),
      r({ client_email: 'x@gmail.com', company_name: 'TLTGO' }),
    ]
    const table = cand.formatCandidateTable(cand.buildCandidates(rows))
    expect(table).toContain('TravelExpress s.r.o.')
    expect(table).toContain('travelexpress.test')
    expect(table).toContain('TLTGO')
    expect(table).toMatch(/\b2\b/)
    expect(table).not.toMatch(EMAIL_PATTERN)
  })

  it('handles an empty list', () => {
    expect(typeof cand.formatCandidateTable([])).toBe('string')
  })
})

describe('constants', () => {
  it('exposes the D-02 types, the canary name and the free-mail list', () => {
    expect(cand.ACCOUNT_TYPE_VALUES).toEqual(['Hotel', 'Agency', 'Corporate', 'Embassy', 'Other'])
    expect(cand.CANARY_ACCOUNT_NAME).toBe('Restore Drill Canary')
    for (const d of ['gmail.com', 'seznam.cz', 'icloud.com', 'rideprestigo.com', 'mail.ru', 'web.de']) {
      expect(cand.FREE_MAIL_DOMAINS).toContain(d)
    }
  })

  it('emailDomain lower-cases and returns null for invalid input', () => {
    expect(cand.emailDomain(' A@Hotel.CZ ')).toBe('hotel.cz')
    expect(cand.emailDomain('nope')).toBeNull()
    expect(cand.emailDomain(null)).toBeNull()
  })
})

describe('account-candidates CLI (runCandidates)', () => {
  function setup() {
    const work = mkdtempSync(join(tmpdir(), 'cand-cli-'))
    const input = join(work, 'export')
    mkdirSync(input)
    const rows = [
      r({ client_email: 'a@travelexpress.test', company_name: 'TravelExpress' }),
      r({ client_email: 'b@travelexpress.test', company_name: 'TravelExpress' }),
      r({ client_email: 'p@example.test', company_name: 'Restore Drill Canary' }),
      r({ client_email: 'q@gmail.com' }),
    ]
    writeFileSync(join(input, 'page-01.json'), JSON.stringify(rows))
    return { work, input }
  }
  const capture = () => {
    const out: string[] = []
    const err: string[] = []
    return { out, err, log: (l: string) => out.push(l), error: (l: string) => err.push(l) }
  }

  it('writes candidates.json with confirm false and type null, prints candidates: N', async () => {
    const { work, input } = setup()
    const io = capture()
    const outFile = join(work, 'candidates.json')
    const code = await runCandidates({ input, out: outFile, workDir: work, log: io.log, error: io.error })
    expect(code).toBe(0)
    const parsed = JSON.parse(readFileSync(outFile, 'utf8'))
    expect(typeof parsed.generatedAt).toBe('string')
    expect(parsed.candidates).toHaveLength(1)
    for (const c of parsed.candidates) {
      expect(c.confirm).toBe(false)
      expect(c.type).toBeNull()
    }
    expect(io.out.join('\n')).toContain('candidates: 1')
  })

  it('stdout holds names but no email address and not the canary', async () => {
    const { work, input } = setup()
    const io = capture()
    await runCandidates({ input, out: join(work, 'c.json'), workDir: work, log: io.log, error: io.error })
    const text = io.out.join('\n')
    expect(text).toContain('TravelExpress')
    expect(text).not.toMatch(EMAIL_PATTERN)
    expect(text).not.toContain('Canary')
  })

  it('refuses an --out path outside the work dir and writes nothing', async () => {
    const { work, input } = setup()
    const elsewhere = mkdtempSync(join(tmpdir(), 'cand-elsewhere-'))
    const target = join(elsewhere, 'candidates.json')
    const io = capture()
    const code = await runCandidates({ input, out: target, workDir: work, log: io.log, error: io.error })
    expect(code).toBe(1)
    expect(existsSync(target)).toBe(false)
  })

  it('a missing input exits 1 and names only the path', async () => {
    const { work } = setup()
    const io = capture()
    const missing = join(work, 'nope')
    const code = await runCandidates({ input: missing, out: join(work, 'c.json'), workDir: work, log: io.log, error: io.error })
    expect(code).toBe(1)
    expect(io.err.join('\n')).toContain(missing)
  })

  it('parseArgs reads --input and --out, rejects unknown flags', () => {
    expect(parseArgs(['--input', 'x', '--out=y'])).toMatchObject({ input: 'x', out: 'y' })
    expect(() => parseArgs(['--nope'])).toThrow()
  })
})
