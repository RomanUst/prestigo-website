// @vitest-environment node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Phase 92, plan 92-05 (D-14): the PDF render packages are pinned exactly and the fonts are the files that were
// reviewed. A later bump, a range or a swapped font file fails here instead of passing silently.
const root = process.cwd()
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
  packages: Record<string, { version?: string; integrity?: string }>
}
const PDF_PACKAGES = ['puppeteer-core', '@sparticuz/chromium-min'] as const
const fontsDir = join(root, 'lib', 'quotes', 'pdf-fonts')

describe('PDF render packages are pinned', () => {
  it.each(PDF_PACKAGES)('%s has an exact version in package.json (no ^, ~, x or range)', (name) => {
    expect(pkg.dependencies[name]).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it.each(PDF_PACKAGES)('%s is locked at that version with a sha512 integrity', (name) => {
    const entry = lock.packages[`node_modules/${name}`]
    expect(entry?.version).toBe(pkg.dependencies[name])
    expect(entry?.integrity?.startsWith('sha512-')).toBe(true)
  })

  it('the app keeps its own zod: the PDF packages must not move the version the request schemas run on', () => {
    // zod 4.6 parses a missing z.unknown() key differently (the consent check answered 400 instead of 422).
    expect(pkg.dependencies.zod).toMatch(/^\d+\.\d+\.\d+$/)
    expect(lock.packages['node_modules/zod']?.version).toBe(pkg.dependencies.zod)
  })
})

describe('PDF fonts match their recorded hashes', () => {
  const lines = readFileSync(join(fontsDir, 'SOURCES.txt'), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => line.split('|').map((part) => part.trim()))

  it('SOURCES.txt lists the six font files, each from a pinned google/fonts commit', () => {
    expect(lines.map((parts) => parts[0]).sort()).toEqual(
      ['Fraunces.ttf', 'Inter.ttf', 'NotoSansArabic.ttf', 'NotoSansDevanagari.ttf', 'NotoSansSC.ttf', 'NotoSansTC.ttf'],
    )
    for (const parts of lines) {
      expect(parts[1]).toMatch(/^https:\/\/raw\.githubusercontent\.com\/google\/fonts\/[0-9a-f]{40}\/ofl\//)
    }
  })

  it.each(lines)('%s exists with the recorded size and sha256', (file, _url, bytes, hash) => {
    const path = join(fontsDir, file)
    expect(existsSync(path), `${file} is missing`).toBe(true)
    const data = readFileSync(path)
    expect(data.length, `${file} size`).toBe(Number(bytes))
    expect(createHash('sha256').update(data).digest('hex'), `${file} sha256`).toBe(hash.replace(/^sha256\s+/, ''))
  })

  it('the licence file is present', () => {
    expect(readFileSync(join(fontsDir, 'OFL.txt'), 'utf8')).toContain('SIL OPEN FONT LICENSE')
  })
})
