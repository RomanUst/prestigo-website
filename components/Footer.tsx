export default function Footer() {
  return (
    <footer className="bg-anthracite-mid border-t border-anthracite-light">

      {/* CTA band */}
      <div className="border-b border-anthracite-light py-14">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <p className="label mb-3">Ready to travel?</p>
            <h2 className="display text-[28px] md:text-[36px]">
              Book your transfer.<br />
              <span className="display-italic">We handle the rest.</span>
            </h2>
          </div>
          <a href="#book" className="btn-primary flex-shrink-0">
            Book now
          </a>
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">

          {/* Brand */}
          <div className="md:col-span-1">
            <p className="wordmark tracking-[0.6em] mb-4">
              <span className="wordmark-presti">PRESTI</span>
              <span className="wordmark-go">GO</span>
            </p>
            <p className="body-text text-[11px]">
              Premium chauffeur service.<br />Prague and Central Europe.
            </p>
          </div>

          {/* Services */}
          <div>
            <p className="label mb-5">Services</p>
            <ul className="flex flex-col gap-3">
              {['Airport Transfer', 'Intercity Routes', 'Corporate Accounts', 'VIP & Events', 'Group Transfer'].map((s) => (
                <li key={s}>
                  <a href="#book" className="body-text text-[11px] hover:text-offwhite transition-colors">
                    {s}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Routes */}
          <div>
            <p className="label mb-5">Popular routes</p>
            <ul className="flex flex-col gap-3">
              {['Prague → Vienna', 'Prague → Berlin', 'Prague → Munich', 'Prague → Budapest', 'Prague → Bratislava'].map((r) => (
                <li key={r}>
                  <a href="#book" className="body-text text-[11px] hover:text-offwhite transition-colors">
                    {r}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="label mb-5">Contact</p>
            <ul className="flex flex-col gap-3">
              <li>
                <a href="tel:+420000000000" className="body-text text-[11px] hover:text-offwhite transition-colors">
                  +420 000 000 000
                </a>
              </li>
              <li>
                <a href="mailto:info@prestigo.com" className="body-text text-[11px] hover:text-offwhite transition-colors">
                  info@prestigo.com
                </a>
              </li>
              <li>
                <p className="body-text text-[11px]">Prague, Czech Republic</p>
              </li>
              <li>
                <p className="body-text text-[11px]">24 / 7 availability</p>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-anthracite-light flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-body font-light text-[10px] tracking-[0.15em] uppercase" style={{ color: 'var(--anthracite-light)' }}>
            © 2024 PRESTIGO. All rights reserved.
          </p>
          <p className="font-body font-light italic text-[11px]" style={{ color: 'var(--anthracite-light)' }}>
            Prestige in every mile.
          </p>
        </div>
      </div>
    </footer>
  )
}
