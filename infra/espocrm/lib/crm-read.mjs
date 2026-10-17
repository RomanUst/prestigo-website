/**
 * infra/espocrm/lib/crm-read.mjs
 *
 * Helpers shared by the migration scripts (backfill, seed-accounts, overlay, sync):
 * collection paging, the dry-run read-only client wrapper, a sleep, and the API
 * error line. Output never carries a query string or a request body: a lookup
 * URL can hold an email address.
 */

export const PAGE_SIZE = 200

export const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve())

/** Page through a collection (server cap 200); de-duplicates by id against unstable paging. */
export async function fetchAll(client, entity, select) {
  const out = new Map()
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const qs = `select=${select.join(',')}&maxSize=${PAGE_SIZE}&offset=${offset}&orderBy=createdAt&order=asc`
    const res = await client.request('GET', `/${entity}?${qs}`)
    const list = Array.isArray(res?.list) ? res.list : []
    for (const rec of list) if (rec?.id && !out.has(rec.id)) out.set(rec.id, rec)
    if (list.length < PAGE_SIZE) break
    if (typeof res?.total === 'number' && res.total >= 0 && offset + PAGE_SIZE >= res.total) break
  }
  return [...out.values()]
}

/** Dry-run wrapper: any request other than GET throws before it leaves the process. */
export function readOnlyClient(client) {
  return {
    ...client,
    request(method, apiPath, body) {
      if (method !== 'GET') throw new Error(`dry-run refused ${method} ${String(apiPath).split('?')[0]}`)
      return client.request(method, apiPath, body)
    },
  }
}

/** API failure line without query string or body. */
export function describeApiError(err) {
  return `${err.method} ${String(err.apiPath).split('?')[0]} -> ${err.status}`
}
