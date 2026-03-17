import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'About PRESTIGO — Prague\'s Premium Chauffeur Service',
  description: 'PRESTIGO is Prague\'s only locally-rooted chauffeur service built to international luxury standards. Meet our team, learn our story, and understand why discerning travellers choose us.',
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

export default function AboutPage() {
  return (
    <main id="main-content">
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
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

      {/* Brand story */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
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
          <div className="flex items-center">
            <div className="w-full border border-anthracite-light p-10">
              <span className="copper-line mb-8 block" />
              <blockquote className="font-display font-light italic text-[24px] md:text-[28px] text-offwhite leading-[1.5]">
                "The first person in Prague who is already on your side."
              </blockquote>
            </div>
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-14">What we stand for</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {principles.map((p) => (
              <div key={p.title} className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <h3 className="font-display font-light text-[22px] text-offwhite mb-3">{p.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Chauffeurs */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <div>
            <p className="label mb-6">Our Chauffeurs</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-6">Our chauffeurs</h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Every PRESTIGO chauffeur is personally vetted, trained in executive transport protocols, and fluent in English. They carry a name board, arrive early, and say only what needs to be said.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-4">
            {requirements.map((r) => (
              <div key={r} className="flex items-start gap-4 py-4 border-b border-anthracite-light last:border-0">
                <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[13px] text-warmgrey">{r}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite-mid py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <h2 className="display text-[28px] md:text-[36px]">
            Travel with PRESTIGO.<br />
            <span className="display-italic">Experience the difference.</span>
          </h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">Book a Transfer</a>
            <a href="/corporate" className="btn-ghost">Corporate Accounts</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
