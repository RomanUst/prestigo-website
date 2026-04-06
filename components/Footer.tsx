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
          <a href="/book" className="btn-primary flex-shrink-0">
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
              {[
                { label: 'Airport Transfer', href: '/services' },
                { label: 'Intercity Routes', href: '/routes' },
                { label: 'Corporate Accounts', href: '/corporate' },
                { label: 'VIP & Events', href: '/services' },
                { label: 'Group Transfer', href: '/services' },
                { label: 'About PRESTIGO', href: '/about' },
                { label: 'FAQ', href: '/faq' },
              ].map((s) => (
                <li key={s.label}>
                  <a href={s.href} className="body-text text-[11px] hover:text-offwhite transition-colors">
                    {s.label}
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
                  <a href="/routes" className="body-text text-[11px] hover:text-offwhite transition-colors">
                    {r}
                  </a>
                </li>
              ))}
              <li>
                <a href="/routes" className="body-text text-[11px] hover:text-offwhite transition-colors" style={{ color: 'var(--copper)' }}>
                  View all routes →
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="label mb-5">Contact</p>
            <ul className="flex flex-col gap-3">
              <li>
                <a href="tel:+420725986855" className="body-text text-[11px] hover:text-offwhite transition-colors">
                  +420 725 986 855
                </a>
              </li>
              <li>
                <a
                  href="https://wa.me/420725986855"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-[#25D366] hover:bg-[#1ebe5d] transition-colors text-[#0a0a0a] font-body font-medium text-[11px] tracking-[0.08em] uppercase"
                >
                  <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.102 1.523 5.83L.057 23.885a.5.5 0 0 0 .606.61l6.198-1.438A11.955 11.955 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.37l-.359-.213-3.72.863.943-3.617-.234-.372A9.818 9.818 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                  </svg>
                  WhatsApp
                </a>
              </li>
              <li>
                <a href="mailto:info@rideprestigo.com" className="body-text text-[11px] hover:text-offwhite transition-colors">
                  info@rideprestigo.com
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
          <p className="font-body font-light text-[10px] tracking-[0.15em] uppercase" style={{ color: 'var(--warmgrey)' }}>
            © {new Date().getFullYear()} PRESTIGO. All rights reserved.
          </p>
          <div className="flex items-center gap-3">
            <a
              href="/privacy"
              className="font-body font-light text-[10px] tracking-[0.15em] uppercase hover:text-offwhite transition-colors"
              style={{ color: 'var(--warmgrey)' }}
            >
              Privacy Policy
            </a>
            <span className="text-anthracite-light">|</span>
            <a
              href="/terms"
              className="font-body font-light text-[10px] tracking-[0.15em] uppercase hover:text-offwhite transition-colors"
              style={{ color: 'var(--warmgrey)' }}
            >
              Terms
            </a>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://www.instagram.com/rideprestigo/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="text-[var(--warmgrey)] hover:text-offwhite transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </a>
            <a
              href="https://www.facebook.com/profile.php?id=61574283117859&locale=cs_CZ"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="text-[var(--warmgrey)] hover:text-offwhite transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
              </svg>
            </a>
          </div>
          <p className="font-body font-light italic text-[11px]" style={{ color: 'var(--warmgrey)' }}>
            Prestige in every mile.
          </p>
        </div>
      </div>
    </footer>
  )
}
