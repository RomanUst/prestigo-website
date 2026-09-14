/**
 * Post-hoc DNT / ICU-variable / rich-tag / RU-plural preservation verifier
 * (fail-closed). Runs after each translation call, before a unit is
 * accepted into the output tree — 72-RESEARCH.md Common Pitfalls 1/2, and
 * the T-72-02 (prompt-injection/model-deviation) and T-72-06 (broken
 * next-intl ICU parse) threat-model mitigations: a unit that drops or
 * alters an ICU variable, a rich-text tag, a DNT term, or a required RU
 * plural category is flagged here rather than silently shipped.
 */

/**
 * Extracts the top-level ICU variable/plural/select names referenced in
 * `str` — e.g. `"{amount}"` -> `["amount"]`, and
 * `"{count, plural, one {# hour} other {# hours}}"` -> `["count"]` (the
 * plural/select sub-categories are NOT descended into or extracted as
 * separate tokens — only the leading variable name of each top-level
 * `{...}` group is a DNT token). Uses a balanced-brace scan so nested
 * plural/select bodies (which themselves contain `{...}`) do not confuse a
 * naive regex.
 */
export function extractIcuTokens(str) {
  if (typeof str !== 'string') return []
  const tokens = []
  let i = 0
  while (i < str.length) {
    if (str[i] === '{') {
      let depth = 1
      let j = i + 1
      while (j < str.length && depth > 0) {
        if (str[j] === '{') depth++
        else if (str[j] === '}') depth--
        j++
      }
      const inner = str.slice(i + 1, j - 1)
      const match = inner.match(/^\s*([a-zA-Z][a-zA-Z0-9]*)/)
      if (match) tokens.push(match[1])
      i = j
    } else {
      i++
    }
  }
  return tokens
}

/**
 * Extracts every top-level `{varName, plural, ...}` / `{varName, select,
 * ...}` construct's full inner content (used by verifyPluralCategories to
 * check for required CLDR category keywords inside each block).
 */
function extractPluralOrSelectBlocks(str) {
  if (typeof str !== 'string') return []
  const blocks = []
  let i = 0
  while (i < str.length) {
    if (str[i] === '{') {
      let depth = 1
      let j = i + 1
      while (j < str.length && depth > 0) {
        if (str[j] === '{') depth++
        else if (str[j] === '}') depth--
        j++
      }
      const inner = str.slice(i + 1, j - 1)
      if (/,\s*plural\s*,/.test(inner)) blocks.push(inner)
      i = j
    } else {
      i++
    }
  }
  return blocks
}

/**
 * Counts open/close occurrences of every `<tag>...</tag>` rich-text tag
 * found in `str`, keyed by tag name — `{ tagName: { open: N, close: N } }`.
 * Order-agnostic (counts only, not position) — matches the glossary's
 * `richTextTags` list (highlight, price, privacy, strong, terms, wa) but is
 * not restricted to it, so an unexpected tag introduced by translation is
 * still detected as unbalanced/unmatched by verifyDntPreserved.
 */
export function extractRichTags(str) {
  const counts = {}
  if (typeof str !== 'string') return counts
  const openRe = /<([a-zA-Z][a-zA-Z0-9]*)>/g
  const closeRe = /<\/([a-zA-Z][a-zA-Z0-9]*)>/g
  let m
  while ((m = openRe.exec(str))) {
    const tag = m[1]
    counts[tag] = counts[tag] || { open: 0, close: 0 }
    counts[tag].open++
  }
  while ((m = closeRe.exec(str))) {
    const tag = m[1]
    counts[tag] = counts[tag] || { open: 0, close: 0 }
    counts[tag].close++
  }
  return counts
}

/**
 * Verifies a translated unit preserves every EN ICU variable/plural-block
 * name, every rich-text tag (same names, same open/close counts), and every
 * brand/vehicle-class DNT term present in the EN source — all verbatim,
 * unchanged (Pitfall 1, D-06, T-72-02/T-72-06).
 *
 * Non-string EN/translated values (numbers, arrays, objects, null) are not
 * this verifier's concern — DNT/ICU/tag preservation only applies to prose
 * strings — and always report `{ok: true}`.
 *
 * @returns {{ok: boolean, missing: string[], unbalanced: string[]}}
 *   `missing` lists the human-readable token/tag/term that was dropped or
 *   altered (`"{amount}"`, `"<price>"`, `"Prestigo"`); `unbalanced` lists
 *   rich-text tag names whose open/close counts don't match each other in
 *   the translated string.
 */
export function verifyDntPreserved(enValue, trValue, glossary) {
  const missing = []
  const unbalanced = []

  if (typeof enValue !== 'string' || typeof trValue !== 'string') {
    return { ok: true, missing, unbalanced }
  }

  // ICU variables / plural / select constructs — every EN top-level token
  // name must still appear as a top-level token in the translation.
  const enTokens = new Set(extractIcuTokens(enValue))
  const trTokens = new Set(extractIcuTokens(trValue))
  for (const token of enTokens) {
    if (!trTokens.has(token)) missing.push(`{${token}}`)
  }

  // Rich-text tags — same tag names present, same open/close counts, and
  // each tag internally balanced (open === close) in the translation.
  const enTags = extractRichTags(enValue)
  const trTags = extractRichTags(trValue)
  for (const [tag, enCount] of Object.entries(enTags)) {
    const trCount = trTags[tag]
    if (!trCount || trCount.open !== enCount.open || trCount.close !== enCount.close) {
      missing.push(`<${tag}>`)
    }
  }
  for (const [tag, trCount] of Object.entries(trTags)) {
    if (trCount.open !== trCount.close && !unbalanced.includes(tag)) {
      unbalanced.push(tag)
    }
  }

  // Brand + vehicle-class DNT terms — reproduced verbatim wherever the EN
  // source used them.
  const dnt = glossary?.doNotTranslate
  const dntTerms = [...(dnt?.brand ?? []), ...(dnt?.vehicleClasses ?? [])]
  for (const term of dntTerms) {
    if (enValue.includes(term) && !trValue.includes(term)) {
      missing.push(term)
    }
  }

  return { ok: missing.length === 0 && unbalanced.length === 0, missing, unbalanced }
}

/**
 * Verifies a translated ICU plural construct emits the full CLDR plural
 * category set required for `locale` (Pitfall 2 — Russian needs
 * one/few/many/other, not English's one/other). Locales whose
 * `pluralCategories` in the glossary has 2 or fewer entries (es, fr) never
 * need expansion, so this always passes for them without inspecting the
 * string. Category KEYWORDS themselves are ICU syntax and stay in English
 * regardless of locale (`plural, one {...} few {...} ...`) — only the
 * message text inside each category branch is translated prose.
 *
 * @returns {{ok: boolean, missing: string[]}} `missing` lists the CLDR
 *   category keyword(s) absent from a plural block that should contain them.
 */
export function verifyPluralCategories(trValue, locale, glossary) {
  if (typeof trValue !== 'string') return { ok: true, missing: [] }

  const requiredCategories = glossary?.locales?.[locale]?.pluralCategories ?? []
  if (requiredCategories.length <= 2) {
    return { ok: true, missing: [] }
  }

  const blocks = extractPluralOrSelectBlocks(trValue)
  if (blocks.length === 0) {
    return { ok: true, missing: [] }
  }

  const missing = new Set()
  for (const block of blocks) {
    for (const category of requiredCategories) {
      const categoryRe = new RegExp(`(^|[\\s,])${category}\\s*\\{`)
      if (!categoryRe.test(block)) {
        missing.add(category)
      }
    }
  }

  return { ok: missing.size === 0, missing: [...missing] }
}
