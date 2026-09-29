#!/usr/bin/env node
/**
 * infra/chatwoot/whatsapp-templates.mjs
 *
 * WhatsApp message templates as code (Phase 78 plan 03, D-09): submits and
 * reports the templates defined in infra/chatwoot/whatsapp-templates/*.json on
 * the WABA through the Meta Graph API. Run by Claude/owner from a workstation,
 * never by the site at runtime.
 *
 *   node infra/chatwoot/whatsapp-templates.mjs --validate            offline, no token
 *   node infra/chatwoot/whatsapp-templates.mjs --dry-run             GET only, prints the plan
 *   node infra/chatwoot/whatsapp-templates.mjs                       creates missing name+language pairs
 *   node infra/chatwoot/whatsapp-templates.mjs --status              GET only, status table
 *   options: --only <key[,key]>  --allow-edit  --delay-ms <n> (default 1500)  --dir <path>
 *
 * Output, one line per name+language: "<name> <language> <action>" with action
 * create | unchanged | resubmit | drift <fields> | edit | exists (dry-run:
 * "plan <action>"), then
 *   summary: create=N unchanged=N resubmit=N drift=N edit=N exists=N
 * --status prints "status <name> <language> <STATUS> <CATEGORY>" lines (plus a
 * "rejected_reason" line for REJECTED) and
 *   status_summary approved=N pending=N rejected=N paused=N other=N
 * --validate prints "valid <name> <language> body_chars=<n>" lines and
 *   validated=<N>
 * Exit codes: 0 ok, 1 config / validation / drift, 2 API error (incl. rate limit).
 *
 * Safety: only GET and POST requests exist (a deleted template name is blocked
 * by Meta for 30 days). An APPROVED or PAUSED template whose copy differs is
 * reported as drift (exit 1) unless --allow-edit. A REJECTED template whose copy
 * differs is re-submitted. A category change made by Meta is never drift.
 * Re-running is safe: work is keyed by name+language and only missing pairs are
 * created. The first rate-limit signal stops the run (exit 2, rerun later).
 *
 * Secrets: lib/graph.mjs reads the token from env or
 * ~/.config/prestigo/meta-whatsapp.env (never argv) and never prints it.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createGraphClient, loadMetaConfig, MetaApiError, MetaConfigError } from './lib/graph.mjs'
import { planCollection, subsetEqual } from './sync.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_TEMPLATES_DIR = path.join(HERE, 'whatsapp-templates')

export const SITE_LOCALES = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh']
export const META_LANGUAGE = { en: 'en', ru: 'ru', es: 'es', fr: 'fr', ar: 'ar', hi: 'hi', zh: 'zh_CN' }

export const LIMITS = { body: 1024, buttonText: 25, name: 512, quickReplies: 10, urlButtons: 2 }
const URL_HOSTS = new Set(['rideprestigo.com', 'www.rideprestigo.com', 'g.page'])
const CATEGORIES = new Set(['UTILITY', 'MARKETING'])
const DEFAULT_DELAY_MS = 1500
const LIST_FIELDS = 'id,name,language,status,category,components,rejected_reason'

// ---------------------------------------------------------------------------
// Loading and validation (offline)
// ---------------------------------------------------------------------------

/**
 * Read every *.json in the directory. Throws MetaConfigError when the directory
 * is missing/empty ("no templates found"), a file is not valid JSON, or a
 * template's key differs from its filename stem.
 * @returns {Array<{ file: string, template: any }>}
 */
export function loadTemplates(dir = DEFAULT_TEMPLATES_DIR) {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : []
  if (files.length === 0) {
    throw new MetaConfigError(`no templates found in ${path.relative(process.cwd(), dir) || dir}`)
  }
  return files.map((file) => {
    let template
    try {
      template = JSON.parse(readFileSync(path.join(dir, file), 'utf8'))
    } catch (err) {
      throw new MetaConfigError(`${file}: not valid JSON (${err instanceof Error ? err.message : 'parse error'})`)
    }
    const stem = file.slice(0, -'.json'.length)
    if (!template || typeof template !== 'object' || template.key !== stem) {
      throw new MetaConfigError(`${file}: "key" must equal the filename stem "${stem}"`)
    }
    return { file, template }
  })
}

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0

/**
 * Human-readable errors for one template object; an empty list means valid.
 * All lengths are UTF-16 code units (String.length), the strictest counting.
 */
export function validateTemplate(t) {
  const errors = []
  if (!t || typeof t !== 'object' || Array.isArray(t)) return ['template must be a JSON object']

  if (typeof t.key !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.key)) errors.push('key must be kebab-case')
  if (typeof t.name !== 'string' || !/^[a-z0-9_]+$/.test(t.name)) {
    errors.push('name must match /^[a-z0-9_]{1,512}$/')
  } else {
    if (t.name.length > LIMITS.name) errors.push(`name is longer than ${LIMITS.name}`)
    if (!t.name.startsWith('prestigo_')) errors.push('name must start with prestigo_')
  }
  if (!CATEGORIES.has(t.category)) errors.push('category must be UTILITY or MARKETING')
  if (t.parameterFormat !== 'NAMED') errors.push('parameterFormat must be NAMED')
  if (t.sourceCanned !== null && typeof t.sourceCanned !== 'string') errors.push('sourceCanned must be a string or null')

  // header
  if (t.header !== null && !(t.header && typeof t.header === 'object' && t.header.format === 'DOCUMENT')) {
    errors.push('header must be null or { format: "DOCUMENT" }')
  }

  // variables
  const variables = Array.isArray(t.variables) ? t.variables : null
  const varNames = []
  if (!variables) errors.push('variables must be an array')
  else {
    for (const v of variables) {
      if (!v || typeof v.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(v.name)) {
        errors.push(`variable name invalid: ${JSON.stringify(v?.name)}`)
        continue
      }
      if (varNames.includes(v.name)) errors.push(`variable ${v.name} declared twice`)
      varNames.push(v.name)
      if (!isNonEmptyString(v.example)) errors.push(`variable ${v.name} needs a non-empty example`)
    }
  }

  // buttons
  const buttons = Array.isArray(t.buttons) ? t.buttons : null
  const textKeys = []
  if (!buttons) errors.push('buttons must be an array')
  else {
    let quick = 0
    let urls = 0
    const quickIdx = []
    buttons.forEach((b, i) => {
      if (!b || typeof b !== 'object') {
        errors.push(`button ${i} must be an object`)
        return
      }
      if (!isNonEmptyString(b.textKey)) errors.push(`button ${i} needs a textKey`)
      else if (textKeys.includes(b.textKey)) errors.push(`button textKey ${b.textKey} used twice`)
      else textKeys.push(b.textKey)
      if (b.type === 'QUICK_REPLY') {
        quick++
        quickIdx.push(i)
      } else if (b.type === 'URL') {
        urls++
        let host = null
        let https = false
        try {
          const u = new URL(String(b.url))
          host = u.hostname
          https = u.protocol === 'https:'
        } catch {
          /* invalid */
        }
        if (typeof b.url !== 'string' || !https) errors.push(`button ${i} url must be a valid https URL`)
        else if (!URL_HOSTS.has(host)) errors.push(`button ${i} url host ${host} is not allowed`)
        if (typeof b.url === 'string' && b.url.includes('{{')) errors.push(`button ${i} url must not contain a variable`)
      } else errors.push(`button ${i} type must be QUICK_REPLY or URL`)
    })
    if (quick > LIMITS.quickReplies) errors.push(`more than ${LIMITS.quickReplies} quick replies`)
    if (urls > LIMITS.urlButtons) errors.push(`more than ${LIMITS.urlButtons} URL buttons`)
    if (quickIdx.length > 1 && quickIdx[quickIdx.length - 1] - quickIdx[0] !== quickIdx.length - 1) {
      errors.push('quick replies must be contiguous (not interleaved with URL buttons)')
    }
  }

  // locales
  const locales = t.locales && typeof t.locales === 'object' && !Array.isArray(t.locales) ? t.locales : null
  if (!locales) {
    errors.push('locales must be an object')
    return errors
  }
  for (const code of SITE_LOCALES) if (!(code in locales)) errors.push(`missing locale ${code}`)
  for (const code of Object.keys(locales)) if (!SITE_LOCALES.includes(code)) errors.push(`unexpected locale ${code}`)

  for (const code of SITE_LOCALES) {
    const loc = locales[code]
    if (!loc) continue
    const at = `locale ${code}`
    if (typeof loc !== 'object') {
      errors.push(`${at} must be an object`)
      continue
    }
    if (loc.language !== META_LANGUAGE[code]) errors.push(`${at}: language must be ${META_LANGUAGE[code]}`)
    if (!isNonEmptyString(loc.body)) {
      errors.push(`${at}: body must be a non-empty string`)
    } else {
      const body = loc.body
      if (body.length > LIMITS.body) errors.push(`${at}: body is ${body.length} characters, limit ${LIMITS.body}`)
      const used = [...body.matchAll(/\{\{([^{}]*)\}\}/g)].map((m) => m[1])
      for (const name of varNames) if (!used.includes(name)) errors.push(`${at}: body does not use {{${name}}}`)
      for (const name of new Set(used)) if (!varNames.includes(name)) errors.push(`${at}: body uses undeclared {{${name}}}`)
      if (/\{\{|\}\}/.test(body.replace(/\{\{[^{}]*\}\}/g, ''))) errors.push(`${at}: body has a stray brace pair`)
      const trimmed = body.trim()
      if (trimmed.startsWith('{{')) errors.push(`${at}: body must not start with a variable`)
      if (trimmed.endsWith('}}')) errors.push(`${at}: body must not end with a variable`)
      if (code === 'en') {
        const order = []
        for (const name of used) if (varNames.includes(name) && !order.includes(name)) order.push(name)
        const declared = varNames.filter((n) => order.includes(n))
        if (order.join() !== declared.join()) errors.push('variables must be declared in order of first appearance in the en body')
      }
    }
    const labels = loc.buttons && typeof loc.buttons === 'object' ? loc.buttons : {}
    for (const key of textKeys) {
      const label = labels[key]
      if (!isNonEmptyString(label)) errors.push(`${at}: missing label for button ${key}`)
      else if (label.length > LIMITS.buttonText) errors.push(`${at}: button ${key} label is ${label.length} characters, limit ${LIMITS.buttonText}`)
    }
  }
  return errors
}

// ---------------------------------------------------------------------------
// Graph request bodies and comparison
// ---------------------------------------------------------------------------

/** Components array shared by create and edit. */
export function buildComponents(template, siteLocale) {
  const loc = template.locales[siteLocale]
  const components = []
  if (template.header) {
    components.push({
      type: 'HEADER',
      format: template.header.format,
      example: { header_handle: template.header.example ? [template.header.example] : [] },
    })
  }
  const body = { type: 'BODY', text: loc.body }
  if (template.variables.length > 0) {
    body.example = { body_text_named_params: template.variables.map((v) => ({ param_name: v.name, example: v.example })) }
  }
  components.push(body)
  if (template.buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: template.buttons.map((b) =>
        b.type === 'URL'
          ? { type: 'URL', text: loc.buttons[b.textKey], url: b.url }
          : { type: 'QUICK_REPLY', text: loc.buttons[b.textKey] },
      ),
    })
  }
  return components
}

/** POST /{WABA}/message_templates body for one site locale. */
export function buildCreateBody(template, siteLocale) {
  return {
    name: template.name,
    language: template.locales[siteLocale].language,
    category: template.category,
    parameter_format: 'NAMED',
    components: buildComponents(template, siteLocale),
  }
}

const norm = (s) => (typeof s === 'string' ? s.normalize('NFC').trim() : s)

/** Normalized comparable subset of a components array (local or remote). */
export function comparableFromComponents(components) {
  const list = Array.isArray(components) ? components : []
  const body = list.find((c) => c?.type === 'BODY')
  const header = list.find((c) => c?.type === 'HEADER')
  const buttons = list.find((c) => c?.type === 'BUTTONS')
  return {
    body: norm(body?.text ?? ''),
    header: header ? (header.format ?? null) : null,
    buttons: (buttons?.buttons ?? []).map((b) => {
      const out = { type: b.type, text: norm(b.text) }
      if (b.type === 'URL') out.url = norm(b.url)
      return out
    }),
  }
}

/** Fields (body, header, buttons) where the remote copy differs from the local one. */
export function diffFields(want, have) {
  return ['body', 'header', 'buttons'].filter((f) => !subsetEqual(want[f], have[f]))
}

const pairKey = (x) => `${x.name}|${x.language}`

/**
 * Plan actions for every local name+language against the remote listing.
 * Category is never compared (Meta may re-categorize).
 * @returns {Array<{ name, language, siteLocale, key, action, fields?, remote?, components }>}
 */
export function planTemplates(templates, remote, { allowEdit = false } = {}) {
  const desired = []
  for (const { template } of templates) {
    for (const siteLocale of SITE_LOCALES) {
      const components = buildComponents(template, siteLocale)
      desired.push({
        name: template.name,
        language: template.locales[siteLocale].language,
        siteLocale,
        key: template.key,
        components,
        comparable: comparableFromComponents(components),
      })
    }
  }
  const plan = planCollection({
    desired,
    existing: remote,
    keyOf: pairKey,
    differs: (want, have) => diffFields(want.comparable, comparableFromComponents(have.components)).length > 0,
  })
  const actions = []
  for (const want of plan.create) actions.push({ ...want, action: 'create' })
  for (const { desired: want, existing } of plan.unchanged) {
    actions.push({ ...want, action: 'unchanged', remote: existing })
  }
  for (const { desired: want, existing } of plan.update) {
    const fields = diffFields(want.comparable, comparableFromComponents(existing.components))
    let action = 'drift'
    if (existing.status === 'REJECTED') action = 'resubmit'
    else if (allowEdit && (existing.status === 'APPROVED' || existing.status === 'PAUSED')) action = 'edit'
    actions.push({ ...want, action, fields, remote: existing })
  }
  const order = (a) => `${a.name}\u0000${a.language}`
  return actions.sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0))
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function selectTemplates(all, only) {
  if (only.length === 0) return all
  const known = new Set(all.map((x) => x.template.key))
  const unknown = only.filter((k) => !known.has(k))
  if (unknown.length) throw new MetaConfigError(`--only: unknown template key ${unknown.join(', ')}`)
  return all.filter((x) => only.includes(x.template.key))
}

function validateAll(loaded) {
  const problems = []
  for (const { file, template } of loaded) {
    for (const e of validateTemplate(template)) problems.push(`${file}: ${e}`)
  }
  if (problems.length) throw new MetaConfigError(`Template validation failed:\n  ${problems.join('\n  ')}`)
}

/**
 * @param {{ validate?: boolean, dryRun?: boolean, status?: boolean, allowEdit?: boolean, only?: string[], delayMs?: number }} opts
 * @param {{ client?: ReturnType<typeof createGraphClient>, wabaId?: string, templatesDir?: string, out?: (l: string) => void, err?: (l: string) => void, sleep?: (ms: number) => Promise<void> }} deps
 * @returns {Promise<{ exitCode: number, counts: Record<string, number> }>}
 */
export async function runTemplates(opts, { client, wabaId, templatesDir = DEFAULT_TEMPLATES_DIR, out = console.log, err = console.error, sleep = defaultSleep } = {}) {
  const loaded = loadTemplates(templatesDir)
  validateAll(loaded) // every file is validated before any network call
  const selected = selectTemplates(loaded, opts.only ?? [])

  if (opts.validate) {
    let n = 0
    for (const { template } of selected) {
      for (const code of SITE_LOCALES) {
        const loc = template.locales[code]
        out(`valid ${template.name} ${loc.language} body_chars=${loc.body.length}`)
        n++
      }
    }
    out(`validated=${n}`)
    return { exitCode: 0, counts: { validated: n } }
  }

  if (!client || !wabaId) throw new MetaConfigError('a Graph client and WABA id are required for this mode')
  const listPath = `/${wabaId}/message_templates?fields=${LIST_FIELDS}&limit=100`
  const remote = await client.paginate(listPath)

  if (opts.status) return reportStatus(selected, remote, out)

  const actions = planTemplates(selected, remote, { allowEdit: !!opts.allowEdit })
  const counts = { create: 0, unchanged: 0, resubmit: 0, drift: 0, edit: 0, exists: 0 }
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS
  const line = (a, text) => out(`${a.name} ${a.language} ${opts.dryRun ? 'plan ' : ''}${text}`)
  let mutated = false

  const summary = () => out(`summary: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}`)

  for (const a of actions) {
    if (a.action === 'unchanged' || a.action === 'drift') {
      counts[a.action]++
      line(a, a.action === 'drift' ? `drift ${a.fields.join(',')}` : 'unchanged')
      continue
    }
    if (opts.dryRun) {
      counts[a.action]++
      line(a, a.action)
      continue
    }
    if (mutated && delayMs > 0) await sleep(delayMs)
    mutated = true
    try {
      if (a.action === 'create') {
        await client.request('POST', `/${wabaId}/message_templates`, buildCreateBody(templateOf(selected, a), a.siteLocale))
      } else {
        // resubmit (REJECTED) and edit (APPROVED/PAUSED with --allow-edit): components only
        await client.request('POST', `/${a.remote.id}`, { components: a.components })
      }
      counts[a.action]++
      line(a, a.action)
    } catch (e) {
      if (e instanceof MetaApiError && e.isRateLimit) {
        line(a, 'rate-limited')
        summary()
        err('rate limit reached - stopping now; rerun later (only missing templates are created)')
        return { exitCode: 2, counts }
      }
      if (e instanceof MetaApiError && a.action === 'create' && e.isAlreadyExists) {
        counts.exists++
        line(a, 'exists')
        continue
      }
      throw e
    }
  }
  summary()
  return { exitCode: counts.drift > 0 ? 1 : 0, counts }
}

function templateOf(selected, a) {
  return selected.find((x) => x.template.key === a.key).template
}

function reportStatus(selected, remote, out) {
  const byPair = new Map(remote.map((r) => [pairKey(r), r]))
  const rows = []
  for (const { template } of selected) {
    for (const code of SITE_LOCALES) {
      const language = template.locales[code].language
      rows.push({ name: template.name, language, remote: byPair.get(`${template.name}|${language}`) })
    }
  }
  rows.sort((a, b) => (a.name === b.name ? (a.language < b.language ? -1 : a.language > b.language ? 1 : 0) : a.name < b.name ? -1 : 1))
  const c = { approved: 0, pending: 0, rejected: 0, paused: 0, other: 0 }
  for (const r of rows) {
    const status = r.remote?.status ?? 'MISSING'
    out(`status ${r.name} ${r.language} ${status} ${r.remote?.category ?? '-'}`)
    if (status === 'REJECTED' && r.remote.rejected_reason) out(`rejected_reason ${r.name} ${r.language} ${r.remote.rejected_reason}`)
    if (status === 'APPROVED') c.approved++
    else if (status === 'PENDING') c.pending++
    else if (status === 'REJECTED') c.rejected++
    else if (status === 'PAUSED') c.paused++
    else c.other++
  }
  out(`status_summary approved=${c.approved} pending=${c.pending} rejected=${c.rejected} paused=${c.paused} other=${c.other}`)
  return { exitCode: 0, counts: c }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const opts = { validate: false, dryRun: false, status: false, allowEdit: false, only: [], delayMs: DEFAULT_DELAY_MS, dir: null }
  const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean)
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--validate') opts.validate = true
    else if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--status') opts.status = true
    else if (arg === '--allow-edit') opts.allowEdit = true
    else if (arg === '--only') {
      const value = argv[++i]
      if (!value) throw new MetaConfigError('--only needs a template key (comma-separated for several)')
      opts.only = list(value)
    } else if (arg.startsWith('--only=')) opts.only = list(arg.slice('--only='.length))
    else if (arg === '--delay-ms' || arg.startsWith('--delay-ms=')) {
      const value = arg === '--delay-ms' ? argv[++i] : arg.slice('--delay-ms='.length)
      const n = Number(value)
      if (value === undefined || !Number.isInteger(n) || n < 0) throw new MetaConfigError('--delay-ms needs a non-negative integer')
      opts.delayMs = n
    } else if (arg === '--dir') {
      const value = argv[++i]
      if (!value) throw new MetaConfigError('--dir needs a path')
      opts.dir = value
    } else throw new MetaConfigError(`Unknown argument: ${arg}`)
  }
  const modes = [opts.validate, opts.dryRun, opts.status].filter(Boolean).length
  if (modes > 1) throw new MetaConfigError('--validate, --dry-run and --status are mutually exclusive')
  return opts
}

async function main(argv) {
  try {
    const opts = parseArgs(argv)
    const deps = { templatesDir: opts.dir ? path.resolve(opts.dir) : DEFAULT_TEMPLATES_DIR }
    if (!opts.validate) {
      const config = loadMetaConfig()
      deps.client = createGraphClient({ token: config.token, graphVersion: config.graphVersion })
      deps.wabaId = config.wabaId
    }
    const { exitCode } = await runTemplates(opts, deps)
    process.exit(exitCode)
  } catch (e) {
    if (e instanceof MetaApiError) {
      console.error(`API error: ${e.message}`)
      process.exit(2)
    }
    if (e instanceof MetaConfigError) {
      console.error(`Config error: ${e.message}`)
      process.exit(1)
    }
    console.error(`Templates failed: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(2)
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main(process.argv.slice(2))
}
