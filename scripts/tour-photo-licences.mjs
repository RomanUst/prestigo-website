// Fetch Commons licence metadata (extmetadata) for tour gallery photos.
// Usage: node scripts/tour-photo-licences.mjs "File:Example.jpg" "File:Other.jpg"
// Prints a JSON array of entries; exits 1 when a title is missing, NonFree is true,
// or a Restrictions value is present. The response is treated as data only.

const titles = process.argv.slice(2)
if (titles.length === 0) {
  console.error('Usage: node scripts/tour-photo-licences.mjs "File:Title.jpg" [...]')
  process.exit(1)
}

const stripHtml = (s) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()

const api = new URL('https://commons.wikimedia.org/w/api.php')
api.search = new URLSearchParams({
  action: 'query',
  prop: 'imageinfo',
  iiprop: 'extmetadata|url',
  // Commons only serves standard thumbnail steps (...1280, 1920, 3840); an arbitrary width
  // such as 2000 is rounded up to 3840 by the API, which then 400s when requested by hand.
  iiurlwidth: '1920',
  format: 'json',
  redirects: '1',
  titles: titles.join('|'),
}).toString()

const res = await fetch(api, { headers: { 'User-Agent': 'prestigo-tour-photo-licences/1.0 (rideprestigo.com)' } })
if (!res.ok) {
  console.error(`Commons API error ${res.status}`)
  process.exit(1)
}
const json = await res.json()
const pages = Object.values(json?.query?.pages ?? {})
const byTitle = new Map()
for (const p of pages) byTitle.set(p.title, p)
const redirects = new Map((json?.query?.redirects ?? []).map((r) => [r.from, r.to]))
const normalized = new Map((json?.query?.normalized ?? []).map((r) => [r.from, r.to]))

let failed = false
const out = []
for (const requested of titles) {
  const n = normalized.get(requested) ?? requested
  const resolved = redirects.get(n) ?? n
  const page = byTitle.get(resolved)
  const info = page?.imageinfo?.[0]
  if (!page || page.missing !== undefined || !info) {
    console.error(`MISSING: ${requested}`)
    failed = true
    continue
  }
  const m = info.extmetadata ?? {}
  const val = (k) => m[k]?.value
  const entry = {
    title: page.title,
    author: stripHtml(val('Artist')),
    license: stripHtml(val('LicenseShortName')),
    license_url: stripHtml(val('LicenseUrl')),
    restrictions: stripHtml(val('Restrictions')),
    non_free: String(val('NonFree') ?? '').toLowerCase() === 'true',
    source_url: info.descriptionurl,
    thumb_url: info.thumburl,
  }
  if (entry.non_free) {
    console.error(`REJECTED (NonFree): ${requested}`)
    failed = true
  }
  if (entry.restrictions) {
    console.error(`REJECTED (Restrictions: ${entry.restrictions}): ${requested}`)
    failed = true
  }
  out.push(entry)
}

console.log(JSON.stringify(out, null, 2))
process.exit(failed ? 1 : 0)
