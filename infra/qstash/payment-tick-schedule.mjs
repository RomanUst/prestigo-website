#!/usr/bin/env node
/**
 * infra/qstash/payment-tick-schedule.mjs
 *
 * Creates or updates the QStash schedule that drives the card-on-file payment tick every 15 minutes
 * (Phase 88 plan 04, D-21). OWNER-RUN: QStash writes need the account token, which only the owner has.
 *
 *   node infra/qstash/payment-tick-schedule.mjs                 same as ensure
 *   node infra/qstash/payment-tick-schedule.mjs ensure          create, update in place, or leave unchanged
 *   node infra/qstash/payment-tick-schedule.mjs --dry-run       say what would happen, write nothing
 *   node infra/qstash/payment-tick-schedule.mjs list            every schedule and the count against the limit
 *
 * Token: QSTASH_TOKEN from the environment, or a hidden prompt on a terminal. Never argv.
 * Region: QSTASH_URL (the account is in the EU region, https://qstash-eu-central-1.upstash.io).
 *
 * The schedule: POST https://rideprestigo.com/api/cron/payment-tick, cron every 15 minutes, id
 * 'prestigo-payment-tick', retries 1. Passing the same scheduleId again updates the existing schedule
 * in place, so re-running is safe.
 *
 * Exit codes: 0 ok (created, updated or unchanged), 1 refused (secret on argv, unknown argument,
 * Free-plan schedule limit reached), 2 API or config error.
 *
 * SAFETY (T-88-09, T-88-11): the token never reaches a printed line (scrubber). The cadence is about
 * 96 messages a day of the 1,000 a day Free plan; retries are 1 because each retry counts as another
 * message. The script refuses to create an 11th schedule on the Free plan (limit 10). The daily Vercel
 * cron backstop (D-08) stays regardless of this schedule.
 */

import { pathToFileURL } from 'node:url'
import { ARGV_SECRET_REFUSAL, argvCarriesSecret, createScrubber, resolveSecret, SecretInputError } from '../lib/secret-io.mjs'

export const SCHEDULE_ID = 'prestigo-payment-tick'
export const TICK_DESTINATION = 'https://rideprestigo.com/api/cron/payment-tick'
export const TICK_CRON = '*/15 * * * *'
export const TICK_RETRIES = 1
export const TICK_METHOD = 'POST'
export const FREE_PLAN_SCHEDULE_LIMIT = 10

const COMMANDS = ['ensure', 'list']

class RefusedError extends Error {}

/**
 * @param {string[]} argv
 * @returns {{ command: 'ensure' | 'list', dryRun: boolean }}
 */
export function parsePaymentTickArgs(argv) {
  if (argvCarriesSecret(argv)) throw new RefusedError(ARGV_SECRET_REFUSAL)
  let command
  let dryRun = false
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true
    else if (COMMANDS.includes(arg)) {
      if (command && command !== arg) throw new RefusedError(`refused: use exactly one command (${COMMANDS.join(' or ')})`)
      command = arg
    } else {
      throw new RefusedError(`refused: unknown argument (use: ${COMMANDS.join(', ')}, --dry-run)`)
    }
  }
  return { command: command ?? 'ensure', dryRun }
}

/** True when the stored schedule already has exactly the settings we want. */
function matchesDesired(schedule) {
  return (
    schedule.destination === TICK_DESTINATION &&
    schedule.cron === TICK_CRON &&
    schedule.retries === TICK_RETRIES &&
    String(schedule.method ?? TICK_METHOD).toUpperCase() === TICK_METHOD
  )
}

function describeDrift(schedule) {
  const drift = []
  if (schedule.destination !== TICK_DESTINATION) drift.push('destination')
  if (schedule.cron !== TICK_CRON) drift.push('cron')
  if (schedule.retries !== TICK_RETRIES) drift.push('retries')
  if (String(schedule.method ?? TICK_METHOD).toUpperCase() !== TICK_METHOD) drift.push('method')
  return drift.join(', ')
}

async function commandList(ctx) {
  const schedules = await ctx.client.schedules.list()
  for (const s of schedules) {
    ctx.out(`id=${s.scheduleId} cron=${s.cron} destination=${s.destination} retries=${s.retries}${s.isPaused ? ' paused=true' : ''}`)
  }
  ctx.out(`schedules: ${schedules.length} of ${FREE_PLAN_SCHEDULE_LIMIT}`)
  return 0
}

async function commandEnsure(ctx, { dryRun }) {
  const schedules = await ctx.client.schedules.list()
  const existing = schedules.find((s) => s.scheduleId === SCHEDULE_ID)
  const countAfter = existing ? schedules.length : schedules.length + 1

  if (!existing && schedules.length >= FREE_PLAN_SCHEDULE_LIMIT) {
    ctx.out(`schedules: ${schedules.length} of ${FREE_PLAN_SCHEDULE_LIMIT}`)
    ctx.err(
      `FAIL schedule limit: the account already has ${schedules.length} schedules (Free plan allows ${FREE_PLAN_SCHEDULE_LIMIT}); delete an unused one in the Upstash console or upgrade, nothing written`,
    )
    return 1
  }

  ctx.out(`schedules: ${countAfter} of ${FREE_PLAN_SCHEDULE_LIMIT}`)

  if (existing && matchesDesired(existing)) {
    if (existing.isPaused) ctx.out('WARN the schedule is paused; resume it in the Upstash console (QStash > Schedules)')
    ctx.out(`OK unchanged (${SCHEDULE_ID}: ${TICK_CRON} -> ${TICK_DESTINATION})`)
    return 0
  }

  const action = existing ? 'updated' : 'created'
  if (dryRun) {
    ctx.out(
      `DRY-RUN would ${existing ? `update ${SCHEDULE_ID} in place (differs: ${describeDrift(existing)})` : `create ${SCHEDULE_ID}`}: ${TICK_METHOD} ${TICK_DESTINATION}, cron ${TICK_CRON}, retries ${TICK_RETRIES}`,
    )
    return 0
  }

  await ctx.client.schedules.create({
    destination: TICK_DESTINATION,
    cron: TICK_CRON,
    scheduleId: SCHEDULE_ID,
    retries: TICK_RETRIES,
    method: TICK_METHOD,
  })
  ctx.out(`OK ${action} (${SCHEDULE_ID}: ${TICK_CRON} -> ${TICK_DESTINATION})`)
  return 0
}

/**
 * @param {{ argv: string[], client: any, isTTY?: boolean, knownSecrets?: string[],
 *           out?: (line: string) => void, err?: (line: string) => void }} deps
 * @returns {Promise<number>} exit code
 */
export async function runPaymentTickSchedule({
  argv,
  client,
  knownSecrets = [],
  out = (line) => console.log(line),
  err = (line) => console.error(line),
}) {
  const { scrub } = createScrubber(knownSecrets)
  const ctx = { client, out: (line) => out(scrub(line)), err: (line) => err(scrub(line)) }
  try {
    const opts = parsePaymentTickArgs(argv)
    if (opts.command === 'list') return await commandList(ctx)
    return await commandEnsure(ctx, opts)
  } catch (error) {
    if (error instanceof RefusedError) {
      ctx.err(error.message)
      return 1
    }
    ctx.err(`FAIL ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }
}

async function main(argv) {
  if (argvCarriesSecret(argv)) {
    console.error(ARGV_SECRET_REFUSAL)
    process.exitCode = 1
    return
  }
  let token
  try {
    token = await resolveSecret({ envName: 'QSTASH_TOKEN', label: 'QStash token (hidden)' })
  } catch (error) {
    console.error(`FAIL ${error instanceof SecretInputError ? error.message : 'could not read the QStash token'}`)
    process.exitCode = 2
    return
  }
  const baseUrl = process.env.QSTASH_URL?.trim() || undefined
  const { Client } = await import('@upstash/qstash')
  process.exitCode = await runPaymentTickSchedule({ argv, client: new Client({ token, baseUrl }), knownSecrets: [token] })
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main(process.argv.slice(2))
}
