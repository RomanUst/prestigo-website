// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- stub fetch payloads are intentionally loose */
/**
 * Phase 80 review IN-01 / IN-04 - credential file hygiene and transport hardening of the
 * EspoCRM client. Synthetic secrets only; temp files live in the OS temp dir.
 */
import { describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  EspoApiError,
  EspoConfigError,
  createEspoClient,
  loadEspoConfig,
  loadSmtpPassword,
  parseEnvFile,
  readSecretFile,
} from '../infra/espocrm/lib/client.mjs'

const BASE = 'https://crm.example.test'
const posix = process.platform !== 'win32'

function tmpEnv(content: string, mode: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'espocrm-client-'))
  const file = join(dir, 'espocrm-sync.env')
  writeFileSync(file, content)
  chmodSync(file, mode)
  return file
}

describe('parseEnvFile (IN-01)', () => {
  it('accepts an export prefix', () => {
    expect(parseEnvFile('export ESPOCRM_API_KEY=abc123\nexport  OTHER="x y"\n')).toEqual({
      ESPOCRM_API_KEY: 'abc123',
      OTHER: 'x y',
    })
  })

  it('drops an inline comment after the value, quoted or not', () => {
    expect(parseEnvFile('A=abc123 # sync key\nB="def456" # quoted\nC=\'ghi789\'  #x\n')).toEqual({
      A: 'abc123',
      B: 'def456',
      C: 'ghi789',
    })
  })

  it('keeps a # that is not preceded by whitespace, and plain quoted values', () => {
    expect(parseEnvFile('A=pa#ss\nB="has # inside"\nC="plain"\nD=\'plain\'\n')).toEqual({
      A: 'pa#ss',
      B: 'has # inside',
      C: 'plain',
      D: 'plain',
    })
  })

  it('still ignores comment lines, blank lines and lines without a key', () => {
    expect(parseEnvFile('# comment\n\n=novalue\nKEY=v\r\n')).toEqual({ KEY: 'v' })
  })
})

describe.skipIf(!posix)('credential file mode (IN-01)', () => {
  it('rejects a group- or world-readable file with a chmod hint and never prints the content', () => {
    const file = tmpEnv('ESPOCRM_API_KEY=key_SECRET_abcdef0123\n', 0o644)
    let message = ''
    try {
      readSecretFile(file)
    } catch (err) {
      expect(err).toBeInstanceOf(EspoConfigError)
      message = (err as Error).message
    }
    expect(message).toMatch(/chmod 600/)
    expect(message).toContain('644')
    expect(message).not.toContain('key_SECRET')
  })

  it('rejects a group-readable file (640) too', () => {
    expect(() => readSecretFile(tmpEnv('A=1\n', 0o640))).toThrow(/chmod 600/)
  })

  it('reads a mode 600 file and returns null for a missing one', () => {
    const file = tmpEnv('A=1\n', 0o600)
    expect(readSecretFile(file)).toBe('A=1\n')
    expect(readSecretFile(join(tmpdir(), 'espocrm-does-not-exist.env'))).toBeNull()
  })

  it('loadEspoConfig refuses a loose file and loads the same file once it is 600', () => {
    const file = tmpEnv(`ESPOCRM_BASE_URL=${BASE}\nESPOCRM_API_KEY=key_SECRET_abcdef0123\n`, 0o644)
    expect(() => loadEspoConfig({ identity: 'apikey', env: {}, filePath: file })).toThrow(/chmod 600/)
    chmodSync(file, 0o600)
    expect(loadEspoConfig({ identity: 'apikey', env: {}, filePath: file })).toMatchObject({ apiKey: 'key_SECRET_abcdef0123' })
  })

  it('loadSmtpPassword refuses a loose file', () => {
    const file = tmpEnv('RESEND_SMTP_PASSWORD=re_abc123\n', 0o664)
    expect(() => loadSmtpPassword({ filePath: file })).toThrow(/chmod 600/)
    chmodSync(file, 0o600)
    expect(loadSmtpPassword({ filePath: file })).toBe('re_abc123')
  })

  it('does not check the mode when the credentials come from the environment', () => {
    const file = tmpEnv('A=1\n', 0o644)
    expect(
      loadEspoConfig({ identity: 'apikey', env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_API_KEY: 'key_SECRET_abcdef0123' }, filePath: file }),
    ).toMatchObject({ apiKey: 'key_SECRET_abcdef0123' })
  })
})

describe('response body failures (IN-04)', () => {
  const apiKeyClient = (fetchImpl: any) =>
    createEspoClient({
      config: loadEspoConfig({ identity: 'apikey', env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_API_KEY: 'key_SECRET_abcdef0123' } }),
      fetchImpl,
    })

  const failingBody = (name: string, message = 'boom') => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: () => Promise.reject(Object.assign(new Error(message), { name })),
  })

  it('maps a timeout while reading the body to a status-0 EspoApiError', async () => {
    const client = apiKeyClient(async () => failingBody('TimeoutError'))
    const err = await client.request('GET', '/Contact').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(EspoApiError)
    expect(err).toMatchObject({ status: 0, method: 'GET', apiPath: '/Contact' })
    expect((err as Error).message).toMatch(/timed out/)
  })

  it('maps an aborted or reset body read to a status-0 EspoApiError and redacts the key', async () => {
    const client = apiKeyClient(async () => failingBody('AbortError'))
    expect(await client.request('GET', '/Contact').catch((e: unknown) => e)).toMatchObject({ status: 0 })

    const leaky = apiKeyClient(async () => failingBody('Error', 'socket closed key_SECRET_abcdef0123'))
    const err = (await leaky.request('GET', '/Contact').catch((e: unknown) => e)) as Error
    expect(err).toBeInstanceOf(EspoApiError)
    expect(err.message).not.toContain('key_SECRET_abcdef0123')
  })

  it('does not poison the client: a later request still goes out', async () => {
    let calls = 0
    const client = apiKeyClient(async () => {
      calls++
      if (calls === 1) return failingBody('TimeoutError')
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => '{"total":0,"list":[]}' }
    })
    await expect(client.request('GET', '/Contact')).rejects.toBeInstanceOf(EspoApiError)
    expect(await client.request('GET', '/Contact')).toEqual({ total: 0, list: [] })
  })
})

describe('addSecret (IN-04)', () => {
  it('masks a registered secret in later API error bodies', async () => {
    const client = createEspoClient({
      config: loadEspoConfig({ identity: 'apikey', env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_API_KEY: 'key_SECRET_abcdef0123' } }),
      fetchImpl: async () => new Response('rejected smtp_SECRET_0123456789', { status: 400 }),
    })
    const before = (await client.request('POST', '/InboundEmail', {}).catch((e: unknown) => e)) as Error
    expect(before.message).toContain('smtp_SECRET_0123456789')

    client.addSecret('smtp_SECRET_0123456789')
    const after = (await client.request('POST', '/InboundEmail', {}).catch((e: unknown) => e)) as Error
    expect(after.message).not.toContain('smtp_SECRET_0123456789')
    expect(after.message).toContain('[redacted]')
  })
})
