import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import BookingWizard from '@/components/booking/BookingWizard'

const bookingSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Service',
      '@id': 'https://rideprestigo.com/book#service',
      name: 'Prague Chauffeur Transfer — Online Booking',
      description: 'Book a private chauffeur transfer in Prague online. Fixed price, instant confirmation, Mercedes E-Class, S-Class, or V-Class. Airport transfers and intercity routes from €49.',
      provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
      url: 'https://rideprestigo.com/book',
      serviceType: 'Chauffeur Transfer',
      areaServed: { '@type': 'Place', name: 'Prague, Czech Republic' },
      offers: {
        '@type': 'Offer',
        price: '49',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        priceSpecification: {
          '@type': 'PriceSpecification',
          price: '49',
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

export const metadata: Metadata = {
  title: 'Book a Transfer — PRESTIGO Prague Chauffeur',
  description: 'Book your Prague chauffeur in 60 seconds. Fixed price, instant confirmation, flight tracking included. Airport transfers, intercity routes, corporate travel.',
}

const guarantees = [
  'Fixed price — guaranteed at booking',
  'Free cancellation up to 1 hour',
  'Flight tracking included',
]

export default function BookPage() {
  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(bookingSchema) }} />
      <Nav />

      {/* Header */}
      <section className="bg-anthracite pt-32 pb-10 md:pt-40 md:pb-12 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Instant Booking</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[52px] max-w-xl">
            Your transfer,<br />
            <span className="display-italic">confirmed in seconds.</span>
          </h1>
          <p className="body-text text-[13px] mt-4">Fixed price. Instant confirmation. No callbacks.</p>
        </div>
      </section>

      {/* Booking wizard */}
      <section className="bg-anthracite py-12 md:py-16">
        <BookingWizard />
      </section>

      {/* Guarantees */}
      <section className="bg-anthracite-mid py-12 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-center gap-8 md:gap-16">
            {guarantees.map((g) => (
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
            <p className="label mb-6">How booking works</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">Four steps, <span className="display-italic">sixty seconds.</span></h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { step: '01', title: 'Choose your route', body: 'Enter your pickup address, destination, date and time. Every Prague address and every major Central European city is supported.' },
              { step: '02', title: 'Pick your vehicle', body: 'Mercedes E-Class, S-Class or V-Class — each price is quoted up front and includes every toll, vignette and fee along the way.' },
              { step: '03', title: 'Confirm in seconds', body: 'Secure card payment or invoicing for corporate accounts. A confirmation email with driver contact is in your inbox before the page reloads.' },
              { step: '04', title: 'We take it from there', body: 'Your chauffeur begins tracking your flight (for airport pickups) or your calendar (for scheduled transfers). You just arrive on time.' },
            ].map((s) => (
              <div key={s.step} className="border border-anthracite-light p-8">
                <p className="font-body font-light text-[9px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--copper)' }}>{s.step}</p>
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{s.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What happens after you book */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <div>
            <p className="label mb-6">After you book</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-6">The work begins <span className="display-italic">the moment you confirm.</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              A PRESTIGO booking is not a request — it is a commitment. The instant you hit confirm, your trip enters our dispatch system, a chauffeur and vehicle are allocated, and the preparation sequence begins. You will receive your driver&rsquo;s name, photo, phone number, and vehicle details well before pickup. If it&rsquo;s an airport transfer, live flight tracking is already running.
            </p>
          </div>
          <ul className="flex flex-col gap-4">
            {[
              { t: 'Instant email + SMS confirmation', b: 'Booking reference, pickup time, driver contact, and a live status link — usually within ten seconds of payment.' },
              { t: 'Chauffeur assigned in advance', b: 'For most bookings, your driver is confirmed hours or days before pickup. For same-day bookings, you receive driver details the moment allocation completes.' },
              { t: 'Flight tracking for airport pickups', b: 'Your driver monitors your flight against live ATC data. If you land early, the car is already there. If you land late, the wait is on us.' },
              { t: 'Meet &amp; greet on arrival', b: 'For airport collections, your chauffeur waits in Arrivals with a PRESTIGO name board. You never have to find them — they find you.' },
              { t: 'Silent journey by default', b: 'Conversation is welcome, but never expected. Most of our chauffeurs will not speak unless you speak first.' },
              { t: 'Confirmation email with invoice', b: 'Once the journey is complete, a full invoice arrives in your inbox automatically. Corporate accounts receive monthly consolidated statements instead.' },
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
        </div>
      </section>

      {/* Why book direct */}
      <section className="bg-anthracite py-16 md:py-24 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="mb-14 max-w-2xl">
            <p className="label mb-6">Why book direct</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">The price you see <span className="display-italic">is the price you pay.</span></h2>
            <p className="body-text text-[13px] mt-6" style={{ lineHeight: '1.9' }}>
              Most premium chauffeur trips in Prague are sold by global aggregators who add a 25&ndash;40% margin on top of the operator&rsquo;s rate. You pay more, the driver earns less, and nobody on either side of the journey is quite sure who is responsible when something goes wrong. Booking direct with PRESTIGO removes all of that.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { title: 'No marketplace margin', body: 'Every euro you pay goes to the operator and the driver. Booking direct is between 20 and 40 percent cheaper than the same journey sold through a global aggregator.' },
              { title: 'Direct driver contact', body: 'You have your chauffeur&rsquo;s phone number from the moment the booking is confirmed. No intermediary, no ticketing system, no call centre between you and the car.' },
              { title: 'One accountable operator', body: 'PRESTIGO operates the cars and employs the drivers. When a booking needs to be changed, rerouted, or recovered, there is exactly one person on the phone — not a contractor of a contractor.' },
            ].map((item) => (
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
          <h2 className="display text-[28px] md:text-[34px] mb-12">Booking questions</h2>
          <div className="flex flex-col gap-0">
            {[
              { q: 'Can I cancel or change my booking?', a: 'Yes. Cancellations are free up to one hour before the scheduled pickup — the refund is processed to the original payment method within one business day, with no cancellation fee and no deduction. Changes to pickup time, pickup or drop-off address, vehicle class, or passenger name are free at any time, including inside the one-hour window and even after the driver has been dispatched. To make a change, call or WhatsApp dispatch on +420 725 986 855, or email your booking reference to info@rideprestigo.com. For last-minute cancellations inside the one-hour window we charge 50 % of the fare to cover the dispatched driver&rsquo;s lost slot, except when the cancellation is caused by a cancelled or heavily delayed flight — in which case we waive the fee entirely and rebook automatically for your next arrival, at no extra cost.' },
              { q: 'What payment methods do you accept?', a: 'Online bookings are paid by credit or debit card at checkout — we accept Visa, Mastercard, American Express, and Apple Pay / Google Pay via Stripe. The full fare is charged at the moment you confirm, not after the trip, so there are no surprises at drop-off. Corporate accounts are billed on a monthly consolidated invoice instead, payable by bank transfer or card within 30 days; your travellers never see a payment screen. We do not accept cash inside the vehicle, and we never ask for additional payment from the chauffeur after the trip — anyone claiming otherwise is not a PRESTIGO driver. Tipping is not expected but is always welcome and goes directly to the chauffeur. Receipts and VAT invoices are emailed automatically within minutes of the trip completing.' },
              { q: 'Is waiting time included in the fare?', a: 'Yes, generous waiting time is included in every booking. For airport pickups at Václav Havel Airport (PRG), we include 60 minutes of free waiting measured from the flight&rsquo;s actual landing time — enough to clear passport control, collect luggage, and reach the meeting point even after a delayed arrival or a long immigration queue. For scheduled transfers from a hotel, office, or residential address, we include 15 minutes of free waiting at the pickup. Once the included allowance is exceeded, waiting is billed at a clear hourly rate (€40/hour for E-Class, €60/hour for S-Class, €50/hour for V-Class), and the chauffeur always contacts you before the meter begins so the extension is a conscious choice, not a surprise on the final invoice. Corporate accounts can configure longer default waiting allowances on request.' },
              { q: 'What happens if my flight is delayed or cancelled?', a: 'Your driver tracks your flight in real time from the moment you confirm the booking, using live air-traffic-control data rather than scheduled times. If you land early, the chauffeur is already in the arrivals hall with a PRESTIGO name board. If the flight is delayed by minutes or hours, the pickup automatically shifts to the new actual landing time and you pay nothing extra — delayed-flight waiting is always free with no hourly cap. If the flight is cancelled entirely by the airline, we cancel the booking at no charge and proactively rebook against your next arrival as soon as it is confirmed. For connecting flights we track the final inbound leg, not the scheduled original, so a missed connection never leaves you stranded with a driver at the wrong gate at the wrong time.' },
              { q: 'Can I bring luggage, children, or pets in the vehicle?', a: 'Yes to all three, with the exact capacity depending on your chosen vehicle class. E-Class fits 2 large suitcases plus 2 cabin bags; S-Class the same; V-Class takes 6 large cases plus 6 cabin bags with all seats occupied. Children are welcome at any age — we carry EU-certified R129/i-Size rear-facing infant seats, forward-facing toddler seats, and booster cushions at no additional cost, installed before pickup once you confirm the child&rsquo;s age and weight at booking. Small pets (cats, small dogs) travel free in a pet carrier, and larger dogs are welcome in the V-Class with advance notice. Oversized items (skis, golf bags, bicycles partially dismantled, musical instruments) fit in the V-Class on request. If you are unsure whether your luggage fits, send us a rough inventory at booking and we will confirm the right class.' },
              { q: 'Can I book a trip for someone else?', a: 'Absolutely — and this is how most of our corporate and hospitality bookings work in practice. Enter the traveller&rsquo;s name in the passenger field at checkout and the chauffeur will hold that name on the arrivals board, collect the traveller by name at the pickup point, and deliver them to the destination. You can optionally add the traveller&rsquo;s mobile number so the driver contacts them directly on arrival, especially useful for VIP airport pickups where a travel assistant booked in advance. The booking confirmation, payment receipt, and invoice are sent to your email (the booker), not to the traveller — so your finance team gets the paperwork and the traveller simply travels. For repeat third-party bookings, corporate accounts streamline this further: one travel manager books for dozens of named travellers across the company.' },
            ].map((faq, i) => (
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
