#!/usr/bin/env node
/**
 * infra/chatwoot/sync.mjs
 *
 * Idempotent config-as-code sync (Phase 77 plan 07, D-18): turns the JSON under
 * infra/chatwoot/ into live Chatwoot configuration. Run by Claude/owner from a
 * workstation, never by the site at runtime.
 *
 *   node infra/chatwoot/sync.mjs [--dry-run] [--only labels,teams,...]
 *
 * Resource order: account, labels, teams, attributes, canned, inboxes, automation.
 * Matching (never re-create what exists): labels by title, teams by name,
 * attributes by attribute_key + model, canned responses by short_code, inboxes
 * by name, automation rules by name (infra/vps/scripts/provision-monitors.sh
 * precedent).
 *
 * Output contract, one line per resource then a summary:
 *   <resource>: create=N update=N unchanged=N skipped=N deleted=N
 *   website_token=<public token>
 *   summary: create=N update=N skipped=N
 * Exit codes: 0 ok, 1 config/validation error, 2 API error.
 *
 * Secrets: the API token is read by lib/client.mjs (env or file, never a command
 * line argument) and never printed; the Website inbox hmac_token is never
 * printed either (only the public website_token is).
 */

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createChatwootClient, loadChatwootConfig, ChatwootApiError, ChatwootConfigError } from './lib/client.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')

export const RESOURCE_ORDER = ['account', 'labels', 'teams', 'attributes', 'canned', 'inboxes', 'automation']

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Split desired items into create / update / unchanged against existing ones.
 * Existing items that are not desired are ignored (never touched here).
 */
export function planCollection({ desired, existing, keyOf, differs }) {
  const byKey = new Map()
  for (const item of existing) byKey.set(keyOf(item), item)
  const plan = { create: [], update: [], unchanged: [] }
  for (const want of desired) {
    const have = byKey.get(keyOf(want))
    if (!have) plan.create.push(want)
    else if (differs(want, have)) plan.update.push({ desired: want, existing: have })
    else plan.unchanged.push({ desired: want, existing: have })
  }
  return plan
}

/**
 * True when every value in `want` is present in `have`. Extra keys on the
 * server side (ids, timestamps, normalized defaults) are ignored. Arrays are
 * compared element by element, except arrays of objects carrying a `name`,
 * which are matched by name (the server may reorder or append fields).
 */
export function subsetEqual(want, have) {
  if (want === null) return have == null
  if (want === '') return have == null || have === ''
  if (typeof want !== 'object') {
    if (want === undefined) return true
    return want === have
  }
  if (Array.isArray(want)) {
    if (!Array.isArray(have) || have.length < want.length) return false
    const named = want.every((x) => x && typeof x === 'object' && 'name' in x)
    if (named) return want.every((w) => have.some((h) => h && h.name === w.name && subsetEqual(w, h)))
    if (have.length !== want.length) return false
    return want.every((w, i) => subsetEqual(w, have[i]))
  }
  if (have === null || typeof have !== 'object') return false
  return Object.keys(want).every((k) => subsetEqual(want[k], have[k]))
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Replace "@owner", "@team:<name>", "@inbox:<name>" placeholders (whole-string
 * values only) with their numeric ids. Returns { value, missing } where missing
 * lists the placeholders that could not be resolved.
 */
export function resolveRefs(value, refs) {
  const missing = []
  const walk = (node) => {
    if (typeof node === 'string') {
      if (node === '@owner') {
        if (refs.ownerId == null) missing.push('@owner')
        return refs.ownerId
      }
      const team = node.match(/^@team:(.+)$/)
      if (team) {
        const id = refs.teams?.get(team[1]) ?? refs.teams?.get(team[1].toLowerCase())
        if (id == null) missing.push(node)
        return id
      }
      const inbox = node.match(/^@inbox:(.+)$/)
      if (inbox) {
        const id = refs.inboxes?.get(inbox[1])
        if (id == null) missing.push(node)
        return id
      }
      return node
    }
    if (Array.isArray(node)) return node.map(walk)
    if (isPlainObject(node)) return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]))
    return node
  }
  const resolved = walk(value)
  return { value: resolved, missing: [...new Set(missing)] }
}

/** Name prefix of every generated keyword rule; only these are ever deleted. */
export const GENERATED_RULE_PREFIX = 'topic:'

/**
 * Expand automation-rules.json into concrete Chatwoot rule bodies. Names,
 * inbox/team/owner references stay as "@inbox:<name>", "@team:<name>",
 * "@owner" placeholders until resolved against live ids. Rules whose references
 * cannot be resolved (e.g. an inbox the owner has not created yet) are returned
 * in `skipped`, never half-created.
 *
 * @param {any} config parsed automation-rules.json
 * @param {{ ownerId?: number | null, teams?: Map<string, number> | null, inboxes?: Map<string, number> | null }} refs
 * @returns {{ rules: any[], skipped: { name: string, reason: string, optional?: boolean }[], allNames: string[] }}
 */
export function expandAutomationRules(config, refs) {
  const templates = []

  for (const rule of config.channelRules ?? []) {
    templates.push({
      name: rule.name,
      description: `Generated: label ${rule.label}, assign to the ${rule.team} team and the owner`,
      event_name: 'conversation_created',
      active: true,
      conditions: [
        { attribute_key: 'inbox_id', filter_operator: 'equal_to', values: [`@inbox:${rule.inbox}`], query_operator: null },
      ],
      actions: [
        { action_name: 'add_label', action_params: [rule.label] },
        { action_name: 'assign_team', action_params: [`@team:${rule.team}`] },
        { action_name: 'assign_agent', action_params: ['@owner'] },
      ],
    })
  }

  for (const topic of config.topicRules ?? []) {
    for (const [locale, keywords] of Object.entries(topic.keywords)) {
      for (const keyword of keywords) {
        const actions = [{ action_name: 'add_label', action_params: [topic.label] }]
        if (topic.team) actions.push({ action_name: 'assign_team', action_params: [`@team:${topic.team}`] })
        templates.push({
          name: `${GENERATED_RULE_PREFIX}${topic.label}:${locale}:${keyword}`,
          description: `Generated: label ${topic.label} when an incoming message contains "${keyword}" (${locale})`,
          event_name: 'message_created',
          active: true,
          conditions: [
            { attribute_key: 'message_type', filter_operator: 'equal_to', values: ['incoming'], query_operator: 'and' },
            { attribute_key: 'content', filter_operator: 'contains', values: [keyword], query_operator: null },
          ],
          actions,
        })
      }
    }
  }

  for (const rule of config.labelRouting ?? []) {
    templates.push({
      name: rule.name,
      description: `Generated: route conversations labelled ${rule.label} to the ${rule.team} team`,
      event_name: 'conversation_updated',
      active: true,
      optional: Boolean(rule.optional),
      conditions: [{ attribute_key: 'labels', filter_operator: 'equal_to', values: [rule.label], query_operator: null }],
      actions: [{ action_name: 'assign_team', action_params: [`@team:${rule.team}`] }],
    })
  }

  const rules = []
  const skipped = []
  for (const template of templates) {
    const { optional, ...body } = template
    const { value, missing } = resolveRefs(body, refs)
    if (missing.length) skipped.push({ name: template.name, reason: `missing ${missing.join(', ')}`, optional })
    else rules.push({ ...value, optional })
  }
  return { rules, skipped, allNames: templates.map((t) => t.name) }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function unwrapList(res, ...keys) {
  if (Array.isArray(res)) return res
  const payload = res?.payload
  if (Array.isArray(payload)) return payload
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key]
    if (Array.isArray(res?.[key])) return res[key]
  }
  return []
}

function readJson(configDir, ...parts) {
  return JSON.parse(readFileSync(path.join(configDir, ...parts), 'utf8'))
}

const emptyCounts = () => ({ create: 0, update: 0, unchanged: 0, skipped: 0, deleted: 0 })

const formatCounts = (c) =>
  `create=${c.create} update=${c.update} unchanged=${c.unchanged} skipped=${c.skipped} deleted=${c.deleted}`

/** In dry-run mode the client is wrapped so any non-GET request throws. */
function readOnlyClient(client) {
  return {
    ...client,
    request(method, apiPath, body) {
      if (method !== 'GET') throw new Error(`dry-run refused ${method} ${apiPath}`)
      return client.request(method, apiPath, body)
    },
    upload() {
      throw new Error('dry-run refused upload')
    },
  }
}

function makeContext({ client: rawClient, dryRun, log, configDir, repoRoot }) {
  const client = dryRun ? readOnlyClient(rawClient) : rawClient
  const refs = { ownerId: null, teams: null, inboxes: null }

  async function mutate(method, apiPath, body) {
    if (dryRun) return null
    return client.request(method, apiPath, body)
  }

  return {
    client,
    dryRun,
    log,
    configDir,
    repoRoot,
    refs,
    mutate,
    read: (...parts) => readJson(configDir, ...parts),
    list: async (apiPath, ...keys) => unwrapList(await client.request('GET', apiPath), ...keys),
    unsupportedFields: new Set(),
    async ownerId() {
      if (refs.ownerId == null) {
        const profile = await client.request('GET', '/api/v1/profile')
        refs.ownerId = profile?.id ?? null
        if (refs.ownerId == null) throw new ChatwootConfigError('Could not resolve the token owner id from /api/v1/profile')
      }
      return refs.ownerId
    },
    async teamMap() {
      if (!refs.teams) {
        const teams = unwrapList(await client.request('GET', '/teams'), 'teams')
        refs.teams = new Map(teams.map((t) => [t.name.toLowerCase(), t.id]))
      }
      return refs.teams
    },
    async inboxMap() {
      if (!refs.inboxes) {
        const inboxes = unwrapList(await client.request('GET', '/inboxes'), 'inboxes')
        const managed = readJson(configDir, 'inboxes.json')
        refs.inboxes = buildInboxRefs(inboxes, managed)
      }
      return refs.inboxes
    },
  }
}

/**
 * name -> id map of the inboxes the config refers to. Inboxes match by name;
 * a managed inbox whose name is not found falls back to the one existing inbox
 * of the same channel_type, but only when both sides are unambiguous (exactly
 * one existing inbox of that type and exactly one managed entry of that type).
 * This is how "Telegram" resolves to an inbox the owner named after the bot.
 */
export function buildInboxRefs(inboxes, config) {
  const map = new Map(inboxes.map((i) => [i.name, i.id]))
  for (const entry of config.managed ?? []) {
    if (map.has(entry.name)) continue
    const sameType = inboxes.filter((i) => i.channel_type === entry.channel_type)
    const sameManaged = (config.managed ?? []).filter((m) => m.channel_type === entry.channel_type)
    if (sameType.length === 1 && sameManaged.length === 1) map.set(entry.name, sameType[0].id)
  }
  return map
}

// ---------------------------------------------------------------------------
// Resource: labels
// ---------------------------------------------------------------------------

async function syncLabels(ctx) {
  const counts = emptyCounts()
  const desired = ctx.read('labels.json').labels
  const existing = await ctx.list('/labels', 'labels')
  const plan = planCollection({
    desired,
    existing,
    keyOf: (l) => l.title,
    differs: (want, have) =>
      want.description !== have.description ||
      want.color !== have.color ||
      Boolean(want.show_on_sidebar) !== Boolean(have.show_on_sidebar),
  })
  for (const want of plan.create) {
    ctx.log(`  [create] label ${want.title}`)
    await ctx.mutate('POST', '/labels', want)
    counts.create++
  }
  for (const { desired: want, existing: have } of plan.update) {
    ctx.log(`  [update] label ${want.title}`)
    await ctx.mutate('PATCH', `/labels/${have.id}`, want)
    counts.update++
  }
  counts.unchanged = plan.unchanged.length
  return counts
}

// ---------------------------------------------------------------------------
// Resource: account
// ---------------------------------------------------------------------------

async function syncAccount(ctx) {
  const counts = emptyCounts()
  const desired = ctx.read('account.json')
  const have = await ctx.client.request('GET', '')
  const drift = Object.keys(desired).filter((k) => desired[k] !== have?.[k])
  if (drift.length === 0) {
    counts.unchanged = 1
    return counts
  }
  ctx.log(`  [update] account ${drift.join(', ')}`)
  await ctx.mutate('PATCH', '', desired)
  counts.update = 1
  return counts
}

// ---------------------------------------------------------------------------
// Resource: teams (+ owner membership)
// ---------------------------------------------------------------------------

async function syncTeams(ctx) {
  const counts = emptyCounts()
  const desired = ctx.read('teams.json').teams
  const existing = unwrapList(await ctx.client.request('GET', '/teams'), 'teams')
  const plan = planCollection({
    desired,
    existing,
    keyOf: (t) => t.name.toLowerCase(),
    differs: (want, have) =>
      want.description !== have.description || Boolean(want.allow_auto_assign) !== Boolean(have.allow_auto_assign),
  })

  const ids = new Map(existing.map((t) => [t.name.toLowerCase(), t.id]))
  const changed = new Set()

  for (const want of plan.create) {
    ctx.log(`  [create] team ${want.name}`)
    const created = await ctx.mutate('POST', '/teams', {
      name: want.name,
      description: want.description,
      allow_auto_assign: Boolean(want.allow_auto_assign),
    })
    ids.set(want.name.toLowerCase(), created?.id ?? -1)
    changed.add(want.name)
    counts.create++
  }
  for (const { desired: want, existing: have } of plan.update) {
    ctx.log(`  [update] team ${want.name}`)
    await ctx.mutate('PATCH', `/teams/${have.id}`, {
      name: want.name,
      description: want.description,
      allow_auto_assign: Boolean(want.allow_auto_assign),
    })
    changed.add(want.name)
    counts.update++
  }

  const ownerId = await ctx.ownerId()
  for (const want of desired) {
    const teamId = ids.get(want.name.toLowerCase())
    const wanted = (want.members ?? []).map((m) => (m === '@owner' ? ownerId : m))
    if (!wanted.length || teamId == null) continue
    const current = teamId > 0 ? unwrapList(await ctx.client.request('GET', `/teams/${teamId}/team_members`), 'members') : []
    const currentIds = new Set(current.map((u) => u.id))
    const toAdd = wanted.filter((id) => !currentIds.has(id))
    if (toAdd.length) {
      ctx.log(`  [update] team ${want.name} members +${toAdd.length}`)
      await ctx.mutate('POST', `/teams/${teamId}/team_members`, { user_ids: toAdd })
      if (!changed.has(want.name)) {
        changed.add(want.name)
        counts.update++
      }
    }
  }

  counts.unchanged = desired.length - changed.size
  ctx.refs.teams = ids
  return counts
}

// ---------------------------------------------------------------------------
// Resource: custom attribute definitions
// ---------------------------------------------------------------------------

async function syncAttributes(ctx) {
  const counts = emptyCounts()
  const config = ctx.read('custom-attributes.json')
  const models = [
    ['conversation', 'conversation_attribute'],
    ['contact', 'contact_attribute'],
  ]
  for (const [section, model] of models) {
    const desired = (config[section] ?? []).map((a) => ({
      attribute_key: a.key,
      attribute_display_name: a.display_name,
      attribute_display_type: a.display_type,
      attribute_description: a.description,
      attribute_model: model,
    }))
    const existing = unwrapList(
      await ctx.client.request('GET', `/custom_attribute_definitions?attribute_model=${model}`),
      'definitions',
    )
    const plan = planCollection({
      desired,
      existing,
      keyOf: (a) => a.attribute_key,
      differs: (want, have) =>
        want.attribute_display_name !== have.attribute_display_name ||
        String(want.attribute_display_type) !== String(have.attribute_display_type) ||
        (want.attribute_description ?? '') !== (have.attribute_description ?? ''),
    })
    for (const want of plan.create) {
      ctx.log(`  [create] attribute ${model}:${want.attribute_key}`)
      await ctx.mutate('POST', '/custom_attribute_definitions', want)
      counts.create++
    }
    for (const { desired: want, existing: have } of plan.update) {
      ctx.log(`  [update] attribute ${model}:${want.attribute_key}`)
      await ctx.mutate('PATCH', `/custom_attribute_definitions/${have.id}`, {
        attribute_display_name: want.attribute_display_name,
        attribute_display_type: want.attribute_display_type,
        attribute_description: want.attribute_description,
      })
      counts.update++
    }
    counts.unchanged += plan.unchanged.length
  }
  return counts
}

// ---------------------------------------------------------------------------
// Resource: canned responses (<topic>-<locale>)
// ---------------------------------------------------------------------------

export function loadCannedDesired(configDir) {
  const dir = path.join(configDir, 'canned-responses')
  const desired = []
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const data = JSON.parse(readFileSync(path.join(dir, file), 'utf8'))
    for (const [locale, content] of Object.entries(data.responses)) {
      desired.push({ short_code: `${data.topic}-${locale}`, content })
    }
  }
  return desired
}

async function syncCanned(ctx) {
  const counts = emptyCounts()
  const desired = loadCannedDesired(ctx.configDir)
  const existing = unwrapList(await ctx.client.request('GET', '/canned_responses'), 'canned_responses')
  const plan = planCollection({
    desired,
    existing,
    keyOf: (c) => c.short_code,
    differs: (want, have) => want.content !== have.content,
  })
  for (const want of plan.create) {
    ctx.log(`  [create] canned ${want.short_code}`)
    await ctx.mutate('POST', '/canned_responses', want)
    counts.create++
  }
  for (const { desired: want, existing: have } of plan.update) {
    ctx.log(`  [update] canned ${want.short_code}`)
    await ctx.mutate('PATCH', `/canned_responses/${have.id}`, want)
    counts.update++
  }
  counts.unchanged = plan.unchanged.length
  return counts
}

// ---------------------------------------------------------------------------
// Resource: inboxes (Website widget + non-secret settings of owner-made inboxes)
// ---------------------------------------------------------------------------

/**
 * POST/PATCH an inbox. If the server rejects the request with a 4xx that names
 * one of the channel fields, drop only that field, warn, and retry - a version
 * that does not know a field must not fail the whole run.
 */
async function writeInbox(ctx, method, apiPath, body) {
  const channel = { ...body.channel }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await ctx.mutate(method, apiPath, { ...body, channel })
    } catch (err) {
      if (!(err instanceof ChatwootApiError) || err.status < 400 || err.status >= 500) throw err
      const culprit = Object.keys(channel).find((k) => k !== 'type' && String(err.body).includes(k))
      if (!culprit) throw err
      ctx.log(`  warning: unsupported field ${culprit}`)
      ctx.unsupportedFields.add(culprit)
      delete channel[culprit]
    }
  }
  throw new ChatwootConfigError('Too many unsupported inbox fields')
}

async function ensureOwnerInboxMember(ctx, inboxId, ownerId) {
  if (inboxId <= 0) return false
  const current = unwrapList(await ctx.client.request('GET', `/inbox_members/${inboxId}`), 'members')
  const ids = current.map((u) => u.id)
  if (ids.includes(ownerId)) return false
  await ctx.mutate('POST', '/inbox_members', { inbox_id: inboxId, user_ids: [...ids, ownerId] })
  return true
}

async function syncInboxes(ctx) {
  const counts = emptyCounts()
  const config = ctx.read('inboxes.json')
  const web = config.website
  const inboxes = unwrapList(await ctx.client.request('GET', '/inboxes'), 'inboxes')
  const ownerId = await ctx.ownerId()
  const { type: channelType, ...channelFields } = web.channel

  const drift = (have) => {
    const fields = []
    for (const [k, v] of Object.entries(web.settings)) if (!subsetEqual(v, have[k])) fields.push(k)
    for (const [k, v] of Object.entries(channelFields)) {
      if (ctx.unsupportedFields.has(k)) continue
      if (!subsetEqual(v, have[k])) fields.push(k)
    }
    return fields
  }

  let site = inboxes.find((i) => i.name === web.name)
  const avatarPath = path.join(ctx.repoRoot, web.avatar)

  if (!site) {
    ctx.log(`  [create] inbox ${web.name} (${channelType})`)
    const created = await writeInbox(ctx, 'POST', '/inboxes', {
      name: web.name,
      ...web.settings,
      channel: { type: channelType, ...channelFields },
    })
    site = created ?? { id: -1, name: web.name, avatar_url: '' }
    counts.create++
    if (!ctx.dryRun) {
      if (!site.avatar_url) await ctx.client.upload(`/inboxes/${site.id}`, 'avatar', avatarPath)
      await ensureOwnerInboxMember(ctx, site.id, ownerId)
      site = (await ctx.client.request('GET', `/inboxes/${site.id}`)) ?? site
    }
  } else {
    const fields = drift(site)
    let changed = false
    if (fields.length) {
      ctx.log(`  [update] inbox ${web.name}: ${fields.join(', ')}`)
      await writeInbox(ctx, 'PATCH', `/inboxes/${site.id}`, { ...web.settings, channel: channelFields })
      changed = true
    }
    if (!site.avatar_url) {
      ctx.log(`  [update] inbox ${web.name}: avatar`)
      if (!ctx.dryRun) await ctx.client.upload(`/inboxes/${site.id}`, 'avatar', avatarPath)
      changed = true
    }
    if (await ensureOwnerInboxMember(ctx, site.id, ownerId)) {
      ctx.log(`  [update] inbox ${web.name}: owner member`)
      changed = true
    }
    if (changed) {
      counts.update++
      if (!ctx.dryRun) site = (await ctx.client.request('GET', `/inboxes/${site.id}`)) ?? site
    } else counts.unchanged++
  }

  // Public widget identifier for the launcher config (never the HMAC secret).
  if (site.website_token) ctx.log(`website_token=${site.website_token}`)

  // Managed inboxes: the owner creates the channel (with credentials); sync only
  // patches the listed non-secret settings and never touches channel fields.
  const refs = buildInboxRefs(inboxes, config)
  for (const entry of config.managed ?? []) {
    const id = refs.get(entry.name)
    const have = id == null ? null : inboxes.find((i) => i.id === id)
    if (!have) {
      ctx.log(`  missing: ${entry.name}`)
      counts.skipped++
      continue
    }
    const fields = Object.keys(entry.settings).filter((k) => !subsetEqual(entry.settings[k], have[k]))
    if (fields.length) {
      ctx.log(`  [update] inbox ${entry.name}: ${fields.join(', ')}`)
      await ctx.mutate('PATCH', `/inboxes/${have.id}`, entry.settings)
      counts.update++
    } else counts.unchanged++
  }

  refs.set(web.name, site.id)
  ctx.refs.inboxes = refs
  return counts
}

// ---------------------------------------------------------------------------
// Resource: automation rules
// ---------------------------------------------------------------------------

async function listAllAutomationRules(ctx) {
  const seen = new Map()
  for (let page = 1; page <= 50; page++) {
    const rows = unwrapList(await ctx.client.request('GET', `/automation_rules?page=${page}`), 'automation_rules')
    const fresh = rows.filter((r) => !seen.has(r.id))
    if (!fresh.length) break
    for (const r of fresh) seen.set(r.id, r)
  }
  return [...seen.values()]
}

async function syncAutomation(ctx) {
  const counts = emptyCounts()
  const config = ctx.read('automation-rules.json')
  const refs = {
    ownerId: await ctx.ownerId(),
    teams: await ctx.teamMap(),
    inboxes: await ctx.inboxMap(),
  }
  const { rules, skipped, allNames } = expandAutomationRules(config, refs)
  const existing = await listAllAutomationRules(ctx)

  for (const s of skipped) {
    ctx.log(`  skipped: ${s.name} (${s.reason})`)
    counts.skipped++
  }

  const plan = planCollection({
    desired: rules,
    existing,
    keyOf: (r) => r.name,
    differs: (want, have) =>
      !subsetEqual(
        { event_name: want.event_name, active: want.active, conditions: want.conditions, actions: want.actions },
        have,
      ),
  })

  const body = ({ optional: _optional, ...rest }) => rest

  for (const want of plan.create) {
    try {
      await ctx.mutate('POST', '/automation_rules', body(want))
      ctx.log(`  [create] rule ${want.name}`)
      counts.create++
    } catch (err) {
      if (want.optional && err instanceof ChatwootApiError && err.status >= 400 && err.status < 500) {
        ctx.log(`  skipped: ${want.name} (unsupported on this version)`)
        counts.skipped++
      } else throw err
    }
  }
  for (const { desired: want, existing: have } of plan.update) {
    ctx.log(`  [update] rule ${want.name}`)
    await ctx.mutate('PATCH', `/automation_rules/${have.id}`, body(want))
    counts.update++
  }
  counts.unchanged = plan.unchanged.length

  // Only generated "topic:" rules may ever be removed, and only when the
  // config no longer produces them. Operator-made rules are never touched.
  const wanted = new Set(allNames)
  for (const have of existing) {
    if (!String(have.name).startsWith(GENERATED_RULE_PREFIX) || wanted.has(have.name)) continue
    ctx.log(`  [delete] rule ${have.name}`)
    await ctx.mutate('DELETE', `/automation_rules/${have.id}`)
    counts.deleted++
  }
  return counts
}

const HANDLERS = {
  account: syncAccount,
  labels: syncLabels,
  teams: syncTeams,
  attributes: syncAttributes,
  canned: syncCanned,
  inboxes: syncInboxes,
  automation: syncAutomation,
}

// ---------------------------------------------------------------------------
// runSync
// ---------------------------------------------------------------------------

/**
 * @param {{ client?: any, only?: string[], dryRun?: boolean, log?: (line: string) => void, configDir?: string, repoRoot?: string }} [options]
 */
export async function runSync({
  client,
  only,
  dryRun = false,
  log = console.log,
  configDir = HERE,
  repoRoot = REPO_ROOT,
} = {}) {
  const selected = only && only.length ? only : RESOURCE_ORDER
  const unknown = selected.filter((r) => !RESOURCE_ORDER.includes(r))
  if (unknown.length) throw new ChatwootConfigError(`Unknown resource for --only: ${unknown.join(', ')}`)

  const ctx = makeContext({ client, dryRun, log, configDir, repoRoot })
  const totals = { create: 0, update: 0, skipped: 0 }
  const results = {}

  for (const resource of RESOURCE_ORDER) {
    if (!selected.includes(resource)) continue
    const handler = HANDLERS[resource]
    if (!handler) {
      throw new ChatwootConfigError(`Resource "${resource}" is not implemented yet`)
    }
    const counts = await handler(ctx)
    results[resource] = counts
    log(`${resource}: ${formatCounts(counts)}`)
    totals.create += counts.create
    totals.update += counts.update
    totals.skipped += counts.skipped
  }

  log(`summary: create=${totals.create} update=${totals.update} skipped=${totals.skipped}`)
  return { results, totals, dryRun }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const opts = { dryRun: false, only: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--only') {
      const value = argv[++i]
      if (!value) throw new ChatwootConfigError('--only needs a comma-separated list')
      opts.only = value.split(',').map((s) => s.trim()).filter(Boolean)
    } else if (arg.startsWith('--only=')) {
      opts.only = arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean)
    } else throw new ChatwootConfigError(`Unknown argument: ${arg}`)
  }
  return opts
}

async function main(argv) {
  try {
    const opts = parseArgs(argv)
    const client = createChatwootClient(loadChatwootConfig())
    await runSync({ client, only: opts.only, dryRun: opts.dryRun })
  } catch (err) {
    if (err instanceof ChatwootApiError) {
      console.error(`API error: ${err.message}`)
      process.exit(2)
    }
    if (err instanceof ChatwootConfigError) {
      console.error(`Config error: ${err.message}`)
      process.exit(1)
    }
    console.error(`Sync failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(2)
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main(process.argv.slice(2))
}
