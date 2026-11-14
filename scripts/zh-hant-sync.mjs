/**
 * Generates the Traditional Chinese locale (zh-hant) from the Simplified
 * Chinese one (zh) with OpenCC (Simplified -> Taiwan Traditional, with
 * Taiwan phrasing). Runs before every `next build` (npm "prebuild"), so a
 * new zh blog post, page or message string always ships in zh-hant too —
 * nobody has to translate or remember zh-hant by hand.
 *
 * Inputs:  messages/zh.json, content/{blog,pages,routes}/zh/**
 * Outputs: messages/zh-hant.json, content/{blog,pages,routes}/zh-hant/**
 *
 * Only CJK characters are converted: JSON keys, ICU placeholders, URLs,
 * MDX components and frontmatter keys are ASCII and pass through untouched.
 */
import fs from 'node:fs'
import path from 'node:path'
import * as OpenCC from 'opencc-js'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const convert = OpenCC.Converter({ from: 'cn', to: 'twp' })

const convertValue = (v) =>
  typeof v === 'string'
    ? convert(v)
    : Array.isArray(v)
      ? v.map(convertValue)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, convertValue(x)]))
        : v

let count = 0
function convertFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  const text = fs.readFileSync(src, 'utf8')
  const out = src.endsWith('.json')
    ? JSON.stringify(convertValue(JSON.parse(text)), null, 2) + (text.endsWith('\n') ? '\n' : '')
    : convert(text)
  fs.writeFileSync(dst, out)
  count++
}

function convertDir(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true }) // drop files whose zh source was removed
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, entry.name)
    const b = path.join(dst, entry.name)
    if (entry.isDirectory()) convertDir(a, b)
    else convertFile(a, b)
  }
}

convertFile(path.join(ROOT, 'messages/zh.json'), path.join(ROOT, 'messages/zh-hant.json'))
for (const kind of ['blog', 'pages', 'routes']) {
  convertDir(path.join(ROOT, 'content', kind, 'zh'), path.join(ROOT, 'content', kind, 'zh-hant'))
}
console.log(`zh-hant-sync: ${count} files generated from zh`)
