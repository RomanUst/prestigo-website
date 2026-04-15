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

interface PlaceDetailsResponse {
  status: string
  result?: {
    reviews?: Array<{
      author_name: string
      rating: number
      text: string
      time: number
      relative_time_description: string
      profile_photo_url?: string
    }>
  }
}

async function fetchGoogleReviews(): Promise<GoogleReview[]> {
  const placeId = process.env.GOOGLE_PLACE_ID
  const apiKey = process.env.GOOGLE_MAPS_API_KEY

  if (!placeId || !apiKey) return []

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
    url.searchParams.set('place_id', placeId)
    url.searchParams.set('fields', 'reviews')
    url.searchParams.set('key', apiKey)

    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (!res.ok) return []

    const json = (await res.json()) as PlaceDetailsResponse
    if (json.status !== 'OK') return []

    const rawReviews = json.result?.reviews ?? []

    return rawReviews
      .filter(
        (r) =>
          typeof r?.rating === 'number' &&
          r.rating >= 4 &&
          typeof r?.text === 'string' &&
          r.text.trim().length > 0,
      )
      .map<GoogleReview>((r) => ({
        source: 'google',
        author: r.author_name,
        rating: r.rating,
        text: r.text,
        time: r.time,
        relativeTime: r.relative_time_description,
        profilePhotoUrl: r.profile_photo_url,
      }))
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

// Maximum number of Google reviews; when reached, hardcoded testimonials are omitted
const MAX_GOOGLE = 5

export async function getReviews(): Promise<Review[]> {
  const googleReviews = await getCachedGoogleReviews()
  // Only fill hardcoded slots when Google did not return its maximum
  const hardcoded = googleReviews.length >= MAX_GOOGLE ? [] : HARDCODED_TESTIMONIALS
  return [...googleReviews, ...hardcoded].slice(0, MAX_POOL)
}
