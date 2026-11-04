#!/usr/bin/env node
/**
 * infra/stripe/webhook-events.mjs
 *
 * Subscribes the live Stripe webhook endpoint (https://rideprestigo.com/api/webhooks/stripe) to every
 * event the card-on-file flow needs (Phase 88 plan 04, PAYF-04). OWNER-RUN: the .env.local Stripe key
 * is a dead placeholder, so this is the only path to a subscribed webhook.
 *
 *   node infra/stripe/webhook-events.mjs                 same as ensure
 *   node infra/stripe/webhook-events.mjs ensure          add the missing events (union only)
 *   node infra/stripe/webhook-events.mjs --dry-run       print what would be added, write nothing
 *   node infra/stripe/webhook-events.mjs list            id, url, status and events of every endpoint
 *
 * Key: STRIPE_SECRET_KEY from the environment, or a hidden prompt on a terminal. Never argv.
 *
 * Exit codes: 0 ok (added or unchanged), 1 refused or expectation failed (secret on argv, no
 * matching endpoint, ambiguous endpoint, update did not stick), 2 API or config error.
 *
 * SAFETY (T-88-09, T-88-10):
 *   - The update sends the sorted UNION of the events already enabled and the required ones. An event
 *     is never removed: the pay-now flow depends on payment_intent.succeeded, charge.refunded and
 *     checkout.session.completed.
 *   - Only an https endpoint on the host rideprestigo.com with the path /api/webhooks/stripe is touched;
 *     zero or more than one match is a refusal with no write.
 *   - An endpoint enabled for '*' already receives everything and is reported unchanged.
 *   - Every printed line passes a scrubber for sk_/rk_/pk_ keys, whsec_ secrets and the key in use.
 */

import { pathToFileURL } from 'node:url'
import { ARGV_SECRET_REFUSAL, argvCarriesSecret, createScrubber, resolveSecret, SecretInputError } from '../lib/secret-io.mjs'

export const CANONICAL_HOST = 'rideprestigo.com'
export const WEBHOOK_PATH = '/api/webhooks/stripe'

/** The six events the card flow adds (research Pattern 5, point 5). */
export const REQUIRED_EVENTS = [
  'setup_intent.succeeded',
  'setup_intent.setup_failed',
  'payment_intent.amount_capturable_updated',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'charge.dispute.created',
]

/** Events the pay-now flow already depends on. Documented here and asserted by the test, never removed. */
export const KEPT_EVENTS = ['payment_intent.succeeded', 'charge.refunded', 'checkout.session.completed']

const COMMANDS = ['ensure', 'list']

class RefusedError extends Error {}

const sortedUnique = (events) => [...new Set(events)].sort()

/**
 * @param {string[]} argv
 * @returns {{ command: 'ensure' | 'list', dryRun: boolean }}
 */
export function parseWebhookEventsArgs(argv) {
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

function isLiveEndpoint(endpoint) {
  let url
  try {
    url = new URL(String(endpoint?.url ?? ''))
  } catch {
    return false
  }
  return url.protocol === 'https:' && url.hostname === CANONICAL_HOST && url.pathname === WEBHOOK_PATH
}

async function listEndpoints(client) {
  const page = await client.webhookEndpoints.list({ limit: 100 })
  return Array.isArray(page?.data) ? page.data : []
}

async function commandList(ctx) {
  const endpoints = await listEndpoints(ctx.client)
  for (const e of endpoints) {
    const events = Array.isArray(e.enabled_events) ? sortedUnique(e.enabled_events) : []
    ctx.out(`id=${e.id} url=${e.url} status=${e.status ?? 'unknown'} events=${events.join(',')}`)
  }
  if (endpoints.length === 0) ctx.out('endpoints=0')
  return 0
}

async function commandEnsure(ctx, { dryRun }) {
  const matches = (await listEndpoints(ctx.client)).filter(isLiveEndpoint)
  if (matches.length === 0) {
    ctx.err(`FAIL no webhook endpoint for https://${CANONICAL_HOST}${WEBHOOK_PATH} (nothing written; create it in the Stripe Dashboard first)`)
    return 1
  }
  if (matches.length > 1) {
    ctx.err(`FAIL ambiguous: ${matches.length} endpoints match https://${CANONICAL_HOST}${WEBHOOK_PATH} (ids: ${matches.map((m) => m.id).join(', ')}); nothing written`)
    return 1
  }

  const [endpoint] = matches
  const current = Array.isArray(endpoint.enabled_events) ? endpoint.enabled_events : []
  if (current.includes('*')) {
    ctx.out(`OK unchanged (endpoint ${endpoint.id} is enabled for all events)`)
    return 0
  }

  const have = new Set(current)
  const missing = sortedUnique(REQUIRED_EVENTS.filter((e) => !have.has(e)))
  if (missing.length === 0) {
    ctx.out(`OK unchanged (endpoint ${endpoint.id} already has every required event)`)
    return 0
  }

  if (dryRun) {
    ctx.out(`DRY-RUN endpoint ${endpoint.id} would gain ${missing.length} event(s), none removed:`)
    for (const e of missing) ctx.out(`+ ${e}`)
    return 0
  }

  const union = sortedUnique([...current, ...REQUIRED_EVENTS])
  const updated = await ctx.client.webhookEndpoints.update(endpoint.id, { enabled_events: union })

  // Stripe echoes the stored list; if it came back without something we asked for, say so loudly.
  if (Array.isArray(updated?.enabled_events)) {
    const stored = new Set(updated.enabled_events)
    const lost = union.filter((e) => !stored.has(e) && !stored.has('*'))
    if (lost.length > 0) {
      ctx.err(`FAIL Stripe did not store: ${lost.join(', ')}`)
      return 1
    }
  }
  ctx.out(`OK added: ${missing.join(', ')}`)
  return 0
}

/**
 * @param {{ argv: string[], client: any, isTTY?: boolean, knownSecrets?: string[],
 *           out?: (line: string) => void, err?: (line: string) => void }} deps
 * @returns {Promise<number>} exit code
 */
export async function runWebhookEvents({
  argv,
  client,
  knownSecrets = [],
  out = (line) => console.log(line),
  err = (line) => console.error(line),
}) {
  const { scrub } = createScrubber(knownSecrets)
  const ctx = { client, out: (line) => out(scrub(line)), err: (line) => err(scrub(line)) }
  try {
    const opts = parseWebhookEventsArgs(argv)
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
  // Refuse a secret on argv before asking for the key, so the prompt is never reached for a bad call.
  if (argvCarriesSecret(argv)) {
    console.error(ARGV_SECRET_REFUSAL)
    process.exitCode = 1
    return
  }
  let key
  try {
    key = await resolveSecret({ envName: 'STRIPE_SECRET_KEY', label: 'Stripe secret key (hidden)' })
  } catch (error) {
    console.error(`FAIL ${error instanceof SecretInputError ? error.message : 'could not read the Stripe key'}`)
    process.exitCode = 2
    return
  }
  const { default: Stripe } = await import('stripe')
  process.exitCode = await runWebhookEvents({ argv, client: new Stripe(key), knownSecrets: [key] })
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main(process.argv.slice(2))
}
