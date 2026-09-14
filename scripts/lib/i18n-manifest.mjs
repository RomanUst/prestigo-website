/**
 * Hash-manifest change detection + unit flatten/rebuild helpers (D-04/D-05).
 *
 * A single flat `unitKey -> { enHash, lastTranslatedAt }` sidecar tracks
 * whether a translatable unit's EN source has changed since it was last
 * translated. No per-locale hashing is needed — D-05's rule ("unchanged EN
 * source -> never overwrite the existing target value") is exactly what a
 * single EN hash per unit satisfies. See 72-RESEARCH.md Architecture
 * Patterns — Pattern 1 for the full algorithm/schema this module implements.
 *
 * unitKey convention: `<relative-source-path>::<dot-path-within-file>`
 * (e.g. `messages/en.json::Nav.signIn`).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** sha256 of a value, prefixed "sha256:" — non-cryptographic change-detection use only. */
export function sha256(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  return 'sha256:' + createHash('sha256').update(serialized, 'utf8').digest('hex')
}

/**
 * A value is "empty" when translating it would fabricate content that
 * isn't there in the EN source: an empty/whitespace-only string, an empty
 * array, or an empty object. Such units are never sent to the translator —
 * they are copied through verbatim.
 */
export function isEmptyValue(value) {
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (value !== null && typeof value === 'object') return Object.keys(value).length === 0
  return false
}

/**
 * Recursively flattens a parsed JSON object into `{ unitKey, value }` leaf
 * pairs. Plain objects are recursed into (an empty object yields zero
 * leaves for that path — it is never fabricated into content downstream).
 * Strings, arrays, numbers, booleans, and null are leaves — arrays are
 * translated/tracked as a single atomic unit, never exploded per-element.
 */
export function flattenEnSource(obj, sourcePath) {
  const units = []

  function walk(node, dotPath) {
    if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
      for (const [key, value] of Object.entries(node)) {
        walk(value, dotPath ? `${dotPath}.${key}` : key)
      }
      return
    }
    units.push({ unitKey: `${sourcePath}::${dotPath}`, value: node })
  }

  walk(obj, '')
  return units
}

/**
 * The inverse of flattenEnSource: rebuilds a full JSON tree in the EN
 * source's key order, substituting each leaf with the value found in
 * `valuesByUnitKey` (falling back to the EN node itself when no override
 * is present for that unitKey). Because the tree is always rebuilt by
 * walking the EN structure, an unchanged EN source deterministically
 * produces byte-identical output on every run (key-order preservation).
 */
export function buildOutputTree(node, sourcePath, dotPath, valuesByUnitKey) {
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    const out = {}
    for (const [key, value] of Object.entries(node)) {
      const childDotPath = dotPath ? `${dotPath}.${key}` : key
      out[key] = buildOutputTree(value, sourcePath, childDotPath, valuesByUnitKey)
    }
    return out
  }
  const unitKey = `${sourcePath}::${dotPath}`
  return Object.prototype.hasOwnProperty.call(valuesByUnitKey, unitKey) ? valuesByUnitKey[unitKey] : node
}

/**
 * Selects EN units that need (re-)translation: a unit whose unitKey is
 * absent from the manifest, or whose current EN sha256 differs from the
 * recorded enHash (D-04). A unit whose hash matches is skipped — its
 * existing target value is never touched (D-05), and no translator call
 * is issued for it.
 *
 * Source: 72-RESEARCH.md Code Examples — "Manifest-driven change
 * detection", applied verbatim.
 */
export function unitsNeedingTranslation(enUnits, manifest) {
  return enUnits.filter(({ unitKey, value }) => {
    const currentHash = sha256(value)
    const recorded = manifest.units[unitKey]
    return !recorded || recorded.enHash !== currentHash
  })
}

/** Loads the manifest sidecar, initializing to `{version:1,units:{}}` when the file is absent. */
export function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) {
    return { version: 1, units: {} }
  }
  const raw = readFileSync(manifestPath, 'utf8')
  const parsed = JSON.parse(raw)
  return { version: parsed.version ?? 1, units: parsed.units ?? {} }
}

/** Persists the manifest sidecar, UTF-8/NFC-normalized, creating parent dirs as needed. */
export function writeManifest(manifestPath, manifest) {
  mkdirSync(dirname(manifestPath), { recursive: true })
  const json = (JSON.stringify(manifest, null, 2) + '\n').normalize('NFC')
  writeFileSync(manifestPath, json, 'utf8')
}
