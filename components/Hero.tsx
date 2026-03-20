import HeroTypewriter from './HeroTypewriter'

export default function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col justify-start bg-anthracite overflow-hidden">

      {/* Background texture — subtle grain */}
      <div
        className="absolute inset-0 opacity-[0.03]"
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

            {/* Headline */}
            <HeroTypewriter />
            <h1 className="display display-italic text-[52px] md:text-[68px] lg:text-[76px] animate-on-load delay-400 mb-10">
              as it should be.
            </h1>

            {/* Subhead */}
            <p className="body-text max-w-sm animate-on-load delay-500 mb-12">
              Your chauffeur is already tracking your flight.<br />
              You simply arrive.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4 animate-on-load delay-600">
              <a href="#book" className="btn-primary">
                Book a transfer
              </a>
              <a href="/corporate" className="btn-ghost">
                Corporate accounts
              </a>
            </div>
          </div>

          {/* Right — stat cards */}
          <div className="hidden lg:flex flex-col gap-4 items-end animate-on-load delay-700">

            {/* Stats */}
            <div className="flex gap-4">
              {[
                { number: '24 / 7', label: 'Availability' },
                { number: 'Fixed', label: 'Price guarantee' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="border border-anthracite-light bg-anthracite-mid px-6 py-5 min-w-[120px]"
                >
                  <p className="font-display font-light text-2xl text-offwhite mb-1 tracking-wide">
                    {stat.number}
                  </p>
                  <p className="label" style={{ color: 'var(--warmgrey)', fontSize: '8px' }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Quote */}
            <div className="border-l-2 border-copper pl-5 py-1 max-w-xs">
              <p className="font-display font-light italic text-lg text-copper-pale leading-snug">
                "We anticipate.<br />You simply arrive."
              </p>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-on-load delay-800">
          <span className="label" style={{ fontSize: '8px', color: 'var(--anthracite-light)' }}>
            Scroll
          </span>
          <div className="w-px h-8 bg-gradient-to-b from-anthracite-light to-transparent" />
        </div>
      </div>
    </section>
  )
}
