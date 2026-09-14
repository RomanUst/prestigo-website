#!/usr/bin/env node
/**
 * AI translation pipeline — TRACER slice (Phase 72, Plan 01).
 *
 * Production trigger (from Plan 72-04 onward): CI, on a push to `main`
 * that touches `messages/en.json` or `content/{routes,pages,blog}/en/**`
 * (D-02). This plan wires exactly ONE catalog key end-to-end (Nav.signIn,
 * locale ru) to prove the manifest + glossary + write + idempotency
 * architecture before Plan 72-02 expands to the full catalog surface.
 *
 * Reads EN source -> checks the hash manifest (D-04/D-05) -> calls the
 * injected translator (default: real @anthropic-ai/sdk client against
 * claude-opus-5, glossary-governed system prompt, D-01/D-06/D-07) only
 * for units that changed -> writes the target locale file, EN key order
 * preserved, UTF-8/NFC -> updates the manifest, entry written only after
 * a successful target write.
 *
 * Usage (local dry-run, no ANTHROPIC_API_KEY required, deterministic mock
 * translator, runs the whole mechanism against a fixture corpus):
 *   node scripts/i18n-translate.mjs --dry-run --fixtures tests/fixtures/i18n
 *
 * Usage (real run, ANTHROPIC_API_KEY from .env.local or CI repo secret):
 *   node scripts/i18n-translate.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
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

/**
 * This plan's tracer scope: translate exactly this one unit in a real
 * (non-fixture) run. Plan 72-02 removes this restriction and processes
 * the full catalog.
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
 * a deterministic mock instead.
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
 */
export function createDryRunTranslator() {
  return async function dryRunTranslate(unit, { locale }) {
    return `[${locale.toUpperCase()}] ${unit.value}`
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

async function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run')
  const fixturesIdx = argv.indexOf('--fixtures')
  const fixturesDir = fixturesIdx !== -1 ? argv[fixturesIdx + 1] : null
  const localesIdx = argv.indexOf('--locales')
  const requestedLocales = localesIdx !== -1 ? argv[localesIdx + 1].split(',') : PHASE_72_LOCALES

  if (!dryRun) {
    loadEnvLocal()
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('Missing env var: ANTHROPIC_API_KEY (set it in .env.local for a local run, or as a CI repo secret)')
      process.exit(1)
    }
  }

  const glossary = loadGlossary()

  for (const locale of requestedLocales) {
    const sourcePath = fixturesDir ? path.join(fixturesDir, 'messages/en.json') : 'messages/en.json'
    const targetPath = fixturesDir ? path.join(fixturesDir, `messages/${locale}.json`) : `messages/${locale}.json`
    const manifestPath = fixturesDir
      ? path.join(fixturesDir, 'translation-manifest.json')
      : 'i18n/translation-manifest.json'
    const translator = dryRun ? createDryRunTranslator() : createAnthropicTranslator(glossary)
    // Real (non-fixture) runs are scoped to the tracer's single unit this plan; --fixtures runs
    // process the whole (small) fixture corpus to exercise select/skip/idempotency in aggregate.
    const only = fixturesDir ? undefined : [TRACER_UNIT_KEY]

    console.log(`Translating ${sourcePath} -> ${targetPath} (locale=${locale}, dryRun=${dryRun})…`)
    const result = await translateSource({
      sourcePath,
      targetPath,
      manifestPath,
      sourceKey: 'messages/en.json',
      locale,
      glossary,
      translator,
      only,
    })
    console.log(
      `✓ ${locale}: ${result.translatorCalls} translated, ${result.skippedCount} skipped (unchanged), ${result.emptySkips} empty`
    )
  }
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  main().catch((err) => {
    console.error('✗ i18n-translate failed:', err)
    process.exit(1)
  })
}

export { main }
