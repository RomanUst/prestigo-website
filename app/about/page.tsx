import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { getAuthor, personSchemaFor } from '@/lib/authors'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'

const ABOUT_DESCRIPTION = "Prague's locally-rooted chauffeur service built to international luxury standards. Our story, our chauffeurs, and why discerning travellers choose PRESTIGO."

export const metadata: Metadata = {
  title: "About PRESTIGO — Prague's Premium Chauffeur Service",
  description: ABOUT_DESCRIPTION,
  alternates: { canonical: '/about' },
  openGraph: {
    url: 'https://rideprestigo.com/about',
    title: "About PRESTIGO — Prague's Premium Chauffeur Service",
    description: ABOUT_DESCRIPTION,
    images: [{ url: 'https://rideprestigo.com/hero-about.png', width: 1200, height: 630 }],
  },
}

const principles = [
  {
    title: 'Discretion',
    body: 'Your journey is your own. We don\'t discuss clients, routes, or conversations.',
  },
  {
    title: 'Precision',
    body: 'The right car at the right place at the right time. No excuses accepted.',
  },
  {
    title: 'Local knowledge',
    body: 'Our drivers know Prague: the traffic patterns, the hotels, the shortcuts, the stories.',
  },
]

const requirements = [
  'Background-checked · Professionally licensed',
  'Executive hospitality training',
  'English fluency minimum B2',
  'Prague geography certified',
  'Uniformed: dark suit, clean shoes, no cologne',
]


const founder = getAuthor('roman-ustyugov')

const aboutPageSchemaGraph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/about#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'About', item: 'https://rideprestigo.com/about' },
      ],
    },
    {
      '@type': 'AboutPage',
      '@id': 'https://rideprestigo.com/about#aboutpage',
      url: 'https://rideprestigo.com/about',
      name: "About PRESTIGO — Prague's Premium Chauffeur Service",
      description: ABOUT_DESCRIPTION,
      mainEntity: { '@id': 'https://rideprestigo.com/#business' },
      about: personSchemaFor('roman-ustyugov'),
    },
  ],
}

export default function AboutPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutPageSchemaGraph) }} />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-about.png" alt="About PRESTIGO — Prague's Premium Chauffeur Service" fill style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">About PRESTIGO</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            Prague's service.<br />
            <span className="display-italic">International standard.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            PRESTIGO was founded on a single observation: Prague deserved a chauffeur service that matched the city's ambition. Not a global aggregator without local knowledge. Not a local operator without a brand. Something in between — and better than both.
          </p>
        </div>
      </section>

      <Divider />

      {/* Brand story */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <Reveal variant="up">
          <div>
            <h2 className="display text-[28px] md:text-[36px] mb-8">Why PRESTIGO exists</h2>
            <div className="flex flex-col gap-6">
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                Every year, hundreds of thousands of executives, diplomats, and discerning travellers arrive in Prague expecting a certain standard. What they find, too often, is a gap — between the city they came for and the first impression it gives them.
              </p>
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                PRESTIGO exists to close that gap. From the moment of landing to the moment of arrival at your destination, every detail is anticipated, every preference noted, every commitment kept.
              </p>
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                We are not a taxi. We are not an aggregator. We are the first person in Prague who is already on your side.
              </p>
            </div>
          </div>
          </Reveal>
          <Reveal variant="up" delay={150}>
          <div className="flex items-center">
            <div className="w-full border border-anthracite-light p-10">
              <span className="copper-line mb-8 block" />
              <blockquote className="font-display font-light italic text-[24px] md:text-[28px] text-offwhite leading-[1.5]">
                &ldquo;The first person in Prague who is already on your side.&rdquo;
              </blockquote>
            </div>
          </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Our story */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-5 gap-12 md:gap-16">
          <Reveal variant="up">
          <div className="md:col-span-2">
            <p className="label mb-6">Our story</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">From one car, <span className="display-italic">to a standard.</span></h2>
          </div>
          </Reveal>
          <Reveal variant="up" delay={150}>
          <div className="md:col-span-3 flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              PRESTIGO began the way most small operators begin in Central Europe — with a single late-model Mercedes and a founder who was tired of watching visiting executives step out of airport taxis looking like they&rsquo;d rather have walked. The ambition from the first day was narrow and specific: build one chauffeur service in Prague that an international traveller would recognise as equivalent to the best they had used in London, Zurich, or Tokyo.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              The founding principle was that the standard has to be set at the edges, not the centre. Anyone can run a good airport transfer on a sunny Tuesday afternoon. The real test is the 04:00 pickup in a snowstorm, the last-minute rerouting when a meeting runs long, the visiting principal with a protocol team, the family of five with skis and a nervous dog. If the service holds at the edges, the centre takes care of itself.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Today, PRESTIGO operates a curated Mercedes-Benz fleet out of Prague with a small team of vetted chauffeurs who&rsquo;ve each been with us long enough to be trusted with any booking. We have deliberately kept the operation compact: we would rather refuse work than dilute the standard.
            </p>
          </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Founder */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-10 md:gap-16 items-start">
          <Reveal variant="up">
          <div
            className="w-[200px] h-[200px] md:w-[240px] md:h-[240px] rounded-full border border-anthracite-light flex-shrink-0"
            style={{
              backgroundImage: `url('/roman-ustyugov-founder.jpg')`,
              backgroundSize: '105%',
              backgroundPosition: 'center -5%',
              backgroundRepeat: 'no-repeat',
            }}
            role="img"
            aria-label={founder.imageAlt}
          />
          </Reveal>
          <Reveal variant="up" delay={150}>
          <div>
            <p className="label mb-6">Meet the founder</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-3">
              Roman Ustyugov, <span className="display-italic">Founder.</span>
            </h2>
            <p className="font-body text-[11px] tracking-[0.12em] uppercase text-copper mb-6">
              {founder.jobTitle}
            </p>
            <div className="flex flex-col gap-5 max-w-2xl">
              {founder.bio.map((para, i) => (
                <p
                  key={i}
                  className="body-text text-[13px]"
                  style={{ lineHeight: '1.9' }}
                >
                  {para}
                </p>
              ))}
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                Ten years in the industry means every 04:00 pickup, every wrong-terminal arrival, every VIP protocol has been seen, solved, and written into PRESTIGO&rsquo;s playbook. That is what you are booking when you book us.
              </p>
              <div className="pt-2">
                <a
                  href={`/authors/${founder.slug}`}
                  className="font-body text-[11px] tracking-[0.12em] uppercase text-copper hover:text-offwhite transition-colors"
                >
                  Read full profile →
                </a>
              </div>
            </div>
          </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* What discretion means */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <Reveal variant="up">
          <div>
            <p className="label mb-6">On discretion</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-6">What discretion <span className="display-italic">actually means.</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              &ldquo;Discretion&rdquo; is one of those words every premium operator puts on their website and very few define. At PRESTIGO, discretion is a set of concrete practices, not a marketing line. It is the reason we hesitate to photograph our own vehicles with clients inside them, the reason our chauffeurs don&rsquo;t carry company-branded clothing to dinner pickups, and the reason nothing that happens in the cabin is ever repeated — to colleagues, to family, or to a social feed.
            </p>
          </div>
          </Reveal>
          <Reveal variant="up" delay={150}>
          <ul className="flex flex-col gap-4">
            {[
              { t: 'No social posting — ever', b: 'Our drivers do not photograph clients, vehicles with clients inside, or the addresses we collect from. There is no internal chat group sharing stories. We don&rsquo;t have one.' },
              { t: 'NDAs on request, at no cost', b: 'For any booking that touches confidential business, we will sign a standard mutual NDA before the trip. Many of our corporate accounts run on a permanent NDA as a matter of routine.' },
              { t: 'Private pickups without signage', b: 'For sensitive collections at residences, embassies, or private entrances, the chauffeur carries no company signage and uses a vehicle without external branding.' },
              { t: 'Conversation only on invitation', b: 'Our chauffeurs will not speak first. If you want a conversation, start one. If you want to work or sleep, the cabin stays silent for the entire journey.' },
              { t: 'What happens inside, stays inside', b: 'Phone calls, documents on your lap, conversations with colleagues in the back seat — none of it exists outside the vehicle. This is not a slogan. It is how we are trained.' },
            ].map((item) => (
              <li key={item.t} className="flex items-start gap-4 py-3 border-b border-anthracite-light last:border-0">
                <span className="mt-[8px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <div>
                  <p className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-1" dangerouslySetInnerHTML={{ __html: item.t }} />
                  <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }} dangerouslySetInnerHTML={{ __html: item.b }} />
                </div>
              </li>
            ))}
          </ul>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Local knowledge */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <p className="label mb-6">Local knowledge, international standards</p>
          <span className="copper-line mb-8 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-10">Prague is our home. <span className="display-italic">That is the advantage.</span></h2>
          </Reveal>
          <Reveal variant="fade" delay={100}>
          <div className="flex flex-col gap-6">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Most of the global chauffeur brands that operate in Prague are platforms — they list local drivers, collect a fee, and disappear the moment something goes wrong. PRESTIGO is the opposite. We are based in Prague, we employ our drivers directly, and we live with every decision about service the next day. That is what &ldquo;locally-rooted&rdquo; actually means.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Local knowledge is a practical advantage. Our chauffeurs know that the Prague 1 traffic pattern changes completely during the Christmas markets, that Charles Bridge is closed to vehicles, that Wenceslas Square becomes impassable whenever there&rsquo;s a protest or a football final, and that the fastest route from the airport to a hotel in Malá Strana depends entirely on the time of day. They know which hotels expect you to drop at the main entrance and which prefer the side porte-cochère. They know which embassies have security checks that add fifteen minutes to the pickup. They know the border-crossing habits of the E65 to Vienna at 06:00 on a summer Monday versus a winter Saturday.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              None of this is written in a policy document. It is learned by driving the city for years, and then choosing to stay with one operator who asks the right questions. It is the single biggest reason PRESTIGO is consistent at the edges — where other services begin to fray.
            </p>
          </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Principles */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <h2 className="display text-[28px] md:text-[36px] mb-14">What we stand for</h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {principles.map((p, i) => (
              <Reveal key={p.title} variant="up" delay={i * 120}>
              <div className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <h3 className="font-display font-light text-[22px] text-offwhite mb-3">{p.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{p.body}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Chauffeurs */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <Reveal variant="up">
          <div>
            <p className="label mb-6">Our Chauffeurs</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-6">Our chauffeurs</h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Every PRESTIGO chauffeur is personally vetted, trained in executive transport protocols, and fluent in English. They carry a name board, arrive early, and say only what needs to be said.
            </p>
          </div>
          </Reveal>
          <Reveal variant="up" delay={150}>
          <div className="flex flex-col justify-center gap-4">
            {requirements.map((r) => (
              <div key={r} className="flex items-start gap-4 py-4 border-b border-anthracite-light last:border-0">
                <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[13px] text-warmgrey">{r}</span>
              </div>
            ))}
          </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite-mid py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <Reveal variant="up">
          <h2 className="display text-[28px] md:text-[36px]">
            Travel with PRESTIGO.<br />
            <span className="display-italic">Experience the difference.</span>
          </h2>
          </Reveal>
          <Reveal variant="fade" delay={150}>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">Book a Transfer</a>
            <a href="/corporate" className="btn-ghost">Corporate Accounts</a>
          </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
