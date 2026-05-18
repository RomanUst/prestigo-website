import { NextResponse } from 'next/server'
import { submitToIndexNow } from '@/lib/indexnow'
import { ROUTES } from '@/lib/routes'
import { getAllPosts, JSX_POSTS } from '@/lib/blog'

export const maxDuration = 60

const BASE = 'https://rideprestigo.com'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const staticUrls = [
    BASE,
    `${BASE}/book`,
    `${BASE}/book/multi-day`,
    `${BASE}/services`,
    `${BASE}/services/airport-transfer`,
    `${BASE}/services/intercity-routes`,
    `${BASE}/services/vip-events`,
    `${BASE}/services/city-rides`,
    `${BASE}/services/group-transfers`,
    `${BASE}/fleet`,
    `${BASE}/routes`,
    `${BASE}/blog`,
    `${BASE}/corporate`,
    `${BASE}/about`,
    `${BASE}/faq`,
    `${BASE}/contact`,
  ]

  const routeUrls = ROUTES.map((r) => `${BASE}/routes/${r.slug}`)

  const blogUrls = [
    ...JSX_POSTS.map((p) => `${BASE}/blog/${p.slug}`),
    ...getAllPosts()
      .filter((p) => p.source === 'mdx')
      .map((p) => `${BASE}/blog/${p.slug}`),
  ]

  const urls = [...staticUrls, ...routeUrls, ...blogUrls]
  const result = await submitToIndexNow(urls)

  if (!result.ok) {
    return NextResponse.json({ error: result.error, status: result.status }, { status: 502 })
  }

  return NextResponse.json({ submitted: urls.length, indexnowStatus: result.status })
}
