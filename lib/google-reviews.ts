import { unstable_cache } from 'next/cache'

const CACHE_TTL_SECONDS = 60 * 60 * 24 // 24 hours
export const MAX_POOL = 8

export interface GoogleReview {
  source: 'google'
  author: string
  rating: number
  text: string
  time: number
  relativeTime: string
  profilePhotoUrl?: string
}

export interface HardcodedReview {
  source: 'hardcoded'
  quote: string
  name: string
  role: string
  sourceLabel: string
}

export type Review = GoogleReview | HardcodedReview

export const HARDCODED_TESTIMONIALS: HardcodedReview[] = [
  {
    source: 'hardcoded',
    quote: 'Our driver was waiting before we even cleared customs. Seamless from landing to hotel.',
    name: 'Michael H.',
    role: 'CFO · Frankfurt',
    sourceLabel: 'Verified booking · Airport transfer',
  },
  {
    source: 'hardcoded',
    quote: 'Travelled Prague–Vienna four times this year. Consistently excellent. The S-Class is exceptional.',
    name: 'Štěpán N.',
    role: 'Senior Partner · Prague',
    sourceLabel: 'Verified booking · Intercity route',
  },
  {
    source: 'hardcoded',
    quote: 'Our corporate account saves hours of admin. Invoicing, reporting — everything just works.',
    name: 'Linh C.',
    role: 'Operations Director',
    sourceLabel: 'Verified booking · Corporate account',
  },
]

// ─── OAuth helpers ────────────────────────────────────────────────────────────

async function getOAuthAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim()

  if (!clientId || !clientSecret || !refreshToken) return null

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { access_token?: string }
    return data.access_token ?? null
  } catch {
    return null
  }
}

// ─── Business Profile API types ───────────────────────────────────────────────

interface BizReviewer {
  displayName?: string
  profilePhotoUrl?: string
}

interface BizReview {
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE'
  comment?: string
  createTime: string
  reviewer?: BizReviewer
}

interface BizReviewsResponse {
  reviews?: BizReview[]
  averageRating?: number
  totalReviewCount?: number
}

const STAR_MAP: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
}

function relativeTimeFromDate(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
  const years = Math.floor(months / 12)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

// ─── Aggregate rating ─────────────────────────────────────────────────────────

function getEnvRating(): { ratingValue: number; reviewCount: number } | null {
  const rv = parseFloat(process.env.GOOGLE_RATING_VALUE ?? '')
  const rc = parseInt(process.env.GOOGLE_REVIEW_COUNT ?? '', 10)
  if (!isNaN(rv) && rv > 0 && !isNaN(rc) && rc > 0) return { ratingValue: rv, reviewCount: rc }
  return null
}

async function fetchAggregateRating(): Promise<{ ratingValue: number; reviewCount: number } | null> {
  const accessToken = await getOAuthAccessToken()
  if (!accessToken) return getEnvRating()

  const locationName = process.env.GOOGLE_BUSINESS_LOCATION_NAME?.trim()
  if (!locationName) return getEnvRating()

  try {
    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=1`,
      {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )
    if (!res.ok) return getEnvRating()

    const json = (await res.json()) as BizReviewsResponse
    if (!json.averageRating || !json.totalReviewCount) return getEnvRating()

    return {
      ratingValue: Math.round(json.averageRating * 10) / 10,
      reviewCount: json.totalReviewCount,
    }
  } catch {
    return getEnvRating()
  }
}

export function getStaticAggregateRating(): { ratingValue: number; reviewCount: number } | null {
  return getEnvRating()
}

export const getCachedAggregateRating = unstable_cache(
  fetchAggregateRating,
  ['google-aggregate-rating'],
  {
    tags: ['google-reviews'],
    revalidate: CACHE_TTL_SECONDS,
  },
)

// ─── Reviews ──────────────────────────────────────────────────────────────────

async function fetchGoogleReviews(): Promise<GoogleReview[]> {
  const accessToken = await getOAuthAccessToken()
  if (!accessToken) return []

  const locationName = process.env.GOOGLE_BUSINESS_LOCATION_NAME?.trim()
  if (!locationName) return []

  try {
    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=50`,
      {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )
    if (!res.ok) return []

    const json = (await res.json()) as BizReviewsResponse
    const rawReviews = json.reviews ?? []

    return rawReviews
      .filter(
        (r) =>
          (STAR_MAP[r.starRating] ?? 0) >= 4 &&
          typeof r.comment === 'string' &&
          r.comment.trim().length > 0,
      )
      .map<GoogleReview>((r) => {
        const date = new Date(r.createTime)
        return {
          source: 'google',
          author: r.reviewer?.displayName ?? 'Google reviewer',
          rating: STAR_MAP[r.starRating] ?? 5,
          text: r.comment!,
          time: date.getTime() / 1000,
          relativeTime: relativeTimeFromDate(date),
          profilePhotoUrl: r.reviewer?.profilePhotoUrl,
        }
      })
  } catch {
    return []
  }
}

const getCachedGoogleReviews = unstable_cache(
  fetchGoogleReviews,
  ['google-reviews'],
  {
    tags: ['google-reviews'],
    revalidate: CACHE_TTL_SECONDS,
  },
)

// ─── Public API ───────────────────────────────────────────────────────────────

const MAX_GOOGLE = 5

export async function getReviews(): Promise<Review[]> {
  const googleReviews = await getCachedGoogleReviews()
  const hardcoded = googleReviews.length >= MAX_GOOGLE ? [] : HARDCODED_TESTIMONIALS
  return [...googleReviews, ...hardcoded].slice(0, MAX_POOL)
}
