#!/usr/bin/env node
/**
 * AI translation pipeline (Phase 72).
 *
 * Production trigger (from Plan 72-04 onward): CI, on a push to `main`
 * that touches `messages/en.json` or `content/{routes,pages,blog}/en/**`
 * (D-02).
 *
 * Plan 72-01 proved the mechanism end-to-end on a single catalog key
 * (Nav.signIn, ru) — the manifest + glossary + write + idempotency
 * architecture (see `translateSource()` below, kept for that tracer's
 * committed test coverage). Plan 72-02 (this revision) expands the CLI's
 * `main()` to the FULL surface: every EN catalog + content-JSON source
 * (`messages/en.json`, `content/routes/en/*.json`,
 * `content/pages/en/**\/*.json` incl. the nested `services/` subdirectory),
 * for every target locale (ru/es/fr), using scripts/lib/i18n-surfaces.mjs's
 * per-surface batching (short-string batch for the catalog, whole-file for
 * route/page prose) and scripts/lib/i18n-verify.mjs's fail-closed DNT/ICU/
 * tag/plural check on every accepted translation.
 *
 * Cross-locale manifest correctness (Rule 1 fix, found while wiring this
 * plan): a unit's manifest entry is advanced ONLY after it has been
 * successfully translated (or was empty/verbatim-copied) in EVERY
 * requested locale this run — never after just the first locale. The
 * manifest's `enHash` doesn't carry a locale, so writing it after a single
 * locale's success would make every other locale's pass see the unit as
 * "already done" and silently fall back to the untranslated EN value.
 *
 * Plan 72-03 adds the third surface: `content/blog/en/*.mdx` (D-10),
 * MDX-aware — frontmatter `title`/`description` translated as short
 * strings, `date`/`dateModified`/`coverImage`/`category`/`author` copied
 * byte-for-byte, and the markdown body translated whole-document with a
 * post-hoc structural check (scripts/lib/i18n-mdx.mjs::verifyMdxStructure)
 * that flags — rather than silently ships — a translation that drops a
 * link URL or a code fence.
 *
 * Usage (local dry-run, no ANTHROPIC_API_KEY required, deterministic mock
 * translator, runs the whole mechanism against a fixture corpus):
 *   node scripts/i18n-translate.mjs --dry-run --fixtures tests/fixtures/i18n
 *
 * Usage (real run, ANTHROPIC_API_KEY from .env.local or CI repo secret,
 * walks the real repo's full catalog + content-JSON + blog surface, then
 * writes i18n/QA-REPORT.md — D-09):
 *   node scripts/i18n-translate.mjs
 *
 * Usage (--check mode, Plan 72-03 Task 3 — NO API calls, verifies
 * ru/es/fr catalog completeness vs messages/en.json and that EN sources
 * are unmutated per `git diff`; used by CI and local pre-merge checks):
 *   node scripts/i18n-translate.mjs --check
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname } from 'node:path'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import matter from 'gray-matter'
import { z } from 'zod'
import { buildSystemPrompt, loadGlossary, PHASE_72_LOCALES } from './lib/i18n-glossary.mjs'
import {
  buildOutputTree,
  flattenEnSource,
  isEmptyValue,
  loadManifest,
  sha256,
  unitsNeedingTranslation,
  writeManifest,
} from './lib/i18n-manifest.mjs'
import {
  buildTranslatedMdx,
  enumerateBlogEnSources,
  flattenMdxSource,
  translateMdxFile,
} from './lib/i18n-mdx.mjs'
import { checkCompleteness, generateQaReport } from './lib/i18n-qa-report.mjs'
import { enumerateEnSources, readEnSource, translateCatalog, translateContentJson } from './lib/i18n-surfaces.mjs'
import { verifyDntPreserved, verifyPluralCategories } from './lib/i18n-verify.mjs'

/**
 * Plan 72-01's tracer scope: translate exactly this one unit when
 * `translateSource()` is invoked without an `only` filter override. Kept
 * for the Plan 01 tracer's committed test coverage — the full-catalog path
 * (`runFullTranslation()` below) does not use `translateSource()`.
 */
export const TRACER_UNIT_KEY = 'messages/en.json::Nav.signIn'

/** Parse .env.local manually for local dry-runs (no dotenv dependency needed). */
function loadEnvLocal() {
  try {
    const envFile = readFileSync('.env.local', 'utf8')
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {
    /* .env.local not found, rely on shell env */
  }
}

/**
 * Default translator: a real @anthropic-ai/sdk client calling claude-opus-5
 * (D-01) with the glossary-governed, cached system prompt (D-06/D-07,
 * 72-COVERAGE.md). Never used by the committed test suite — tests inject
 * a deterministic mock instead. Kept for the Plan 01 tracer's single-unit
 * path (translateSource()).
 */
export function createAnthropicTranslator(glossary) {
  const client = new Anthropic()
  return async function anthropicTranslate(unit, { locale }) {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: buildSystemPrompt(glossary, locale),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Translate the following text to ${locale}. Preserve ICU variables, rich-text tags, and any do-not-translate terms EXACTLY as instructed in the system prompt. Return ONLY the translated text, nothing else.\n\n${unit.value}`,
        },
      ],
    })
    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock) {
      throw new Error(`i18n-translate: Anthropic response for "${unit.unitKey}" contained no text block`)
    }
    return textBlock.text.trim()
  }
}

/**
 * Deterministic mock translator used by the CLI's `--dry-run` mode — lets a
 * developer exercise the whole read/select/write/idempotency mechanism
 * against a fixture corpus with zero API cost and no ANTHROPIC_API_KEY.
 * Kept for the Plan 01 tracer's single-unit path (translateSource()).
 */
export function createDryRunTranslator() {
  return async function dryRunTranslate(unit, { locale }) {
    return `[${locale.toUpperCase()}] ${unit.value}`
  }
}

/**
 * Real translator for the short-string batch strategy (72-RESEARCH.md
 * Pattern 3.1 / 72-COVERAGE.md structured outputs): one call per batch of
 * units, returning a validated JSON array of translated strings, same
 * length and order as the input — via `client.messages.parse()` +
 * `output_config.format` (replaces assistant prefill, which returns a 400
 * on Opus 5).
 */
export function createAnthropicBatchTranslator(glossary) {
  const client = new Anthropic()
  return async function anthropicBatchTranslate(units, { locale }) {
    const schema = z.object({
      translations: z.array(z.string()).length(units.length),
    })
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 8192,
      system: [
        { type: 'text', text: buildSystemPrompt(glossary, locale), cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: `Translate each of the following ${units.length} numbered EN strings to ${locale}. Return one translation per input, in the same order. Preserve ICU variables, rich-text tags, and any do-not-translate terms EXACTLY as instructed in the system prompt.\n\n${units
            .map((u, i) => `${i + 1}. ${typeof u.value === 'string' ? u.value : JSON.stringify(u.value)}`)
            .join('\n')}`,
        },
      ],
      output_config: { format: zodOutputFormat(schema) },
    })
    if (!response.parsed_output) {
      throw new Error(`i18n-translate: batch translation for locale=${locale} returned no parsed_output`)
    }
    return response.parsed_output.translations
  }
}

/**
 * Real translator for the whole-file strategy (72-RESEARCH.md Pattern 3.2):
 * one streamed call per file per locale so Claude sees the full page for
 * cross-field tone/terminology consistency, and so a large route/page file
 * doesn't hit non-streaming max_tokens HTTP timeouts (72-COVERAGE.md).
 */
export function createAnthropicWholeFileTranslator(glossary) {
  const client = new Anthropic()
  return async function anthropicWholeFileTranslate(enObj, { locale, sourceKey }) {
    const stream = client.messages.stream({
      model: 'claude-opus-5',
      max_tokens: 64000,
      system: [
        { type: 'text', text: buildSystemPrompt(glossary, locale), cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: `Translate every string value in the following JSON document to ${locale}. Keep every key, nesting, and array length byte-for-byte identical — translate ONLY the string values, never the keys or the document structure. Preserve ICU variables, rich-text tags, and any do-not-translate terms EXACTLY as instructed in the system prompt. Geographic place names use the locale's standard exonym per the system prompt's place-names policy. Return ONLY the translated JSON document — no markdown code fence, no commentary.\n\nSource file: ${sourceKey}\n\n${JSON.stringify(enObj, null, 2)}`,
        },
      ],
    })
    const finalMessage = await stream.finalMessage()
    const textBlock = finalMessage.content.find((block) => block.type === 'text')
    if (!textBlock) {
      throw new Error(`i18n-translate: whole-file translation for "${sourceKey}" (locale=${locale}) returned no text block`)
    }
    let jsonText = textBlock.text.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/```\s*$/, '').trim()
    }
    return JSON.parse(jsonText)
  }
}

/**
 * Real translator for the MDX blog-body strategy (Plan 72-03, D-10 /
 * 72-RESEARCH.md Pattern 4): one streamed call per post per locale, whole-
 * document, with explicit instructions to preserve fenced code blocks,
 * markdown link URLs, heading/list markers, and any HTML/JSX tags —
 * translating only the prose between them.
 */
export function createAnthropicMdxBodyTranslator(glossary) {
  const client = new Anthropic()
  return async function anthropicMdxBodyTranslate(body, { locale, sourceKey }) {
    const stream = client.messages.stream({
      model: 'claude-opus-5',
      max_tokens: 64000,
      system: [
        { type: 'text', text: buildSystemPrompt(glossary, locale), cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: `Translate the following Markdown/MDX blog post body to ${locale}. Preserve verbatim: every fenced code block, every markdown link's URL (translate the visible link text, never the URL), every heading marker (#, ##, ...), every list/bullet marker, and any HTML/JSX tags — translate only the prose between these structures. Preserve ICU variables, rich-text tags, and any do-not-translate terms EXACTLY as instructed in the system prompt. Return ONLY the translated Markdown body — no frontmatter, no code-fence wrapper, no commentary.\n\nSource file: ${sourceKey}\n\n${body}`,
        },
      ],
    })
    const finalMessage = await stream.finalMessage()
    const textBlock = finalMessage.content.find((block) => block.type === 'text')
    if (!textBlock) {
      throw new Error(`i18n-translate: MDX body translation for "${sourceKey}" (locale=${locale}) returned no text block`)
    }
    return textBlock.text.trim()
  }
}

/** Deterministic dry-run MDX-body translator — mirrors createDryRunTranslator() but for the whole-body MDX shape. */
export function createDryRunMdxBodyTranslator() {
  return async function dryRunMdxBodyTranslate(body, { locale }) {
    return `[${locale.toUpperCase()}] ${body}`
  }
}

/** Deterministic dry-run batch translator — mirrors createDryRunTranslator() but for the batch API shape. */
export function createDryRunBatchTranslator() {
  return async function dryRunBatchTranslate(units, { locale }) {
    return units.map((u) => `[${locale.toUpperCase()}] ${typeof u.value === 'string' ? u.value : JSON.stringify(u.value)}`)
  }
}

/** Deep-prefixes every string leaf (recursing through plain objects and arrays, never altering keys). */
function prefixDeep(node, locale) {
  if (typeof node === 'string') {
    return node.trim() === '' ? node : `[${locale.toUpperCase()}] ${node}`
  }
  if (Array.isArray(node)) {
    return node.map((item) => prefixDeep(item, locale))
  }
  if (node !== null && typeof node === 'object') {
    const out = {}
    for (const [key, value] of Object.entries(node)) out[key] = prefixDeep(value, locale)
    return out
  }
  return node
}

/** Deterministic dry-run whole-file translator — mirrors createDryRunTranslator() but for the whole-file API shape. */
export function createDryRunWholeFileTranslator() {
  return async function dryRunWholeFileTranslate(enObj, { locale }) {
    return prefixDeep(enObj, locale)
  }
}

/**
 * Core pipeline for one EN source file -> one target locale file.
 *
 * - Never mutates `sourcePath` (EN stays byte-for-byte unchanged).
 * - A unit whose EN hash matches the manifest is skipped: no translator
 *   call, its value is carried forward from the EXISTING target file
 *   untouched (D-05 — this is what preserves a hand-edited translation).
 * - A unit absent from the manifest, or whose EN hash differs, is
 *   selected (D-04). Within the selected set, an empty/whitespace-only
 *   or structurally-empty unit is copied through verbatim with no
 *   translator call; every other selected unit is translated.
 * - The manifest gains an entry only for a unit that was selected AND
 *   successfully written to the output tree.
 * - Output is written with the EN source's key order preserved (rebuilt
 *   by walking the EN tree), UTF-8/NFC-normalized, so an unchanged
 *   re-run yields a byte-identical file (idempotency).
 *
 * Plan 72-01's tracer entry point — single-unit-at-a-time translator
 * interface (`translator(unit, {locale, glossary})`). Kept for its
 * committed test coverage (tests/i18n-translate-manifest.test.ts). The
 * full-catalog path added in Plan 72-02 is `runFullTranslation()` below,
 * which batches per surface type instead of calling a translator per unit.
 *
 * @param {object} options
 * @param {string} options.sourcePath - filesystem path to the EN JSON source
 * @param {string} options.targetPath - filesystem path to write the translated locale JSON
 * @param {string} options.manifestPath - filesystem path to the hash-manifest sidecar
 * @param {string} [options.sourceKey] - the logical relative-path used in unitKey (defaults to sourcePath)
 * @param {string} options.locale - target locale code (e.g. 'ru')
 * @param {object} options.glossary - a loaded+validated glossary (loadGlossary())
 * @param {(unit: {unitKey: string, value: unknown}, ctx: {locale: string, glossary: object}) => Promise<unknown>} options.translator
 * @param {string[]} [options.only] - restrict processing to these unitKeys (tracer real-mode scope)
 */
export async function translateSource({
  sourcePath,
  targetPath,
  manifestPath,
  sourceKey = sourcePath,
  locale,
  glossary,
  translator,
  only,
}) {
  const enObj = JSON.parse(readFileSync(sourcePath, 'utf8'))
  let enUnits = flattenEnSource(enObj, sourceKey)
  if (only) {
    const onlySet = new Set(only)
    enUnits = enUnits.filter((unit) => onlySet.has(unit.unitKey))
  }

  const manifest = loadManifest(manifestPath)
  const selected = unitsNeedingTranslation(enUnits, manifest)

  let existingTargetObj = {}
  if (existsSync(targetPath)) {
    existingTargetObj = JSON.parse(readFileSync(targetPath, 'utf8'))
  }
  const existingValuesByUnitKey = Object.fromEntries(
    flattenEnSource(existingTargetObj, sourceKey).map((unit) => [unit.unitKey, unit.value])
  )

  const newValuesByUnitKey = {}
  let translatorCalls = 0
  let emptySkips = 0
  const now = new Date().toISOString()

  for (const unit of selected) {
    let finalValue
    if (isEmptyValue(unit.value)) {
      finalValue = unit.value
      emptySkips += 1
    } else {
      finalValue = await translator(unit, { locale, glossary })
      if (typeof finalValue === 'string') finalValue = finalValue.normalize('NFC')
      translatorCalls += 1
    }
    newValuesByUnitKey[unit.unitKey] = finalValue
    // Manifest entry written only after this unit's value is queued for the output write.
    manifest.units[unit.unitKey] = { enHash: sha256(unit.value), lastTranslatedAt: now }
  }

  const mergedValuesByUnitKey = { ...existingValuesByUnitKey, ...newValuesByUnitKey }
  const outputTree = buildOutputTree(enObj, sourceKey, '', mergedValuesByUnitKey)

  mkdirSync(dirname(targetPath), { recursive: true })
  const outputJson = (JSON.stringify(outputTree, null, 2) + '\n').normalize('NFC')
  writeFileSync(targetPath, outputJson, 'utf8')

  writeManifest(manifestPath, manifest)

  return {
    totalUnits: enUnits.length,
    selectedCount: selected.length,
    translatorCalls,
    emptySkips,
    skippedCount: enUnits.length - selected.length,
  }
}

/**
 * Verifies every non-empty translated unit for `translatedByUnitKey`
 * against the EN source with scripts/lib/i18n-verify.mjs (DNT/ICU/tag/RU-
 * plural, fail-closed). A unit that fails verification is EXCLUDED from
 * the returned accepted map — it is never written to the output tree or
 * advanced in the manifest (Task 2's contract: "a failing unit is NOT
 * written as accepted"). Failing unitKeys are logged for the QA report
 * (Plan 72-03 owns generating that report file; this plan only surfaces
 * the failures at the console/return level).
 */
function verifyTranslatedUnits({ enUnits, translatedByUnitKey, locale, glossary }) {
  const enByUnitKey = Object.fromEntries(enUnits.map((u) => [u.unitKey, u.value]))
  const accepted = {}
  const flagged = []

  for (const [unitKey, trValue] of Object.entries(translatedByUnitKey)) {
    const enValue = enByUnitKey[unitKey]
    const dntResult = verifyDntPreserved(enValue, trValue, glossary)
    const pluralResult = verifyPluralCategories(trValue, locale, glossary)
    if (dntResult.ok && pluralResult.ok) {
      accepted[unitKey] = trValue
    } else {
      flagged.push({
        unitKey,
        locale,
        missing: dntResult.missing,
        unbalanced: dntResult.unbalanced,
        missingPluralCategories: pluralResult.missing,
      })
      console.error(
        `✗ i18n-translate: DNT/ICU/plural verification failed for "${unitKey}" (locale=${locale}) — missing=${JSON.stringify(
          dntResult.missing
        )} unbalanced=${JSON.stringify(dntResult.unbalanced)} missingPluralCategories=${JSON.stringify(pluralResult.missing)}`
      )
    }
  }

  return { accepted, flagged }
}

/**
 * Blog-source branch of runFullTranslation() (Plan 72-03, D-10): mirrors
 * the JSON per-source-per-locale loop's cross-locale manifest-advance and
 * fail-closed-verification contract above, but operates on gray-matter MDX
 * units (`frontmatter.title`, `frontmatter.description`, `body`) via
 * scripts/lib/i18n-mdx.mjs instead of a JSON tree. Mutates `manifest` and
 * `summary` in place — same caller-owns-persistence contract as the JSON
 * loop (Plan 72-02 pattern).
 */
async function processBlogSource({ source, locales, glossary, manifest, translateBatch, translateMdxBody, summary, now }) {
  const enRaw = readFileSync(source.sourcePath, 'utf8')
  const { data: enData, content: enBody } = matter(enRaw)
  const enUnits = flattenMdxSource(enRaw, source.sourceKey)

  let anySelected = false
  let succeededEverywhere = null
  let emptyUnitsForManifest = []

  for (const locale of locales) {
    const targetPath = source.targetPathFor(locale)

    const mdxResult = await translateMdxFile({
      enRaw,
      sourceKey: source.sourceKey,
      manifest,
      locale,
      glossary,
      translateBatch,
      translateBody: translateMdxBody,
    })

    if (mdxResult.selected.length === 0) {
      continue
    }
    anySelected = true
    emptyUnitsForManifest = mdxResult.emptyUnits

    for (const unitKey of mdxResult.failedUnitKeys) {
      summary.flagged.push({
        unitKey,
        locale,
        reason: unitKey.endsWith('::body') && mdxResult.structure && !mdxResult.structure.ok ? 'mdx_structure_failed' : 'translator_call_failed',
      })
    }

    const { accepted, flagged } = verifyTranslatedUnits({
      enUnits: mdxResult.enUnits,
      translatedByUnitKey: mdxResult.translatedByUnitKey,
      locale,
      glossary,
    })
    summary.flagged.push(...flagged)
    summary.translated += Object.keys(accepted).length
    for (const [unitKey, trValue] of Object.entries(accepted)) {
      const enUnit = mdxResult.enUnits.find((u) => u.unitKey === unitKey)
      summary.accepted.push({ unitKey, locale, enValue: enUnit?.value, trValue })
    }

    const succeededThisLocale = new Set([...Object.keys(accepted), ...mdxResult.emptyUnits.map((u) => u.unitKey)])
    succeededEverywhere = succeededEverywhere
      ? new Set([...succeededEverywhere].filter((k) => succeededThisLocale.has(k)))
      : succeededThisLocale

    let existingValuesByUnitKey = {}
    if (existsSync(targetPath)) {
      const existingRaw = readFileSync(targetPath, 'utf8')
      existingValuesByUnitKey = Object.fromEntries(
        flattenMdxSource(existingRaw, source.sourceKey).map((u) => [u.unitKey, u.value])
      )
    }

    const newValuesByUnitKey = {}
    for (const unit of mdxResult.emptyUnits) newValuesByUnitKey[unit.unitKey] = unit.value
    for (const [unitKey, value] of Object.entries(accepted)) {
      newValuesByUnitKey[unitKey] = typeof value === 'string' ? value.normalize('NFC') : value
    }

    const mergedValuesByUnitKey = { ...existingValuesByUnitKey, ...newValuesByUnitKey }
    const output = buildTranslatedMdx({ enData, enBody, sourceKey: source.sourceKey, valuesByUnitKey: mergedValuesByUnitKey })
    mkdirSync(dirname(targetPath), { recursive: true })
    writeFileSync(targetPath, output.normalize('NFC'), 'utf8')
  }

  if (!anySelected) {
    summary.sourcesSkipped += 1
    return
  }

  for (const unit of emptyUnitsForManifest) {
    manifest.units[unit.unitKey] = { enHash: sha256(unit.value), lastTranslatedAt: now }
  }
  for (const unitKey of succeededEverywhere ?? []) {
    const unit = enUnits.find((u) => u.unitKey === unitKey)
    if (unit && !emptyUnitsForManifest.some((e) => e.unitKey === unitKey)) {
      manifest.units[unitKey] = { enHash: sha256(unit.value), lastTranslatedAt: now }
    }
  }
}

/**
 * Full-surface pipeline (Plan 72-02, extended by Plan 72-03 with the blog
 * MDX branch): walks every EN catalog + content-JSON source
 * (scripts/lib/i18n-surfaces.mjs::enumerateEnSources) plus every EN blog
 * post (scripts/lib/i18n-mdx.mjs::enumerateBlogEnSources) and translates
 * each for every requested locale, batched per surface type (catalog =
 * short-string batch, content = whole-file, blog = frontmatter batch +
 * whole-body), verified fail-closed (scripts/lib/i18n-verify.mjs +
 * scripts/lib/i18n-mdx.mjs::verifyMdxStructure) before a unit is accepted.
 *
 * Cross-locale manifest correctness: for each source, `selected` (the set
 * of units needing translation) is computed ONCE from the manifest state
 * at the start of that source's locale loop, then reused unchanged across
 * every locale in `locales` — reading the manifest again mid-loop would be
 * safe too (it isn't mutated until the loop ends) but computing it once
 * keeps the invariant explicit. The manifest itself is advanced only after
 * ALL requested locales have been attempted for that source, and only for
 * units that succeeded (translated + verified, or were empty) in EVERY
 * locale — a unit that fails in just one locale is excluded from this
 * run's manifest advance so every locale retries it next run, rather than
 * marking it "done" while one locale still holds the English fallback.
 */
export async function runFullTranslation({
  rootDir = process.cwd(),
  locales,
  glossary,
  manifestPath,
  translateBatch,
  translateFile,
  translateMdxBody,
}) {
  const sources = [...enumerateEnSources(rootDir), ...enumerateBlogEnSources(rootDir)]
  const manifest = loadManifest(manifestPath)
  const now = new Date().toISOString()

  const summary = { sourcesWalked: sources.length, sourcesSkipped: 0, translated: 0, flagged: [], accepted: [] }

  for (const source of sources) {
    if (source.surfaceType === 'blog') {
      await processBlogSource({ source, locales, glossary, manifest, translateBatch, translateMdxBody, summary, now })
      continue
    }

    const enObj = readEnSource(source.sourcePath)
    const enUnits = flattenEnSource(enObj, source.sourceKey)

    // succeededEverywhere starts as "every non-empty unit that might be
    // selected" and is narrowed down as locales are processed; recomputed
    // per-locale-call below via translateCatalog/translateContentJson
    // (both re-derive `selected` from the same unmutated `manifest`).
    let anySelected = false
    let succeededEverywhere = null // Set<unitKey>, initialized on first locale pass
    let emptyUnitsForManifest = []

    for (const locale of locales) {
      const targetPath = source.targetPathFor(locale)

      const result =
        source.surfaceType === 'catalog'
          ? await translateCatalog({ enUnits, manifest, locale, glossary, translateBatch })
          : await translateContentJson({ enObj, sourceKey: source.sourceKey, enUnits, manifest, locale, glossary, translateFile })

      if (result.selected.length === 0) {
        // Nothing needs translation for this source at all — no file
        // touched, no locale loop continuation needed.
        continue
      }
      anySelected = true
      emptyUnitsForManifest = result.emptyUnits

      for (const unitKey of result.failedUnitKeys) {
        summary.flagged.push({ unitKey, locale, reason: 'translator_call_failed' })
      }

      const { accepted, flagged } = verifyTranslatedUnits({
        enUnits,
        translatedByUnitKey: result.translatedByUnitKey,
        locale,
        glossary,
      })
      summary.flagged.push(...flagged)
      summary.translated += Object.keys(accepted).length
      for (const [unitKey, trValue] of Object.entries(accepted)) {
        const enUnit = enUnits.find((u) => u.unitKey === unitKey)
        summary.accepted.push({ unitKey, locale, enValue: enUnit?.value, trValue })
      }

      const succeededThisLocale = new Set([
        ...Object.keys(accepted),
        ...result.emptyUnits.map((u) => u.unitKey),
      ])
      succeededEverywhere = succeededEverywhere
        ? new Set([...succeededEverywhere].filter((k) => succeededThisLocale.has(k)))
        : succeededThisLocale

      let existingTargetObj = {}
      if (existsSync(targetPath)) {
        existingTargetObj = JSON.parse(readFileSync(targetPath, 'utf8'))
      }
      const existingValuesByUnitKey = Object.fromEntries(
        flattenEnSource(existingTargetObj, source.sourceKey).map((u) => [u.unitKey, u.value])
      )

      const newValuesByUnitKey = {}
      for (const unit of result.emptyUnits) newValuesByUnitKey[unit.unitKey] = unit.value
      for (const [unitKey, value] of Object.entries(accepted)) {
        newValuesByUnitKey[unitKey] = typeof value === 'string' ? value.normalize('NFC') : value
      }

      const mergedValuesByUnitKey = { ...existingValuesByUnitKey, ...newValuesByUnitKey }
      const outputTree = buildOutputTree(enObj, source.sourceKey, '', mergedValuesByUnitKey)
      mkdirSync(dirname(targetPath), { recursive: true })
      writeFileSync(targetPath, (JSON.stringify(outputTree, null, 2) + '\n').normalize('NFC'), 'utf8')
    }

    if (!anySelected) {
      summary.sourcesSkipped += 1
      continue
    }

    // Advance the manifest only for units that succeeded in every
    // requested locale this run (Rule 1 fix — see function doc comment).
    for (const unit of emptyUnitsForManifest) {
      manifest.units[unit.unitKey] = { enHash: sha256(unit.value), lastTranslatedAt: now }
    }
    for (const unitKey of succeededEverywhere ?? []) {
      const unit = enUnits.find((u) => u.unitKey === unitKey)
      if (unit && !emptyUnitsForManifest.some((e) => e.unitKey === unitKey)) {
        manifest.units[unitKey] = { enHash: sha256(unit.value), lastTranslatedAt: now }
      }
    }
  }

  writeManifest(manifestPath, manifest)
  return summary
}

/**
 * `--check` mode (Task 3, D-09/TR-02): makes NO API calls. Verifies every
 * requested locale's catalog (`messages/<locale>.json`) has zero keys
 * missing vs `messages/en.json` (checkCompleteness) and — for a real repo
 * run, never for a `--fixtures` run, since an arbitrary temp/fixture dir
 * has no meaningful git history to assert against — that EN source files
 * are clean per `git diff` (the pipeline must never mutate EN). Returns
 * `{ok, failures}` rather than calling `process.exit()` itself so it stays
 * directly unit-testable; the CLI entry point (`main()`) owns the exit
 * code. Used by CI (Plan 72-04) and by a developer verifying a PR locally.
 */
export function checkPipelineState({ rootDir, skipGitCheck = false, locales = PHASE_72_LOCALES }) {
  const failures = []

  if (!skipGitCheck) {
    try {
      execSync('git diff --exit-code -- messages/en.json content/routes/en content/pages/en content/blog/en', {
        cwd: rootDir,
        stdio: 'pipe',
      })
    } catch {
      failures.push('EN source files are not clean per `git diff` — the pipeline must never mutate EN sources.')
    }
  }

  const enPath = path.join(rootDir, 'messages/en.json')
  if (!existsSync(enPath)) {
    failures.push(`messages/en.json not found at ${enPath}`)
    return { ok: false, failures }
  }
  const enCatalog = JSON.parse(readFileSync(enPath, 'utf8'))

  for (const locale of locales) {
    const localePath = path.join(rootDir, `messages/${locale}.json`)
    const localeCatalog = existsSync(localePath) ? JSON.parse(readFileSync(localePath, 'utf8')) : {}
    const { missing } = checkCompleteness(enCatalog, localeCatalog)
    if (missing.length > 0) {
      failures.push(`messages/${locale}.json is missing ${missing.length} key(s): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', ...' : ''}`)
    }
  }

  return { ok: failures.length === 0, failures }
}

async function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run')
  const checkMode = argv.includes('--check')
  const fixturesIdx = argv.indexOf('--fixtures')
  const fixturesDir = fixturesIdx !== -1 ? argv[fixturesIdx + 1] : null
  const localesIdx = argv.indexOf('--locales')
  const requestedLocales = localesIdx !== -1 ? argv[localesIdx + 1].split(',') : PHASE_72_LOCALES
  const rootDir = fixturesDir ? path.resolve(fixturesDir) : process.cwd()

  if (checkMode) {
    const result = checkPipelineState({ rootDir, skipGitCheck: Boolean(fixturesDir), locales: requestedLocales })
    if (result.ok) {
      console.log(`✓ i18n-translate --check: PASSED — [${requestedLocales.join(', ')}] complete vs messages/en.json, EN unchanged, no API calls made`)
      return
    }
    for (const failure of result.failures) console.error(`✗ i18n-translate --check: ${failure}`)
    console.error('✗ i18n-translate --check: FAILED')
    process.exit(1)
  }

  if (!dryRun) {
    loadEnvLocal()
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('Missing env var: ANTHROPIC_API_KEY (set it in .env.local for a local run, or as a CI repo secret)')
      process.exit(1)
    }
  }

  const glossary = loadGlossary()
  const manifestPath = fixturesDir
    ? path.join(rootDir, 'translation-manifest.json')
    : path.join(rootDir, 'i18n/translation-manifest.json')

  const translateBatch = dryRun ? createDryRunBatchTranslator() : createAnthropicBatchTranslator(glossary)
  const translateFile = dryRun ? createDryRunWholeFileTranslator() : createAnthropicWholeFileTranslator(glossary)
  const translateMdxBody = dryRun ? createDryRunMdxBodyTranslator() : createAnthropicMdxBodyTranslator(glossary)

  console.log(
    `i18n-translate: walking ${rootDir} for locales [${requestedLocales.join(', ')}] (dryRun=${dryRun})…`
  )
  const summary = await runFullTranslation({
    rootDir,
    locales: requestedLocales,
    glossary,
    manifestPath,
    translateBatch,
    translateFile,
    translateMdxBody,
  })
  console.log(
    `✓ i18n-translate: ${summary.sourcesWalked} source(s) walked, ${summary.sourcesSkipped} unchanged/skipped, ${summary.translated} unit-translations written, ${summary.flagged.length} flagged (DNT/ICU/plural/MDX-structural verification failure)`
  )
  if (summary.flagged.length > 0) {
    console.warn('⚠ i18n-translate: some units failed post-hoc verification and were NOT written — see log above for details.')
  }

  const enCatalogPath = path.join(rootDir, 'messages/en.json')
  const enCatalog = existsSync(enCatalogPath) ? JSON.parse(readFileSync(enCatalogPath, 'utf8')) : {}
  const completenessByLocale = {}
  for (const locale of requestedLocales) {
    const localeCatalogPath = path.join(rootDir, `messages/${locale}.json`)
    const localeCatalog = existsSync(localeCatalogPath) ? JSON.parse(readFileSync(localeCatalogPath, 'utf8')) : {}
    completenessByLocale[locale] = checkCompleteness(enCatalog, localeCatalog)
  }
  const qaReportPath = fixturesDir ? path.join(rootDir, 'QA-REPORT.md') : path.join(rootDir, 'i18n/QA-REPORT.md')
  generateQaReport({ locales: requestedLocales, results: summary, glossary, completenessByLocale, outputPath: qaReportPath })
  console.log(`✓ i18n-translate: QA report (D-09) written to ${qaReportPath}`)
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  main().catch((err) => {
    console.error('✗ i18n-translate failed:', err)
    process.exit(1)
  })
}

export { main }
