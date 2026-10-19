#!/usr/bin/env node
/**
 * infra/chatwoot/probe-filter.mjs
 *
 * Read-only live probe (Phase 82 plan 82-10, RESEARCH A3): confirms the request shape of
 * `POST /contacts/filter` that lib/chatwoot-sync.ts relies on for exact lookups.
 *
 *   node infra/chatwoot/probe-filter.mjs
 *
 * The filter is a read: it sends one exact `equal_to` query for a random, never-existing
 * `probe-<hex>@example.invalid` address and writes nothing. The owner token is read by
 * lib/client.mjs (env or ~/.config/prestigo/chatwoot-api.env, never argv).
 *
 * Output is one line of status and booleans/counts only; no token, address or response body.
 *   status=<n> payload_array=<bool> meta_count=<n>
 * Exit 0 on a 2xx answer with an array payload, 2 on anything else.
 */

import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createChatwootClient, loadChatwootConfig, ChatwootApiError, ChatwootConfigError } from './lib/client.mjs'

/** The request body shape the site handler sends (kept in sync with lib/chatwoot-sync.ts). */
export function buildFilterBody(attributeKey, value) {
  return { payload: [{ attribute_key: attributeKey, filter_operator: 'equal_to', values: [value], query_operator: null }] }
}

/** Summarise a filter answer without echoing any of it. */
export function summarize(status, res) {
  const payloadArray = !!res && typeof res === 'object' && Array.isArray(res.payload)
  const count = res?.meta?.count
  const metaCount = typeof count === 'number' && Number.isFinite(count) ? count : -1
  return { status, payloadArray, metaCount }
}

export function formatLine({ status, payloadArray, metaCount }) {
  return `status=${status} payload_array=${payloadArray} meta_count=${metaCount}`
}

async function main() {
  let client
  try {
    client = createChatwootClient(loadChatwootConfig())
  } catch (err) {
    console.error(err instanceof ChatwootConfigError ? 'chatwoot config missing or invalid' : 'chatwoot client failed')
    return 2
  }

  const probe = `probe-${randomBytes(6).toString('hex')}@example.invalid`
  try {
    const res = await client.request('POST', '/contacts/filter', buildFilterBody('email', probe))
    const summary = summarize(200, res)
    console.log(formatLine(summary))
    return summary.payloadArray ? 0 : 2
  } catch (err) {
    const status = err instanceof ChatwootApiError ? err.status : 0
    console.log(formatLine({ status, payloadArray: false, metaCount: -1 }))
    return 2
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  process.exitCode = await main()
}
