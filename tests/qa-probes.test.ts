/**
 * Phase 77 review fixes — behaviour of the python QA probes' pure helpers
 * (no network, no browser). Skipped when python3 is unavailable.
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const QA_DIR = join(process.cwd(), 'scripts/qa')
const HAS_PYTHON = spawnSync('python3', ['--version']).status === 0

function py(code: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(QA_DIR)})\n${code}`], {
    encoding: 'utf8',
  })
  return { status: r.status, stdout: r.stdout.trim(), stderr: r.stderr.trim() }
}

describe.skipIf(!HAS_PYTHON)('csp_regression --expect-added (WR-03)', () => {
  const STATIC = "default-src 'self'; script-src 'unsafe-inline' https:; frame-src https://js.stripe.com"
  const STATIC_NEW =
    "default-src 'self'; script-src 'unsafe-inline' https: https://chat.example.com; frame-src https://js.stripe.com https://chat.example.com"
  const NONCE = "default-src 'self'; script-src 'nonce-X' 'strict-dynamic'; frame-src https://js.stripe.com"

  function findings(route: string, base: string, cur: string, tokens = ['https://chat.example.com']): string[] {
    const r = py(
      `import csp_regression as c, json\nprint(json.dumps(c.expected_token_findings(${JSON.stringify(route)}, ${JSON.stringify(base)}, ${JSON.stringify(cur)}, ${JSON.stringify(tokens)})))`,
    )
    expect(r.status, r.stderr).toBe(0)
    return JSON.parse(r.stdout)
  }

  it('accepts the token on a static-policy route and its absence on a nonce route', () => {
    expect(findings('/', STATIC, STATIC_NEW)).toEqual([])
    expect(findings('/admin', NONCE, NONCE)).toEqual([])
  })

  it('flags a static-policy route that lacks every expected token', () => {
    expect(findings('/', STATIC, STATIC)).toEqual([expect.stringContaining('none of the expected tokens')])
  })

  it('flags the chat origin leaking into a nonce-CSP route even though stripping it restores the baseline', () => {
    const leaked = NONCE.replace('frame-src https://js.stripe.com', 'frame-src https://js.stripe.com https://chat.example.com')
    const out = findings('/admin', NONCE, leaked)
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('nonce-policy route must not carry')
  })

  it('flags an expected token in default-src', () => {
    const wide = STATIC_NEW.replace("default-src 'self'", "default-src 'self' https://chat.example.com")
    expect(findings('/', STATIC, wide).some((f) => f.includes('default-src'))).toBe(true)
  })

  it('--help keeps working', () => {
    const r = spawnSync('python3', [join(QA_DIR, 'csp_regression.py'), '--help'], { encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('--expect-added')
  })
})

describe.skipIf(!HAS_PYTHON)('chat_widget_probe launch gates fail loudly (WR-07)', () => {
  function run(code: string) {
    const r = py(`import chat_widget_probe as p, json\n${code}`)
    expect(r.status, r.stderr).toBe(0)
    return r.stdout
  }

  it('--overlap exits 3 when no page had a launcher, 1 on overlap findings, 0 when clean', () => {
    expect(run('print(p.overlap_exit_code(2, 0, 0))')).toBe('3')
    expect(run('print(p.overlap_exit_code(2, 2, 1))')).toBe('1')
    expect(run('print(p.overlap_exit_code(2, 1, 0))')).toBe('0')
  })

  it('--cwv-compare reports every page that produced no launcher_inp_ms', () => {
    const out = run(
      `print(json.dumps(p.missing_launcher_findings({'/': {'launcher_inp_ms': 90}, '/book': {'lcp_ms': 1}}, ['/', '/book', '/x'])))`,
    )
    const findings = JSON.parse(out) as string[]
    expect(findings).toHaveLength(2)
    expect(findings[0]).toContain('/book')
    expect(findings[1]).toContain('/x')
  })

  it('--help keeps working', () => {
    const r = spawnSync('python3', [join(QA_DIR, 'chat_widget_probe.py'), '--help'], { encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('--overlap')
  })
})
