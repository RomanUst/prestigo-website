/**
 * Phase 72, Plan 03 — MDX-aware blog translation (D-10, TDD). Fixture-based;
 * no test in this file calls the real Anthropic API.
 */
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { loadGlossary } from '../scripts/lib/i18n-glossary.mjs'
import {
  buildTranslatedMdx,
  enumerateBlogEnSources,
  flattenMdxSource,
  translateMdxFile,
  verifyMdxStructure,
} from '../scripts/lib/i18n-mdx.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_MDX_PATH = join(__dirname, 'fixtures/i18n/content/blog/en/sample-post.mdx')
const SOURCE_KEY = 'content/blog/en/sample-post.mdx'

const glossary = loadGlossary()

function mockBatchTranslator() {
  return vi.fn(async (units: { unitKey: string; value: unknown }[], ctx: { locale: string }) =>
    units.map((u) => `[${ctx.locale.toUpperCase()}] ${u.value}`)
  )
}

function mockBodyTranslator() {
  return vi.fn(async (body: string, ctx: { locale: string }) => `[${ctx.locale.toUpperCase()}] ${body}`)
}

describe('flattenMdxSource', () => {
  it('produces a single body unit and two frontmatter prose units, manifest-compatible with 72-01', () => {
    const enRaw = readFileSync(FIXTURE_MDX_PATH, 'utf8')
    const units = flattenMdxSource(enRaw, SOURCE_KEY)
    expect(units.map((u) => u.unitKey)).toEqual([
      `${SOURCE_KEY}::frontmatter.title`,
      `${SOURCE_KEY}::frontmatter.description`,
      `${SOURCE_KEY}::body`,
    ])
  })
})

describe('enumerateBlogEnSources', () => {
  it('enumerates every .mdx file under content/blog/en/, keyed and target-pathed per locale', () => {
    const rootDir = join(__dirname, 'fixtures/i18n')
    const sources = enumerateBlogEnSources(rootDir)
    const sample = sources.find((s) => s.sourceKey === SOURCE_KEY)
    expect(sample).toBeDefined()
    expect(sample!.surfaceType).toBe('blog')
    expect(sample!.targetPathFor('ru')).toBe(join(rootDir, 'content/blog/ru/sample-post.mdx'))
  })
})

describe('verifyMdxStructure', () => {
  it('passes fencesMatch/linkCountMatch/urlsPreserved/headingCountMatch for a faithful translation', () => {
    const { content } = matter(readFileSync(FIXTURE_MDX_PATH, 'utf8'))
    const faithfulTranslation = `[RU] ${content}`
    const result = verifyMdxStructure(content, faithfulTranslation)
    expect(result).toEqual({
      fencesMatch: true,
      linkCountMatch: true,
      urlsPreserved: true,
      headingCountMatch: true,
      ok: true,
    })
  })

  it('fails (urlsPreserved: false) when a translation drops a link URL', () => {
    const { content } = matter(readFileSync(FIXTURE_MDX_PATH, 'utf8'))
    const broken = content.replace('https://rideprestigo.com/fleet', 'https://rideprestigo.com/broken')
    const result = verifyMdxStructure(content, broken)
    expect(result.urlsPreserved).toBe(false)
    expect(result.ok).toBe(false)
  })

  it('fails (fencesMatch: false) when a translation drops a code fence', () => {
    const { content } = matter(readFileSync(FIXTURE_MDX_PATH, 'utf8'))
    const broken = content.replace(/```[\s\S]*?```/, 'code block content')
    const result = verifyMdxStructure(content, broken)
    expect(result.fencesMatch).toBe(false)
    expect(result.ok).toBe(false)
  })
})

describe('translateMdxFile + buildTranslatedMdx — full round-trip', () => {
  it('translates title/description/body while preserving non-prose frontmatter byte-for-byte, and verifies structure', async () => {
    const enRaw = readFileSync(FIXTURE_MDX_PATH, 'utf8')
    const manifest = { version: 1, units: {} }
    const translateBatch = mockBatchTranslator()
    const translateBody = mockBodyTranslator()

    const result = await translateMdxFile({
      enRaw,
      sourceKey: SOURCE_KEY,
      manifest,
      locale: 'ru',
      glossary,
      translateBatch,
      translateBody,
    })

    expect(result.failedUnitKeys).toEqual([])
    expect(result.structure?.ok).toBe(true)

    const output = buildTranslatedMdx({
      enData: result.enData,
      enBody: result.enBody,
      sourceKey: SOURCE_KEY,
      valuesByUnitKey: result.translatedByUnitKey,
    })

    const { data, content } = matter(output)
    const { data: enData } = matter(enRaw)

    expect(data.title).toBe(`[RU] ${enData.title}`)
    expect(data.description).toBe(`[RU] ${enData.description}`)
    expect(content).toBe(`[RU] ${result.enBody}`)

    // Non-prose frontmatter fields copied byte-for-byte (lib/blog.ts:53 required set).
    expect(data.date).toBe(enData.date)
    expect(data.dateModified).toBe(enData.dateModified)
    expect(data.coverImage).toBe(enData.coverImage)
    expect(data.category).toBe(enData.category)
    expect(data.author).toBe(enData.author)

    // Frontmatter key order mirrors the EN source exactly.
    expect(Object.keys(data)).toEqual(Object.keys(enData))
  })

  it('flags the body unit (not a silent write) when translation drops MDX structure', async () => {
    const enRaw = readFileSync(FIXTURE_MDX_PATH, 'utf8')
    const manifest = { version: 1, units: {} }
    const translateBatch = mockBatchTranslator()
    const translateBody = vi.fn(async (body: string) =>
      body.replace('https://rideprestigo.com/fleet', 'https://rideprestigo.com/broken')
    )

    const result = await translateMdxFile({
      enRaw,
      sourceKey: SOURCE_KEY,
      manifest,
      locale: 'ru',
      glossary,
      translateBatch,
      translateBody,
    })

    expect(result.structure?.ok).toBe(false)
    expect(result.structure?.urlsPreserved).toBe(false)
    expect(result.failedUnitKeys).toContain(`${SOURCE_KEY}::body`)
  })

  it('skips a hash-matched unit (D-05): only the changed unit is sent to the translator', async () => {
    const enRaw = readFileSync(FIXTURE_MDX_PATH, 'utf8')
    const { data } = matter(enRaw)
    const { sha256 } = await import('../scripts/lib/i18n-manifest.mjs')
    const manifest = {
      version: 1,
      units: {
        [`${SOURCE_KEY}::frontmatter.title`]: { enHash: sha256(data.title), lastTranslatedAt: '2026-01-01T00:00:00Z' },
        [`${SOURCE_KEY}::frontmatter.description`]: {
          enHash: sha256(data.description),
          lastTranslatedAt: '2026-01-01T00:00:00Z',
        },
      },
    }
    const translateBatch = mockBatchTranslator()
    const translateBody = mockBodyTranslator()

    const result = await translateMdxFile({
      enRaw,
      sourceKey: SOURCE_KEY,
      manifest,
      locale: 'ru',
      glossary,
      translateBatch,
      translateBody,
    })

    expect(translateBatch).not.toHaveBeenCalled()
    expect(translateBody).toHaveBeenCalledTimes(1)
    expect(Object.keys(result.translatedByUnitKey)).toEqual([`${SOURCE_KEY}::body`])
  })
})

describe('dry-run pipeline over the fixture — writes content/blog/<locale>/<slug>.mdx with identical frontmatter key order', () => {
  it('runFullTranslation writes a locale MDX file with the same frontmatter keys, same order, as the EN source', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'i18n-blog-dryrun-'))
    try {
      const { mkdirSync, copyFileSync } = await import('node:fs')
      mkdirSync(join(dir, 'content/blog/en'), { recursive: true })
      copyFileSync(FIXTURE_MDX_PATH, join(dir, 'content/blog/en/sample-post.mdx'))

      const {
        createDryRunBatchTranslator,
        createDryRunMdxBodyTranslator,
        createDryRunWholeFileTranslator,
        runFullTranslation,
      } = await import('../scripts/i18n-translate.mjs')

      const manifestPath = join(dir, 'translation-manifest.json')
      await runFullTranslation({
        rootDir: dir,
        locales: ['ru'],
        glossary,
        manifestPath,
        translateBatch: createDryRunBatchTranslator(),
        translateFile: createDryRunWholeFileTranslator(),
        translateMdxBody: createDryRunMdxBodyTranslator(),
      })

      const outputPath = join(dir, 'content/blog/ru/sample-post.mdx')
      const enRaw = readFileSync(FIXTURE_MDX_PATH, 'utf8')
      const output = readFileSync(outputPath, 'utf8')
      const { data: enData } = matter(enRaw)
      const { data: trData } = matter(output)

      expect(Object.keys(trData)).toEqual(Object.keys(enData))
      expect(trData.title).toBe(`[RU] ${enData.title}`)
      expect(trData.coverImage).toBe(enData.coverImage)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
