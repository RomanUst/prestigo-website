/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 80 — in-memory fake EspoCRM shared by every espocrm test.
 *
 * Injected as `fetchImpl` into createEspoClient. No test using it makes a
 * network call or reads a real credential. Later plans may extend it only when
 * they are in a different wave from every other plan that extends it; a test
 * file that needs one more endpoint should use the `extraRoutes` hook instead.
 */

export interface FakeReq {
  method: string
  /** Path relative to /api/v1, no query string (e.g. `/Settings`). */
  path: string
  /** Raw query string without the leading `?`. */
  query: string
  body: any
  /** Lower-cased header names. */
  headers: Record<string, string>
}

export interface FakeEspoOptions {
  adminUser?: string
  adminPassword?: string
  /** API key -> user name. */
  apiKeys?: Record<string, string>
  settings?: Record<string, any>
  /** Nested metadata object walked by GET /Metadata/action/get?key=a.b.c. */
  metadata?: Record<string, any>
  /** entityType -> records. */
  records?: Record<string, any[]>
  /** `Scope/layoutName` -> layout JSON served by GET/PUT /{scope}/layout/{name}. */
  layouts?: Record<string, any>
  /** entityType -> attribute; POST with an existing value of it returns 409. */
  duplicateCheck?: Record<string, string>
  /** Request paths (exact, relative to /api/v1) that never answer. */
  stallPaths?: string[]
  /** Return a Response to handle a request before the built-in routes. */
  extraRoutes?: (req: FakeReq, state: FakeEspoState) => Response | undefined | Promise<Response | undefined>
}

export interface FakeEspoState {
  settings: Record<string, any>
  metadata: Record<string, any>
  records: Record<string, any[]>
  /** `Scope/layoutName` -> layout JSON. */
  layouts: Record<string, any>
  /** `Scope.field` -> labels written through FieldManager (label, translatedOptions, tooltipText). */
  i18n: Record<string, any>
  /** token -> user name. */
  tokens: Map<string, string>
  /** Number of password exchanges answered with a token. */
  logins: number
}

const ADMIN_ONLY = /^\/(?:Admin|EntityManager|Metadata|Role|User|Layout)(?:\/|$)/
const SCOPE_LAYOUT = /^\/[A-Za-z][A-Za-z0-9]*\/layout\//i
const ENTITY = /^\/([A-Za-z][A-Za-z0-9]*)(?:\/([0-9a-f]{17}))?$/

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const empty = (status: number) => new Response('', { status })

const ucFirst = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/** Params FieldManager accepts for every field type (FieldManager::prepareFieldDefs, 10.0.8). */
const UNIVERSAL_FIELD_PARAMS = ['type', 'isCustom', 'isPersonalData', 'tooltip', 'inlineEditDisabled', 'defaultAttributes']
/** Keys FieldManager::write routes to i18n / logic files instead of entityDefs. */
const NON_ENTITYDEFS_PARAMS = ['label', 'translatedOptions', 'tooltipText', 'name']

const paramNames = (list: any): string[] =>
  (Array.isArray(list) ? list : []).map((p: any) => (typeof p === 'string' ? p : p?.name)).filter(Boolean)

/**
 * Field-type metadata as served by the live 10.0.8 instance (`fields.{type}.params`,
 * read-only probe, plan 80-04). Tests that exercise FieldManager seed it with
 * `metadata: stockEspoMetadata()`.
 */
export function stockEspoMetadata(): Record<string, any> {
  const p = (...names: string[]) => names.map((name) => ({ name }))
  return {
    scopes: {
      Account: { entity: true, customizable: true },
      Contact: { entity: true, customizable: true },
      Opportunity: { entity: true, customizable: true, kanbanStatusIgnoreList: ['Closed Lost'] },
    },
    clientDefs: { Opportunity: { kanbanViewMode: true } },
    // Stock enum fields as served by the live 10.0.8 instance (read-only probe, plan 80-05).
    entityDefs: {
      Account: {
        fields: {
          type: { type: 'enum', options: ['', 'Customer', 'Investor', 'Partner', 'Reseller'], audited: true },
        },
        links: {},
      },
      Contact: { fields: {}, links: {} },
      Opportunity: {
        fields: {
          stage: {
            type: 'enum',
            options: ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'],
            default: 'Prospecting',
            audited: true,
            probabilityMap: { Prospecting: 10, Qualification: 20, Proposal: 50, Negotiation: 80, 'Closed Won': 100, 'Closed Lost': 0 },
            style: { Proposal: 'primary', Negotiation: 'warning', 'Closed Won': 'success', 'Closed Lost': 'info' },
            fieldManagerAdditionalParamList: [{ name: 'probabilityMap' }],
          },
          lastStage: { type: 'enum', customizationOptionsDisabled: true },
        },
        links: {},
      },
    },
    fields: {
      varchar: {
        params: p('required', 'default', 'maxLength', 'options', 'pattern', 'copyToClipboard', 'audited', 'readOnly', 'readOnlyAfterCreate', 'noSpellCheck', 'optionsPath'),
      },
      enum: {
        translatedOptions: true,
        params: p('required', 'options', 'default', 'optionsReference', 'isSorted', 'translation', 'optionsPath', 'style', 'displayAsLabel', 'labelType', 'audited', 'readOnly', 'readOnlyAfterCreate'),
      },
      currency: {
        params: p('required', 'default', 'min', 'max', 'onlyDefaultCurrency', 'conversionDisabled', 'decimal', 'audited', 'readOnly', 'readOnlyAfterCreate', 'precision', 'scale'),
      },
      datetime: {
        params: p('required', 'default', 'after', 'before', 'afterOrEqual', 'useNumericFormat', 'hasSeconds', 'minuteStep', 'audited', 'readOnly', 'readOnlyAfterCreate'),
      },
      url: {
        params: p('required', 'default', 'maxLength', 'strip', 'protocolRequired', 'copyToClipboard', 'audited', 'readOnly', 'readOnlyAfterCreate'),
      },
    },
  }
}

/** Parse `where[0][type]=equals&where[0][attribute]=x&where[0][value][0]=a` into a list. */
function parseWhere(params: URLSearchParams): any[] {
  const rows: any[] = []
  for (const [key, value] of params.entries()) {
    const m = key.match(/^where\[(\d+)\]\[(type|attribute|value)\](?:\[(\d+)\])?$/)
    if (!m) continue
    const row = (rows[Number(m[1])] ??= {})
    if (m[2] === 'value' && m[3] !== undefined) (row.value ??= [])[Number(m[3])] = value
    else row[m[2]] = value
  }
  return rows.filter(Boolean)
}

function matchesWhere(record: any, row: any): boolean {
  const have = record[row.attribute]
  switch (row.type) {
    case 'equals':
      return have === row.value
    case 'isNull':
      return have == null
    case 'isEmpty':
      return have == null || have === ''
    case 'isNotEmpty':
      return !(have == null || have === '')
    case 'in':
      return Array.isArray(row.value) && row.value.includes(have)
    default:
      return false
  }
}

export function createFakeEspoCRM(options: FakeEspoOptions = {}) {
  const adminUser = options.adminUser ?? 'prestigo-config'
  const adminPassword = options.adminPassword ?? 'pw_SECRET_0123456789'
  const apiKeys = options.apiKeys ?? { key_SECRET_abcdef0123: 'prestigo-sync' }

  const state: FakeEspoState = {
    settings: { ...(options.settings ?? {}) },
    metadata: options.metadata ?? {},
    records: Object.fromEntries(Object.entries(options.records ?? {}).map(([k, v]) => [k, [...v]])),
    layouts: { ...(options.layouts ?? {}) },
    i18n: {},
    tokens: new Map(),
    logins: 0,
  }
  const requests: FakeReq[] = []
  let inFlight = 0
  let maxSeen = 0
  let idCounter = 0x1000
  let tokenCounter = 0

  const nextId = () => `f${(idCounter++).toString(16).padStart(16, '0')}`

  const decodeBasic = (value: string): [string, string] => {
    const text = Buffer.from(value, 'base64').toString('utf8')
    const i = text.indexOf(':')
    return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + 1)]
  }

  /** Resolves the caller or an error Response. */
  function authenticate(req: FakeReq): { caller: { name: string; api: boolean } } | { response: Response } {
    const apiKey = req.headers['x-api-key']
    if (apiKey) {
      const name = apiKeys[apiKey]
      return name ? { caller: { name, api: true } } : { response: empty(401) }
    }
    const basic = req.headers['espo-authorization']
    if (!basic) return { response: empty(401) }
    const [user, secret] = decodeBasic(basic)
    const byToken = req.headers['espo-authorization-by-token'] === 'true'
    if (!byToken) {
      if (req.path === '/App/user' && user === adminUser && secret === adminPassword) {
        const token = `tok_SECRET_${String(++tokenCounter).padStart(8, '0')}`
        state.tokens.set(token, user)
        state.logins++
        return { caller: { name: user, api: false } }
      }
      return { response: empty(401) }
    }
    const owner = state.tokens.get(secret)
    return owner && owner === user ? { caller: { name: user, api: false } } : { response: empty(401) }
  }

  async function handle(req: FakeReq): Promise<Response> {
    const auth = authenticate(req)
    if ('response' in auth) return auth.response
    const { caller } = auth

    // Password exchange: answered only for the basic (non-token) call.
    if (req.method === 'GET' && req.path === '/App/user' && req.headers['espo-authorization-by-token'] !== 'true') {
      const token = [...state.tokens.keys()].at(-1)
      return json({ token, user: { userName: caller.name, type: 'admin' } })
    }

    const adminOnly =
      ADMIN_ONLY.test(req.path) || SCOPE_LAYOUT.test(req.path) || (req.method === 'PUT' && req.path === '/Settings')
    if (adminOnly && caller.api) return empty(403)

    if (options.extraRoutes) {
      const extra = await options.extraRoutes(req, state)
      if (extra) return extra
    }

    if (req.path === '/Settings') {
      if (req.method === 'GET') return json(state.settings)
      if (req.method === 'PUT') {
        Object.assign(state.settings, req.body ?? {})
        return json(state.settings)
      }
    }

    if (req.method === 'GET' && req.path === '/Metadata/action/get') {
      const key = new URLSearchParams(req.query).get('key') ?? ''
      let node: any = state.metadata
      for (const part of key.split('.').filter(Boolean)) {
        if (node == null || typeof node !== 'object' || !(part in node)) {
          node = null
          break
        }
        node = node[part]
      }
      return json(node ?? null)
    }

    // ---- EntityManager / FieldManager / Layout (admin only, enforced above) ----
    const md = state.metadata
    const mdAt = (...keys: string[]) => {
      let node: any = md
      for (const k of keys) {
        node = node?.[k]
        if (node == null) return undefined
      }
      return node
    }
    const ensure = (...keys: string[]) => {
      let node: any = md
      for (const k of keys) node = node[k] ??= {}
      return node
    }
    const isCustomScope = (scope: string) => Boolean(mdAt('scopes', scope)?.isCustom)

    if (req.method === 'POST' && req.path === '/EntityManager/action/createEntity') {
      const raw = String(req.body?.name ?? '')
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(raw)) return empty(400)
      const name = `C${ucFirst(raw)}`
      if (mdAt('scopes', name)) return empty(409)
      ensure('scopes')[name] = { entity: true, customizable: true, isCustom: true, type: req.body?.type ?? 'Base', stream: Boolean(req.body?.stream), tab: true }
      ensure('entityDefs')[name] = { fields: { name: { type: 'varchar', required: true } }, links: {} }
      state.i18n[`${name}.scope`] = { labelSingular: req.body?.labelSingular, labelPlural: req.body?.labelPlural }
      return json({ name })
    }

    if (req.method === 'POST' && req.path === '/EntityManager/action/createLink') {
      const { linkType, entity, link, entityForeign, linkForeign } = req.body ?? {}
      if (linkType !== 'manyToOne' || !mdAt('scopes', entity) || !mdAt('scopes', entityForeign)) return empty(400)
      const own = ensure('entityDefs', entity)
      own.fields ??= {}
      own.links ??= {}
      if (own.links[link]) return empty(409)
      // The stock-scope side of a custom link gets a `c` prefix (NameUtil::addCustomPrefix).
      const foreignName = isCustomScope(entityForeign) ? linkForeign : `c${ucFirst(linkForeign)}`
      own.links[link] = { type: 'belongsTo', entity: entityForeign, foreign: foreignName }
      own.fields[link] = { type: 'link' }
      const other = ensure('entityDefs', entityForeign)
      other.fields ??= {}
      other.links ??= {}
      other.links[foreignName] = { type: 'hasMany', entity, foreign: link }
      return json(true)
    }

    const fieldCreate = req.path.match(/^\/Admin\/fieldManager\/([A-Za-z0-9]+)$/)
    const fieldUpdate = req.path.match(/^\/Admin\/fieldManager\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)$/)
    if ((req.method === 'POST' && fieldCreate) || (req.method === 'PUT' && fieldUpdate)) {
      const scope = (fieldCreate ?? fieldUpdate)![1]
      if (!mdAt('scopes', scope)) return empty(404)
      const body = { ...(req.body ?? {}) }
      let name: string
      let existing: any
      if (fieldCreate) {
        const raw = String(body.name ?? '')
        if (!/^[a-z][A-Za-z0-9]*$/.test(raw)) return empty(400)
        name = isCustomScope(scope) ? raw : `c${ucFirst(raw)}`
        if (mdAt('entityDefs', scope, 'fields', name) || mdAt('entityDefs', scope, 'links', name)) return empty(409)
        existing = {}
      } else {
        name = fieldUpdate![2]
        existing = mdAt('entityDefs', scope, 'fields', name)
        if (!existing) return empty(404)
        delete body.type // FieldManager::update ignores a type change
      }
      const type = body.type ?? existing.type
      if (!type || !mdAt('fields', type)) return empty(400)
      // Only params permitted for the type persist (FieldManager::prepareFieldDefs).
      const permitted = new Set([
        ...UNIVERSAL_FIELD_PARAMS,
        ...paramNames(mdAt('fields', type)?.params),
        ...paramNames(body.fieldManagerAdditionalParamList),
      ])
      const stored: any = { ...existing, type, isCustom: true }
      for (const [k, v] of Object.entries(body)) {
        if (NON_ENTITYDEFS_PARAMS.includes(k) || k === 'fieldManagerAdditionalParamList') continue
        if (permitted.has(k)) stored[k] = v
      }
      ensure('entityDefs', scope).fields ??= {}
      md.entityDefs[scope].fields[name] = stored
      const labels: any = (state.i18n[`${scope}.${name}`] ??= {})
      if (body.label !== undefined) labels.label = body.label
      if (body.tooltipText !== undefined) labels.tooltipText = body.tooltipText
      if (body.translatedOptions !== undefined && mdAt('fields', type)?.translatedOptions) {
        labels.translatedOptions = body.translatedOptions
      }
      return json(fieldCreate ? { ...stored, name } : stored)
    }

    // GET /I18n: stock labels are the identity for every enum option; labels written
    // through FieldManager (state.i18n `Scope.field`.translatedOptions) override them.
    if (req.method === 'GET' && req.path === '/I18n') {
      const out: any = {}
      for (const [scope, defs] of Object.entries<any>(md.entityDefs ?? {})) {
        for (const [field, def] of Object.entries<any>(defs?.fields ?? {})) {
          if (!Array.isArray(def?.options)) continue
          const labels: Record<string, string> = {}
          for (const v of def.options) if (v !== '') labels[v] = v
          Object.assign(labels, state.i18n[`${scope}.${field}`]?.translatedOptions ?? {})
          ;((out[scope] ??= {}).options ??= {})[field] = labels
        }
      }
      return json(out)
    }

    const layoutMatch = req.path.match(/^\/([A-Za-z][A-Za-z0-9]*)\/layout\/([A-Za-z0-9]+)$/)
    if (layoutMatch) {
      const key = `${layoutMatch[1]}/${layoutMatch[2]}`
      if (req.method === 'GET') return json(state.layouts[key] ?? null)
      if (req.method === 'PUT') {
        state.layouts[key] = req.body
        return json(req.body)
      }
    }

    const m = req.path.match(ENTITY)
    if (!m) return empty(404)
    const [, entity, id] = m
    const list = (state.records[entity] ??= [])

    if (!id) {
      if (req.method === 'GET') {
        const params = new URLSearchParams(req.query)
        const where = parseWhere(params)
        let rows = list.filter((r) => where.every((w) => matchesWhere(r, w)))
        const orderBy = params.get('orderBy')
        if (orderBy) {
          const dir = params.get('order') === 'desc' ? -1 : 1
          rows = [...rows].sort((a, b) => (a[orderBy] > b[orderBy] ? dir : a[orderBy] < b[orderBy] ? -dir : 0))
        }
        const total = rows.length
        const offset = Number(params.get('offset') ?? 0)
        const maxSize = Math.min(Number(params.get('maxSize') ?? 20), 200)
        const select = params.get('select')?.split(',').filter(Boolean)
        const page = rows.slice(offset, offset + maxSize).map((r) => {
          if (!select) return { ...r }
          const out: any = { id: r.id }
          for (const k of select) out[k] = r[k]
          return out
        })
        return json({ total, list: page })
      }
      if (req.method === 'POST') {
        const attr = options.duplicateCheck?.[entity]
        if (attr && req.body?.[attr] != null && list.some((r) => r[attr] === req.body[attr])) return empty(409)
        const record = { ...(req.body ?? {}), id: nextId() }
        list.push(record)
        return json(record)
      }
      return empty(405)
    }

    const index = list.findIndex((r) => r.id === id)
    if (index < 0) return empty(404)
    if (req.method === 'GET') return json(list[index])
    if (req.method === 'PUT') {
      list[index] = { ...list[index], ...(req.body ?? {}), id }
      return json(list[index])
    }
    if (req.method === 'DELETE') {
      list.splice(index, 1)
      return json(true)
    }
    return empty(405)
  }

  const fetchImpl = async (url: string | URL, init: any = {}): Promise<Response> => {
    const parsed = new URL(String(url))
    const apiPath = parsed.pathname.replace(/^\/api\/v1/, '') || '/'
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = String(v)
    const req: FakeReq = {
      method: String(init.method ?? 'GET').toUpperCase(),
      path: apiPath,
      query: parsed.search.replace(/^\?/, ''),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers,
    }
    requests.push(req)

    inFlight++
    maxSeen = Math.max(maxSeen, inFlight)
    try {
      if (options.stallPaths?.includes(apiPath)) {
        return await new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal.reason))
        })
      }
      // A real network hop: lets overlapping requests be observed.
      await new Promise((r) => setTimeout(r, 2))
      return await handle(req)
    } finally {
      inFlight--
    }
  }

  return { fetchImpl, state, requests, maxInFlight: () => maxSeen }
}
