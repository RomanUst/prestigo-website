const steps = [
  {
    number: '01',
    title: 'Book online',
    body: 'Enter your route and travel details. Receive instant confirmation with a fixed price — no hidden fees.',
  },
  {
    number: '02',
    title: 'We track your flight',
    body: 'Your driver monitors your flight in real time. Delays, early arrivals — we adjust automatically.',
  },
  {
    number: '03',
    title: 'Simply arrive',
    body: 'Your chauffeur is waiting at Arrivals with a name board. Direct transfer to your destination.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-heading" className="bg-anthracite py-20 md:py-28 border-t border-anthracite-light">
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        <div className="mb-14">
          <p className="label mb-6">How it works</p>
          <span className="copper-line mb-8 block" />
          <h2 id="how-it-works-heading" className="display text-[36px] md:text-[44px]">
            Three steps.<br />
            <span className="display-italic">Zero surprises.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {steps.map((step, i) => (
            <div key={i} className="relative">
              <div className="flex items-start gap-5">
                <span
                  className="font-display font-light text-[48px] leading-none"
                  style={{ color: 'var(--anthracite-light)' }}
                >
                  {step.number}
                </span>
                <div className="pt-2">
                  <p className="label mb-3">{step.title}</p>
                  <p className="body-text">{step.body}</p>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-6 right-0 w-px h-16 bg-gradient-to-b from-anthracite-light to-transparent" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
