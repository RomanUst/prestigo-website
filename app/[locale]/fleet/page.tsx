import type { Metadata } from 'next'
import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'
import { getPageContent } from '@/lib/page-content'
import { getPathname } from '@/i18n/routing'

export const revalidate = 120

type FleetContent = {
  metadata: { title: string; description: string; ogTitle: string; ogDescription: string }
  imageAlts: { hero: string; vehicleTemplate: string }
  hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string }
  vehicles: { category: string; description: string; features: string[]; idealFor: string }[]
  specsLabels: { seatsLabel: string; luggageLabel: string; passengersTemplate: string; luggageTemplate: string }
  idealForPrefix: string
  bookButtonTemplate: string
  standards: { heading: string; items: { title: string; body: string }[] }
  marque: { label: string; headingLine1: string; headingItalic: string; paragraphs: string[] }
  maintenance: { label: string; headingLine1: string; headingItalic: string; items: { title: string; body: string }[] }
  technology: { label: string; headingLine1: string; headingItalic: string; intro: string; items: { t: string; b: string }[] }
  selection: { label: string; headingLine1: string; headingItalic: string; paragraphs: string[] }
  faq: { label: string; heading: string; items: { q: string; a: string }[] }
  cta: { headingLine1: string; headingItalic: string; intro: string; button: string }
}

// CR-01: converted from a static `metadata` export to generateMetadata()
// so the current locale is available for the self-referencing canonical.
// 75-08: /fleet now has a content model (content/pages/<locale>/fleet.json)
// -> `content: { kind: 'page', key: 'fleet' }` makes the hreflang cluster
// translation-aware (Phase 74 D-07), closing the deferred gap noted in
// 74-CONTEXT.md.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const content = getPageContent('fleet', locale) as FleetContent
  const alternates = getAlternates('/fleet', { indexable: true, content: { kind: 'page', key: 'fleet' }, locale })
  return {
    title: content.metadata.title,
    description: content.metadata.description,
    alternates,
    openGraph: {
      url: toAbsoluteUrl(alternates.canonical),
      title: content.metadata.ogTitle,
      description: content.metadata.ogDescription,
      images: [{ url: 'https://rideprestigo.com/hero-fleet.webp', width: 1200, height: 630 }],
    },
  }
}

type VehicleSpec = {
  model: string
  photo: string
  // EN-only, used exclusively for the Vehicle ItemList JSON-LD (Phase 74
  // D-09 — Service/ItemList/Breadcrumb names stay English by design). The
  // visible, localized equivalents live in content.vehicles[i].
  categoryEn: string
  descriptionEn: string
  // Structured spec table for Vehicle schema + on-page display
  specs: {
    seating: number
    luggageCases: number
    luggageBags: number
    fuelType: 'hybrid' | 'petrol' | 'diesel' | 'electric'
    transmission: 'automatic' | 'manual'
    driveType: 'rwd' | 'awd' | 'fwd'
    modelYearFrom: number
    cylinders?: number
    wheelbase?: string
    cargoVolume?: string
    vehicleConfiguration?: string
  }
}

// Structural data — model names, photo paths, capacities, bag counts, and
// the EN-only category/description used for JSON-LD stay in code (Phase 69
// convention). Zipped by index with the translated content.vehicles array.
const vehicles: VehicleSpec[] = [
  {
    model: 'Mercedes-Benz E-Class',
    categoryEn: 'Business Sedan',
    descriptionEn: 'The first choice for airport transfers and city rides. Comfortable, discreet, efficient. Capacity: 3 passengers + luggage.',
    photo: '/vehicles/e-class.avif',
    specs: {
      seating: 3,
      luggageCases: 2,
      luggageBags: 2,
      fuelType: 'hybrid',
      transmission: 'automatic',
      driveType: 'rwd',
      modelYearFrom: 2022,
      cylinders: 4,
      wheelbase: '2,961 mm',
      cargoVolume: '540 L',
      vehicleConfiguration: 'E 220 d / E 300 de Hybrid',
    },
  },
  {
    model: 'Mercedes-Benz S-Class',
    categoryEn: 'Executive Sedan',
    descriptionEn: 'For those who travel at the highest level. Rear massaging seats, ambient lighting, panoramic roof. Silence as standard.',
    photo: '/vehicles/s-class.avif',
    specs: {
      seating: 3,
      luggageCases: 2,
      luggageBags: 2,
      fuelType: 'hybrid',
      transmission: 'automatic',
      driveType: 'awd',
      modelYearFrom: 2022,
      cylinders: 6,
      wheelbase: '3,216 mm',
      cargoVolume: '550 L',
      vehicleConfiguration: 'S 450 4MATIC / S 580 e Hybrid',
    },
  },
  {
    model: 'Mercedes-Benz V-Class',
    categoryEn: 'Executive Van',
    descriptionEn: 'Up to 6 passengers. Full luggage. Privacy partition available. The choice for families, groups, and multi-bag travellers who refuse to compromise.',
    photo: '/vehicles/v-class.avif',
    specs: {
      seating: 6,
      luggageCases: 6,
      luggageBags: 6,
      fuelType: 'diesel',
      transmission: 'automatic',
      driveType: 'rwd',
      modelYearFrom: 2022,
      cylinders: 4,
      wheelbase: '3,200 mm',
      cargoVolume: '1,410 L',
      vehicleConfiguration: 'V 300 d Extralong AVANTGARDE',
    },
  },
]

const vehicleListSchema = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  '@id': 'https://rideprestigo.com/fleet#vehicles',
  name: 'PRESTIGO Mercedes Fleet Prague',
  itemListElement: vehicles.map((v, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Vehicle',
      '@id': `https://rideprestigo.com/fleet#${v.model.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: v.model,
      description: v.descriptionEn,
      image: `https://rideprestigo.com${v.photo}`,
      brand: { '@type': 'Brand', name: 'Mercedes-Benz' },
      manufacturer: { '@type': 'Organization', name: 'Mercedes-Benz Group AG' },
      vehicleModelDate: String(v.specs.modelYearFrom),
      vehicleConfiguration: v.specs.vehicleConfiguration,
      bodyType: v.categoryEn,
      fuelType: v.specs.fuelType,
      vehicleTransmission: v.specs.transmission,
      driveWheelConfiguration: v.specs.driveType === 'rwd'
        ? 'https://schema.org/RearWheelDriveConfiguration'
        : v.specs.driveType === 'awd'
          ? 'https://schema.org/AllWheelDriveConfiguration'
          : 'https://schema.org/FrontWheelDriveConfiguration',
      vehicleSeatingCapacity: {
        '@type': 'QuantitativeValue',
        value: v.specs.seating,
        unitText: 'passengers',
      },
      cargoVolume: v.specs.cargoVolume
        ? { '@type': 'QuantitativeValue', value: parseInt(v.specs.cargoVolume.replace(/,/g, '')), unitText: 'L' }
        : undefined,
      wheelbase: v.specs.wheelbase,
      numberOfAxles: 2,
    },
  })),
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Fleet', item: 'https://rideprestigo.com/fleet' },
  ],
}

// FAQPage mainEntity is built from content.faq.items (D-06/D-07) — visible
// FAQ and structured FAQ always come from the same source per locale.
// acceptedAnswer.text is the plain answer string (73-CONTEXT.md rule: never
// a ReactNode). Service/ItemList/Breadcrumb stay English by design
// (Phase 74 D-09) and are module-level constants above.
function buildFleetSchemaGraph(content: FleetContent) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      vehicleListSchema,
      breadcrumbSchema,
      {
        '@type': 'FAQPage',
        '@id': 'https://rideprestigo.com/fleet#faq',
        mainEntity: content.faq.items.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  }
}

export default async function FleetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const content = getPageContent('fleet', locale) as FleetContent
  const fleetSchemaGraph = buildFleetSchemaGraph(content)
  const bookHref = getPathname({ locale, href: '/book' })

  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(fleetSchemaGraph) }} />
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-fleet.webp" alt={content.imageAlts.hero} fill style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">{content.hero.label}</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[length:clamp(30px,10vw,40px)] md:text-[56px] max-w-xl">
            {content.hero.headlineLine1} <br />
            <span className="display-italic">{content.hero.headlineItalic}</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            {content.hero.intro}
          </p>
        </div>
      </section>

      {/* Vehicle cards */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col gap-16">
          {vehicles.map((v, i) => {
            const vc = content.vehicles[i]
            const photoAlt = content.imageAlts.vehicleTemplate.replace('{model}', v.model)
            const seatsValue = content.specsLabels.passengersTemplate.replace('{n}', String(v.specs.seating))
            const luggageValue = content.specsLabels.luggageTemplate
              .replace('{cases}', String(v.specs.luggageCases))
              .replace('{bags}', String(v.specs.luggageBags))
            return (
              <Reveal key={v.model} variant="up" delay={i * 150}>
              <div
                className={`grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 pb-16 ${i < vehicles.length - 1 ? 'border-b border-anthracite-light' : ''}`}
              >
                {/* Photo */}
                <div className="relative h-64 md:h-80 overflow-hidden">
                  <Image
                    src={v.photo}
                    alt={photoAlt}
                    width={600}
                    height={340}
                    className="w-full h-full object-contain"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    priority={i === 0}
                  />
                </div>

                {/* Info */}
                <div className="flex flex-col justify-center gap-6">
                  <div>
                    <p className="label mb-2">{vc.category}</p>
                    <h2 className="display text-[28px] md:text-[34px] mb-3">{v.model}</h2>
                    <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{vc.description}</p>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {vc.features.map((f) => (
                      <li key={f} className="flex items-center gap-3">
                        <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                        <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Spec table */}
                  <dl className="border-t border-anthracite-light pt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[11px]">
                    {[
                      [content.specsLabels.seatsLabel, seatsValue],
                      [content.specsLabels.luggageLabel, luggageValue],
                    ].map(([label, val]) => (
                      <div key={label} className="flex flex-col">
                        <dt className="font-body font-medium uppercase tracking-[0.12em] text-warmgrey/80" style={{ fontSize: '9px' }}>{label}</dt>
                        <dd className="font-body font-light text-offwhite mt-1">{val}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="flex items-center gap-6">
                    <a href={bookHref} className="btn-primary" style={{ padding: '10px 24px', fontSize: '9px' }}>
                      {content.bookButtonTemplate.replace('{className}', v.model.split(' ').pop() ?? '')}
                    </a>
                  </div>
                  <p className="font-body font-light text-[11px] text-warmgrey">
                    {content.idealForPrefix} {vc.idealFor}
                  </p>
                </div>
              </div>
              </Reveal>
            )
          })}
        </div>
      </section>

      <Divider />

      {/* Standards */}
      <section className="theme-light bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up" className="mb-14">
            <h2 className="display text-[28px] md:text-[36px]">{content.standards.heading}</h2>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {content.standards.items.map((s, i) => (
              <Reveal key={s.title} variant="up" delay={i * 100}>
              <div>
                <span className="copper-line mb-5 block" />
                <h3 className="font-body font-medium text-[11px] tracking-[0.15em] uppercase text-offwhite mb-2">{s.title}</h3>
                <p className="body-text text-[12px]">{s.body}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Why Mercedes-Benz */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <Reveal variant="up">
          <div>
            <p className="label mb-6">{content.marque.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-8">{content.marque.headingLine1} <span className="display-italic">{content.marque.headingItalic}</span></h2>
          </div>
          </Reveal>
          <Reveal variant="up" delay={150}>
          <div className="flex flex-col gap-6">
            {content.marque.paragraphs.map((para, i) => (
              <p key={i} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                {para}
              </p>
            ))}
          </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Maintenance & safety */}
      <section className="theme-light bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <div className="mb-14">
            <p className="label mb-6">{content.maintenance.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">{content.maintenance.headingLine1} <br /><span className="display-italic">{content.maintenance.headingItalic}</span></h2>
          </div>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {content.maintenance.items.map((item, i) => (
              <Reveal key={item.title} variant="up" delay={i * 120}>
              <div className="border border-anthracite-light p-8">
                <span className="copper-line mb-5 block" />
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{item.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{item.body}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Technology onboard */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <Reveal variant="up">
          <div>
            <p className="label mb-6">{content.technology.label}</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-6">{content.technology.headingLine1} <br /><span className="display-italic">{content.technology.headingItalic}</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {content.technology.intro}
            </p>
          </div>
          </Reveal>
          <Reveal variant="up" delay={150}>
          <ul className="flex flex-col gap-5">
            {content.technology.items.map((item) => (
              <li key={item.t} className="flex items-start gap-4 py-4 border-b border-anthracite-light last:border-0">
                <span className="mt-[9px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <div>
                  <p className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-2" dangerouslySetInnerHTML={{ __html: item.t }} />
                  <p className="body-text text-[12px]" style={{ lineHeight: '1.85' }} dangerouslySetInnerHTML={{ __html: item.b }} />
                </div>
              </li>
            ))}
          </ul>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Selection criteria */}
      <section className="theme-light bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <p className="label mb-6">{content.selection.label}</p>
          <span className="copper-line mb-8 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-10">{content.selection.headingLine1} <span className="display-italic">{content.selection.headingItalic}</span></h2>
          </Reveal>
          <Reveal variant="fade" delay={100}>
          <div className="flex flex-col gap-6">
            {content.selection.paragraphs.map((para, i) => (
              <p key={i} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                {para}
              </p>
            ))}
          </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* FAQ */}
      <section className="theme-light bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <p className="label mb-6">{content.faq.label}</p>
          <span className="copper-line mb-8 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-12">{content.faq.heading}</h2>
          </Reveal>
          <div className="flex flex-col gap-0">
            {content.faq.items.map((faq, i) => (
              <Reveal key={faq.q} variant="up" delay={i * 80}>
              <div className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}>
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <Reveal variant="up">
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            {content.cta.headingLine1} <br />
            <span className="display-italic">{content.cta.headingItalic}</span>
          </h2>
          <p className="body-text text-[13px] mt-4 mb-10">{content.cta.intro}</p>
          </Reveal>
          <Reveal variant="fade" delay={150}>
          <a href={bookHref} className="btn-primary">{content.cta.button}</a>
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
