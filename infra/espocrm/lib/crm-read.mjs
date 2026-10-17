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

/** The collection could not be read completely: callers must not write on a partial picture. */
export class PartialPreloadError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PartialPreloadError'
  }
}

/**
 * Page through a collection (server cap 200).
 *
 * Pages are ordered by the unique `id`, so records written in the same second (the
 * backfill writes ~50 ms apart; createdAt has one-second resolution) cannot swap
 * places between two page requests. Repeats are de-duplicated by id, and the result is
 * checked against the `total` the first page reported: fewer records than that means a
 * page was skipped, and the call fails closed instead of letting the caller treat a
 * missing record as "not yet created". Records created while paging may add to the
 * result; only a shortfall is an error.
 */
export async function fetchAll(client, entity, select) {
  const out = new Map()
  let expected = null
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const qs = `select=${select.join(',')}&maxSize=${PAGE_SIZE}&offset=${offset}&orderBy=id&order=asc`
    const res = await client.request('GET', `/${entity}?${qs}`)
    const list = Array.isArray(res?.list) ? res.list : []
    if (offset === 0 && typeof res?.total === 'number' && res.total >= 0) expected = res.total
    for (const rec of list) if (rec?.id && !out.has(rec.id)) out.set(rec.id, rec)
    if (list.length < PAGE_SIZE) break
    if (typeof res?.total === 'number' && res.total >= 0 && offset + PAGE_SIZE >= res.total) break
  }
  if (expected !== null && out.size < expected) {
    throw new PartialPreloadError(`${entity}: loaded ${out.size} of ${expected} records; refusing to continue on a partial preload`)
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
