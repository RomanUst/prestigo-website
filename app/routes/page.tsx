import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Prague Private Chauffeur — 30 Intercity Routes',
  description: 'Private chauffeur transfers from Prague to 30 destinations across Central Europe. Vienna from €485, Berlin from €580, Munich from €635, Budapest from €885. Fixed price, door-to-door.',
  alternates: { canonical: '/routes' },
  openGraph: {
    url: 'https://rideprestigo.com/routes',
    title: 'Prague Private Chauffeur — 30 Intercity Routes',
    description: 'Private chauffeur transfers from Prague to 30 destinations across Central Europe. Vienna from €485, Berlin from €580, Munich from €635, Budapest from €885. Fixed price, door-to-door.',
  },
}

const routes = [
  { from: 'Prague', to: 'Kutná Hora', slug: 'prague-kutna-hora', h2: 'Prague to Kutná Hora Transfer', description: 'The silver-mining city of medieval Bohemia. 70 km east — UNESCO old town, the Sedlec Ossuary, and the Cathedral of St. Barbara. The most accessible day trip from Prague by private car.', distance: '~70 km', duration: '~1 hour', road: null, price: 'From €115', notes: ['Sedlec Ossuary visit available on request', 'Return same day available'] },
  { from: 'Prague', to: 'Plzeň', slug: 'prague-plzen', h2: 'Prague to Plzeň Transfer', description: 'Home of Pilsner Urquell and West Bohemia\'s industrial capital. 90 km west on the D5 — brewery tours, the Republic Square, and a thriving Czech tech sector.', distance: '~90 km', duration: '~1 hour', road: 'Motorway D5', price: 'From €150', notes: ['Pilsner Urquell brewery tour available on request'] },
  { from: 'Prague', to: 'Liberec', slug: 'prague-liberec', h2: 'Prague to Liberec Chauffeur', description: 'North Bohemia\'s mountain capital. 105 km north — Jizera Mountains cable car, the neo-baroque town hall, and Czech glass tradition. Day trip distance from Prague.', distance: '~105 km', duration: '~1.5 hours', road: null, price: 'From €175', notes: ['Ski resorts and hiking in the Jizera Mountains nearby'] },
  { from: 'Prague', to: 'Pardubice', slug: 'prague-pardubice', h2: 'Prague to Pardubice Transfer', description: 'East Bohemia\'s equestrian city. 110 km east on the D11 — the Grand Pardubice Steeplechase, a well-preserved Old Town, and close ties with Hradec Králové.', distance: '~110 km', duration: '~1.5 hours', road: 'Motorway D11', price: 'From €180', notes: ['Hradec Králové stop available en route'] },
  { from: 'Prague', to: 'Hradec Králové', slug: 'prague-hradec-kralove', h2: 'Prague to Hradec Králové Chauffeur', description: 'The royal city on the upper Elbe. 115 km east — modernist architecture by Kotěra and Gočár, East Bohemia Museum, and the Czech military history capital.', distance: '~115 km', duration: '~1.5 hours', road: 'Motorway D11', price: 'From €190', notes: ['Pardubice stop available en route'] },
  { from: 'Prague', to: 'Karlovy Vary', slug: 'prague-karlovy-vary', h2: 'Prague to Karlovy Vary Transfer', description: 'The crown jewel of the Bohemian spa triangle. 130 km west on the D6 — film festival, thermal colonnades, Becherovka, and the most celebrated spa destination in Central Europe.', distance: '~130 km', duration: '~1.5 hours', road: 'Motorway D6', price: 'From €215', notes: ['Mariánské Lázně and Františkovy Lázně nearby'] },
  { from: 'Prague', to: 'Dresden', slug: 'prague-dresden', h2: 'Prague to Dresden Private Transfer', description: 'Just 150 km through the Saxon Switzerland national park. The closest major German city to Prague — Semperoper, Zwinger, and Frauenkirche.', distance: '~150 km', duration: '~1.5 hours', road: 'Motorway D8/A17', price: 'From €250', notes: [] },
  { from: 'Prague', to: 'České Budějovice', slug: 'prague-ceske-budejovice', h2: 'Prague to České Budějovice Transfer', description: 'South Bohemia\'s capital and home of Budvar. 155 km south — the baroque main square, Budějovický Budvar brewery, and a gateway to Šumava and Český Krumlov.', distance: '~155 km', duration: '~2 hours', road: null, price: 'From €255', notes: ['Český Krumlov nearby — add as a stop on request'] },
  { from: 'Prague', to: 'Leipzig', slug: 'prague-leipzig', h2: 'Prague to Leipzig Private Chauffeur', description: 'Bach\'s city and Germany\'s new creative capital. 165 km north on the D8 — the most direct route into Saxony, with a Dresden stopover available.', distance: '~165 km', duration: '~2 hours', road: 'Motorway D8/A14', price: 'From €270', notes: ['Dresden stopover available en route'] },
  { from: 'Prague', to: 'Mariánské Lázně', slug: 'prague-marianske-lazne', h2: 'Prague to Mariánské Lázně Chauffeur', description: 'The green pearl of the Bohemian spa triangle. 165 km west — Chopin\'s summer retreat, colonnaded springs, and the most elegant atmosphere in Czech spa country.', distance: '~165 km', duration: '~2 hours', road: 'Motorway D6', price: 'From €270', notes: ['Karlovy Vary stop available en route', 'Františkovy Lázně nearby'] },
  { from: 'Prague', to: 'Český Krumlov', slug: 'prague-cesky-krumlov', h2: 'Prague to Český Krumlov Chauffeur', description: 'UNESCO old town on the Vltava bend, 175 km south. The most requested day trip from Prague — baroque castle, cobbled streets, and the river below. Private and punctual.', distance: '~175 km', duration: '~2.5 hours', road: null, price: 'From €290', notes: ['Return same day available', 'České Budějovice stop on request'] },
  { from: 'Prague', to: 'Františkovy Lázně', slug: 'prague-frantiskovy-lazne', h2: 'Prague to Františkovy Lázně Transfer', description: 'The smallest and most refined of the Bohemian spa towns. 175 km west — Empire-style colonnades, pure mineral springs, and the quietest corner of West Bohemia.', distance: '~175 km', duration: '~2.5 hours', road: 'Motorway D6', price: 'From €290', notes: ['Mariánské Lázně and Karlovy Vary nearby'] },
  { from: 'Prague', to: 'Linz', slug: 'prague-linz', h2: 'Prague to Linz Private Transfer', description: 'Austria\'s industrial capital and European Capital of Culture. 195 km south — Ars Electronica, the Danube, and a two-and-a-half-hour drive from Prague\'s centre.', distance: '~195 km', duration: '~2.5 hours', road: null, price: 'From €320', notes: [] },
  { from: 'Prague', to: 'Brno', slug: 'prague-brno', h2: 'Prague to Brno Chauffeur', description: 'Moravia\'s capital and the Czech second city. 205 km southeast on the D1 — tech sector, trade fairs, Špilberk.', distance: '~205 km', duration: '~2.5 hours', road: 'Motorway D1', price: 'From €340', notes: [] },
  { from: 'Prague', to: 'Passau', slug: 'prague-passau', h2: 'Prague to Passau Private Transfer', description: 'The city of three rivers. 220 km southwest — where the Danube, Inn, and Ilz meet, beneath the baroque Dom and the Veste Oberhaus fortress.', distance: '~220 km', duration: '~2.5 hours', road: null, price: 'From €365', notes: ['Linz stopover available on the Danube route'] },
  { from: 'Prague', to: 'Olomouc', slug: 'prague-olomouc', h2: 'Prague to Olomouc Private Transfer', description: 'Moravia\'s hidden capital and university city. 280 km east — six baroque fountains, the UNESCO Holy Trinity Column, and Czech café culture at its finest.', distance: '~280 km', duration: '~3 hours', road: 'Motorway D1/D46', price: 'From €460', notes: ['Brno stop available en route'] },
  { from: 'Prague', to: 'Wrocław', slug: 'prague-wroclaw', h2: 'Prague to Wrocław Private Transfer', description: 'Poland\'s Venice of the North. Three hours through Lower Silesia — university city, medieval market square, MICE hub.', distance: '~285 km', duration: '~3 hours', road: null, price: 'From €470', notes: [] },
  { from: 'Prague', to: 'Regensburg', slug: 'prague-regensburg', h2: 'Prague to Regensburg Private Transfer', description: 'Bavaria\'s best-preserved medieval city. 285 km southwest — the 12th-century stone bridge, the UNESCO Altstadt, and the Danube — one hour from Munich.', distance: '~285 km', duration: '~3 hours', road: 'Motorway D5/A93', price: 'From €470', notes: ['Nuremberg and Munich within easy reach from Regensburg'] },
  { from: 'Prague', to: 'Vienna', slug: 'prague-vienna', h2: 'Prague to Vienna Private Chauffeur', description: 'The classic Central European route. 295 km through the Bohemian countryside, arriving in Vienna\'s Innere Stadt. Business class, without the airport.', distance: '~295 km', duration: '~3.5 hours', road: 'Motorway D1/A22', price: 'From €485', notes: ['Flight tracking from Vienna Airport on return', 'Stops available on request (Bratislava, Brno)'], image: '/vienna.png' },
  { from: 'Prague', to: 'Salzburg', slug: 'prague-salzburg', h2: 'Prague to Salzburg Chauffeur', description: 'Mozart, the Fortress, and the Alps. 305 km southwest — business, leisure, or a Festspiele weekend.', distance: '~305 km', duration: '~3.5 hours', road: null, price: 'From €505', notes: [] },
  { from: 'Prague', to: 'Zlín', slug: 'prague-zlin', h2: 'Prague to Zlín Chauffeur', description: 'The functionalist company town on the Dřevnice. 310 km southeast — Baťa\'s legacy, constructivist architecture, and an international film festival with a global reputation.', distance: '~310 km', duration: '~3.5 hours', road: null, price: 'From €510', notes: ['Olomouc stop available en route'] },
  { from: 'Prague', to: 'Bratislava', slug: 'prague-bratislava', h2: 'Prague to Bratislava Chauffeur', description: 'Slovakia\'s capital on the Danube. EU institutions, corporate travel, weekend breaks — 330 km, 3.5 hours.', distance: '~330 km', duration: '~3.5 hours', road: null, price: 'From €545', notes: [] },
  { from: 'Prague', to: 'Berlin', slug: 'prague-berlin', h2: 'Prague to Berlin Private Transfer', description: 'Four hours north through Dresden. Board meetings, trade shows, weekend escapes. One vehicle, one price, no connections.', distance: '~350 km', duration: '~4 hours', road: 'Motorway D8/A17', price: 'From €580', notes: ['Dresden stopover available', 'Return journeys bookable online'] },
  { from: 'Prague', to: 'Nuremberg', slug: 'prague-nuremberg', h2: 'Prague to Nuremberg Chauffeur', description: 'Medieval Altstadt, the Christmas market, BMW day trips. 360 km southwest through Pilsen and Bavaria.', distance: '~360 km', duration: '~3.5 hours', road: 'Motorway D5/A93', price: 'From €595', notes: [] },
  { from: 'Prague', to: 'Ostrava', slug: 'prague-ostrava', h2: 'Prague to Ostrava Chauffeur', description: 'Czech industrial heritage transformed. 370 km northeast — Dolní Vítkovice arts precinct, Colours of Ostrava festival, and the Slovak and Polish borders within reach.', distance: '~370 km', duration: '~4 hours', road: 'Motorway D1', price: 'From €610', notes: ['Olomouc stop available en route', 'Katowice (Poland) nearby'] },
  { from: 'Prague', to: 'Munich', slug: 'prague-munich', h2: 'Prague to Munich Chauffeur Service', description: 'West through Pilsen and Bavaria. Oktoberfest, business parks, the Munich airport — PRESTIGO covers every reason to travel.', distance: '~385 km', duration: '~4 hours', road: 'Motorway D5/A93', price: 'From €635', notes: ['Munich Airport (MUC) pickups included'] },
  { from: 'Prague', to: 'Kraków', slug: 'prague-krakow', h2: 'Prague to Kraków Chauffeur', description: 'The royal capital and cultural heart of Poland. Four hours east on the expressway — Wawel, Kazimierz, and Auschwitz visits.', distance: '~385 km', duration: '~4 hours', road: null, price: 'From €635', notes: [] },
  { from: 'Prague', to: 'Graz', slug: 'prague-graz', h2: 'Prague to Graz Private Transfer', description: 'Styria\'s capital and a UNESCO city of design. 450 km south of Prague — four and a half hours, door to door.', distance: '~450 km', duration: '~4.5 hours', road: null, price: 'From €745', notes: [] },
  { from: 'Prague', to: 'Budapest', slug: 'prague-budapest', h2: 'Prague to Budapest Private Driver', description: 'Brno, Vienna, and the Danube bend — five and a half hours that feel curated. Grand baths, ruin bars, parliament views.', distance: '~535 km', duration: '~5.5 hours', road: null, price: 'From €885', notes: ['Vienna and Bratislava stops available'] },
  { from: 'Prague', to: 'Warsaw', slug: 'prague-warsaw', h2: 'Prague to Warsaw Private Chauffeur', description: 'Poland\'s capital. Seven hours northeast — government visits, board meetings, tech sector. No connections, no delays.', distance: '~660 km', duration: '~7 hours', road: null, price: 'From €1,090', notes: ['Wrocław or Kraków stopover available'] },
]

const faqs = [
  {
    q: 'Can I stop en route?',
    a: 'Yes. Stops can be added at booking or on the day.',
  },
  {
    q: 'What if my plans change?',
    a: 'Free cancellation up to 2 hours before departure.',
  },
  {
    q: 'Can I book a return journey?',
    a: 'Yes, return bookings are available at a discount.',
  },
  {
    q: 'What vehicle will I travel in?',
    a: 'Mercedes E-Class (standard), S-Class (executive), or V-Class (group). Select at booking.',
  },
]


const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
  ],
}

export default function RoutesPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Intercity Routes</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            Central Europe,<br />
            <span className="display-italic">door to door.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            Prague is the centre of Central Europe. Vienna, Berlin, Munich, Budapest — all within a day's drive. PRESTIGO chauffeurs cover 30 routes with fixed pricing, premium vehicles, and zero surprises.
          </p>
        </div>
      </section>

      {/* Route sections */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col gap-0">
          {routes.map((r, i) => {
            const hasImage = 'image' in r
            const cardContent = (
              <>
                <div>
                  <p className="label mb-4">{r.from} → {r.to}</p>
                  <h2 className="display text-[26px] md:text-[32px] mb-4">{r.h2}</h2>
                  <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{r.description}</p>
                </div>
                <div className="flex flex-col justify-between gap-6">
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-6">
                      <div>
                        <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>Distance</p>
                        <p className="font-body font-light text-[13px] text-offwhite">{r.distance}</p>
                      </div>
                      <div>
                        <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>Duration</p>
                        <p className="font-body font-light text-[13px] text-offwhite">{r.duration}</p>
                      </div>
                      <div>
                        <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>Price</p>
                        <p className="font-body font-light text-[13px]" style={{ color: 'var(--copper-light)' }}>{r.price}</p>
                      </div>
                    </div>
                    {r.notes.length > 0 && (
                      <ul className="flex flex-col gap-2 mt-2">
                        {r.notes.map((n) => (
                          <li key={n} className="flex items-start gap-3">
                            <span className="mt-[6px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                            <span className="font-body font-light text-[12px] text-warmgrey">{n}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <a href="/book" className="btn-primary self-start" style={{ padding: '10px 24px', fontSize: '9px' }}>
                      Book Prague → {r.to}
                    </a>
                    <a href={`/routes/${r.slug}`} className="btn-ghost self-start" style={{ padding: '10px 24px', fontSize: '9px' }}>
                      Route Details
                    </a>
                  </div>
                </div>
              </>
            )
            if (hasImage) {
              return (
                <div
                  key={r.to}
                  className={`relative overflow-hidden border-b border-anthracite-light -mx-6 md:-mx-12 ${i === 0 ? 'border-t' : ''}`}
                  style={{
                    backgroundImage: `url(${(r as { image: string }).image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    minHeight: '460px',
                  }}
                >
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(28,28,30,0.92) 30%, rgba(28,28,30,0.55) 100%)' }} />
                  <div className="relative z-10 py-14 md:py-16 px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
                    {cardContent}
                  </div>
                </div>
              )
            }
            return (
              <div
                key={r.to}
                className={`py-14 md:py-16 border-b border-anthracite-light grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 ${i === 0 ? 'border-t' : ''}`}
              >
                {cardContent}
              </div>
            )
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-14">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { step: '01', title: 'Book', body: 'Select your route and vehicle. Fixed price confirmed instantly.' },
              { step: '02', title: 'Travel', body: 'Your chauffeur collects you at the agreed time and location.' },
              { step: '03', title: 'Arrive', body: 'Door-to-door delivery. No transfers, no terminals, no waiting.' },
            ].map((s) => (
              <div key={s.step} className="border border-anthracite-light p-8">
                <p className="font-body font-light text-[9px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--copper)' }}>{s.step}</p>
                <h3 className="font-display font-light text-[22px] text-offwhite mb-3">{s.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-20 border-t border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[34px] mb-12">Common questions</h2>
          <div className="flex flex-col gap-0">
            {faqs.map((faq, i) => (
              <div
                key={faq.q}
                className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}
              >
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite-mid py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <h2 className="display text-[28px] md:text-[36px]">
              Not seeing your destination?<br />
              <span className="display-italic">We go anywhere.</span>
            </h2>
            <p className="body-text text-[13px] mt-4">PRESTIGO covers all destinations across Central Europe.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">Book a Route</a>
            <a href="/contact" className="btn-ghost">Request Custom Route</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
