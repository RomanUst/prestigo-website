/**
 * MDX-aware blog translation (D-10) — Phase 72, Plan 03.
 *
 * Parses an EN blog MDX file with gray-matter (same parser + import used by
 * lib/blog.ts), translates only `data.title`/`data.description` (short-
 * string path, batched exactly like a catalog unit) and the markdown body
 * (whole-document, 72-RESEARCH.md Pattern 4), and copies every other
 * frontmatter field byte-for-byte from the EN source (lib/blog.ts:53's
 * required-field set — date, coverImage, category, author — plus the
 * optional dateModified). verifyMdxStructure() runs a post-hoc structural
 * check (fenced-code-block count, link count, URL preservation, heading
 * count) so a translation that drops a link URL or a code fence is flagged
 * for the QA report (Plan 72-03 Task 3 / T-72-07) instead of being written
 * silently.
 *
 * Mirrors the "pure orchestrator, caller owns persistence" pattern
 * established in scripts/lib/i18n-surfaces.mjs (translateCatalog /
 * translateContentJson, Plan 72-02): translateMdxFile() never writes a
 * file or mutates the manifest — scripts/i18n-translate.mjs owns writing
 * the target .mdx and advancing the manifest, so a translator or
 * structural-verification failure can always be retried on the next run.
 */
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { isEmptyValue, unitsNeedingTranslation } from './i18n-manifest.mjs'

/**
 * Frontmatter fields copied byte-for-byte from EN — never translated.
 * Mirrors lib/blog.ts:53's required-field set (title/description excluded
 * here since those two ARE translated) plus the optional dateModified.
 */
const STRUCTURAL_FRONTMATTER_FIELDS = ['date', 'dateModified', 'coverImage', 'category', 'author']

/**
 * Enumerates every EN blog source (`content/blog/en/*.mdx`), same
 * `{sourcePath, sourceKey, surfaceType, targetPathFor}` shape as
 * scripts/lib/i18n-surfaces.mjs::enumerateEnSources() so
 * scripts/i18n-translate.mjs can walk catalog + content-JSON + blog
 * sources uniformly.
 */
export function enumerateBlogEnSources(rootDir = process.cwd()) {
  const blogDir = path.join(rootDir, 'content/blog/en')
  if (!existsSync(blogDir)) return []
  return readdirSync(blogDir)
    .filter((f) => f.endsWith('.mdx'))
    .sort()
    .map((file) => ({
      sourcePath: path.join(blogDir, file),
      sourceKey: `content/blog/en/${file}`,
      surfaceType: 'blog',
      targetPathFor: (locale) => path.join(rootDir, `content/blog/${locale}/${file}`),
    }))
}

/**
 * Flattens a raw EN MDX file into the manifest's `{unitKey, value}` leaf
 * shape (72-RESEARCH.md Pattern 1's unit-key convention, applied to MDX):
 * one unit per translatable frontmatter prose field, plus a single `body`
 * unit for the whole markdown body — never split per-paragraph (D-01
 * quality priority; see 72-RESEARCH.md Pattern 4).
 */
export function flattenMdxSource(enRaw, sourceKey) {
  const { data, content } = matter(enRaw)
  return [
    { unitKey: `${sourceKey}::frontmatter.title`, value: data.title },
    { unitKey: `${sourceKey}::frontmatter.description`, value: data.description },
    { unitKey: `${sourceKey}::body`, value: content },
  ]
}

/**
 * Post-hoc structural-invariant check between an EN MDX body and its
 * translation (72-RESEARCH.md Pattern 4, applied verbatim): fenced-code-
 * block count, markdown link count, every EN link URL preserved unchanged,
 * and heading-marker count all must match. A failing check means the
 * translation dropped or altered structure that must never be translated —
 * the caller flags the unit for the QA report rather than shipping it.
 */
export function verifyMdxStructure(enBody, translatedBody) {
  const countFences = (s) => (s.match(/```/g) || []).length
  const extractLinks = (s) => s.match(/\[[^\]]*\]\([^)]*\)/g) || []
  const enLinks = extractLinks(enBody).map((l) => l.match(/\(([^)]*)\)/)[1])
  const trLinks = extractLinks(translatedBody).map((l) => l.match(/\(([^)]*)\)/)[1])
  const countHeadings = (s) => (s.match(/^#{1,6}\s/gm) || []).length

  const fencesMatch = countFences(enBody) === countFences(translatedBody)
  const linkCountMatch = enLinks.length === trLinks.length
  const urlsPreserved = enLinks.every((url) => trLinks.includes(url))
  const headingCountMatch = countHeadings(enBody) === countHeadings(translatedBody)

  return {
    fencesMatch,
    linkCountMatch,
    urlsPreserved,
    headingCountMatch,
    ok: fencesMatch && linkCountMatch && urlsPreserved && headingCountMatch,
  }
}

/**
 * Rebuilds a full translated MDX file: the EN frontmatter with `title`/
 * `description` substituted from `valuesByUnitKey` (falling back to the EN
 * value when no override is present, mirroring
 * scripts/lib/i18n-manifest.mjs::buildOutputTree's per-unit fallback), the
 * structural frontmatter fields ALWAYS copied byte-for-byte from EN
 * (never taken from `valuesByUnitKey`, even if a caller mistakenly
 * supplied an override — this is what guarantees T-72-07's byte-for-byte
 * frontmatter contract), and the body substituted the same way.
 *
 * NOTE: gray-matter's `stringify(content, data)` takes the BODY first,
 * DATA second — the inverse of the parameter order shown in
 * 72-RESEARCH.md's/72-PATTERNS.md's code snippets, confirmed against
 * node_modules/gray-matter/README.md this session (Rule 1 fix — the
 * research snippet's arg order would silently serialize the body string
 * as frontmatter data and vice versa).
 */
export function buildTranslatedMdx({ enData, enBody, sourceKey, valuesByUnitKey }) {
  const titleKey = `${sourceKey}::frontmatter.title`
  const descriptionKey = `${sourceKey}::frontmatter.description`
  const bodyKey = `${sourceKey}::body`

  const translatedData = { ...enData }
  if (Object.prototype.hasOwnProperty.call(valuesByUnitKey, titleKey)) {
    translatedData.title = valuesByUnitKey[titleKey]
  }
  if (Object.prototype.hasOwnProperty.call(valuesByUnitKey, descriptionKey)) {
    translatedData.description = valuesByUnitKey[descriptionKey]
  }
  for (const field of STRUCTURAL_FRONTMATTER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(enData, field)) {
      translatedData[field] = enData[field] // byte-for-byte, never translated
    }
  }

  const translatedBody = Object.prototype.hasOwnProperty.call(valuesByUnitKey, bodyKey)
    ? valuesByUnitKey[bodyKey]
    : enBody

  return matter.stringify(translatedBody, translatedData)
}

/**
 * Orchestrates ONE EN blog MDX source -> ONE locale. Pure/read-only with
 * respect to persistence (same contract as translateCatalog /
 * translateContentJson) — never writes a file or mutates `manifest`, so
 * the caller (scripts/i18n-translate.mjs) can safely retry a failed unit
 * on the next run.
 *
 * - `selected`/`emptyUnits`/`nonEmptyUnits` mirror the manifest-gated
 *   selection contract (D-04/D-05) used by every other surface type.
 * - The two frontmatter prose units are translated together via one
 *   `translateBatch()` call (reuses the exact short-string batch
 *   translator every catalog unit uses — no separate transport).
 * - The body is translated via `translateBody()` (whole-document, MDX-
 *   preservation-instructed) and immediately checked with
 *   `verifyMdxStructure()`; a failing check adds the body unit to
 *   `failedUnitKeys` (excluded from `translatedByUnitKey` acceptance
 *   downstream) rather than being written.
 * - A translator-call failure for either path is caught (not re-thrown)
 *   so one bad call never aborts the whole pipeline run — matches
 *   translateCatalog/translateContentJson's catch-and-continue contract.
 *
 * @param {object} options
 * @param {string} options.enRaw - raw EN MDX file content (gray-matter frontmatter + body)
 * @param {string} options.sourceKey - e.g. 'content/blog/en/<slug>.mdx'
 * @param {object} options.manifest - the hash manifest (read-only here)
 * @param {string} options.locale
 * @param {object} options.glossary
 * @param {(units: {unitKey:string, value:unknown}[], ctx:{locale:string, glossary:object}) => Promise<string[]>} options.translateBatch
 * @param {(body: string, ctx: {locale:string, glossary:object, sourceKey:string}) => Promise<string>} options.translateBody
 */
export async function translateMdxFile({ enRaw, sourceKey, manifest, locale, glossary, translateBatch, translateBody }) {
  const { data: enData, content: enBody } = matter(enRaw)
  const enUnits = flattenMdxSource(enRaw, sourceKey)
  const selected = unitsNeedingTranslation(enUnits, manifest)
  const emptyUnits = selected.filter((u) => isEmptyValue(u.value))
  const nonEmptyUnits = selected.filter((u) => !isEmptyValue(u.value))

  const translatedByUnitKey = {}
  const failedUnitKeys = []
  let structure = null

  const frontmatterUnits = nonEmptyUnits.filter(
    (u) => u.unitKey === `${sourceKey}::frontmatter.title` || u.unitKey === `${sourceKey}::frontmatter.description`
  )
  const bodyUnit = nonEmptyUnits.find((u) => u.unitKey === `${sourceKey}::body`)

  if (frontmatterUnits.length > 0) {
    try {
      const translated = await translateBatch(frontmatterUnits, { locale, glossary })
      if (!Array.isArray(translated) || translated.length !== frontmatterUnits.length) {
        throw new Error(
          `i18n-mdx: frontmatter batch translation for "${sourceKey}" (locale=${locale}) returned ${
            Array.isArray(translated) ? translated.length : typeof translated
          } result(s) for ${frontmatterUnits.length} unit(s)`
        )
      }
      frontmatterUnits.forEach((u, i) => {
        translatedByUnitKey[u.unitKey] = translated[i]
      })
    } catch (err) {
      for (const u of frontmatterUnits) failedUnitKeys.push(u.unitKey)
      console.error(`✗ i18n-translate: MDX frontmatter translation failed for "${sourceKey}" (locale=${locale}): ${err.message}`)
    }
  }

  if (bodyUnit) {
    try {
      const translatedBody = await translateBody(bodyUnit.value, { locale, glossary, sourceKey })
      structure = verifyMdxStructure(enBody, translatedBody)
      if (structure.ok) {
        translatedByUnitKey[bodyUnit.unitKey] = translatedBody
      } else {
        failedUnitKeys.push(bodyUnit.unitKey)
        console.error(
          `✗ i18n-translate: MDX structural verification failed for "${sourceKey}" (locale=${locale}): ${JSON.stringify(structure)}`
        )
      }
    } catch (err) {
      failedUnitKeys.push(bodyUnit.unitKey)
      console.error(`✗ i18n-translate: MDX body translation failed for "${sourceKey}" (locale=${locale}): ${err.message}`)
    }
  }

  return { enUnits, selected, emptyUnits, nonEmptyUnits, translatedByUnitKey, failedUnitKeys, structure, enData, enBody }
}
