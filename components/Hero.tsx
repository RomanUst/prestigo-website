import HeroTypewriter from './HeroTypewriter'
import HeroWhatsApp from './HeroWhatsApp'
import HeroRating from './HeroRating'
import HeroBackground from './HeroBackground'

type Props = {
  airportPrice: number
  rating?: { ratingValue: number; reviewCount: number } | null
}

export default function Hero({ airportPrice, rating }: Props) {
  return (
    <section className="relative min-h-dvh flex flex-col justify-start overflow-hidden">

      {/* Full-screen background photo — parallax (desktop + mobile crop) */}
      <HeroBackground />

      {/* Navy overlays — cinematic legibility, darkest bottom-left where the
          headline sits, clearing toward the top-right so the photo reads through.
          rgba is #0B1622 (deepest navy) to stay in the new palette. */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(11,22,34,0.88) 0%, rgba(11,22,34,0.5) 55%, rgba(11,22,34,0.12) 100%)' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(11,22,34,0.85) 0%, rgba(11,22,34,0.25) 45%, transparent 80%)' }} />

      {/* Background texture — subtle grain */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px',
        }}
      />

      {/* Copper accent — top left corner line */}
      <div className="absolute top-0 left-0 w-px h-48 bg-gradient-to-b from-copper/60 to-transparent" />
      <div className="absolute top-0 left-0 w-48 h-px bg-gradient-to-r from-copper/60 to-transparent" />

      {/* Copper accent — bottom right */}
      <div className="absolute bottom-0 right-0 w-px h-64 bg-gradient-to-t from-copper/30 to-transparent" />

      {/* Main content */}
      <div className="relative max-w-7xl mx-auto w-full px-6 md:px-12 pb-16 md:pb-20 pt-24 md:pt-28">

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-end">

          {/* Left — headline */}
          <div>
            {/* Label */}
            <p className="label animate-on-load delay-100 mb-6">
              Prague · Premium Chauffeur
            </p>

            {/* Copper line */}
            <span className="copper-line animate-on-load delay-200 mb-8 block" />

            {/* Headline — H1 stays in server component so crawlers always see keyword text */}
            <h1 className="display text-[52px] md:text-[68px] lg:text-[76px] animate-on-load delay-300 mb-2">
              <HeroTypewriter /> in Prague,
            </h1>
            <p className="display display-italic text-[52px] md:text-[68px] lg:text-[76px] animate-on-load delay-400 mb-10">
              as it should be.
            </p>

            {/* Subhead */}
            <p className="body-text max-w-sm animate-on-load delay-500 mb-12">
              Your chauffeur is already tracking your flight.<br />
              You simply arrive.
            </p>

            {/* CTAs — stacked underlined text links */}
            <div className="flex flex-col items-start gap-5 animate-on-load delay-600">
              <a href="#book" className="cta-text cta-text-primary">
                Book a ride
              </a>
              <HeroWhatsApp />
            </div>

            {/* Price anchor */}
            <p className="animate-on-load delay-600 mt-5 font-body font-light text-[11px] tracking-[0.12em] uppercase" style={{ color: 'var(--warmgrey)' }}>
              Airport transfers from <span style={{ color: 'var(--copper)' }}>€{airportPrice}</span> — fixed price, no surcharges
            </p>

            {/* Google rating — live trust signal next to the CTA */}
            {rating && rating.reviewCount > 0 && (
              <HeroRating ratingValue={rating.ratingValue} reviewCount={rating.reviewCount} />
            )}
          </div>

        </div>

        {/* Scroll hint — desktop/tablet only; hidden on mobile where it collides with stacked CTAs */}
        <div className="hidden md:flex absolute bottom-8 left-1/2 -translate-x-1/2 flex-col items-center gap-2 animate-on-load delay-800">
          <span className="label" style={{ fontSize: '9px', color: 'var(--warmgrey)' }}>
            Scroll
          </span>
          <div className="w-px h-8 bg-gradient-to-b from-anthracite-light to-transparent" />
        </div>
      </div>
    </section>
  )
}
