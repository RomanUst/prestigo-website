import { MetadataRoute } from 'next'

const BASE = 'https://rideprestigo.com'

// 30 indexed intercity routes (17 Green + 13 Yellow).
// 20 long-distance routes removed 2026-04-09 per SEO strategy
// — see /Users/romanustyugov/Desktop/founder prestigo/routes/03-noindex-rules-20-red-routes.md
const routeSlugs = [
  'prague-vienna',
  'prague-karlovy-vary',
  'prague-plzen',
  'prague-liberec',
  'prague-pardubice',
  'prague-hradec-kralove',
  'prague-ceske-budejovice',
  'prague-marianske-lazne',
  'prague-frantiskovy-lazne',
  'prague-cesky-krumlov',
  'prague-dresden',
  'prague-leipzig',
  'prague-linz',
  'prague-brno',
  'prague-passau',
  'prague-olomouc',
  'prague-wroclaw',
  'prague-regensburg',
  'prague-salzburg',
  'prague-zlin',
  'prague-bratislava',
  'prague-berlin',
  'prague-nuremberg',
  'prague-ostrava',
  'prague-munich',
  'prague-krakow',
  'prague-graz',
  'prague-budapest',
  'prague-warsaw',
  'prague-kutna-hora',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const routeEntries: MetadataRoute.Sitemap = routeSlugs.map((slug) => ({
    url: `${BASE}/routes/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.85,
  }))

  return [
    {
      url: BASE,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE}/book`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    {
      url: `${BASE}/services`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${BASE}/services/airport-transfer`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${BASE}/services/intercity-routes`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${BASE}/services/corporate-accounts`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${BASE}/services/vip-events`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${BASE}/services/city-rides`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${BASE}/services/group-transfers`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${BASE}/fleet`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE}/routes`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    ...routeEntries,
    {
      url: `${BASE}/corporate`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE}/about`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.6,
    },
    {
      url: `${BASE}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE}/contact`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.7,
    },
    {
      url: `${BASE}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}
