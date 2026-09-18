/**
 * Phase 72, Plan 03 — QA-report generator: completeness diff, no-English-
 * leakage heuristic, and the `--check` CI/local guard (D-09, TR-02). No
 * test in this file calls the real Anthropic API.
 */
import { describe, expect, it } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadGlossary } from '../scripts/lib/i18n-glossary.mjs'
import { checkCompleteness, checkNoEnglishLeakage, generateQaReport } from '../scripts/lib/i18n-qa-report.mjs'
import { checkPipelineState } from '../scripts/i18n-translate.mjs'

const glossary = loadGlossary()

describe('checkCompleteness', () => {
  it('reports a key missing from the locale catalog', () => {
    const en = { Nav: { signIn: 'Sign in', bookNow: 'Book now' } }
    const ru = { Nav: { signIn: 'Войти' } }
    const result = checkCompleteness(en, ru)
    expect(result.missing).toEqual(['Nav.bookNow'])
    expect(result.extra).toEqual([])
  })

  it('reports zero missing for a structurally complete locale catalog', () => {
    const en = { Nav: { signIn: 'Sign in', bookNow: 'Book now' } }
    const ru = { Nav: { signIn: 'Войти', bookNow: 'Забронировать' } }
    const result = checkCompleteness(en, ru)
    expect(result.missing).toEqual([])
  })

  it('reports a key present in the locale but absent from EN as extra', () => {
    const en = { Nav: { signIn: 'Sign in' } }
    const ru = { Nav: { signIn: 'Войти', stale: 'Устаревшее' } }
    const result = checkCompleteness(en, ru)
    expect(result.extra).toEqual(['Nav.stale'])
  })
})

describe('checkNoEnglishLeakage', () => {
  it('flags a processed unit whose translated value is byte-identical to its EN source', () => {
    const accepted = [{ unitKey: 'messages/en.json::Nav.bookNow', locale: 'ru', enValue: 'Book now', trValue: 'Book now' }]
    const leaks = checkNoEnglishLeakage(accepted, glossary)
    expect(leaks).toHaveLength(1)
    expect(leaks[0].unitKey).toBe('messages/en.json::Nav.bookNow')
  })

  it('does NOT flag a DNT-only unit whose value is identical across locales', () => {
    const accepted = [{ unitKey: 'messages/en.json::Footer.brand', locale: 'ru', enValue: 'Prestigo', trValue: 'Prestigo' }]
    expect(checkNoEnglishLeakage(accepted, glossary)).toEqual([])
  })

  it('does not flag a genuinely different translation', () => {
    const accepted = [{ unitKey: 'messages/en.json::Nav.bookNow', locale: 'ru', enValue: 'Book now', trValue: 'Забронировать' }]
    expect(checkNoEnglishLeakage(accepted, glossary)).toEqual([])
  })

  // Phase 73 (TR-02) — ar/hi/zh fixture cases, duplicating the ru shape
  // above per locale. Wave 0 gap flagged in 73-RESEARCH.md Validation
  // Architecture: this file previously exercised checkNoEnglishLeakage
  // only against ru fixtures.
  it('flags a processed unit whose translated value is byte-identical to its EN source (ar)', () => {
    const accepted = [{ unitKey: 'messages/en.json::Nav.bookNow', locale: 'ar', enValue: 'Book now', trValue: 'Book now' }]
    const leaks = checkNoEnglishLeakage(accepted, glossary)
    expect(leaks).toHaveLength(1)
    expect(leaks[0].unitKey).toBe('messages/en.json::Nav.bookNow')
  })

  it('does not flag a genuinely different translation (ar)', () => {
    const accepted = [{ unitKey: 'messages/en.json::Nav.bookNow', locale: 'ar', enValue: 'Book now', trValue: 'احجز الآن' }]
    expect(checkNoEnglishLeakage(accepted, glossary)).toEqual([])
  })

  it('does NOT flag a DNT-only unit whose value is identical across locales (ar)', () => {
    const accepted = [{ unitKey: 'messages/en.json::Footer.brand', locale: 'ar', enValue: 'Prestigo', trValue: 'Prestigo' }]
    expect(checkNoEnglishLeakage(accepted, glossary)).toEqual([])
  })

  it('flags a processed unit whose translated value is byte-identical to its EN source (hi)', () => {
    const accepted = [{ unitKey: 'messages/en.json::Nav.bookNow', locale: 'hi', enValue: 'Book now', trValue: 'Book now' }]
    const leaks = checkNoEnglishLeakage(accepted, glossary)
    expect(leaks).toHaveLength(1)
    expect(leaks[0].unitKey).toBe('messages/en.json::Nav.bookNow')
  })

  it('does not flag a genuinely different translation (hi)', () => {
    const accepted = [{ unitKey: 'messages/en.json::Nav.bookNow', locale: 'hi', enValue: 'Book now', trValue: 'अभी बुक करें' }]
    expect(checkNoEnglishLeakage(accepted, glossary)).toEqual([])
  })

  it('does NOT flag a DNT-only unit whose value is identical across locales (hi)', () => {
    const accepted = [{ unitKey: 'messages/en.json::Footer.brand', locale: 'hi', enValue: 'Prestigo', trValue: 'Prestigo' }]
    expect(checkNoEnglishLeakage(accepted, glossary)).toEqual([])
  })

  it('flags a processed unit whose translated value is byte-identical to its EN source (zh)', () => {
    const accepted = [{ unitKey: 'messages/en.json::Nav.bookNow', locale: 'zh', enValue: 'Book now', trValue: 'Book now' }]
    const leaks = checkNoEnglishLeakage(accepted, glossary)
    expect(leaks).toHaveLength(1)
    expect(leaks[0].unitKey).toBe('messages/en.json::Nav.bookNow')
  })

  it('does not flag a genuinely different translation (zh)', () => {
    const accepted = [{ unitKey: 'messages/en.json::Nav.bookNow', locale: 'zh', enValue: 'Book now', trValue: '立即预订' }]
    expect(checkNoEnglishLeakage(accepted, glossary)).toEqual([])
  })

  it('does NOT flag a DNT-only unit whose value is identical across locales (zh)', () => {
    const accepted = [{ unitKey: 'messages/en.json::Footer.brand', locale: 'zh', enValue: 'Prestigo', trValue: 'Prestigo' }]
    expect(checkNoEnglishLeakage(accepted, glossary)).toEqual([])
  })
})

describe('generateQaReport', () => {
  it('writes a QA report with per-locale completeness, no-leakage, DNT, MDX-structure, and sample-diff sections', () => {
    const dir = mkdtempSync(join(tmpdir(), 'i18n-qa-report-'))
    try {
      const outputPath = join(dir, 'QA-REPORT.md')
      const results = {
        flagged: [
          { unitKey: 'messages/en.json::Booking.foo', locale: 'ru', missing: ['{amount}'], unbalanced: [], missingPluralCategories: [] },
          { unitKey: 'content/blog/en/sample-post.mdx::body', locale: 'ru', reason: 'mdx_structure_failed' },
        ],
        accepted: [
          { unitKey: 'messages/en.json::Nav.bookNow', locale: 'ru', enValue: 'Book now', trValue: 'Забронировать' },
          { unitKey: 'messages/en.json::Nav.leak', locale: 'ru', enValue: 'Leaked string', trValue: 'Leaked string' },
        ],
      }
      const completenessByLocale = { ru: { missing: ['RoutePage.foo'], extra: [] } }
      generateQaReport({ locales: ['ru'], results, glossary, completenessByLocale, outputPath })

      const content = readFileSync(outputPath, 'utf8')
      expect(content).toContain('Key Completeness')
      expect(content).toContain('RoutePage.foo')
      expect(content).toContain('No-English-Leakage')
      expect(content).toContain('messages/en.json::Nav.leak')
      // A real (non-identical) translation must not appear in the leakage section.
      const leakageSection = content.slice(content.indexOf('No-English-Leakage'), content.indexOf('DNT / ICU-Variable'))
      expect(leakageSection).not.toContain('messages/en.json::Nav.bookNow')
      expect(content).toContain('DNT / ICU-Variable / Plural-Category')
      expect(content).toContain('messages/en.json::Booking.foo')
      expect(content).toContain('MDX Structural Invariants')
      expect(content).toContain('content/blog/en/sample-post.mdx::body')
      expect(content).toContain('Sampled Diff')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('checkPipelineState (--check mode, no API calls)', () => {
  it('passes on a complete fixture corpus (git check skipped for --fixtures runs)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'i18n-check-'))
    try {
      mkdirSync(join(dir, 'messages'), { recursive: true })
      writeFileSync(join(dir, 'messages/en.json'), JSON.stringify({ Nav: { signIn: 'Sign in' } }), 'utf8')
      writeFileSync(join(dir, 'messages/ru.json'), JSON.stringify({ Nav: { signIn: 'Войти' } }), 'utf8')
      const result = checkPipelineState({ rootDir: dir, skipGitCheck: true, locales: ['ru'] })
      expect(result.ok).toBe(true)
      expect(result.failures).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when a locale catalog is missing a key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'i18n-check-'))
    try {
      mkdirSync(join(dir, 'messages'), { recursive: true })
      writeFileSync(join(dir, 'messages/en.json'), JSON.stringify({ Nav: { signIn: 'Sign in', bookNow: 'Book now' } }), 'utf8')
      writeFileSync(join(dir, 'messages/ru.json'), JSON.stringify({ Nav: { signIn: 'Войти' } }), 'utf8')
      const result = checkPipelineState({ rootDir: dir, skipGitCheck: true, locales: ['ru'] })
      expect(result.ok).toBe(false)
      expect(result.failures.some((f) => f.includes('Nav.bookNow'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when EN sources are not clean per `git diff` (EN-mutation guard)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'i18n-check-git-'))
    try {
      execSync('git init -q', { cwd: dir })
      execSync('git config user.email test@example.com', { cwd: dir })
      execSync('git config user.name test', { cwd: dir })
      mkdirSync(join(dir, 'messages'), { recursive: true })
      writeFileSync(join(dir, 'messages/en.json'), JSON.stringify({ Nav: { signIn: 'Sign in' } }), 'utf8')
      writeFileSync(join(dir, 'messages/ru.json'), JSON.stringify({ Nav: { signIn: 'Войти' } }), 'utf8')
      execSync('git add messages', { cwd: dir })
      execSync('git commit -q -m init', { cwd: dir })

      // Mutate EN after commit — simulates the pipeline accidentally touching EN.
      writeFileSync(join(dir, 'messages/en.json'), JSON.stringify({ Nav: { signIn: 'Sign in MUTATED' } }), 'utf8')

      const result = checkPipelineState({ rootDir: dir, skipGitCheck: false, locales: ['ru'] })
      expect(result.ok).toBe(false)
      expect(result.failures.some((f) => f.toLowerCase().includes('git diff'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('passes when EN sources are clean per `git diff`', () => {
    const dir = mkdtempSync(join(tmpdir(), 'i18n-check-git-clean-'))
    try {
      execSync('git init -q', { cwd: dir })
      execSync('git config user.email test@example.com', { cwd: dir })
      execSync('git config user.name test', { cwd: dir })
      mkdirSync(join(dir, 'messages'), { recursive: true })
      writeFileSync(join(dir, 'messages/en.json'), JSON.stringify({ Nav: { signIn: 'Sign in' } }), 'utf8')
      writeFileSync(join(dir, 'messages/ru.json'), JSON.stringify({ Nav: { signIn: 'Войти' } }), 'utf8')
      execSync('git add messages', { cwd: dir })
      execSync('git commit -q -m init', { cwd: dir })

      const result = checkPipelineState({ rootDir: dir, skipGitCheck: false, locales: ['ru'] })
      expect(result.ok).toBe(true)
      expect(result.failures).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
