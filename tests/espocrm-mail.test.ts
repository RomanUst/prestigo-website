// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 80, Plan 10 - owner mailbox and reminders as code (CRM-04, CRM-02, D-05/D-11/D-12/D-13):
 * the `mail` sync resource, the invariants pinned to infra/espocrm/mail.json and the PII-free
 * CRM inspect tool (infra/espocrm/inspect.mjs), all against the in-memory fake and a stubbed
 * Chatwoot. No test here makes a network call or reads a real credential.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEspoClient, EspoConfigError, loadEspoConfig, loadSmtpPassword } from '../infra/espocrm/lib/client.mjs'
import { createChatwootClient } from '../infra/chatwoot/lib/client.mjs'
import { parseArgs, RESOURCE_ORDER, runSync, validateMailConfig } from '../infra/espocrm/sync.mjs'
import { parseInspectArgs, runInspect } from '../infra/espocrm/inspect.mjs'
import { createFakeEspoCRM, stockEspoMetadata } from './helpers/fake-espocrm'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://crm.example.test'
const MAIL_JSON = JSON.parse(readFileSync(join(REPO_ROOT, 'infra/espocrm/mail.json'), 'utf8'))

const ADMIN_ID = 'b00000000000000a1'
const OWNER = 'roman@rideprestigo.com'

type Fake = ReturnType<typeof createFakeEspoCRM>

const SMTP_SECRET = 'smtp_SECRET_0123456789'
const SYSTEM_ADDRESS = 'notifications@rideprestigo.com'
/** The live state after the 80-10 fix: the declared group account, as the API returns it (no password). */
const SYSTEM_ACCOUNT = { ...MAIL_JSON.systemSmtp, id: 'a00000000000000e1' }

const adminClient = (fake: Fake) =>
  createEspoClient({
    config: loadEspoConfig({
      identity: 'admin',
      env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_ADMIN_USER: 'prestigo-config', ESPOCRM_ADMIN_PASSWORD: 'pw_SECRET_0123456789' },
    }),
    fetchImpl: fake.fetchImpl as any,
  })

const mailMetadata = (actionOptions: string[] = ['Skip', 'Move to Folder', 'Move to Group Folder', 'None']) => {
  const md = stockEspoMetadata()
  md.entityDefs.EmailFilter = { fields: { action: { type: 'enum', options: actionOptions }, emailFolder: { type: 'link' } } }
  md.entityDefs.EmailFolder = { fields: { name: { type: 'varchar' }, assignedUser: { type: 'link' } } }
  md.entityDefs.Preferences = { fields: { defaultRemindersTask: { type: 'jsonArray' } } }
  return md
}

const jobs = (status = 'Active') => [
  { id: 'd00000000000000a1', name: 'Check Personal Email Accounts', job: 'CheckEmailAccounts', status: 'Active' },
  { id: 'd00000000000000a2', name: 'Send Email Reminders', job: 'SendEmailReminders', status },
  { id: 'd00000000000000a3', name: 'Cleanup', job: 'Cleanup', status: 'Active' },
]

const freshFake = (over: { metadata?: any; records?: Record<string, any[]>; extraRoutes?: any } = {}) =>
  createFakeEspoCRM({
    extraRoutes: over.extraRoutes,
    metadata: over.metadata ?? mailMetadata(),
    records: {
      User: [
        { id: ADMIN_ID, userName: 'prestigo-admin', type: 'admin' },
        { id: 'e00000000000000a1', userName: 'prestigo-sync', type: 'api', rolesIds: [] },
      ],
      Preferences: [{ id: ADMIN_ID, defaultRemindersTask: [] }],
      ScheduledJob: jobs(),
      InboundEmail: [{ ...SYSTEM_ACCOUNT }],
      ...(over.records ?? {}),
    },
  })

async function syncMail(
  fake: Fake,
  opts: { dryRun?: boolean; mail?: unknown; setSmtpPassword?: boolean; getSmtpPassword?: () => string } = {},
) {
  const lines: string[] = []
  let configDir = join(REPO_ROOT, 'infra/espocrm')
  if (opts.mail) {
    configDir = mkdtempSync(join(tmpdir(), 'espocrm-mail-'))
    writeFileSync(join(configDir, 'mail.json'), JSON.stringify(opts.mail))
  }
  await runSync({
    client: adminClient(fake),
    configDir,
    only: ['mail'],
    dryRun: opts.dryRun,
    setSmtpPassword: opts.setSmtpPassword,
    getSmtpPassword: opts.getSmtpPassword ?? (() => SMTP_SECRET),
    log: (l: string) => lines.push(l),
  })
  return lines
}

describe('mail.json', () => {
  it('declares the owner mailbox, a Reminders folder and filter, task reminder defaults and the two jobs', () => {
    expect(MAIL_JSON.owner).toEqual({ userName: 'prestigo-admin', emailAddress: OWNER })
    expect(MAIL_JSON.folders).toEqual([{ name: 'Reminders', user: 'prestigo-admin' }])
    expect(MAIL_JSON.filters).toHaveLength(1)
    expect(MAIL_JSON.filters[0]).toMatchObject({ from: 'notifications@rideprestigo.com', action: 'Move to Folder', folder: 'Reminders' })
    expect(MAIL_JSON.preferences[0].defaultRemindersTask).toEqual([
      { type: 'Popup', seconds: 0 },
      { type: 'Email', seconds: 3600 },
    ])
    expect(MAIL_JSON.requiredJobs).toEqual(['CheckEmailAccounts', 'SendEmailReminders'])
  })

  it('never uses the Skip action (it would hide reminders) and holds no password key', () => {
    const raw = readFileSync(join(REPO_ROOT, 'infra/espocrm/mail.json'), 'utf8')
    expect(raw).not.toContain('"Skip"')
    expect(raw.toLowerCase()).not.toMatch(/password|secret|token/)
  })

  it('mail runs after roles', () => {
    const order = RESOURCE_ORDER as string[]
    expect(order.indexOf('mail')).toBe(order.indexOf('roles') + 1)
  })
})

const OWNER_FOLDER = { id: 'f00000000000000a1', name: 'Reminders', assignedUserId: ADMIN_ID }
/** What the live instance did on the first try: a folder created through the API belongs to the admin identity. */
const STRAY_FOLDER = { id: 'f00000000000000a9', name: 'Reminders', assignedUserId: 'c00000000000000c1' }

describe('mail resource', () => {
  it('sets the owner email, points the filter at the owner-created folder and sets reminder defaults; the second run changes nothing', async () => {
    const fake = freshFake({ records: { EmailFolder: [OWNER_FOLDER] } })
    const first = await syncMail(fake)
    expect(first).toContain('mail: create=1 update=2 unchanged=2 skipped=0 removed=0')
    expect(first).toContain('jobs: CheckEmailAccounts=Active SendEmailReminders=Active')

    const admin = fake.state.records.User.find((u) => u.userName === 'prestigo-admin')!
    expect(admin.emailAddress).toBe(OWNER)
    expect(fake.state.records.EmailFilter).toHaveLength(1)
    expect(fake.state.records.EmailFilter[0]).toMatchObject({
      name: 'System notifications to Reminders',
      from: 'notifications@rideprestigo.com',
      action: 'Move to Folder',
      emailFolderId: OWNER_FOLDER.id,
      parentType: 'User',
      parentId: ADMIN_ID,
      isGlobal: false,
    })
    expect(fake.state.records.Preferences[0].defaultRemindersTask).toEqual(MAIL_JSON.preferences[0].defaultRemindersTask)

    const second = await syncMail(fake)
    expect(second).toContain('mail: create=0 update=0 unchanged=5 skipped=0 removed=0')
    expect(fake.state.records.EmailFolder).toHaveLength(1)
    expect(fake.state.records.EmailFilter).toHaveLength(1)
  })

  it('never creates a folder: without the owner folder the folder and its filter are skipped with an owner instruction', async () => {
    const fake = freshFake()
    const lines = await syncMail(fake)
    expect(lines).toContain('mail: create=0 update=2 unchanged=1 skipped=2 removed=0')
    expect(lines.some((l) => /folder "Reminders" owned by prestigo-admin does not exist/.test(l) && /owner creates it/.test(l))).toBe(true)
    expect(fake.requests.filter((r) => r.method === 'POST')).toEqual([])
    expect(fake.state.records.EmailFolder ?? []).toHaveLength(0)
    expect(fake.state.records.EmailFilter ?? []).toHaveLength(0)
  })

  it('ignores a same-named folder owned by another user and re-points a filter that targets it', async () => {
    const fake = freshFake({
      records: {
        EmailFolder: [STRAY_FOLDER],
        EmailFilter: [
          { id: 'f00000000000000b1', name: 'System notifications to Reminders', from: 'notifications@rideprestigo.com', action: 'Move to Folder', emailFolderId: STRAY_FOLDER.id, parentType: 'User', parentId: ADMIN_ID },
        ],
      },
    })
    const stray = await syncMail(fake)
    expect(stray).toContain('mail: create=0 update=2 unchanged=1 skipped=2 removed=0')
    expect(fake.state.records.EmailFilter[0].emailFolderId).toBe(STRAY_FOLDER.id)

    // The owner creates their folder; the next run repairs the filter and leaves the stray folder alone.
    fake.state.records.EmailFolder.push(OWNER_FOLDER)
    const healed = await syncMail(fake)
    expect(healed).toContain('mail: create=0 update=1 unchanged=4 skipped=0 removed=0')
    expect(fake.state.records.EmailFilter).toHaveLength(1)
    expect(fake.state.records.EmailFilter[0].emailFolderId).toBe(OWNER_FOLDER.id)
    expect(fake.state.records.EmailFolder).toHaveLength(2)
    expect(fake.requests.filter((r) => r.method === 'DELETE')).toEqual([])
  })

  it('matches the owner email case-insensitively and repairs a drifted filter', async () => {
    const fake = freshFake({
      records: {
        User: [{ id: ADMIN_ID, userName: 'prestigo-admin', type: 'admin', emailAddress: 'ROMAN@rideprestigo.com' }],
        EmailFolder: [{ id: 'f00000000000000a1', name: 'Reminders', assignedUserId: ADMIN_ID }],
        EmailFilter: [
          { id: 'f00000000000000b1', name: 'System notifications to Reminders', from: 'someone@else.test', action: 'Skip', emailFolderId: null, parentType: 'User', parentId: ADMIN_ID },
        ],
      },
    })
    const lines = await syncMail(fake)
    expect(lines).toContain('mail: create=0 update=2 unchanged=3 skipped=0 removed=0')
    expect(fake.state.records.User[0].emailAddress).toBe('ROMAN@rideprestigo.com')
    expect(fake.state.records.EmailFilter).toHaveLength(1)
    expect(fake.state.records.EmailFilter[0]).toMatchObject({ from: 'notifications@rideprestigo.com', action: 'Move to Folder', emailFolderId: 'f00000000000000a1' })
  })

  it('a stopped SendEmailReminders job rejects the run, names the job and writes nothing', async () => {
    const fake = freshFake({ records: { ScheduledJob: jobs('Inactive') } })
    await expect(syncMail(fake)).rejects.toThrow(/SendEmailReminders/)
    expect(fake.requests.filter((r) => r.method !== 'GET')).toEqual([])
  })

  it('a missing required job rejects the run', async () => {
    const fake = freshFake({ records: { ScheduledJob: jobs().filter((j) => j.job !== 'CheckEmailAccounts') } })
    await expect(syncMail(fake)).rejects.toThrow(/CheckEmailAccounts/)
  })

  it('dry run sends only GET requests and reports the delta', async () => {
    const fake = freshFake({ records: { EmailFolder: [OWNER_FOLDER] } })
    const lines = await syncMail(fake, { dryRun: true })
    expect(fake.requests.length).toBeGreaterThan(0)
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
    expect(lines).toContain('mail: create=1 update=2 unchanged=2 skipped=0 removed=0')
    expect(fake.state.records.EmailFilter ?? []).toHaveLength(0)
  })

  it('when the live filter action list has no "Move to Folder" it creates no folder or filter and says why', async () => {
    const fake = freshFake({ metadata: mailMetadata(['Skip', 'None']) })
    const lines = await syncMail(fake)
    expect(lines.some((l) => /folders and filters skipped/.test(l) && /Move to Folder/.test(l))).toBe(true)
    expect(fake.state.records.EmailFolder ?? []).toHaveLength(0)
    expect(fake.state.records.EmailFilter ?? []).toHaveLength(0)
    expect(lines.some((l) => /^mail: create=0 update=2 unchanged=1 skipped=2 /.test(l))).toBe(true)
  })

  it('an unknown user is a config error; a declared Skip action is refused before any write', async () => {
    const fake = freshFake()
    await expect(syncMail(fake, { mail: { ...MAIL_JSON, owner: { userName: 'nobody', emailAddress: OWNER } } })).rejects.toThrow(/nobody/)
    const bad = { ...MAIL_JSON, filters: [{ ...MAIL_JSON.filters[0], action: 'Skip' }] }
    await expect(syncMail(freshFake(), { mail: bad })).rejects.toThrow(/Skip/)
  })
})

describe('mail.json systemSmtp', () => {
  it('declares the Resend SMTP group account without any secret', () => {
    expect(MAIL_JSON.systemSmtp).toMatchObject({
      emailAddress: SYSTEM_ADDRESS,
      status: 'Active',
      useImap: false,
      useSmtp: true,
      smtpHost: 'smtp.resend.com',
      smtpPort: 587,
      smtpSecurity: 'TLS',
      smtpAuth: true,
      smtpUsername: 'resend',
      excludeFromReply: true,
    })
    expect(Object.keys(MAIL_JSON.systemSmtp).some((k) => /password/i.test(k))).toBe(false)
  })

  it('refuses a password key, an unknown key and a sender that cannot send', () => {
    const withKey = (extra: Record<string, unknown>) => ({ ...MAIL_JSON, systemSmtp: { ...MAIL_JSON.systemSmtp, ...extra } })
    expect(() => validateMailConfig(MAIL_JSON)).not.toThrow()
    expect(() => validateMailConfig(withKey({ smtpPassword: 'x' }))).toThrow(/unsupported keys: smtpPassword/)
    expect(() => validateMailConfig(withKey({ extra: 1 }))).toThrow(/unsupported keys/)
    expect(() => validateMailConfig(withKey({ useSmtp: false }))).toThrow(/useSmtp must be true/)
    expect(() => validateMailConfig(withKey({ smtpPort: '587' }))).toThrow(/smtpPort must be a number/)
    expect(() => validateMailConfig(withKey({ emailAddress: 'not-an-address' }))).toThrow(/emailAddress/)
  })
})

describe('system SMTP group account', () => {
  const noAccount = () => freshFake({ records: { InboundEmail: [] } })
  const inboundWrites = (fake: Fake) => fake.requests.filter((r) => r.path.startsWith('/InboundEmail') && r.method !== 'GET')

  it('creates the account with the password in the body only, then the second run changes nothing', async () => {
    const fake = noAccount()
    const first = await syncMail(fake)
    expect(first).toContain('mail: create=1 update=2 unchanged=0 skipped=2 removed=0')
    const posts = fake.requests.filter((r) => r.method === 'POST' && r.path === '/InboundEmail')
    expect(posts).toHaveLength(1)
    expect(posts[0].body).toMatchObject({ ...MAIL_JSON.systemSmtp, smtpPassword: SMTP_SECRET })
    expect(first.join('\n')).not.toContain(SMTP_SECRET)

    const second = await syncMail(fake)
    expect(second.join('\n')).not.toContain(SMTP_SECRET)
    expect(inboundWrites(fake)).toHaveLength(1)
    expect(fake.state.records.InboundEmail).toHaveLength(1)
  })

  it('leaves a matching account alone and never asks for the password', async () => {
    const fake = freshFake({ records: { EmailFolder: [OWNER_FOLDER] } })
    await syncMail(fake)
    const lines = await syncMail(fake, {
      getSmtpPassword: () => {
        throw new Error('password must not be read')
      },
    })
    expect(lines).toContain('mail: create=0 update=0 unchanged=5 skipped=0 removed=0')
    expect(inboundWrites(fake)).toEqual([])
  })

  it('repairs only the drifted non-secret fields and does not resend the password', async () => {
    const fake = freshFake({
      records: { EmailFolder: [OWNER_FOLDER], InboundEmail: [{ ...SYSTEM_ACCOUNT, status: 'Inactive', smtpPort: 25, smtpIsShared: false }] },
    })
    const lines = await syncMail(fake)
    const puts = fake.requests.filter((r) => r.method === 'PUT' && r.path.startsWith('/InboundEmail/'))
    expect(puts).toHaveLength(1)
    expect(puts[0].body).toEqual({ status: 'Active', smtpPort: 587, smtpIsShared: true })
    expect(fake.state.records.InboundEmail[0]).toMatchObject({ status: 'Active', smtpPort: 587, smtpIsShared: true })
    expect(lines.some((l) => /^\[update\] mail system SMTP group account \(status, smtpIsShared, smtpPort\)$/.test(l))).toBe(true)
  })

  it('sends the password on an existing account only with --set-smtp-password and never prints it', async () => {
    const fake = freshFake({ records: { EmailFolder: [OWNER_FOLDER] } })
    const lines = await syncMail(fake, { setSmtpPassword: true })
    const puts = fake.requests.filter((r) => r.method === 'PUT' && r.path.startsWith('/InboundEmail/'))
    expect(puts).toHaveLength(1)
    expect(puts[0].body).toEqual({ smtpPassword: SMTP_SECRET })
    expect(lines.join('\n')).not.toContain(SMTP_SECRET)
    expect(lines).toContain('mail: create=1 update=3 unchanged=1 skipped=0 removed=0')
  })

  it('masks the SMTP password in an API error that echoes the request field (IN-04)', async () => {
    const fake = freshFake({
      records: { EmailFolder: [OWNER_FOLDER] },
      extraRoutes: (req: any) =>
        req.method === 'PUT' && req.path.startsWith('/InboundEmail/') && req.body?.smtpPassword
          ? new Response(`{"message":"bad smtpPassword ${req.body.smtpPassword}"}`, { status: 400 })
          : undefined,
    })
    const failure = await syncMail(fake, { setSmtpPassword: true }).then(
      () => null,
      (err: Error) => err,
    )
    expect(failure).toBeInstanceOf(Error)
    expect(failure!.message).toContain('400')
    expect(failure!.message).not.toContain(SMTP_SECRET)
    expect(failure!.message).toContain('[redacted]')
  })

  it('a missing password source aborts the create before any write', async () => {
    const fake = noAccount()
    const missing = () => loadSmtpPassword({ readFile: () => null })
    await expect(syncMail(fake, { getSmtpPassword: missing })).rejects.toThrow(/RESEND_SMTP_PASSWORD/)
    expect(fake.requests.filter((r) => r.method !== 'GET')).toEqual([])
  })

  it('dry run reads only and does not touch the password', async () => {
    const fake = noAccount()
    const lines = await syncMail(fake, {
      dryRun: true,
      setSmtpPassword: true,
      getSmtpPassword: () => {
        throw new Error('password must not be read in dry-run')
      },
    })
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
    expect(lines).toContain('[dry-run] [create] mail system SMTP group account')
    expect(fake.state.records.InboundEmail).toHaveLength(0)
  })

  it('refuses to guess between two accounts with the system address', async () => {
    const fake = freshFake({ records: { InboundEmail: [SYSTEM_ACCOUNT, { ...SYSTEM_ACCOUNT, id: 'a00000000000000e2' }] } })
    await expect(syncMail(fake)).rejects.toThrow(/exactly one/)
    expect(fake.requests.filter((r) => r.method !== 'GET')).toEqual([])
  })

  it('ignores group accounts with another address', async () => {
    const other = { id: 'a00000000000000e9', name: 'Other', emailAddress: 'info@rideprestigo.com', status: 'Active', useSmtp: true }
    const fake = freshFake({ records: { EmailFolder: [OWNER_FOLDER], InboundEmail: [other] } })
    await syncMail(fake)
    expect(fake.state.records.InboundEmail).toHaveLength(2)
    expect(fake.state.records.InboundEmail[0]).toEqual(other)
  })
})

describe('loadSmtpPassword and --set-smtp-password', () => {
  it('reads RESEND_SMTP_PASSWORD from the file and names the file (never a value) when it is missing', () => {
    expect(loadSmtpPassword({ filePath: '/x/espocrm-smtp.env', readFile: () => '# c\nRESEND_SMTP_PASSWORD="re_abc123"\n' })).toBe('re_abc123')
    expect(() => loadSmtpPassword({ filePath: '/x/espocrm-smtp.env', readFile: () => 'OTHER=1\n' })).toThrow(EspoConfigError)
    expect(() => loadSmtpPassword({ filePath: '/x/espocrm-smtp.env', readFile: () => null })).toThrow(/espocrm-smtp\.env/)
    expect(() => loadSmtpPassword({ readFile: () => 'RESEND_SMTP_PASSWORD=bad\u0436value\n' })).toThrow(/printable ASCII/)
    try {
      loadSmtpPassword({ readFile: () => 'RESEND_SMTP_PASSWORD=bad\u0436value\n' })
    } catch (err) {
      expect(String((err as Error).message)).not.toContain('bad')
    }
  })

  it('the flag is parsed only when given', () => {
    expect(parseArgs(['--only', 'mail'])).toEqual({ dryRun: false, only: ['mail'] })
    expect(parseArgs(['--only', 'mail', '--set-smtp-password'])).toEqual({ dryRun: false, only: ['mail'], setSmtpPassword: true })
  })
})

// ---------------------------------------------------------------------------
// inspect.mjs
// ---------------------------------------------------------------------------

const KNOWN_CONTACT_ADDRESS = 'jane.doe@customer.example'

function inspectWorld(extra: Record<string, any[]> = {}, chatwootInboxes: any[] = []) {
  const fake = freshFake({
    records: {
      Lead: [
        { id: 'a00000000000000a1', firstName: 'Zed', emailAddress: 'zed@leads.example', assignedUserId: null },
        { id: 'a00000000000000a2', firstName: 'Yan', emailAddress: 'yan@leads.example', assignedUserId: ADMIN_ID },
        { id: 'a00000000000000a3', firstName: 'Xia', emailAddress: 'xia@leads.example', assignedUserId: '' },
      ],
      Contact: [{ id: 'a00000000000000b1', firstName: 'Jane', emailAddress: KNOWN_CONTACT_ADDRESS }],
      ...extra,
    },
  })
  const chatwootFetch = async () => new Response(JSON.stringify({ payload: chatwootInboxes }), { status: 200 })
  const chatwootClient = createChatwootClient({
    baseUrl: 'https://chat.example.test',
    token: 'cw_SECRET_token',
    accountId: '1',
    fetchImpl: chatwootFetch as any,
  })
  const out: string[] = []
  const run = async (argv: string[]) => {
    const code = await runInspect({
      argv,
      client: adminClient(fake),
      getChatwootClient: () => chatwootClient,
      configDir: join(REPO_ROOT, 'infra/espocrm'),
      log: (l: string) => out.push(l),
    })
    return { code, out: [...out] }
  }
  return { fake, run, out }
}

describe('parseInspectArgs', () => {
  it('parses count, jobs, mailbox and email-parent', () => {
    expect(parseInspectArgs(['count', 'Lead'])).toMatchObject({ command: 'count', entity: 'Lead' })
    expect(parseInspectArgs(['count', 'Lead', 'status=New'])).toMatchObject({ command: 'count', entity: 'Lead', attr: 'status', value: 'New' })
    expect(parseInspectArgs(['count', 'Lead', 'assignedUserId='])).toMatchObject({ attr: 'assignedUserId', value: '', empty: true })
    expect(parseInspectArgs(['jobs'])).toMatchObject({ command: 'jobs' })
    expect(parseInspectArgs(['mailbox'])).toMatchObject({ command: 'mailbox' })
    expect(parseInspectArgs(['email-parent', '--since', '2026-10-13T10:00:00Z'])).toMatchObject({ command: 'email-parent', since: '2026-10-13T10:00:00Z' })
  })

  it('rejects unknown commands, bad entity names and a missing or invalid --since', () => {
    expect(() => parseInspectArgs([])).toThrow(/command/i)
    expect(() => parseInspectArgs(['nope'])).toThrow(/Unknown command/)
    expect(() => parseInspectArgs(['count', '../Lead'])).toThrow(/entity/i)
    expect(() => parseInspectArgs(['count', 'Lead', 'bad attr=1'])).toThrow(/attribute/i)
    expect(() => parseInspectArgs(['email-parent'])).toThrow(/--since/)
    expect(() => parseInspectArgs(['email-parent', '--since', 'yesterday-ish'])).toThrow(/--since/)
    expect(parseInspectArgs(['system-mail', '--expect-active'])).toMatchObject({ command: 'system-mail', expectActive: true })
    expect(() => parseInspectArgs(['system-mail', '--nope'])).toThrow(/Unknown argument/)
  })
})

describe('inspect commands', () => {
  it('count prints count=N, attr=value filters and attr= means empty', async () => {
    const w = inspectWorld()
    expect((await w.run(['count', 'Lead'])).out).toEqual(['count=3'])
    w.out.length = 0
    expect((await w.run(['count', 'Lead', 'firstName=Zed'])).out).toEqual(['count=1'])
    w.out.length = 0
    expect((await w.run(['count', 'Lead', 'assignedUserId='])).out).toEqual(['count=2'])
  })

  it('jobs prints one job=status line per required job and exits 1 when one is not Active', async () => {
    const ok = inspectWorld()
    const res = await ok.run(['jobs'])
    expect(res.code).toBe(0)
    expect(res.out).toEqual(['CheckEmailAccounts=Active', 'SendEmailReminders=Active'])

    const stopped = createFakeEspoCRM({ metadata: mailMetadata(), records: { ScheduledJob: jobs('Inactive') } })
    const out: string[] = []
    const code = await runInspect({ argv: ['jobs'], client: adminClient(stopped), configDir: join(REPO_ROOT, 'infra/espocrm'), log: (l: string) => out.push(l) })
    expect(code).toBe(1)
    expect(out).toEqual(['CheckEmailAccounts=Active', 'SendEmailReminders=Inactive'])
  })

  it('mailbox reports a missing account, then an active one, with the Chatwoot inbox count', async () => {
    const missing = inspectWorld({ EmailAccount: [] })
    expect((await missing.run(['mailbox'])).out).toEqual([
      'email_account=missing imap=off smtp=off store_sent=off chatwoot_inboxes_with_roman=0',
    ])

    const active = inspectWorld(
      { EmailAccount: [{ id: 'a00000000000000c1', emailAddress: OWNER, status: 'Active', useImap: true, useSmtp: true, storeSentEmails: true }] },
      [{ id: 1, name: 'Website', email: 'info@rideprestigo.com' }],
    )
    const res = await active.run(['mailbox', '--expect-active'])
    expect(res.code).toBe(0)
    expect(res.out).toEqual(['email_account=active imap=on smtp=on store_sent=on chatwoot_inboxes_with_roman=0'])
  })

  it('mailbox counts a Chatwoot inbox that holds roman@ and --expect-active then exits 1', async () => {
    const w = inspectWorld(
      { EmailAccount: [{ id: 'a00000000000000c1', emailAddress: OWNER, status: 'Active', useImap: true, useSmtp: false, storeSentEmails: false }] },
      [{ id: 7, name: 'Sales', email: 'Roman@RidePrestigo.com' }, { id: 8, name: 'Other', email: 'info@rideprestigo.com' }],
    )
    const res = await w.run(['mailbox', '--expect-active'])
    expect(res.out).toEqual(['email_account=active imap=on smtp=off store_sent=off chatwoot_inboxes_with_roman=1'])
    expect(res.code).toBe(1)
  })

  it('email-parent groups emails created since T by parentType and counts a missing parent as none', async () => {
    const w = inspectWorld({
      Email: [
        { id: 'a00000000000000d1', parentType: 'Account', createdAt: '2026-10-13 10:05:00' },
        { id: 'a00000000000000d2', parentType: 'Opportunity', createdAt: '2026-10-13 10:30:00' },
        { id: 'a00000000000000d3', parentType: null, createdAt: '2026-10-13 10:31:00' },
        { id: 'a00000000000000d4', parentType: 'Contact', createdAt: '2026-10-13 10:40:00' },
        { id: 'a00000000000000d5', parentType: 'Account', createdAt: '2026-10-13 08:00:00' },
        { id: 'a00000000000000d6', parentType: 'Lead', createdAt: '2026-10-13 10:41:00' },
      ],
    })
    const res = await w.run(['email-parent', '--since', '2026-10-13T10:00:00Z'])
    expect(res.code).toBe(0)
    expect(res.out).toEqual(['emails=5 Account=1 Contact=1 Opportunity=1 none=1 other=1'])
  })

  it('system-mail reports exists / active / use_smtp / from-address match as booleans, never the address or password', async () => {
    const ok = inspectWorld()
    ok.fake.state.settings.outboundEmailFromAddress = SYSTEM_ADDRESS
    ok.fake.state.records.InboundEmail[0].smtpPassword = SMTP_SECRET
    const good = await ok.run(['system-mail', '--expect-active'])
    expect(good.code).toBe(0)
    expect(good.out).toEqual(['system_smtp=present active=on use_smtp=on from_matches_settings=on'])

    const drifted = inspectWorld({ InboundEmail: [{ ...SYSTEM_ACCOUNT, status: 'Inactive', useSmtp: false }] })
    drifted.fake.state.settings.outboundEmailFromAddress = 'other@rideprestigo.com'
    const bad = await drifted.run(['system-mail', '--expect-active'])
    expect(bad.out).toEqual(['system_smtp=present active=off use_smtp=off from_matches_settings=off'])
    expect(bad.code).toBe(1)

    const gone = inspectWorld({ InboundEmail: [] })
    const missing = await gone.run(['system-mail'])
    expect(missing.out).toEqual(['system_smtp=missing active=off use_smtp=off from_matches_settings=off'])
    expect(missing.code).toBe(0)
    expect([...good.out, ...bad.out, ...missing.out].join('\n')).not.toMatch(/@|SECRET/)
  })

  it('never prints an email address, subject or name', async () => {
    const w = inspectWorld(
      {
        EmailAccount: [{ id: 'a00000000000000c1', emailAddress: OWNER, status: 'Active', useImap: true, useSmtp: true, storeSentEmails: true }],
        Email: [{ id: 'a00000000000000d1', parentType: 'Contact', name: 'Secret subject line', fromString: KNOWN_CONTACT_ADDRESS, createdAt: '2026-10-13 10:05:00' }],
      },
      [{ id: 1, name: 'Sales', email: OWNER }],
    )
    await w.run(['count', 'Contact'])
    await w.run(['jobs'])
    await w.run(['mailbox'])
    await w.run(['email-parent', '--since', '2026-10-13T00:00:00Z'])
    const text = w.out.join('\n')
    expect(text).not.toMatch(/@/)
    expect(text).not.toContain('Secret subject')
    expect(text).not.toContain('Jane')
    expect(text).not.toContain('SECRET')
  })
})
