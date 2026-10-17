/**
 * infra/espocrm/lib/export-loader.mjs
 *
 * Reads the Supabase booking export (page-NN.json files kept under the git-ignored
 * infra/espocrm/.work/). Shared by backfill, seed-accounts and account-candidates.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { EspoConfigError } from './client.mjs'
import { isAbandonedCheckout } from './booking-map.mjs'

const isNil = (v) => v === null || v === undefined

export const byExportOrder = (a, b) => {
  const ca = String(a.created_at ?? '')
  const cb = String(b.created_at ?? '')
  if (ca !== cb) return ca < cb ? -1 : 1
  const ia = String(a.id)
  const ib = String(b.id)
  return ia < ib ? -1 : ia > ib ? 1 : 0
}

/**
 * Load the Supabase export: a single .json file or a directory of page-*.json files.
 * De-duplicates by id (duplicate_rows) and re-applies the abandoned-checkout rule
 * (excluded_abandoned). Rows come back in export order (created_at, id).
 * Error messages name only the path: file contents never reach an error message.
 */
export function loadExport(input) {
  if (!input || !existsSync(input)) {
    throw new EspoConfigError(`Export input not found: ${input}`)
  }
  let files
  if (statSync(input).isDirectory()) {
    files = readdirSync(input)
      .filter((f) => /^page-.*\.json$/.test(f))
      .sort()
      .map((f) => path.join(input, f))
    if (files.length === 0) throw new EspoConfigError(`No page-*.json files in: ${input}`)
  } else {
    files = [input]
  }

  const seen = new Map()
  let duplicateRows = 0
  for (const file of files) {
    let parsed
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      throw new EspoConfigError(`Export file is not valid JSON: ${file}`)
    }
    if (!Array.isArray(parsed)) throw new EspoConfigError(`Export file is not a JSON array: ${file}`)
    for (const row of parsed) {
      if (!row || typeof row !== 'object' || isNil(row.id) || row.id === '') {
        throw new EspoConfigError(`Export file holds a row without id: ${file}`)
      }
      if (seen.has(row.id)) duplicateRows++
      else seen.set(row.id, row)
    }
  }

  const all = [...seen.values()]
  const rows = all.filter((r) => !isAbandonedCheckout(r)).sort(byExportOrder)
  return {
    rows,
    counts: {
      rows: all.length,
      excluded_abandoned: all.length - rows.length,
      duplicate_rows: duplicateRows,
    },
  }
}
