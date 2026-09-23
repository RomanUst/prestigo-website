import type { Metadata } from 'next'
import { getRoutePrice } from '@/lib/route-prices'
import { buildRouteJsonLd } from '@/lib/jsonld'
import { ROUTE_FALLBACK } from '@/lib/price-fallbacks'
import { getLocale, getTranslations } from 'next-intl/server'
import { getRouteContent } from '@/lib/route-content'
import { interpolate, interpolateBidi } from '@/lib/content-interpolate'
import { getAlternates } from '@/lib/seo'

export const revalidate = 120


import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const content = getRouteContent('prague-nuremberg', locale)
  const route = await getRoutePrice('prague-nuremberg')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const prices = { ePrice }
  return {
    title: interpolate(content.metadata.title, prices),
    description: interpolate(content.metadata.description, prices),
    alternates: getAlternates('/routes/prague-nuremberg', {
      indexable: true,
      content: { kind: 'route', key: 'prague-nuremberg' },
    }),
    openGraph: {
      url: 'https://rideprestigo.com/routes/prague-nuremberg',
      title: interpolate(content.metadata.ogTitle, prices),
      description: interpolate(content.metadata.ogDescription, prices),
      images: [{ url: "https://rideprestigo.com/hero-intercity-routes.png", width: 1200, height: 630 }],
    },
  }
}


export default async function PragueNurembergPage() {
  const locale = await getLocale()
  const content = getRouteContent('prague-nuremberg', locale)
  const t = await getTranslations('RoutePage')
  const route = await getRoutePrice('prague-nuremberg')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const sPrice = route?.sClassEur ?? ROUTE_FALLBACK.sClassEur
  const vPrice = route?.vClassEur ?? ROUTE_FALLBACK.vClassEur
  const prices = { ePrice, sPrice, vPrice }

  const openingParagraphs = content.openingParagraphs.map((p) => interpolateBidi(p, prices))
  const routeNarrativeParagraphs = content.routeNarrative.paragraphs.map((p) => interpolateBidi(p, prices))

  const highlights = content.highlights.map((h) => ({
    ...h,
    value: typeof h.value === 'string' ? interpolate(h.value, prices) : h.value,
  }))

  const vehicles = content.vehicles.map((v) => ({ ...v, price: interpolate(v.price, prices) }))

  const inclusions = content.inclusions.map((s) => interpolate(s, prices))

  const faqs = content.faqs.map((f) => ({ q: f.q, a: interpolate(f.a, prices), aBidi: interpolateBidi(f.a, prices) }))

  const dayTripConfigurations = content.dayTrip.configurations.map((c) => ({
    ...c,
    body: interpolate(c.body, prices),
    price: interpolate(c.price, prices),
  }))

  const whyBook = content.whyBook.items

  const relatedRoutes = content.relatedRoutes

  const pageSchema = {
    '@context': 'https://schema.org' as const,
    '@graph': [
      ...(route
        ? buildRouteJsonLd(route, 'prague-nuremberg', {
            locale,
            name: interpolate(content.metadata.title, prices),
            description: interpolate(content.metadata.description, prices),
          })['@graph']
        : []),
      {
        '@type': 'FAQPage',
        '@id': 'https://rideprestigo.com/routes/prague-nuremberg#faq',
        mainEntity: faqs.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': 'https://rideprestigo.com/routes/prague-nuremberg#breadcrumb',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
          { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
          { '@type': 'ListItem', position: 3, name: 'Prague to Nuremberg', item: 'https://rideprestigo.com/routes/prague-nuremberg' },
        ],
      },
    ],
  }

  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0"><Image src="/photohero.jpg" alt="Nuremberg — private chauffeur transfer from Prague to Nuremberg" fill priority sizes="100vw" className="object-cover" style={{ filter: 'brightness(0.38)' }} /></div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">{content.hero.label}</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">{content.hero.headlineLine1} <br /><span className="display-italic">{content.hero.headlineItalic}</span></h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>{interpolateBidi(content.hero.intro, prices)}</p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">{t('heroCtaPrimary')}</a>
            <a href="/contact" className="btn-ghost">{t('heroCtaSecondary')}</a>
          </div>
        </div>
      </section>

      <Divider />

      {/* Highlights bar */}
      <section className="bg-anthracite-mid py-12">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {highlights.map((h, i) => (<Reveal key={h.label} variant="up" delay={i * 100}><div><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--copper)' }}>{h.label}</p>{Array.isArray(h.value) ? (<div><div className="flex flex-wrap gap-2 mt-1">{h.value.map((tag) => (<span key={tag} className="font-body font-light text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 border border-anthracite-light text-offwhite">{tag}</span>))}</div><p className="font-body font-light text-[10px] text-warmgrey mt-3" style={{ letterSpacing: '0.03em' }}>{t('availableOnThisRoute')}</p></div>) : (<p className="font-body font-light text-[22px]" style={{ color: (h as { copper?: boolean }).copper ? 'var(--copper-light)' : 'var(--offwhite)' }}>{(h as { copper?: boolean }).copper ? <bdi>{h.value}</bdi> : h.value}</p>)}</div></Reveal>))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Opening paragraph */}
      <section className="bg-anthracite py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="body-text text-[14px]" style={{ lineHeight: '1.9' }}>
            {openingParagraphs[0]}
          </p>
          <p className="body-text text-[14px] mt-6" style={{ lineHeight: '1.9' }}>
            {openingParagraphs[1]}
          </p></Reveal>
        </div>
      </section>

      <Divider />

      {/* The Route narrative */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">{t('sectionLabels.theRoute')}</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">{content.routeNarrative.headingLine1} <br /><span className="display-italic">{content.routeNarrative.headingItalic}</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {routeNarrativeParagraphs[0]}
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {routeNarrativeParagraphs[1]}
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {routeNarrativeParagraphs[2]}
            </p>
          </div></Reveal>
        </div>
      </section>

      <Divider />

      {/* What's included */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">{content.includedLabel}</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">{t('includedHeading.line1')} <br /><span className="display-italic">{t('includedHeading.italic')}</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{content.includedIntro}</p>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-4 justify-center">{inclusions.map((item) => (<div key={item} className="flex items-start gap-4"><span className="mt-[7px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} /><span className="font-body font-light text-[13px] text-warmgrey" style={{ lineHeight: '1.8' }}>{item}</span></div>))}</div></Reveal>
        </div>
      </section>

      <Divider />

      {/* Fleet */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">{t('sectionLabels.fleet')}</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14">{t('chooseYourVehicle')}</h2></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {vehicles.map((v, i) => (<Reveal key={v.name} variant="up" delay={i * 120}><div className="border border-anthracite-light flex flex-col"><div className="w-full overflow-hidden" style={{ aspectRatio: '16/9', position: 'relative' }}><Image src={v.photo} alt={v.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-contain" style={{ background: '#EFE8DA', filter: 'brightness(0.92)' }} /></div><div className="p-8 flex flex-col gap-6 flex-1"><div><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--copper)' }}>{v.category}</p><h3 className="font-display font-light text-[24px] text-offwhite mb-2">{v.name}</h3></div><div className="flex flex-col gap-2"><div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">{t('vehicleFields.passengers')}</span><span className="font-body font-light text-[11px] text-offwhite">{v.capacity}</span></div><div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">{t('vehicleFields.luggage')}</span><span className="font-body font-light text-[11px] text-offwhite">{v.bags}</span></div><div className="flex justify-between"><span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">{t('vehicleFields.transferPrice')}</span><span className="font-body font-light text-[11px]" style={{ color: 'var(--copper-light)' }}><bdi>{v.price}</bdi></span></div></div><a href="/book" className="btn-primary self-center mt-auto" style={{ padding: '10px 24px', fontSize: '9px' }}>{t('bookOnline')}</a></div></div></Reveal>))}
          </div>
          <p className="body-text text-[11px] mt-8" style={{ lineHeight: '1.8' }}>{content.fleetNote}</p>
        </div>
      </section>

      <Divider />

      {/* Journey timeline + Good to know */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">{t('sectionLabels.theJourney')}</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">{content.journeyHeading.line1} <br /><span className="display-italic">{content.journeyHeading.italic}</span></h2>
            <div className="flex flex-col gap-8 mt-10">
              {content.journeyStops.map((stop, i, arr) => (<div key={stop.city} className="flex gap-6"><div className="flex flex-col items-center"><div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: stop.anchor ? 'var(--copper)' : stop.custom ? 'transparent' : 'var(--anthracite-light)', border: stop.custom ? '1px solid var(--copper)' : 'none' }} />{i < arr.length - 1 && <div className="w-px flex-1 mt-2" style={{ background: stop.custom ? 'var(--copper)' : 'var(--anthracite-light)', minHeight: '40px', opacity: stop.custom ? 0.4 : 1 }} />}</div><div className="pb-6"><p className="font-body font-light text-[11px] tracking-[0.15em] uppercase mb-1" style={{ color: stop.custom ? 'var(--copper-pale)' : 'var(--offwhite)' }}>{stop.city}</p><p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{stop.note}</p></div></div>))}
            </div>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-6 justify-start pt-[60px]">
            <div className="border border-anthracite-light p-8">
              <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-6" style={{ color: 'var(--copper)' }}>{t('sectionLabels.goodToKnow')}</p>
              <div className="flex flex-col gap-5">
                {content.goodToKnow.map((item) => (<div key={item.label}><p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>{item.label}</p><p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{item.value}</p></div>))}
              </div>
            </div>
          </div></Reveal>
        </div>
      </section>

      <Divider />

      {/* Popular day-trip configurations */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">{content.dayTripLabel}</p>
          <h2 className="display text-[28px] md:text-[38px] mb-4">{content.dayTrip.headingLine1} <br /><span className="display-italic">{content.dayTrip.headingItalic}</span></h2>
          <p className="body-text text-[13px] mb-14 max-w-2xl" style={{ lineHeight: '1.9' }}>
            {content.dayTrip.intro}
          </p></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {dayTripConfigurations.map((c, i) => (
              <Reveal key={c.title} variant="up" delay={i * 120}><div className="border border-anthracite-light p-8 flex flex-col gap-4">
                <h3 className="font-display font-light text-[22px] text-offwhite">{c.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{c.body}</p>
                <p className="font-body font-light text-[11px] mt-auto pt-4 border-t border-anthracite-light" style={{ color: 'var(--copper-light)' }}><bdi>{c.price}</bdi></p>
              </div></Reveal>
            ))}
          </div>
          <p className="body-text text-[11px] mt-8 max-w-3xl" style={{ lineHeight: '1.8' }}>
            {content.dayTrip.footnote}
          </p>
        </div>
      </section>

      <Divider />

      {/* What to expect from your chauffeur */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <Reveal variant="up"><div>
            <p className="label mb-6">{t('sectionLabels.theChauffeur')}</p>
            <h2 className="display text-[28px] md:text-[38px]">{t('chauffeurHeading.line1')} <br /><span className="display-italic">{t('chauffeurHeading.italic')}</span></h2>
          </div></Reveal>
          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {content.chauffeurNarrative[0]}
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {content.chauffeurNarrative[1]}
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {content.chauffeurNarrative[2]}
            </p>
          </div></Reveal>
        </div>
      </section>

      <Divider />

      {/* Why book with Prestigo */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">{t('sectionLabels.whyPrestigo')}</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14 max-w-2xl">
            {content.whyBook.headingLine1} <br /><span className="display-italic">{content.whyBook.headingItalic}</span>
          </h2></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {whyBook.map((w, i) => (
              <Reveal key={w.title} variant="up" delay={i * 120}><div className="border border-anthracite-light p-8 flex flex-col gap-4">
                <h3 className="font-display font-light text-[20px] text-offwhite">{w.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{w.body}</p>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><h2 className="display text-[28px] md:text-[34px] mb-12">{content.faqsHeading}</h2></Reveal>
          <div className="flex flex-col gap-0">{faqs.map((faq, i) => (<Reveal key={faq.q} variant="up" delay={i * 70}><div className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}><h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3><p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.aBidi}</p></div></Reveal>))}</div>
        </div>
      </section>

      <Divider />

      {/* Related routes */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <Reveal variant="up"><p className="label mb-6">{t('sectionLabels.relatedRoutes')}</p>
          <h2 className="display text-[26px] md:text-[32px] mb-6">
            {content.relatedHeading.line1} <br /><span className="display-italic">{content.relatedHeading.italic}</span>
          </h2>
          <p className="body-text text-[13px] mb-10 max-w-2xl" style={{ lineHeight: '1.9' }}>
            {content.relatedRoutesIntro}
          </p></Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {relatedRoutes.map((r, i) => (
              <Reveal key={r.slug} variant="up" delay={i * 100}><a href={`/routes/${r.slug}`} className="border border-anthracite-light p-6 flex justify-between items-center hover:border-[var(--copper)] transition-colors">
                <div>
                  <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>Prague → {r.city}</p>
                  <p className="font-display font-light text-[18px] text-offwhite">{r.city}</p>
                </div>
                <div className="text-end">
                  <p className="font-body font-light text-[11px] text-warmgrey">{r.distance}</p>
                  <p className="font-body font-light text-[11px] text-warmgrey">{r.duration}</p>
                </div>
              </a></Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Final CTA */}
      <section className="bg-anthracite py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <Reveal variant="up"><div><h2 className="display text-[28px] md:text-[36px]">{content.cta.headingLine1} <br /><span className="display-italic">{interpolateBidi(content.cta.headingItalic, prices)}</span></h2><p className="body-text text-[13px] mt-4">{t('ctaFootnote')}</p></div></Reveal>
          <Reveal variant="fade" delay={150}><div className="flex flex-col sm:flex-row gap-4"><a href="/book" className="btn-primary">{t('bookNow')}</a><a href="/routes" className="btn-ghost">{t('allRoutes')}</a></div></Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
