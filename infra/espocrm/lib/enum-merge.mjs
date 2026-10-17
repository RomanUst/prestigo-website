// Pure module: merge-safe enum option sync (Phase 80, plan 05; D-01, D-02, D-20).
//
// FieldManager PUT replaces a field's whole `options` array and its whole
// `translatedOptions` map, so the sync must always send the merged result of
// "what git declares" and "what the owner has in the CRM now". Nothing here
// touches the network or the disk.

/** True when the label is missing or is the stock identity label (value shown as its own label). */
const isUnlabelled = (label, value) => label === undefined || label === null || label === '' || label === value

/**
 * Merge declared enum values into the live ones.
 *
 * @param {object} args
 * @param {{ value: string, label: string }[]} args.desired   declared values, in declared order
 * @param {string[]} args.current                              live `options`, in live order
 * @param {Record<string, string>} [args.currentLabels]        live labels (`{scope}.options.{field}` of GET /I18n)
 * @param {string[]} [args.retire]                             stock values that may be removed when unused (D-20)
 * @param {Set<string>|string[]} [args.inUse]                  values at least one record uses
 * @returns {{ options: string[], translatedOptions: Record<string, string>, removed: string[] }}
 *
 * options           desired values (desired order), then every live value that is neither
 *                   desired nor (retired and not in use), in its original live order. A second
 *                   run over the output returns the identical list.
 * translatedOptions live labels, plus the desired label for a value whose live label is missing or
 *                   equals the value itself (the stock identity label). A label that differs from
 *                   both is an owner rename and is kept.
 * removed           retired values that were live and are not in use.
 */
export function mergeEnumOptions({ desired, current, currentLabels = {}, retire = [], inUse = new Set() }) {
  const desiredValues = desired.map((d) => d.value)
  const desiredSet = new Set(desiredValues)
  const retireSet = new Set(retire)
  const used = inUse instanceof Set ? inUse : new Set(inUse)

  const removed = current.filter((v) => retireSet.has(v) && !desiredSet.has(v) && !used.has(v))
  const removedSet = new Set(removed)
  const kept = current.filter((v) => !desiredSet.has(v) && !removedSet.has(v))

  const translatedOptions = { ...currentLabels }
  for (const { value, label } of desired) {
    if (isUnlabelled(currentLabels[value], value)) translatedOptions[value] = label
  }

  return { options: [...desiredValues, ...kept], translatedOptions, removed }
}

/**
 * Seed-not-enforce merge for the per-value maps of an enum field (`probabilityMap`, `style`):
 * keys of values that were removed are dropped, a declared key is added only when the live map
 * has none for that value, every other live key (an owner edit) is kept.
 */
export function mergeValueMap({ desired = {}, current = {}, removed = [] }) {
  const gone = new Set(removed)
  const out = Object.fromEntries(Object.entries(current ?? {}).filter(([k]) => !gone.has(k)))
  for (const [k, v] of Object.entries(desired)) {
    if (!(k in out)) out[k] = v
  }
  return out
}

/**
 * The default value after a merge: the declared one when the field has no default or its default
 * is a retire-listed stock value (the stock default, e.g. Prospecting); otherwise the live default
 * stays, because the owner may have picked another one.
 */
export function mergeDefault({ desired, current, retire = [] }) {
  if (desired === undefined) return current
  if (current === undefined || current === null || current === '' || retire.includes(current)) return desired
  return current
}
