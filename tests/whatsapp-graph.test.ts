// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake Graph payloads are intentionally loose */
/**
 * Phase 78, Plan 03 — WhatsApp templates-as-code, proven against an in-memory
 * fake Graph API. No test here makes a network call or uses a real token.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGraphClient, loadMetaConfig, MetaConfigError } from '../infra/chatwoot/lib/graph.mjs'
import {
  buildCreateBody,
  parseArgs,
  runTemplates,
  SITE_LOCALES,
} from '../infra/chatwoot/whatsapp-templates.mjs'

const TOKEN = 'test-graph-token'
const WABA = '111222333'
const GRAPH = 'https://graph.facebook.com'
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(REPO_ROOT, 'infra/chatwoot/whatsapp-templates.mjs')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LANG: Record<string, string> = { en: 'en', ru: 'ru', es: 'es', fr: 'fr', ar: 'ar', hi: 'hi', zh: 'zh_CN' }

function makeTemplate(key = 'fixture-change', over: Record<string, any> = {}) {
  const locales: Record<string, any> = {}
  for (const code of SITE_LOCALES as string[]) {
    locales[code] = {
      language: LANG[code],
      body: `Hello {{first_name}}, your booking {{booking_ref}} is updated (${code}). See you soon.`,
      buttons: { ok: `OK ${code}`, question: `Question ${code}` },
    }
  }
  return {
    key,
    name: `prestigo_${key.replace(/-/g, '_')}`,
    category: 'UTILITY',
    parameterFormat: 'NAMED',
    sourceCanned: null,
    variables: [
      { name: 'first_name', example: 'Anna' },
      { name: 'booking_ref', example: 'PRG-EXAMPLE' },
    ],
    buttons: [
      { type: 'QUICK_REPLY', textKey: 'ok' },
      { type: 'QUICK_REPLY', textKey: 'question' },
    ],
    header: null,
    locales,
    ...over,
  } as any
}

const dirs: string[] = []
function writeDir(templates: any[]) {
  const dir = mkdtempSync(join(os.tmpdir(), 'wa-templates-'))
  dirs.push(dir)
  for (const t of templates) writeFileSync(join(dir, `${t.key}.json`), JSON.stringify(t))
  return dir
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

type Req = { method: string; url: string; path: string; body: any; init: any }

interface FakeOptions {
  remote?: any[]
  pageSize?: number
  /** POST create answers with this error for the given (1-based) call number. */
  failCreate?: Record<number, { status: number; error: any }>
  /** Echo this string inside every error body. */
  echo?: string
}

/** In-memory Graph API: message_templates list (cursor paging) and create/edit. */
function createFakeGraph(options: FakeOptions = {}) {
  const store: any[] = [...(options.remote ?? [])]
  const requests: Req[] = []
  let nextId = 9000
  let creates = 0
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

  const fetchImpl = async (url: string, init: any = {}) => {
    const method = (init.method ?? 'GET') as string
    const parsed = new URL(url)
    const p = parsed.pathname.replace(/^\/v\d+\.\d+/, '')
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body
    requests.push({ method, url, path: p + parsed.search, body, init })
    if (parsed.origin !== GRAPH) return json({ error: { message: 'unexpected origin' } }, 500)

    if (method === 'GET' && p === `/${WABA}/message_templates`) {
      const size = options.pageSize ?? 100
      const start = Number(parsed.searchParams.get('after') ?? 0)
      const slice = store.slice(start, start + size)
      const end = start + size
      const more = end < store.length
      return json({
        data: slice,
        paging: {
          cursors: { before: 'b', after: String(end) },
          ...(more ? { next: `https://evil.example/next?after=${end}` } : {}),
        },
      })
    }
    if (method === 'POST' && p === `/${WABA}/message_templates`) {
      creates++
      const failure = options.failCreate?.[creates]
      if (failure) {
        const err = options.echo
          ? { ...failure.error, message: `${failure.error.message} ${options.echo}`, access_token: options.echo }
          : failure.error
        return json({ error: err }, failure.status)
      }
      const rec = { id: String(nextId++), name: body.name, language: body.language, status: 'PENDING', category: body.category, components: body.components }
      store.push(rec)
      return json({ id: rec.id, status: 'PENDING', category: rec.category })
    }
    const edit = p.match(/^\/(\d+)$/)
    if (method === 'POST' && edit) {
      const rec = store.find((r) => r.id === edit[1])
      if (!rec) return json({ error: { message: 'not found' } }, 404)
      rec.components = body.components
      return json({ success: true })
    }
    return json({ error: { message: `unhandled ${method} ${p}` } }, 405)
  }
  return { fetchImpl, requests, store }
}

function harness(fake: ReturnType<typeof createFakeGraph>, dir: string) {
  const outLines: string[] = []
  const errLines: string[] = []
  const sleeps: number[] = []
  const client = createGraphClient({ token: TOKEN, fetchImpl: fake.fetchImpl as any })
  const run = (argv: string[] = []) =>
    runTemplates(parseArgs(argv), {
      client,
      wabaId: WABA,
      templatesDir: dir,
      out: (l: string) => outLines.push(l),
      err: (l: string) => errLines.push(l),
      sleep: async (ms: number) => {
        sleeps.push(ms)
      },
    })
  return { run, outLines, errLines, sleeps, text: () => outLines.join('\n') }
}

const remoteOf = (t: any, status = 'APPROVED', over: Record<string, any> = {}) =>
  (SITE_LOCALES as string[]).map((code, i) => ({
    id: String(100 + i),
    name: t.name,
    language: LANG[code],
    status,
    category: t.category,
    components: buildCreateBody(t, code).components,
    ...over,
  }))

// ---------------------------------------------------------------------------
// Task 1 — tracer: fixture -> validate -> create for 7 languages -> rerun no-op
// ---------------------------------------------------------------------------

describe('loadMetaConfig', () => {
  it('reads env first, then the file, and never names a value when keys are missing', () => {
    const cfg = loadMetaConfig({
      env: { META_WA_SYSTEM_USER_TOKEN: TOKEN },
      readFile: () => 'META_WA_WABA_ID=555\nMETA_WA_SYSTEM_USER_TOKEN=file-token\n',
    })
    expect(cfg).toEqual({ token: TOKEN, wabaId: '555', graphVersion: 'v25.0' })

    let message = ''
    try {
      loadMetaConfig({ env: {}, readFile: () => null })
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('META_WA_SYSTEM_USER_TOKEN')
    expect(message).toContain('META_WA_WABA_ID')
    expect(message).not.toContain(TOKEN)
  })

  it('rejects a malformed META_WA_GRAPH_VERSION', () => {
    expect(() =>
      loadMetaConfig({ env: { META_WA_SYSTEM_USER_TOKEN: TOKEN, META_WA_WABA_ID: '1', META_WA_GRAPH_VERSION: 'latest' }, readFile: () => null }),
    ).toThrow(MetaConfigError)
  })
})

describe('templates create path (tracer)', () => {
  it('first run: 1 GET then 7 POST creates, zh as zh_CN, named params in declared order', async () => {
    const dir = writeDir([makeTemplate()])
    const fake = createFakeGraph()
    const h = harness(fake, dir)
    const res = await h.run()

    expect(res.exitCode).toBe(0)
    expect(fake.requests.filter((r) => r.method === 'GET')).toHaveLength(1)
    const posts = fake.requests.filter((r) => r.method === 'POST')
    expect(posts).toHaveLength(7)
    const zh = posts.find((r) => r.body.language === 'zh_CN')
    expect(zh).toBeTruthy()
    expect(posts.map((r) => r.body.language).sort()).toEqual(['ar', 'en', 'es', 'fr', 'hi', 'ru', 'zh_CN'])
    for (const r of posts) {
      expect(r.path).toBe(`/${WABA}/message_templates`)
      expect(r.body.parameter_format).toBe('NAMED')
      expect(r.body.category).toBe('UTILITY')
      const body = r.body.components.find((c: any) => c.type === 'BODY')
      expect(body.example.body_text_named_params).toEqual([
        { param_name: 'first_name', example: 'Anna' },
        { param_name: 'booking_ref', example: 'PRG-EXAMPLE' },
      ])
      const buttons = r.body.components.find((c: any) => c.type === 'BUTTONS')
      expect(buttons.buttons.map((b: any) => b.type)).toEqual(['QUICK_REPLY', 'QUICK_REPLY'])
    }
    expect(h.outLines[h.outLines.length - 1]).toBe('summary: create=7 unchanged=0 resubmit=0 drift=0 edit=0 exists=0')
  })

  it('second run against the populated fake: create=0 unchanged=7 and no POST', async () => {
    const dir = writeDir([makeTemplate()])
    const fake = createFakeGraph()
    await harness(fake, dir).run()
    fake.requests.length = 0
    const h = harness(fake, dir)
    const res = await h.run()
    expect(res.exitCode).toBe(0)
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
    expect(h.outLines[h.outLines.length - 1]).toBe('summary: create=0 unchanged=7 resubmit=0 drift=0 edit=0 exists=0')
  })

  it('--validate prints validated=7, needs no client and no token', async () => {
    const dir = writeDir([makeTemplate()])
    const outLines: string[] = []
    const res = await runTemplates(parseArgs(['--validate']), { templatesDir: dir, out: (l: string) => outLines.push(l) })
    expect(res.exitCode).toBe(0)
    expect(outLines).toContain('validated=7')
    expect(outLines.some((l) => /^valid prestigo_fixture_change zh_CN body_chars=\d+$/.test(l))).toBe(true)
  })

  it('--validate works from the CLI with an empty environment and no token file', () => {
    const dir = writeDir([makeTemplate()])
    const home = mkdtempSync(join(os.tmpdir(), 'wa-home-'))
    dirs.push(home)
    const r = spawnSync(process.execPath, [SCRIPT, '--validate', '--dir', dir], { env: { PATH: process.env.PATH ?? '', HOME: home }, encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('validated=7')
  })

  it('an empty templates directory exits 1 from the CLI with "no templates found"', () => {
    const dir = writeDir([])
    const r = spawnSync(process.execPath, [SCRIPT, '--validate', '--dir', dir], { env: { PATH: process.env.PATH ?? '' }, encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('no templates found')
  })

  it('every request carries a Bearer header, redirect: error and a signal; no URL contains the token', async () => {
    const dir = writeDir([makeTemplate()])
    const fake = createFakeGraph()
    await harness(fake, dir).run()
    expect(fake.requests.length).toBeGreaterThan(0)
    for (const r of fake.requests) {
      expect(r.init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
      expect(r.init.redirect).toBe('error')
      expect(r.init.signal).toBeInstanceOf(AbortSignal)
      expect(r.url).not.toContain(TOKEN)
      expect(r.url.startsWith(`${GRAPH}/v25.0/`)).toBe(true)
    }
  })
})
