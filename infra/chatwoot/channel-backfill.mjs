#!/usr/bin/env node
/**
 * infra/chatwoot/channel-backfill.mjs
 *
 * One-time backfill of public.chat_leads.channel for Phase 85 (D-04). Chat Leads
 * created before the intake stored the channel have channel NULL and would all show
 * under "Chat - Other" in the funnel. This script looks up the creating Chatwoot
 * conversation of each such Lead and prints one idempotent UPDATE per Lead; the
 * orchestrator applies the printed SQL through Supabase MCP.
 *
 *   node infra/chatwoot/channel-backfill.mjs < input.json > backfill.sql
 *
 * Input (stdin): a JSON array of { "lead_id": "<uuid>", "conversation_id": <int|null> }
 * (ids only, no personal data). Output (stdout): one statement per Lead,
 *
 *   UPDATE public.chat_leads SET channel = public.chat_channel_bucket('Channel::X')
 *     WHERE id = '<uuid>' AND channel IS NULL;
 *
 * and a final `-- channel-backfill: leads=<n> statements=<m> skipped=<k>` comment line.
 * The mapping to the five buckets lives only in public.chat_channel_bucket (migration
 * 081); this file never maps a channel itself.
 *
 * Safety (T-85-13 .. T-85-15): every request is a GET (GET /conversations/<id>). The
 * API token is read by lib/client.mjs (env or ~/.config/prestigo/chatwoot-api.env),
 * never from argv, and is never printed. Only SQL, ids, HTTP statuses and counts are
 * written: no name, email, phone or message text, and an API failure prints the HTTP
 * status only (the ChatwootApiError message carries the request path and body).
 * A lead id and a channel class are validated against strict regexes before a
 * statement is built, so an API response can never inject SQL; a 404, a missing
 * channel or an unrecognised class leaves the Lead NULL.
 *
 * Exit codes: 0 ok, 2 config or input error.
 */

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createChatwootClient, loadChatwootConfig, ChatwootApiError, ChatwootConfigError } from './lib/client.mjs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const CHANNEL_RE = /^Channel::[A-Za-z]{1,40}$/

export class BackfillInputError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BackfillInputError'
  }
}

/** Parse the stdin JSON into validated { leadId, conversationId } items. */
export function parseBackfillInput(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BackfillInputError('input is not valid JSON')
  }
  if (!Array.isArray(parsed)) throw new BackfillInputError('input must be a JSON array')
  return parsed.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new BackfillInputError(`item ${index} is not an object`)
    }
    const { lead_id: leadId, conversation_id: conversationId } = item
    if (typeof leadId !== 'string' || !UUID_RE.test(leadId)) {
      throw new BackfillInputError(`item ${index} has an invalid lead_id`)
    }
    if (conversationId !== null && !(Number.isInteger(conversationId) && conversationId > 0)) {
      throw new BackfillInputError(`item ${index} has an invalid conversation_id`)
    }
    return { leadId, conversationId }
  })
}

/** The raw Chatwoot channel class of a conversation payload, or null when absent or not a clean class. */
export function channelOf(conversation) {
  if (conversation === null || typeof conversation !== 'object') return null
  const raw = conversation.meta?.channel ?? conversation.channel
  return typeof raw === 'string' && CHANNEL_RE.test(raw) ? raw : null
}

/** One idempotent UPDATE; throws unless both values pass their regex. */
export function backfillStatement(leadId, raw) {
  if (typeof leadId !== 'string' || !UUID_RE.test(leadId)) throw new BackfillInputError('invalid lead id')
  if (typeof raw !== 'string' || !CHANNEL_RE.test(raw)) throw new BackfillInputError('invalid channel class')
  return `UPDATE public.chat_leads SET channel = public.chat_channel_bucket('${raw}') WHERE id = '${leadId}' AND channel IS NULL;`
}

/** Sequential GETs; writes statements to `out`, HTTP failures to `err`, a summary comment to `out`. */
export async function runBackfill({ client, items, out, err }) {
  let statements = 0
  let skipped = 0
  for (const { leadId, conversationId } of items) {
    if (conversationId === null) {
      skipped++
      continue
    }
    let conversation
    try {
      conversation = await client.request('GET', `/conversations/${conversationId}`)
    } catch (error) {
      if (!(error instanceof ChatwootApiError)) throw error
      // Status only: the error message carries the request path and the response body.
      err.write(`conversation ${conversationId}: HTTP ${error.status}\n`)
      skipped++
      continue
    }
    const raw = channelOf(conversation)
    if (raw === null) {
      skipped++
      continue
    }
    out.write(`${backfillStatement(leadId, raw)}\n`)
    statements++
  }
  out.write(`-- channel-backfill: leads=${items.length} statements=${statements} skipped=${skipped}\n`)
  return { statements, skipped }
}

async function main() {
  try {
    const items = parseBackfillInput(readFileSync(0, 'utf8'))
    const client = createChatwootClient(loadChatwootConfig())
    await runBackfill({ client, items, out: process.stdout, err: process.stderr })
    process.exitCode = 0
  } catch (error) {
    if (error instanceof ChatwootConfigError) {
      console.error(`Config error: ${error.message}`)
    } else if (error instanceof BackfillInputError) {
      console.error(`Input error: ${error.message}`)
    } else {
      console.error('Backfill failed')
    }
    process.exitCode = 2
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main()
}
