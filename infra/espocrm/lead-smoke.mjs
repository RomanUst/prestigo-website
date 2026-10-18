#!/usr/bin/env node
/**
 * infra/espocrm/lead-smoke.mjs
 *
 * PII-free go-live check for website Leads (Phase 81 plan 06; used by the smoke in plan 81-11).
 * Finds the Lead(s) the site wrote for one smoke submission by their cSupabaseRef and either
 * summarises or deletes them.
 *
 *   node infra/espocrm/lead-smoke.mjs show <ref>
 *   node infra/espocrm/lead-smoke.mjs delete <ref>
 *
 *   <ref>   exactly `inquiry:<uuid>` or `booking:<uuid>` (anything else is refused before any request)
 *
 *   show    -> one line per matching Lead (or `count=0`):
 *              count=N status=S source=S existing_customer=true|false has_email=true|false
 *              has_phone=true|false has_account_name=true|false has_return_reference=true|false
 *   delete  -> deleted=N   (every Lead whose cSupabaseRef equals <ref>)
 *
 * Exit codes: 0 ok, 1 usage/config error, 2 API error. Identity: prestigo-sync (API key), which has
 * Lead read/edit/delete since plan 81-03. Output is counts, statuses, source names and booleans only:
 * never an email, a phone number or a name. Deleting is limited to an exact site reference, so only
 * Leads created by the site (and, in the go-live smoke, by the smoke itself) can ever match.
 */

import { pathToFileURL } from 'node:url'
import { createEspoClient, loadEspoConfig, EspoApiError, EspoConfigError } from './lib/client.mjs'

const COMMANDS = ['show', 'delete']
const REF_RE = /^(inquiry|booking):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_MATCHES = 20

/**
 * @param {string[]} argv
 * @returns {{ command: 'show' | 'delete', ref: string }}
 */
export function parseLeadSmokeArgs(argv) {
  const [command, ref, ...extra] = argv
  if (!command) throw new EspoConfigError(`Missing command (expected one of ${COMMANDS.join(', ')})`)
  if (!COMMANDS.includes(command)) throw new EspoConfigError(`Unknown command: ${command}`)
  if (typeof ref !== 'string' || !REF_RE.test(ref)) {
    throw new EspoConfigError(`${command} needs a reference such as inquiry:<uuid> or booking:<uuid>`)
  }
  if (extra.length) throw new EspoConfigError(`Unknown argument: ${extra[0]}`)
  return { command, ref }
}

const truthy = (value) => (typeof value === 'string' ? value.trim() !== '' : Boolean(value))

async function findLeads(client, ref, select) {
  const params = new URLSearchParams({ select, maxSize: String(MAX_MATCHES) })
  params.set('where[0][type]', 'equals')
  params.set('where[0][attribute]', 'cSupabaseRef')
  params.set('where[0][value]', ref)
  return (await client.request('GET', `/Lead?${params.toString()}`))?.list ?? []
}

/**
 * @param {{ argv: string[], client: { request: Function }, log?: (line: string) => void }} options
 * @returns {Promise<number>} the exit code
 */
export async function runLeadSmoke({ argv, client, log = console.log }) {
  const { command, ref } = parseLeadSmokeArgs(argv)

  if (command === 'show') {
    const select = 'id,status,source,cExistingCustomer,emailAddress,phoneNumber,accountName,cReturnBookingReference'
    const leads = await findLeads(client, ref, select)
    if (leads.length === 0) {
      log('count=0')
      return 0
    }
    for (const lead of leads) {
      log(
        `count=${leads.length} status=${lead.status ?? ''} source=${lead.source ?? ''}` +
          ` existing_customer=${Boolean(lead.cExistingCustomer)} has_email=${truthy(lead.emailAddress)}` +
          ` has_phone=${truthy(lead.phoneNumber)} has_account_name=${truthy(lead.accountName)}` +
          ` has_return_reference=${truthy(lead.cReturnBookingReference)}`,
      )
    }
    return 0
  }

  const leads = await findLeads(client, ref, 'id')
  let deleted = 0
  for (const lead of leads) {
    if (typeof lead?.id !== 'string' || !lead.id) continue
    await client.request('DELETE', `/Lead/${encodeURIComponent(lead.id)}`)
    deleted++
  }
  log(`deleted=${deleted}`)
  return 0
}

async function main(argv) {
  try {
    parseLeadSmokeArgs(argv)
    const client = createEspoClient({ config: loadEspoConfig({ identity: 'apikey' }) })
    process.exit(await runLeadSmoke({ argv, client }))
  } catch (err) {
    if (err instanceof EspoApiError) {
      console.error(`API error: ${err.message}`)
      process.exit(2)
    }
    if (err instanceof EspoConfigError) {
      console.error(`Config error: ${err.message}`)
      process.exit(1)
    }
    console.error(`Lead smoke failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(2)
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main(process.argv.slice(2))
}
