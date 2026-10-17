#!/usr/bin/env node
/**
 * infra/espocrm/account-candidates.mjs
 *
 * D-14 account candidate scan (Phase 80, plan 12). Reads the same Supabase export as the
 * backfill (same exclusion and de-duplication, via loadExport), proposes likely partner
 * Accounts and writes them to a git-ignored candidates.json for the owner to confirm.
 *
 *   node infra/espocrm/account-candidates.mjs [--input infra/espocrm/.work/export]
 *                                             [--out infra/espocrm/.work/candidates.json]
 *
 * No network, no CRM calls. Exit codes: 0 ok, 1 config (missing input, --out outside .work/).
 * stdout is a table of names, domains, company names and counts: never an email address.
 * Every candidate starts as confirm:false, type:null. The owner confirms by editing the file.
 */

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { EspoConfigError } from './lib/client.mjs'
import { buildCandidates, formatCandidateTable } from './lib/candidates.mjs'
import { loadExport } from './lib/export-loader.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const WORK_DIR = path.join(HERE, '.work')
export const DEFAULT_INPUT = path.join(WORK_DIR, 'export')
export const DEFAULT_OUT = path.join(WORK_DIR, 'candidates.json')

export function parseArgs(argv) {
  const opts = { input: DEFAULT_INPUT, out: DEFAULT_OUT }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--input' || arg === '--out') {
      if (!argv[i + 1]) throw new EspoConfigError(`${arg} needs a path`)
      opts[arg.slice(2)] = argv[++i]
    } else if (arg.startsWith('--input=')) opts.input = arg.slice('--input='.length)
    else if (arg.startsWith('--out=')) opts.out = arg.slice('--out='.length)
    else throw new EspoConfigError(`Unknown argument: ${arg}`)
  }
  return opts
}

/** True when target resolves inside dir (never equal to dir itself). */
function isInside(dir, target) {
  const rel = path.relative(path.resolve(dir), path.resolve(target))
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/**
 * @param {{ input?: string, out?: string, workDir?: string, log?: (l: string) => void, error?: (l: string) => void }} options
 * @returns {number} the process exit code
 */
export function runCandidates({
  input = DEFAULT_INPUT,
  out = DEFAULT_OUT,
  workDir = WORK_DIR,
  log = console.log,
  error = console.error,
} = {}) {
  try {
    if (!isInside(workDir, out)) {
      throw new EspoConfigError('--out must be a file inside the git-ignored infra/espocrm/.work/ folder')
    }
    const { rows } = loadExport(input)
    const candidates = buildCandidates(rows)
    // The file holds customer company names and counts: owner-only. `mode` applies only when
    // a file or folder is created, so a pre-existing looser one is tightened explicitly.
    const outDir = path.dirname(path.resolve(out))
    mkdirSync(outDir, { recursive: true, mode: 0o700 })
    chmodSync(outDir, 0o700)
    writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), candidates }, null, 2) + '\n', {
      mode: 0o600,
    })
    chmodSync(out, 0o600)
    log(formatCandidateTable(candidates))
    log(`candidates: ${candidates.length}`)
    return 0
  } catch (err) {
    if (err instanceof EspoConfigError) {
      error(`Config error: ${err.message}`)
      return 1
    }
    error(`Candidate scan failed: ${err instanceof Error ? err.name : 'unknown error'}`)
    return 1
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  try {
    process.exit(runCandidates(parseArgs(process.argv.slice(2))))
  } catch (err) {
    console.error(`Config error: ${err instanceof Error ? err.message : 'invalid arguments'}`)
    process.exit(1)
  }
}
