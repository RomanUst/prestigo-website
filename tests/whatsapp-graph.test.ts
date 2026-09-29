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
  loadTemplates,
  parseArgs,
  runTemplates,
  SITE_LOCALES,
  validateTemplate,
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
/** Minimal environment for CLI runs: no META_* variables, HOME optionally redirected. */
const cleanEnv = (home?: string) => ({ PATH: process.env.PATH ?? '', ...(home ? { HOME: home } : {}) }) as unknown as NodeJS.ProcessEnv
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
    const r = spawnSync(process.execPath, [SCRIPT, '--validate', '--dir', dir], { env: cleanEnv(home), encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('validated=7')
  })

  it('an empty templates directory exits 1 from the CLI with "no templates found"', () => {
    const dir = writeDir([])
    const r = spawnSync(process.execPath, [SCRIPT, '--validate', '--dir', dir], { env: cleanEnv(), encoding: 'utf8' })
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

// ---------------------------------------------------------------------------
// Task 2 — drift / resubmit / status / paging / rate-limit / redaction matrix
// ---------------------------------------------------------------------------

describe('drift, resubmit and edit', () => {
  const changed = (t: any) => {
    const c = JSON.parse(JSON.stringify(t))
    for (const code of SITE_LOCALES as string[]) c.locales[code].body = `${c.locales[code].body} Changed copy.`
    return c
  }

  it('APPROVED remote with a changed body: drift body, exit 1, no POST', async () => {
    const remote = makeTemplate()
    const dir = writeDir([changed(remote)])
    const fake = createFakeGraph({ remote: remoteOf(remote) })
    const h = harness(fake, dir)
    const res = await h.run()
    expect(res.exitCode).toBe(1)
    expect(h.text()).toMatch(/prestigo_fixture_change en drift body/)
    expect(h.outLines[h.outLines.length - 1]).toBe('summary: create=0 unchanged=0 resubmit=0 drift=7 edit=0 exists=0')
    expect(fake.requests.some((r) => r.method === 'POST')).toBe(false)
  })

  it('--allow-edit turns APPROVED drift into an edit: one POST /{id} per pair, components only', async () => {
    const remote = makeTemplate()
    const dir = writeDir([changed(remote)])
    const fake = createFakeGraph({ remote: remoteOf(remote) })
    const h = harness(fake, dir)
    const res = await h.run(['--allow-edit'])
    expect(res.exitCode).toBe(0)
    const posts = fake.requests.filter((r) => r.method === 'POST')
    expect(posts).toHaveLength(7)
    for (const r of posts) {
      expect(r.path).toMatch(/^\/1\d\d$/)
      expect(Object.keys(r.body)).toEqual(['components'])
    }
    expect(h.text()).toMatch(/prestigo_fixture_change en edit/)
    expect(h.outLines[h.outLines.length - 1]).toContain('edit=7')
  })

  it('PAUSED drift is also drift without --allow-edit', async () => {
    const remote = makeTemplate()
    const dir = writeDir([changed(remote)])
    const fake = createFakeGraph({ remote: remoteOf(remote, 'PAUSED') })
    const res = await harness(fake, dir).run()
    expect(res.exitCode).toBe(1)
    expect(fake.requests.some((r) => r.method === 'POST')).toBe(false)
  })

  it('REJECTED remote with a changed body is re-submitted without --allow-edit', async () => {
    const remote = makeTemplate()
    const dir = writeDir([changed(remote)])
    const fake = createFakeGraph({ remote: remoteOf(remote, 'REJECTED') })
    const h = harness(fake, dir)
    const res = await h.run()
    expect(res.exitCode).toBe(0)
    expect(fake.requests.filter((r) => r.method === 'POST')).toHaveLength(7)
    expect(h.text()).toMatch(/prestigo_fixture_change en resubmit/)
  })

  it('REJECTED with identical copy is unchanged; --status shows its rejected_reason', async () => {
    const remote = makeTemplate()
    const dir = writeDir([remote])
    const fake = createFakeGraph({ remote: remoteOf(remote, 'REJECTED', { rejected_reason: 'INVALID_FORMAT' }) })
    const h = harness(fake, dir)
    expect((await h.run()).exitCode).toBe(0)
    expect(h.outLines[h.outLines.length - 1]).toContain('unchanged=7')
    expect(fake.requests.some((r) => r.method === 'POST')).toBe(false)

    const s = harness(fake, dir)
    await s.run(['--status'])
    expect(s.text()).toContain('rejected_reason prestigo_fixture_change en INVALID_FORMAT')
    expect(s.text()).toContain('status_summary approved=0 pending=0 rejected=7 paused=0 other=0')
  })

  it('a category changed by Meta is not drift', async () => {
    const t = makeTemplate()
    const dir = writeDir([t])
    const fake = createFakeGraph({ remote: remoteOf(t, 'APPROVED', { category: 'MARKETING' }) })
    const h = harness(fake, dir)
    expect((await h.run()).exitCode).toBe(0)
    expect(h.outLines[h.outLines.length - 1]).toContain('unchanged=7')
    const s = harness(fake, dir)
    await s.run(['--status'])
    expect(s.text()).toContain('status prestigo_fixture_change en APPROVED MARKETING')
  })

  it('NFC normalization and surrounding whitespace alone are not drift', async () => {
    const decomposed = makeTemplate('fixture-nfc')
    const composed = JSON.parse(JSON.stringify(decomposed))
    for (const code of SITE_LOCALES as string[]) {
      decomposed.locales[code].body = `Café {{first_name}} booking {{booking_ref}} ok.`
      composed.locales[code].body = `Café {{first_name}} booking {{booking_ref}} ok.`
    }
    const dir = writeDir([composed])
    const remote = remoteOf(decomposed).map((r: any) => ({
      ...r,
      components: r.components.map((c: any) => (c.type === 'BODY' ? { ...c, text: `  ${c.text}\n` } : c)),
    }))
    const fake = createFakeGraph({ remote })
    const h = harness(fake, dir)
    expect((await h.run()).exitCode).toBe(0)
    expect(h.outLines[h.outLines.length - 1]).toContain('unchanged=7')
  })

  it('a changed button label is reported as drift buttons', async () => {
    const t = makeTemplate()
    const c = JSON.parse(JSON.stringify(t))
    c.locales.ru.buttons.ok = 'Changed'
    const dir = writeDir([c])
    const fake = createFakeGraph({ remote: remoteOf(t) })
    const h = harness(fake, dir)
    expect((await h.run()).exitCode).toBe(1)
    expect(h.text()).toMatch(/prestigo_fixture_change ru drift buttons/)
  })
})

describe('read-only modes, paging and filtering', () => {
  it('--dry-run and --status issue GET requests only', async () => {
    const dir = writeDir([makeTemplate()])
    const fake = createFakeGraph()
    const d = harness(fake, dir)
    expect((await d.run(['--dry-run'])).exitCode).toBe(0)
    expect(d.text()).toContain('prestigo_fixture_change en plan create')
    expect(d.outLines[d.outLines.length - 1]).toBe('summary: create=7 unchanged=0 resubmit=0 drift=0 edit=0 exists=0')
    const s = harness(fake, dir)
    await s.run(['--status'])
    expect(fake.requests.length).toBeGreaterThan(0)
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
    expect(s.text()).toContain('status_summary approved=0 pending=0 rejected=0 paused=0 other=7')
  })

  it('--status prints lines sorted by name then language plus the summary', async () => {
    const a = makeTemplate('aaa-first')
    const b = makeTemplate('bbb-second')
    const dir = writeDir([b, a])
    const fake = createFakeGraph({ remote: [...remoteOf(b, 'PENDING'), ...remoteOf(a, 'APPROVED')] })
    const s = harness(fake, dir)
    await s.run(['--status'])
    const lines = s.outLines.filter((l) => l.startsWith('status '))
    expect(lines).toHaveLength(14)
    expect(lines[0]).toBe('status prestigo_aaa_first ar APPROVED UTILITY')
    expect(lines[6]).toBe('status prestigo_aaa_first zh_CN APPROVED UTILITY')
    expect(lines[7].startsWith('status prestigo_bbb_second ar PENDING')).toBe(true)
    expect(s.outLines[s.outLines.length - 1]).toBe('status_summary approved=7 pending=7 rejected=0 paused=0 other=0')
  })

  it('a listing spread over 3 pages is followed by cursor, never by a paging.next URL', async () => {
    const t = makeTemplate()
    const dir = writeDir([t])
    const fake = createFakeGraph({ remote: remoteOf(t), pageSize: 3 })
    const h = harness(fake, dir)
    expect((await h.run()).exitCode).toBe(0)
    const gets = fake.requests.filter((r) => r.method === 'GET')
    expect(gets).toHaveLength(3)
    expect(gets[1].path).toContain('after=3')
    expect(gets[2].path).toContain('after=6')
    expect(fake.requests.every((r) => r.url.startsWith(GRAPH))).toBe(true)
    expect(h.outLines[h.outLines.length - 1]).toContain('unchanged=7')
  })

  it('--only restricts to one key and an unknown key is a config error (exit 1)', async () => {
    const dir = writeDir([makeTemplate('one-a'), makeTemplate('two-b')])
    const fake = createFakeGraph()
    const h = harness(fake, dir)
    await h.run(['--only', 'one-a'])
    const posts = fake.requests.filter((r) => r.method === 'POST')
    expect(posts).toHaveLength(7)
    expect(posts.every((r) => r.body.name === 'prestigo_one_a')).toBe(true)
    await expect(harness(createFakeGraph(), dir).run(['--only', 'nope'])).rejects.toThrow(MetaConfigError)
    const r = spawnSync(process.execPath, [SCRIPT, '--validate', '--only', 'nope', '--dir', dir], { env: cleanEnv(), encoding: 'utf8' })
    expect(r.status).toBe(1)
  })

  it('an empty or missing templates directory is an error, never "created 0"', async () => {
    const empty = writeDir([])
    expect(() => loadTemplates(empty)).toThrow(/no templates found/)
    expect(() => loadTemplates(join(empty, 'missing'))).toThrow(/no templates found/)
    const fake = createFakeGraph()
    await expect(harness(fake, empty).run()).rejects.toThrow(/no templates found/)
    expect(fake.requests).toHaveLength(0)
  })

  it('a template with zero variables and zero buttons is valid and posts no example or buttons', () => {
    const t = makeTemplate('plain-note', { variables: [], buttons: [] })
    for (const code of SITE_LOCALES as string[]) {
      t.locales[code].body = `Your driver is on the way (${code}). Thank you for riding with us.`
      t.locales[code].buttons = {}
    }
    expect(validateTemplate(t)).toEqual([])
    const body = buildCreateBody(t, 'en')
    expect(body.components).toHaveLength(1)
    expect((body.components[0] as any).example).toBeUndefined()
  })
})

describe('validateTemplate', () => {
  it('accepts the fixture', () => {
    expect(validateTemplate(makeTemplate())).toEqual([])
  })

  it('a template missing the ar locale fails and names ar', () => {
    const t = makeTemplate()
    delete t.locales.ar
    expect(validateTemplate(t).join('\n')).toMatch(/missing locale ar/)
  })

  it('rejects a 1,025-character body and a 26-character button label', () => {
    const t = makeTemplate()
    const head = 'Hello {{first_name}} {{booking_ref}} '
    t.locales.en.body = `${head}${'x'.repeat(1025 - head.length - 1)}.`
    expect(t.locales.en.body.length).toBe(1025)
    t.locales.fr.buttons.ok = 'y'.repeat(26)
    const errors = validateTemplate(t).join('\n')
    expect(errors).toMatch(/locale en: body is 1025 characters/)
    expect(errors).toMatch(/locale fr: button ok label is 26 characters/)
  })

  it('counts UTF-16 code units: astral characters beyond 1,024 units fail although code points do not', () => {
    const t = makeTemplate()
    t.locales.zh.body = `Hi {{first_name}} {{booking_ref}} ${'\u{1F600}'.repeat(496)}.`
    expect([...t.locales.zh.body].length).toBeLessThan(1024)
    expect(t.locales.zh.body.length).toBeGreaterThan(1024)
    expect(validateTemplate(t).join('\n')).toMatch(/locale zh: body is \d+ characters/)
  })

  it('rejects a body starting or ending with a variable and an undeclared variable', () => {
    const t = makeTemplate()
    t.locales.es.body = '{{first_name}} booking {{booking_ref}} ok.'
    t.locales.hi.body = 'Hello {{first_name}} booking {{booking_ref}}'
    t.locales.ru.body = 'Hello {{first_name}} booking {{booking_ref}} and {{x}} ok.'
    const errors = validateTemplate(t).join('\n')
    expect(errors).toMatch(/locale es: body must not start with a variable/)
    expect(errors).toMatch(/locale hi: body must not end with a variable/)
    expect(errors).toMatch(/locale ru: body uses undeclared \{\{x\}\}/)
  })

  it('rejects a declared variable that a locale body never uses', () => {
    const t = makeTemplate()
    t.locales.ar.body = 'Hello {{first_name}} your booking is updated. Bye.'
    expect(validateTemplate(t).join('\n')).toMatch(/locale ar: body does not use \{\{booking_ref\}\}/)
  })

  it('rejects a URL button on a non-allowlisted host, an http URL and a URL with a variable', () => {
    for (const url of ['https://evil.example/x', 'http://rideprestigo.com/x', 'https://rideprestigo.com/{{first_name}}']) {
      const t = makeTemplate('link-note', { buttons: [{ type: 'URL', textKey: 'open', url }] })
      for (const code of SITE_LOCALES as string[]) t.locales[code].buttons = { open: 'Open' }
      expect(validateTemplate(t).length).toBeGreaterThan(0)
    }
    const good = makeTemplate('link-ok', { buttons: [{ type: 'URL', textKey: 'open', url: 'https://g.page/r/abc/review' }] })
    for (const code of SITE_LOCALES as string[]) good.locales[code].buttons = { open: 'Open' }
    expect(validateTemplate(good)).toEqual([])
  })

  it('rejects interleaved quick replies and a wrong zh language code', () => {
    const t = makeTemplate('mixed', {
      buttons: [
        { type: 'QUICK_REPLY', textKey: 'ok' },
        { type: 'URL', textKey: 'open', url: 'https://rideprestigo.com/x' },
        { type: 'QUICK_REPLY', textKey: 'question' },
      ],
    })
    for (const code of SITE_LOCALES as string[]) t.locales[code].buttons = { ok: 'OK', open: 'Open', question: 'Q' }
    t.locales.zh.language = 'zh'
    const errors = validateTemplate(t).join('\n')
    expect(errors).toMatch(/quick replies must be contiguous/)
    expect(errors).toMatch(/locale zh: language must be zh_CN/)
  })

  it('loadTemplates rejects a key that differs from the filename stem', () => {
    const dir = writeDir([])
    writeFileSync(join(dir, 'other-name.json'), JSON.stringify(makeTemplate('fixture-change')))
    expect(() => loadTemplates(dir)).toThrow(/filename stem/)
  })

  it('validation of every file happens before any network call', async () => {
    const bad = makeTemplate('bad-one')
    delete bad.locales.ar
    const dir = writeDir([makeTemplate(), bad])
    const fake = createFakeGraph()
    await expect(harness(fake, dir).run()).rejects.toThrow(/missing locale ar/)
    expect(fake.requests).toHaveLength(0)
  })
})

describe('idempotence, exists, rate limit, delay', () => {
  it('a create answered with "already exists" prints exists and the run continues', async () => {
    const dir = writeDir([makeTemplate()])
    const fake = createFakeGraph({
      failCreate: { 2: { status: 400, error: { message: 'Content in this language already exists', code: 100 } } },
    })
    const h = harness(fake, dir)
    const res = await h.run()
    expect(res.exitCode).toBe(0)
    expect(h.text()).toMatch(/ exists$/m)
    expect(h.outLines[h.outLines.length - 1]).toBe('summary: create=6 unchanged=0 resubmit=0 drift=0 edit=0 exists=1')
    expect(fake.requests.filter((r) => r.method === 'POST')).toHaveLength(7)
  })

  it('the already-exists subcode is recognised without the message text', async () => {
    const dir = writeDir([makeTemplate()])
    const fake = createFakeGraph({ failCreate: { 1: { status: 400, error: { message: 'x', code: 100, error_subcode: 2388024 } } } })
    const h = harness(fake, dir)
    expect((await h.run()).exitCode).toBe(0)
    expect(h.outLines[h.outLines.length - 1]).toContain('exists=1')
  })

  it('a 429 on create stops immediately with exit 2 and later templates are not attempted', async () => {
    const dir = writeDir([makeTemplate('one-a'), makeTemplate('two-b')])
    const fake = createFakeGraph({ failCreate: { 3: { status: 429, error: { message: 'too many', code: 4 } } } })
    const h = harness(fake, dir)
    const res = await h.run()
    expect(res.exitCode).toBe(2)
    expect(fake.requests.filter((r) => r.method === 'POST')).toHaveLength(3)
    expect(h.errLines.join('\n')).toMatch(/rerun later/)
    expect(h.text()).toContain('summary: create=2')
  })

  it('a Graph rate-limit code on HTTP 400 also stops the run', async () => {
    const dir = writeDir([makeTemplate()])
    const fake = createFakeGraph({ failCreate: { 2: { status: 400, error: { message: 'limit', code: 80007 } } } })
    const res = await harness(fake, dir).run()
    expect(res.exitCode).toBe(2)
    expect(fake.requests.filter((r) => r.method === 'POST')).toHaveLength(2)
  })

  it('an interrupted run resumes: only the missing pairs are created on the next run', async () => {
    const dir = writeDir([makeTemplate()])
    const fake = createFakeGraph({ failCreate: { 4: { status: 429, error: { message: 'slow down', code: 4 } } } })
    expect((await harness(fake, dir).run()).exitCode).toBe(2)
    expect(fake.store).toHaveLength(3)
    fake.requests.length = 0
    const h = harness(fake, dir)
    expect((await h.run()).exitCode).toBe(0)
    expect(fake.requests.filter((r) => r.method === 'POST')).toHaveLength(4)
    expect(h.outLines[h.outLines.length - 1]).toBe('summary: create=4 unchanged=3 resubmit=0 drift=0 edit=0 exists=0')
  })

  it('mutations are spaced by the configured delay; the default is 1,500 ms', async () => {
    const dir = writeDir([makeTemplate()])
    const h = harness(createFakeGraph(), dir)
    await h.run()
    expect(h.sleeps).toEqual([1500, 1500, 1500, 1500, 1500, 1500])
    const h2 = harness(createFakeGraph(), dir)
    await h2.run(['--delay-ms', '0'])
    expect(h2.sleeps).toEqual([])
    expect(parseArgs(['--delay-ms=250']).delayMs).toBe(250)
    expect(() => parseArgs(['--delay-ms', 'abc'])).toThrow(MetaConfigError)
  })

  it('parseArgs rejects unknown arguments (a token can never be passed on argv) and mode combinations', () => {
    expect(() => parseArgs(['--token', 'abc'])).toThrow(MetaConfigError)
    expect(() => parseArgs(['--dry-run', '--status'])).toThrow(MetaConfigError)
  })
})

describe('secrets and destructive methods', () => {
  it('an API error echoing the token or an access_token field is printed redacted', async () => {
    const dir = writeDir([makeTemplate()])
    const fake = createFakeGraph({
      echo: TOKEN,
      failCreate: { 1: { status: 400, error: { message: 'bad request', code: 100 } } },
    })
    let message = ''
    try {
      await harness(fake, dir).run()
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('400')
    expect(message).not.toContain(TOKEN)
    expect(message).toContain('[redacted]')
  })

  it('a transport error message never carries the token', async () => {
    const client = createGraphClient({
      token: TOKEN,
      fetchImpl: (async () => {
        throw new TypeError(`fetch failed for Bearer ${TOKEN}`)
      }) as any,
    })
    let message = ''
    try {
      await client.request('GET', '/1/message_templates')
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('[redacted]')
    expect(message).not.toContain(TOKEN)
  })

  it('the client only issues GET and POST and refuses absolute URLs', async () => {
    const client = createGraphClient({ token: TOKEN, fetchImpl: (async () => new Response('{}')) as any })
    for (const method of ['DELETE', 'PUT', 'PATCH']) {
      await expect(client.request(method, '/1')).rejects.toThrow(MetaConfigError)
    }
    await expect(client.request('GET', 'https://evil.example/x')).rejects.toThrow(MetaConfigError)
  })

  it('across the full matrix no request method other than GET or POST is ever issued', async () => {
    const t = makeTemplate()
    const dir = writeDir([t])
    const fake = createFakeGraph({ remote: remoteOf(t, 'REJECTED') })
    const h = harness(fake, dir)
    await h.run(['--allow-edit'])
    await h.run(['--dry-run'])
    await h.run(['--status'])
    expect(fake.requests.every((r) => r.method === 'GET' || r.method === 'POST')).toBe(true)
  })
})
