// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { normalizePhone } from '@/lib/phone'
import {
  ERASED_EMAIL_DOMAIN,
  normalizeIdentityEmail,
  normalizeIdentityPhone,
} from '@/lib/identity'
import { normalizeLeadEmail } from '@/lib/lead-mapping'

// Phase 82, plan 82-05 (SYNC-03): phone matching for the identity resolver.
//
// Three layers, one fixture file (tests/fixtures/identity-cases.json):
//   1. lib/identity.ts normalisers against the fixture `expected` values;
//   2. a small pure REFERENCE MODEL of resolver rules 1-5 run over the fixture scenarios;
//   3. text-level contract checks of supabase/migrations/072_identity_phone_rules.sql.
// The live behaviour of the SQL is proven by the rolled-back smoke 82-05-smoke.sql, which runs
// the very same fixtures against the database (T-82-16: SQL and TS rules cannot drift apart).

type RawCase = { raw: string | null; expected: string | null }

type SetupStep =
  | { op: 'flag-manual'; phone: string }
  | { op: 'erase'; step: number }
type ResolveStep = {
  email: string | null
  phone: string | null
  basis: 'email' | 'signup'
  user: string | null
}
type Step = SetupStep | ResolveStep

type Scenario = {
  name: string
  note: string
  steps: Step[]
  expect: {
    identities: number
    phoneMerges: number
    sharedPhones: { phone: string; source: string }[]
    phoneRows: number
    stepIdentity: (number | null)[]
    stepOutcome: (string | null)[]
    personPhones?: Record<string, string[]>
    identityUsers?: Record<string, number>
  }
}

const fixtures = JSON.parse(
  readFileSync(join(process.cwd(), 'tests', 'fixtures', 'identity-cases.json'), 'utf8'),
) as { emails: RawCase[]; phones: RawCase[]; scenarios: Scenario[] }

// ── 1. Normalisers ──────────────────────────────────────────────────────────

describe('identity fixtures', () => {
  it('has the required breadth', () => {
    expect(fixtures.phones.length).toBeGreaterThanOrEqual(25)
    expect(fixtures.scenarios.length).toBeGreaterThanOrEqual(8)
    const names = new Set(fixtures.scenarios.map((s) => s.name))
    for (const k of [
      'email-merge',
      'phone-merge-then-shared',
      'third-email-new-identity',
      'collision-shared',
      'manual-shared',
      'signup-guard',
      'erasing-owner',
      'phone-without-email',
    ]) {
      expect(names.has(k), `scenario ${k}`).toBe(true)
    }
  })
})

describe('normalizeIdentityPhone', () => {
  it('is lib/phone.ts normalizePhone, nothing else', () => {
    expect(normalizeIdentityPhone).toBe(normalizePhone)
  })

  it.each(fixtures.phones.map((c) => [JSON.stringify(c.raw), c] as const))(
    'fixture %s',
    (_label, c) => {
      expect(normalizeIdentityPhone(c.raw)).toBe(c.expected)
    },
  )

  it('never guesses a country (a local number stays unusable)', () => {
    expect(normalizeIdentityPhone('777 900 101')).toBeNull()
    expect(normalizeIdentityPhone('0777900101')).toBeNull()
  })
})

describe('normalizeIdentityEmail', () => {
  it.each(fixtures.emails.map((c) => [JSON.stringify(c.raw).slice(0, 60), c] as const))(
    'fixture %s',
    (_label, c) => {
      expect(normalizeIdentityEmail(c.raw)).toBe(c.expected)
    },
  )

  it('rejects the GNet placeholder and the erased domain, lower-cases and trims', () => {
    expect(normalizeIdentityEmail('x@gnet.local')).toBeNull()
    expect(normalizeIdentityEmail(`x@${ERASED_EMAIL_DOMAIN}`)).toBeNull()
    expect(ERASED_EMAIL_DOMAIN).toBe('erased.invalid')
    expect(normalizeIdentityEmail('  Jane@Example.COM ')).toBe('jane@example.com')
    expect(normalizeIdentityEmail(undefined)).toBeNull()
  })

  it('agrees with normalizeLeadEmail wherever the lead rule gives an address', () => {
    for (const c of fixtures.emails) {
      const lead = normalizeLeadEmail(c.raw)
      if (lead !== null && !lead.endsWith('@erased.invalid')) {
        expect(normalizeIdentityEmail(c.raw)).toBe(c.expected === null ? null : lead)
      }
    }
  })
})

// ── 2. Reference model of identity_resolve_core rules 1-5 ───────────────────

type ModelIdentity = {
  userId: string | null
  erasing: boolean
  emails: { email: string; basis: string; viaPhone: string | null }[]
  phones: Set<string>
}

type RunResult = {
  identities: ModelIdentity[]
  flags: Map<string, { shared: boolean; source: string }>
  stepIdentity: (number | null)[]
  stepOutcome: (string | null)[]
}

/** Mirrors supabase/migrations/072_identity_phone_rules.sql identity_resolve_core, rule by rule. */
function runModel(steps: Step[]): RunResult {
  const identities: ModelIdentity[] = []
  const flags = new Map<string, { shared: boolean; source: string }>()
  const emailOwner = new Map<string, number>()
  const stepIdentity: (number | null)[] = []
  const stepOutcome: (string | null)[] = []

  const isShared = (p: string) => flags.get(p)?.shared === true
  const owners = (p: string) =>
    identities.map((x, i) => [x, i] as const).filter(([x]) => x.phones.has(p)).map(([, i]) => i)
  const flagAuto = (p: string) => {
    if (!flags.has(p)) flags.set(p, { shared: true, source: 'auto' })
  }
  const attachUser = (idx: number, user: string | null) => {
    if (user === null) return
    if (identities[idx].userId === null && !identities.some((x) => x.userId === user)) {
      identities[idx].userId = user
    }
  }
  /** Rules 2 and 3: store the phone on `idx`, or flag it shared when a different live person has it. */
  const handlePhone = (idx: number, p: string | null) => {
    if (p === null) return
    if (owners(p).some((o) => o !== idx && !identities[o].erasing)) flagAuto(p)
    else identities[idx].phones.add(p)
  }

  for (const step of steps) {
    if ('op' in step) {
      if (step.op === 'flag-manual') flags.set(step.phone, { shared: true, source: 'manual' })
      else identities[stepIdentity[step.step] as number].erasing = true
      stepIdentity.push(null)
      stepOutcome.push(null)
      continue
    }

    const e = step.email === null ? null : normalizeIdentityEmail(`${step.email}@example.test`)
    const rawPhone = normalizeIdentityPhone(step.phone)
    const p = rawPhone !== null && !isShared(rawPhone) ? rawPhone : null

    // Rule 1: no usable email -> no identity, whatever the phone.
    if (e === null) {
      stepIdentity.push(null)
      stepOutcome.push('no_identity')
      continue
    }

    // Rule 2: the email already has an owner.
    const owned = emailOwner.get(e)
    if (owned !== undefined) {
      if (identities[owned].erasing) {
        stepIdentity.push(owned)
        stepOutcome.push('erasing')
        continue
      }
      attachUser(owned, step.user)
      handlePhone(owned, p)
      stepIdentity.push(owned)
      stepOutcome.push('resolved')
      continue
    }

    // Rule 3: new email, but the signed-in user already has an identity.
    if (step.user !== null) {
      const j = identities.findIndex((x) => x.userId === step.user)
      if (j !== -1) {
        if (identities[j].erasing) {
          stepIdentity.push(j)
          stepOutcome.push('erasing')
          continue
        }
        identities[j].emails.push({ email: e, basis: 'signup', viaPhone: null })
        emailOwner.set(e, j)
        handlePhone(j, p)
        stepIdentity.push(j)
        stepOutcome.push('resolved')
        continue
      }
    }

    // Rule 4: new email, un-shared phone owned by exactly one live identity -> merge once, then shared.
    if (p !== null) {
      const o = owners(p)
      if (o.length === 1) {
        const j = o[0]
        const blocked =
          step.user !== null && identities[j].userId !== null && identities[j].userId !== step.user
        if (!identities[j].erasing && !blocked) {
          identities[j].emails.push({ email: e, basis: 'phone', viaPhone: p })
          emailOwner.set(e, j)
          attachUser(j, step.user)
          flagAuto(p)
          stepIdentity.push(j)
          stepOutcome.push('resolved')
          continue
        }
      }
    }

    // Rule 5: a brand-new person.
    const n = identities.length
    identities.push({
      userId: step.user,
      erasing: false,
      emails: [{ email: e, basis: step.basis, viaPhone: null }],
      phones: new Set(),
    })
    emailOwner.set(e, n)
    if (p !== null) {
      const o = owners(p).filter((x) => x !== n)
      if (o.some((x) => !identities[x].erasing)) flagAuto(p)
      else if (o.length === 0) identities[n].phones.add(p)
      // owned only by an erasing identity: ignored
    }
    stepIdentity.push(n)
    stepOutcome.push('resolved')
  }
  return { identities, flags, stepIdentity, stepOutcome }
}

function assertScenario(sc: Scenario) {
  const r = runModel(sc.steps)
  const ex = sc.expect
  expect(r.identities.length, 'identities').toBe(ex.identities)
  expect(
    r.identities.reduce((n, i) => n + i.emails.filter((m) => m.basis === 'phone').length, 0),
    'phone merges',
  ).toBe(ex.phoneMerges)
  const shared = [...r.flags.entries()]
    .filter(([, f]) => f.shared)
    .map(([phone, f]) => ({ phone, source: f.source }))
    .sort((a, b) => a.phone.localeCompare(b.phone))
  expect(shared, 'shared phones').toEqual(
    [...ex.sharedPhones].sort((a, b) => a.phone.localeCompare(b.phone)),
  )
  expect(
    r.identities.reduce((n, i) => n + i.phones.size, 0),
    'stored phone rows',
  ).toBe(ex.phoneRows)
  expect(r.stepIdentity, 'step identities').toEqual(ex.stepIdentity)
  expect(r.stepOutcome, 'step outcomes').toEqual(ex.stepOutcome)
  for (const [idx, want] of Object.entries(ex.personPhones ?? {})) {
    // identity_person lists a stored phone unless phone_flags says shared.
    const got = [...r.identities[Number(idx)].phones].filter((p) => r.flags.get(p)?.shared !== true)
    expect(got.sort(), `identity_person(${idx}).phones`).toEqual([...want].sort())
  }
  for (const [label, idx] of Object.entries(ex.identityUsers ?? {})) {
    expect(r.identities[idx].userId, `user ${label}`).toBe(label)
  }
  return r
}

describe('reference model over the shared scenarios', () => {
  it.each(fixtures.scenarios.map((s) => [s.name, s] as const))('%s', (_name, sc) => {
    assertScenario(sc)
  })
})

function scenario(name: string): Scenario {
  const sc = fixtures.scenarios.find((s) => s.name === name)
  if (!sc) throw new Error(`scenario ${name} missing from the fixture file`)
  return sc
}

describe('D-04 phone merge', () => {
  it('a new email with the un-shared phone of one person joins them, marked "merged by phone"', () => {
    const r = assertScenario(scenario('phone-merge-then-shared'))
    const merged = r.identities[0].emails[1]
    expect(merged.basis).toBe('phone')
    expect(merged.viaPhone).toMatch(/^\+420777/)
  })

  it('phone-merge-then-shared: the merge itself makes the number shared (source auto)', () => {
    const r = assertScenario(scenario('phone-merge-then-shared'))
    const flag = r.flags.get(r.identities[0].emails[1].viaPhone as string)
    expect(flag).toEqual({ shared: true, source: 'auto' })
  })

  it('a third email with that phone creates a new identity', () => {
    const r = assertScenario(scenario('third-email-new-identity'))
    expect(r.identities).toHaveLength(2)
    expect(r.identities[1].phones.size).toBe(0)
  })

  it('a phone alone never creates or extends an identity', () => {
    const r = assertScenario(scenario('phone-without-email'))
    expect(r.identities).toHaveLength(0)
    expect(r.flags.size).toBe(0)
  })
})

describe('D-05 shared numbers', () => {
  it('adjacency: exactly one email on a phone is not shared; the second distinct email makes it shared', () => {
    const one = assertScenario(scenario('adjacency-single-not-shared'))
    expect(one.flags.size).toBe(0)
    const two = assertScenario(scenario('phone-merge-then-shared'))
    expect([...two.flags.values()].every((f) => f.shared && f.source === 'auto')).toBe(true)
    expect(two.flags.size).toBe(1)
  })

  it('collision: an email-matched person bringing a phone another person owns flags it shared, no merge', () => {
    const r = assertScenario(scenario('collision-shared'))
    expect(r.identities.flatMap((i) => i.emails).filter((m) => m.basis === 'phone')).toHaveLength(0)
    expect([...r.flags.values()]).toEqual([{ shared: true, source: 'auto' }])
  })

  it('manual: an owner-flagged number is never used for matching and never reaches identity_person', () => {
    const pre = assertScenario(scenario('manual-shared'))
    expect(pre.identities).toHaveLength(2)
    expect(pre.identities.every((i) => i.phones.size === 0)).toBe(true)
    const late = assertScenario(scenario('manual-shared-after-owner'))
    expect(late.identities).toHaveLength(2)
  })

  it('manual flags are never overwritten by an automatic flag', () => {
    const r = runModel([
      { op: 'flag-manual', phone: '+420777909001' },
      { email: 'a', phone: '+420777909001', basis: 'email', user: null },
    ])
    expect(r.flags.get('+420777909001')?.source).toBe('manual')
  })

  it('signup guard: a signup is never merged into an identity of another account', () => {
    const r = assertScenario(scenario('signup-guard'))
    expect(r.identities[0].userId).toBe('U1')
    expect(r.identities[1].userId).toBe('U2')
    expect(r.identities.flatMap((i) => i.emails).filter((m) => m.basis === 'phone')).toHaveLength(0)
    expect([...r.flags.values()]).toEqual([{ shared: true, source: 'auto' }])
  })

  it('a signup whose phone belongs to a guest joins the guest and claims the account', () => {
    const r = assertScenario(scenario('signup-phone-merge'))
    expect(r.identities[0].userId).toBe('U1')
  })

  it('erasing: a number owned only by an identity being erased is ignored (no merge, no flag)', () => {
    const r = assertScenario(scenario('erasing-owner'))
    expect(r.flags.size).toBe(0)
    expect(r.identities[1].phones.size).toBe(0)
    expect(r.stepOutcome[3]).toBe('erasing')
  })

  it('unusable phones never match and are never stored', () => {
    const r = assertScenario(scenario('unusable-phone'))
    expect(r.flags.size).toBe(0)
  })
})

// ── 3. Text-level contract of migration 072 ─────────────────────────────────

function loadMigration(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
}

const m072 = loadMigration('072_identity_phone_rules.sql')
const m069 = loadMigration('069_identity_core_sync_triggers.sql')

function fnBody(src: string, name: string): string {
  const start = src.indexOf(`FUNCTION public.${name}(`)
  expect(start, `function ${name} not found`).toBeGreaterThan(-1)
  const rest = src.slice(start + 10)
  const next = rest.search(/CREATE OR REPLACE FUNCTION|REVOKE EXECUTE/)
  return src.slice(start, next === -1 ? undefined : start + 10 + next)
}

describe('072 identity_normalize_phone', () => {
  const body = fnBody(m072, 'identity_normalize_phone')

  it('is defined once, IMMUTABLE, with an empty search_path', () => {
    expect((m072.match(/CREATE OR REPLACE FUNCTION public\.identity_normalize_phone/g) ?? []).length).toBe(1)
    expect(body).toMatch(/IMMUTABLE/)
    expect(body).toMatch(/SET search_path = ''/)
  })

  it('ports every lib/phone.ts rule and nothing more', () => {
    // E.164 shape, 00 prefix, "+" required, +420/+421 followed by 0 rejected, trunk-zero country list.
    expect(body).toMatch(/\^\\\+\[1-9\]\[0-9\]\{7,14\}\$/)
    expect(body).toMatch(/'00'/)
    expect(body).toMatch(/'4200'/)
    expect(body).toMatch(/'4210'/)
    expect(body).toMatch(/'44', '49', '43', '41', '31', '32', '33', '36', '48'/)
    // Digit blocks: Arabic-Indic, Extended Arabic-Indic, Devanagari, fullwidth.
    for (const zero of [1632, 1776, 2406, 65296]) expect(body).toContain(String(zero))
    // Dashes U+2010..2015, U+2212, U+FE58, U+FE63, U+FF0D; invisible marks; fullwidth + ( ) .
    for (const cp of [8208, 8213, 8722, 65112, 65123, 65293, 8203, 8207, 8234, 8238, 8294, 8297, 1564, 65279]) {
      expect(body).toContain(`chr(${cp})`)
    }
    for (const cp of [65291, 65288, 65289, 65294]) expect(body).toContain(`chr(${cp})`)
  })

  it('has no country guessing (the backfill-only +420 rule never appears)', () => {
    expect(body).not.toMatch(/'\+420'\s*\|\|/)
    expect(body).not.toMatch(/\|\|\s*'\+420'/)
    expect(body).not.toMatch(/\bright\(/)
  })

  it('is closed to anon / authenticated and open to service_role', () => {
    expect(m072).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.identity_normalize_phone\(text\) FROM PUBLIC, anon, authenticated;/,
    )
    expect(m072).toMatch(/GRANT EXECUTE ON FUNCTION public\.identity_normalize_phone\(text\) TO service_role;/)
  })
})

describe('072 identity_resolve_core', () => {
  const body = fnBody(m072, 'identity_resolve_core')

  it('keeps the exact 069 signature, SECURITY DEFINER and empty search_path', () => {
    const sig069 = fnBody(m069, 'identity_resolve_core')
    const head = (s: string) => s.slice(0, s.indexOf('AS $$')).replace(/\s+/g, ' ')
    expect(head(body)).toBe(head(sig069))
    expect(body).toMatch(/SECURITY DEFINER/)
    expect(body).toMatch(/SET search_path = ''/)
  })

  it('is re-revoked and still not granted to anyone (internal: the caller holds the lock)', () => {
    expect(m072).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.identity_resolve_core\(text, text, text, uuid\) FROM PUBLIC, anon, authenticated;/,
    )
    expect(m072).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.identity_resolve_core/)
  })

  it('normalises the phone through identity_normalize_phone and drops shared numbers up front', () => {
    expect(body).toMatch(/public\.identity_normalize_phone\(p_phone_raw\)/)
    expect(body).toMatch(/public\.phone_flags/)
    expect(body).toMatch(/shared/)
  })

  it('merges by phone with basis phone + via_phone, then flags the number shared (auto)', () => {
    expect(body).toMatch(/INSERT INTO public\.identity_emails[^;]*'phone'/)
    expect(body).toMatch(/via_phone/)
    expect(body).toMatch(/INSERT INTO public\.phone_flags[^;]*'auto'/)
    expect(body).toMatch(/ON CONFLICT[^;]*DO NOTHING/)
  })

  it('honours the erasing owner and the signup guard', () => {
    expect(body).toMatch(/erasing_at/)
    expect(body).toMatch(/<>\s*p_user_id/)
  })

  it('rule order: the email match comes before the phone match', () => {
    const email = body.indexOf('FROM public.identity_emails e')
    const phoneMerge = body.search(/INSERT INTO public\.identity_emails[^;]*'phone'/)
    expect(email).toBeGreaterThan(-1)
    expect(phoneMerge).toBeGreaterThan(email)
  })

  it('rule 1: an unusable email returns no_identity before any phone work', () => {
    const noId = body.indexOf("'no_identity'")
    const firstPhone = body.indexOf('phone_flags')
    expect(noId).toBeGreaterThan(-1)
    expect(noId).toBeLessThan(firstPhone)
  })

  it('leaves identity_person (the shared-phone read filter) untouched', () => {
    expect(m072).not.toMatch(/FUNCTION public\.identity_person/)
  })
})

// ── 4. The SQL normaliser, executed in JS from the migration's own constants ─
// There is no Postgres in the test run, so the code-point tables of identity_normalize_phone are
// parsed out of the 072 text and a line-by-line JS port of the SQL steps is run over the shared
// fixtures. A wrong code point or a mistyped class in the migration fails here before it is applied;
// the live smoke (82-05-smoke.sql) then proves the real function against the same fixtures.

function sqlConstant(name: string): string {
  const m = m072.match(new RegExp(`${name}\\s+constant text :=([^;]+);`))
  if (!m) throw new Error(`constant ${name} not found in 072`)
  let out = ''
  for (const t of m[1].matchAll(/chr\((\d+)\)|'([^']*)'/g)) {
    out += t[1] !== undefined ? String.fromCodePoint(Number(t[1])) : t[2]
  }
  return out
}

function sqlNormalizePhone(raw: string | null): string | null {
  if (raw === null) return null
  const ws = sqlConstant('c_ws')
  const invisible = sqlConstant('c_invisible')
  const dashes = sqlConstant('c_dashes')
  const zeros = (m072.match(/FOREACH v_zero IN ARRAY ARRAY\[([^\]]+)\]/) as RegExpMatchArray)[1]
    .split(',')
    .map(Number)
  let s = raw.replace(new RegExp(`[${invisible}]`, 'g'), '')
  for (const z of zeros) {
    for (let i = 0; i <= 9; i++) s = s.split(String.fromCodePoint(z + i)).join(String(i))
  }
  for (const m of m072.matchAll(/v_s := replace\(v_s, chr\((\d+)\), '(.)'\);/g)) {
    s = s.split(String.fromCodePoint(Number(m[1]))).join(m[2])
  }
  s = s.replace(new RegExp(`[${dashes}]`, 'g'), '-')
  s = s.replace(new RegExp(`\\([${ws}]*0[${ws}]*\\)`, 'g'), '')
  s = s.replace(new RegExp(`[${ws}.()-]`, 'g'), '')
  if (s.startsWith('00')) s = `+${s.slice(2)}`
  if (!s.startsWith('+')) return null
  const digits = s.slice(1)
  if (/^(4200|4210)/.test(digits)) return null
  const list = (m072.match(/FOREACH v_cc IN ARRAY ARRAY\[([^\]]+)\]/) as RegExpMatchArray)[1].match(/\d+/g) as string[]
  for (const cc of list) {
    if (digits.startsWith(`${cc}0`)) {
      s = `+${cc}${digits.slice(3)}`
      break
    }
  }
  return /^\+[1-9][0-9]{7,14}$/.test(s) ? s : null
}

describe('072 identity_normalize_phone, run from the migration constants', () => {
  it.each(fixtures.phones.map((c) => [JSON.stringify(c.raw), c] as const))('fixture %s', (_label, c) => {
    expect(sqlNormalizePhone(c.raw)).toBe(c.expected)
  })

  it('parses the same character classes lib/phone.ts documents', () => {
    expect(sqlConstant('c_invisible')).toContain('​-‏')
    expect(sqlConstant('c_invisible')).toContain('‪-‮')
    expect(sqlConstant('c_invisible')).toContain('⁦-⁩')
    expect(sqlConstant('c_dashes')).toContain('‐-―')
    expect(sqlConstant('c_ws')).toContain(' - ')
    expect(sqlConstant('c_ws')).toContain(' ')
    expect(sqlConstant('c_ws')).toContain('　')
  })
})

describe('072 shared-number protections (rule branches present in the SQL)', () => {
  const body = fnBody(m072, 'identity_resolve_core')

  it('collision: an email match that brings a phone a different live person owns flags it shared, no merge', () => {
    expect(body).toMatch(/p\.identity_id <> v_id AND o\.erasing_at IS NULL/)
  })

  it('erasing: only live (erasing_at IS NULL) owners count as a collision; erasing owners are skipped', () => {
    expect((body.match(/o\.erasing_at IS NULL/g) ?? []).length).toBe(3)
    expect(body).toMatch(/v_erasing IS NULL/)
  })

  it('signup guard: a different account blocks the phone merge and the signup gets its own identity', () => {
    expect(body).toMatch(/NOT \(p_user_id IS NOT NULL AND v_uid IS NOT NULL AND v_uid <> p_user_id\)/)
  })

  it('manual flags: shared numbers are dropped before any matching and auto flags never overwrite a row', () => {
    expect(body.indexOf('f.shared')).toBeLessThan(body.indexOf('FROM public.identity_emails e'))
    expect(body).not.toMatch(/ON CONFLICT[^;]*DO UPDATE/)
  })
})
