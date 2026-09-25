import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import BookingWizard from '@/components/booking/BookingWizard'
import { businessNodeDoc } from '@/lib/jsonld'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'
import { getPageContent } from '@/lib/page-content'

type BookContent = {
  metadata: { title: string; description: string; ogTitle: string; ogDescription: string }
  hero: { label: string; headlineLine1: string; headlineItalic: string; subhead: string }
  guarantees: string[]
  howItWorks: {
    label: string
    headingLine1: string
    headingItalic: string
    steps: { title: string; body: string }[]
  }
  afterYouBook: {
    label: string
    headingLine1: string
    headingItalic: string
    intro: string
    items: { t: string; b: string }[]
  }
  whyBookDirect: {
    label: string
    headingLine1: string
    headingItalic: string
    intro: string
    items: { title: string; body: string }[]
  }
  faq: {
    heading: string
    items: { q: string; a: string }[]
  }
}

const bookingSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Service',
      '@id': 'https://rideprestigo.com/book#service',
      name: 'Prague Chauffeur Transfer — Online Booking',
      description: 'Book a private chauffeur transfer in Prague online. Fixed price, instant confirmation, Mercedes E-Class, S-Class, or V-Class. Airport transfers and intercity routes — fixed price.',
      provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
      url: 'https://rideprestigo.com/book',
      serviceType: 'Chauffeur Transfer',
      areaServed: { '@type': 'Place', name: 'Prague, Czech Republic' },
      offers: {
        '@type': 'Offer',
        price: '69',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        priceSpecification: {
          '@type': 'PriceSpecification',
          price: '69',
          priceCurrency: 'EUR',
          valueAddedTaxIncluded: true,
          description: 'Starting price for E-Class airport transfer',
        },
      },
      potentialAction: {
        '@type': 'ReserveAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://rideprestigo.com/book',
          actionPlatform: [
            'https://schema.org/DesktopWebPlatform',
            'https://schema.org/MobileWebPlatform',
          ],
        },
        result: {
          '@type': 'Reservation',
          name: 'Prague Chauffeur Transfer Reservation',
        },
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Book a Transfer', item: 'https://rideprestigo.com/book' },
      ],
    },
  ],
}

// CR-01: converted from a static `metadata` export to generateMetadata()
// so the current locale is available for the self-referencing canonical.
// 75-06: /book now has a content model (content/pages/<locale>/book.json)
// -> `content: { kind: 'page', key: 'book' }` makes the hreflang cluster
// translation-aware (Phase 74 D-07), not "all locales assumed valid".
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const content = getPageContent('book', locale) as BookContent
  const alternates = getAlternates('/book', { indexable: true, content: { kind: 'page', key: 'book' }, locale })
  return {
    title: content.metadata.title,
    description: content.metadata.description,
    alternates,
    openGraph: {
      url: toAbsoluteUrl(alternates.canonical),
      title: content.metadata.ogTitle,
      description: content.metadata.ogDescription,
      images: [{ url: 'https://rideprestigo.com/og-image.jpg', width: 1200, height: 630 }],
    },
  }
}

// Structural config — step numbers stay in code, zipped by index with the
// translated `howItWorks.steps` catalog array (Phase 69 convention).
const stepNumbers = ['01', '02', '03', '04']

export default async function BookPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const content = getPageContent('book', locale) as BookContent
  const businessDoc = businessNodeDoc()
  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(bookingSchema) }} />
      {businessDoc && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(businessDoc) }} />}
      <Nav />

      {/* Header */}
      <section className="bg-anthracite pt-32 pb-10 md:pt-40 md:pb-12 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">{content.hero.label}</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[52px] max-w-xl">
            {content.hero.headlineLine1} <br />
            <span className="display-italic">{content.hero.headlineItalic}</span>
          </h1>
          <p className="body-text text-[13px] mt-4">{content.hero.subhead}</p>
        </div>
      </section>

      {/* Booking wizard */}
      <section className="theme-light bg-anthracite py-12 md:py-16">
        <BookingWizard />
      </section>

      {/* Guarantees */}
      <section className="bg-anthracite-mid py-12 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-center gap-8 md:gap-16">
            {content.guarantees.map((g) => (
              <div key={g} className="flex items-center gap-3">
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[11px] tracking-[0.12em] uppercase text-warmgrey">{g}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How booking works */}
      <section className="bg-anthracite py-16 md:py-24 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="mb-14">
            <p className="label mb-6">{content.howItWorks.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">{content.howItWorks.headingLine1} <span className="display-italic">{content.howItWorks.headingItalic}</span></h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {stepNumbers.map((step, i) => {
              const s = content.howItWorks.steps[i]
              return (
                <div key={step} className="border border-anthracite-light p-8">
                  <p className="font-body font-light text-[9px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--copper)' }}>{step}</p>
                  <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{s.title}</h3>
                  <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{s.body}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* What happens after you book */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <div>
            <p className="label mb-6">{content.afterYouBook.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-6">{content.afterYouBook.headingLine1} <span className="display-italic">{content.afterYouBook.headingItalic}</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {content.afterYouBook.intro}
            </p>
          </div>
          <ul className="flex flex-col gap-4">
            {content.afterYouBook.items.map((item) => (
              <li key={item.t} className="flex items-start gap-4 py-3 border-b border-anthracite-light last:border-0">
                <span className="mt-[8px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <div>
                  <p className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-1" dangerouslySetInnerHTML={{ __html: item.t }} />
                  <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }} dangerouslySetInnerHTML={{ __html: item.b }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Why book direct */}
      <section className="bg-anthracite py-16 md:py-24 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="mb-14 max-w-2xl">
            <p className="label mb-6">{content.whyBookDirect.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">{content.whyBookDirect.headingLine1} <span className="display-italic">{content.whyBookDirect.headingItalic}</span></h2>
            <p className="body-text text-[13px] mt-6" style={{ lineHeight: '1.9' }}>
              {content.whyBookDirect.intro}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {content.whyBookDirect.items.map((item) => (
              <div key={item.title} className="border border-anthracite-light p-8">
                <span className="copper-line mb-5 block" />
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{item.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Booking FAQ */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-t border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[34px] mb-12">{content.faq.heading}</h2>
          <div className="flex flex-col gap-0">
            {content.faq.items.map((faq, i) => (
              <div
                key={faq.q}
                className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}
              >
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }} dangerouslySetInnerHTML={{ __html: faq.a }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
