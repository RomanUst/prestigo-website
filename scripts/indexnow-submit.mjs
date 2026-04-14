#!/usr/bin/env node
/**
 * Post-deploy IndexNow submission.
 *
 * Run after every production deployment to notify Bing/Yandex of updated URLs.
 * All pages in the sitemap are submitted — IndexNow deduplicates crawl requests.
 *
 * Usage:
 *   node scripts/indexnow-submit.mjs
 *
 * Or add to your deploy workflow after `vercel deploy --prebuilt --prod`:
 *   vercel deploy --prebuilt --prod --archive=tgz && node prestigo/scripts/indexnow-submit.mjs
 */

const KEY = 'a3f8e2d1c9b765432fedcba987654321'
const HOST = 'rideprestigo.com'
const BASE = `https://${HOST}`
const ENDPOINT = 'https://api.indexnow.org/IndexNow'

/** All indexed URLs — mirrors sitemap.ts static entries + key route pages. */
const URLS = [
  '/',
  '/book',
  '/book/multi-day',
  '/services',
  '/services/airport-transfer',
  '/services/intercity-routes',
  '/services/vip-events',
  '/services/city-rides',
  '/services/group-transfers',
  '/fleet',
  '/routes',
  '/routes/prague-vienna',
  '/routes/prague-berlin',
  '/routes/prague-munich',
  '/routes/prague-bratislava',
  '/routes/prague-budapest',
  '/routes/prague-dresden',
  '/routes/prague-salzburg',
  '/routes/prague-brno',
  '/routes/prague-airport',
  '/compare',
  '/compare/prague-vienna-transfer-vs-train',
  '/compare/prague-airport-taxi-vs-chauffeur',
  '/guides',
  '/guides/prague-airport-to-city-center',
  '/corporate',
  '/about',
  '/authors/roman-ustyugov',
  '/faq',
  '/contact',
].map((path) => `${BASE}${path}`)

async function main() {
  console.log(`Submitting ${URLS.length} URLs to IndexNow…`)

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: `${BASE}/${KEY}.txt`,
      urlList: URLS,
    }),
  })

  if (res.status === 200 || res.status === 202) {
    console.log(`✓ IndexNow accepted — HTTP ${res.status}`)
  } else {
    const body = await res.text().catch(() => '')
    console.error(`✗ IndexNow returned HTTP ${res.status}: ${body}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('IndexNow submit failed:', err)
  process.exit(1)
})
