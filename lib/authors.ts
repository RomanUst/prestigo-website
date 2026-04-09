/**
 * Author profiles for E-E-A-T Experience signal.
 *
 * Each author here maps to a real person who is accountable for content on
 * rideprestigo.com. The structured data produced by `personSchemaFor()` is
 * consumed by the Article schema on /guides, /compare, and /routes pages so
 * that Google and AI answer engines can resolve a named, bio'd expert behind
 * every YMYL-adjacent page.
 *
 * Keep this file as the single source of truth — if a bio or title changes,
 * update it here and every Article schema inherits the new value at build
 * time.
 */

export type Author = {
  slug: string
  name: string
  jobTitle: string
  bioShort: string
  bio: string[]
  /** Absolute path under /public. Serve as <img src={image}> (800x800). */
  image: string
  /** Same image as a fully-qualified URL for JSON-LD. */
  imageUrl: string
  /** Alt text for the portrait. */
  imageAlt: string
  /** Known-for expertise keywords. */
  knowsAbout: string[]
  worksFor: {
    '@type': 'Organization'
    '@id': string
    name: string
  }
  /** External profiles that help entity disambiguation. Extend as they come. */
  sameAs: string[]
}

export const AUTHORS = {
  'roman-ustyugov': {
    slug: 'roman-ustyugov',
    name: 'Roman Ustyugov',
    jobTitle: 'Founder & Chief Experience Officer',
    bioShort:
      'Founder of PRESTIGO. 10+ years in luxury transportation and 5★ hospitality in Prague.',
    bio: [
      'Roman Ustyugov is the founder of PRESTIGO, a premium chauffeur service in Prague. With over 10 years of experience in luxury transportation and the 5★ hospitality industry, Roman specialises in flawless ground transport for corporate clients, diplomatic missions, and hotel guests — where every detail of the journey matters.',
      'Roman personally oversees PRESTIGO\u2019s quality standards: from curating the Mercedes-Benz fleet to training chauffeurs in VIP client protocol, route selection in Prague\u2019s traffic, and end-to-end discretion. His approach is quiet luxury, punctuality, and absolute discretion — the same standard he first encountered as a frequent guest of Prague\u2019s 5★ hotels a decade ago.',
    ],
    image: '/roman-ustyugov-founder.jpg',
    imageUrl: 'https://rideprestigo.com/roman-ustyugov-founder.jpg',
    imageAlt: 'Roman Ustyugov — Founder of PRESTIGO chauffeur service in Prague',
    knowsAbout: [
      'Luxury chauffeur service',
      'Prague ground transportation',
      'Corporate travel operations',
      '5-star hotel hospitality',
      'Airport transfer logistics',
      'VIP client protocol',
    ],
    worksFor: {
      '@type': 'Organization' as const,
      '@id': 'https://rideprestigo.com/#business',
      name: 'PRESTIGO',
    },
    sameAs: [] as string[],
  },
} satisfies Record<string, Author>

export type AuthorSlug = keyof typeof AUTHORS

export function getAuthor(slug: AuthorSlug): Author {
  return AUTHORS[slug]
}

/**
 * Build a schema.org Person node suitable for nesting inside an Article
 * schema. Returns the JSON-LD object (not a string) so callers can embed it
 * in their page schema graph without double serialisation.
 */
export function personSchemaFor(slug: AuthorSlug) {
  const a = AUTHORS[slug]
  return {
    '@type': 'Person',
    '@id': `https://rideprestigo.com/authors/${a.slug}#person`,
    name: a.name,
    jobTitle: a.jobTitle,
    description: a.bioShort,
    image: a.imageUrl,
    url: `https://rideprestigo.com/authors/${a.slug}`,
    knowsAbout: a.knowsAbout,
    worksFor: a.worksFor,
    ...(a.sameAs.length > 0 ? { sameAs: a.sameAs } : {}),
  }
}

/**
 * Format an ISO date (YYYY-MM-DD) as a human-readable byline date, e.g.
 * "9 April 2026". Used for visible bylines next to the author name.
 */
export function formatBylineDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
