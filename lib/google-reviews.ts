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

// Places API New (v1) response shape
interface PlacesApiV1Review {
  rating: number
  text?: { text: string; languageCode: string }
  originalText?: { text: string; languageCode: string }
  relativePublishTimeDescription: string
  publishTime: string
  authorAttribution?: {
    displayName: string
    uri?: string
    photoUri?: string
  }
}

interface PlacesApiV1Response {
  reviews?: PlacesApiV1Review[]
}

async function fetchGoogleReviews(): Promise<GoogleReview[]> {
  const placeId = process.env.GOOGLE_PLACE_ID
  const apiKey = process.env.GOOGLE_MAPS_API_KEY

  if (!placeId || !apiKey) return []

  try {
    // Places API New (v1) — supports Service Area Businesses; Legacy endpoint returns NOT_FOUND for SABs
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        cache: 'no-store',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'reviews',
        },
      },
    )
    if (!res.ok) return []

    const json = (await res.json()) as PlacesApiV1Response
    const rawReviews = json.reviews ?? []

    return rawReviews
      .filter(
        (r) =>
          typeof r?.rating === 'number' &&
          r.rating >= 4 &&
          typeof r?.text?.text === 'string' &&
          r.text.text.trim().length > 0,
      )
      .map<GoogleReview>((r) => ({
        source: 'google',
        author: r.authorAttribution?.displayName ?? 'Google reviewer',
        rating: r.rating,
        text: r.text!.text,
        time: new Date(r.publishTime).getTime() / 1000,
        relativeTime: r.relativePublishTimeDescription,
        profilePhotoUrl: r.authorAttribution?.photoUri,
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
