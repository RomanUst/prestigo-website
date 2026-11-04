// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake QStash payloads are intentionally loose */
/**
 * Phase 88, Plan 04 - infra/qstash/payment-tick-schedule.mjs (D-21) proven against an in-memory fake
 * QStash client. No test here makes a network call or reads a real credential.
 */
import { describe, it, expect } from 'vitest'
import {
  runPaymentTickSchedule,
  SCHEDULE_ID,
  TICK_DESTINATION,
  TICK_CRON,
  FREE_PLAN_SCHEDULE_LIMIT,
} from '../infra/qstash/payment-tick-schedule.mjs'

const FAKE_TOKEN = 'FAKE_qstash_token_value_for_tests_0123456789'

type Sched = { scheduleId: string; cron: string; destination: string; method: string; retries: number; isPaused?: boolean }

const other = (n: number): Sched => ({
  scheduleId: `other-${n}`,
  cron: '0 4 * * *',
  destination: `https://rideprestigo.com/api/cron/other-${n}`,
  method: 'POST',
  retries: 3,
})
const ours = (over: Partial<Sched> = {}): Sched => ({
  scheduleId: SCHEDULE_ID,
  cron: TICK_CRON,
  destination: TICK_DESTINATION,
  method: 'POST',
  retries: 1,
  ...over,
})

function fakeQStash(initial: Sched[], opts: { failOn?: 'list' | 'create' } = {}) {
  const state = [...initial]
  const calls = { list: 0, create: [] as any[] }
  const client = {
    schedules: {
      async list() {
        calls.list++
        if (opts.failOn === 'list') throw new Error(`Unauthorized: token ${FAKE_TOKEN} rejected`)
        return state.map((s) => ({ ...s }))
      },
      async create(request: any) {
        calls.create.push(request)
        if (opts.failOn === 'create') throw new Error('upstream failed')
        const i = state.findIndex((s) => s.scheduleId === request.scheduleId)
        const row = { scheduleId: request.scheduleId, cron: request.cron, destination: request.destination, method: request.method ?? 'POST', retries: request.retries ?? 3 }
        if (i >= 0) state[i] = row
        else state.push(row)
        return { scheduleId: request.scheduleId }
      },
    },
  }
  return { client, calls, state }
}

async function run(argv: string[], client: any, extra: Record<string, unknown> = {}) {
  const out: string[] = []
  const err: string[] = []
  const code = await runPaymentTickSchedule({
    argv,
    client,
    isTTY: false,
    out: (t: string) => out.push(t),
    err: (t: string) => err.push(t),
    ...extra,
  })
  return { code, out, err, text: out.join('\n'), all: `${out.join('\n')}\n${err.join('\n')}` }
}

describe('constants', () => {
  it('exports the schedule identity from D-21', () => {
    expect(SCHEDULE_ID).toBe('prestigo-payment-tick')
    expect(TICK_DESTINATION).toBe('https://rideprestigo.com/api/cron/payment-tick')
    expect(TICK_CRON).toBe('*/15 * * * *')
    expect(FREE_PLAN_SCHEDULE_LIMIT).toBe(10)
  })
})

describe('ensure', () => {
  it('creates the schedule with the exact settings next to two other schedules and reports 3 of 10', async () => {
    const fake = fakeQStash([other(1), other(2)])
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(0)
    expect(fake.calls.create).toEqual([
      { destination: TICK_DESTINATION, cron: TICK_CRON, scheduleId: SCHEDULE_ID, retries: 1, method: 'POST' },
    ])
    expect(res.text).toContain('schedules: 3 of 10')
    expect(res.text).toContain('OK created')
  })

  it('creates on an empty account and reports 1 of 10', async () => {
    const fake = fakeQStash([])
    const res = await run([], fake.client)
    expect(res.code).toBe(0)
    expect(fake.calls.create).toHaveLength(1)
    expect(res.text).toContain('schedules: 1 of 10')
  })

  it('prints OK unchanged and makes no create call when the schedule already matches', async () => {
    const fake = fakeQStash([other(1), ours()])
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(0)
    expect(res.text).toContain('OK unchanged')
    expect(res.text).toContain('schedules: 2 of 10')
    expect(fake.calls.create).toHaveLength(0)
  })

  it('updates in place (same scheduleId) when the cron differs and prints OK updated', async () => {
    const fake = fakeQStash([ours({ cron: '0 * * * *' })])
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(0)
    expect(res.text).toContain('OK updated')
    expect(fake.calls.create).toHaveLength(1)
    expect(fake.calls.create[0].scheduleId).toBe(SCHEDULE_ID)
    expect(fake.state).toHaveLength(1)
    expect(fake.state[0].cron).toBe(TICK_CRON)
  })

  it('updates when the destination or retries differ', async () => {
    for (const drift of [{ destination: 'https://www.rideprestigo.com/api/cron/payment-tick' }, { retries: 3 }]) {
      const fake = fakeQStash([ours(drift)])
      const res = await run(['ensure'], fake.client)
      expect(res.text).toContain('OK updated')
      expect(fake.calls.create).toHaveLength(1)
    }
  })

  it('is idempotent across two runs', async () => {
    const fake = fakeQStash([other(1)])
    await run(['ensure'], fake.client)
    const second = await run(['ensure'], fake.client)
    expect(second.text).toContain('OK unchanged')
    expect(fake.calls.create).toHaveLength(1)
  })

  it('warns, without failing, when the existing schedule is paused', async () => {
    const fake = fakeQStash([ours({ isPaused: true })])
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(0)
    expect(res.all).toContain('paused')
  })
})

describe('Free-plan schedule limit', () => {
  it('refuses an 11th schedule: exit 1, FAIL schedule limit, no create', async () => {
    const fake = fakeQStash(Array.from({ length: 10 }, (_, i) => other(i)))
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(1)
    expect(res.all).toContain('FAIL schedule limit')
    expect(fake.calls.create).toHaveLength(0)
  })

  it('still updates ours when the account is already at 10 schedules including ours', async () => {
    const fake = fakeQStash([...Array.from({ length: 9 }, (_, i) => other(i)), ours({ cron: '0 * * * *' })])
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(0)
    expect(res.text).toContain('schedules: 10 of 10')
    expect(fake.calls.create).toHaveLength(1)
  })
})

describe('--dry-run', () => {
  it('never calls create and says what would happen', async () => {
    for (const initial of [[], [ours({ cron: '0 * * * *' })], [ours()]]) {
      const fake = fakeQStash(initial)
      const res = await run(['--dry-run'], fake.client)
      expect(res.code).toBe(0)
      expect(fake.calls.create).toHaveLength(0)
      expect(res.text).toMatch(/DRY-RUN|OK unchanged/)
    }
  })

  it('still reports the limit refusal as exit 1', async () => {
    const fake = fakeQStash(Array.from({ length: 10 }, (_, i) => other(i)))
    const res = await run(['ensure', '--dry-run'], fake.client)
    expect(res.code).toBe(1)
    expect(fake.calls.create).toHaveLength(0)
  })
})

describe('list', () => {
  it('prints every schedule with the count against the limit and writes nothing', async () => {
    const fake = fakeQStash([other(1), ours()])
    const res = await run(['list'], fake.client)
    expect(res.code).toBe(0)
    expect(res.text).toContain(`id=${SCHEDULE_ID}`)
    expect(res.text).toContain('schedules: 2 of 10')
    expect(fake.calls.create).toHaveLength(0)
  })
})

describe('refusals and errors', () => {
  it('refuses a token (or any secret-looking value or token option) on the command line before any call', async () => {
    for (const argv of [['ensure', '--token', FAKE_TOKEN], ['--token=eyJ_FAKE'], ['ensure', 'sk_test_FAKE_x'], ['frobnicate']]) {
      const fake = fakeQStash([])
      const res = await run(argv, fake.client, { knownSecrets: [FAKE_TOKEN] })
      expect(res.code).toBe(1)
      expect(res.all).not.toContain(FAKE_TOKEN)
      expect(fake.calls.list).toBe(0)
      expect(fake.calls.create).toHaveLength(0)
    }
  })

  it('exits 2 with a FAIL line on an API error and never prints the token', async () => {
    const fake = fakeQStash([], { failOn: 'list' })
    const res = await run(['ensure'], fake.client, { knownSecrets: [FAKE_TOKEN] })
    expect(res.code).toBe(2)
    expect(res.all).toContain('FAIL')
    expect(res.all).not.toContain(FAKE_TOKEN)
  })

  it('exits 2 when create fails', async () => {
    const fake = fakeQStash([], { failOn: 'create' })
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(2)
    expect(res.all).toContain('FAIL')
  })
})

describe('secret custody', () => {
  it('no output line of any command contains the token value', async () => {
    const scenarios: Array<[string[], Sched[]]> = [
      [['ensure'], []],
      [['--dry-run'], [other(1)]],
      [['list'], [ours()]],
      [['ensure'], Array.from({ length: 10 }, (_, i) => other(i))],
    ]
    for (const [argv, initial] of scenarios) {
      const fake = fakeQStash(initial)
      const res = await run(argv, fake.client, { knownSecrets: [FAKE_TOKEN] })
      expect(res.all).not.toContain(FAKE_TOKEN)
    }
  })
})
