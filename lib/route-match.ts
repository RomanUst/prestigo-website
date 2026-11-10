/**
 * Route pre-fill for the booking form.
 *
 * "Book this Route" on a route page used to open an empty /book form, so the
 * visitor had to type both cities again (Clarity, Nov 2026). `routeBookQuery`
 * builds the BookingWizard deeplink params (from/to + coordinates) for a
 * route_prices slug; the form then prices the trip by distance as usual.
 *
 * Client-safe: no server imports.
 */

export type LatLng = { lat: number; lng: number }

export const PRAGUE: LatLng & { label: string } = { label: 'Prague, Czechia', lat: 50.0755, lng: 14.4378 }

export const ROUTE_CITIES: Record<string, LatLng & { label: string }> = {
  'prague-kutna-hora': { label: 'Kutná Hora, Czechia', lat: 49.9484, lng: 15.2682 },
  'prague-plzen': { label: 'Plzeň, Czechia', lat: 49.7384, lng: 13.3736 },
  'prague-pardubice': { label: 'Pardubice, Czechia', lat: 50.0343, lng: 15.7812 },
  'prague-hradec-kralove': { label: 'Hradec Králové, Czechia', lat: 50.2104, lng: 15.8327 },
  'prague-liberec': { label: 'Liberec, Czechia', lat: 50.7663, lng: 15.0543 },
  'prague-karlovy-vary': { label: 'Karlovy Vary, Czechia', lat: 50.231, lng: 12.8712 },
  'prague-marianske-lazne': { label: 'Mariánské Lázně, Czechia', lat: 49.9646, lng: 12.7012 },
  'prague-frantiskovy-lazne': { label: 'Františkovy Lázně, Czechia', lat: 50.1205, lng: 12.3517 },
  'prague-cesky-krumlov': { label: 'Český Krumlov, Czechia', lat: 48.8127, lng: 14.3175 },
  'prague-ceske-budejovice': { label: 'České Budějovice, Czechia', lat: 48.9747, lng: 14.4743 },
  'prague-brno': { label: 'Brno, Czechia', lat: 49.1951, lng: 16.6068 },
  'prague-olomouc': { label: 'Olomouc, Czechia', lat: 49.5938, lng: 17.2509 },
  'prague-zlin': { label: 'Zlín, Czechia', lat: 49.2265, lng: 17.6707 },
  'prague-ostrava': { label: 'Ostrava, Czechia', lat: 49.8209, lng: 18.2625 },
  'prague-dresden': { label: 'Dresden, Germany', lat: 51.0504, lng: 13.7373 },
  'prague-leipzig': { label: 'Leipzig, Germany', lat: 51.3397, lng: 12.3731 },
  'prague-passau': { label: 'Passau, Germany', lat: 48.5665, lng: 13.4312 },
  'prague-erfurt': { label: 'Erfurt, Germany', lat: 50.9848, lng: 11.0299 },
  'prague-regensburg': { label: 'Regensburg, Germany', lat: 49.0134, lng: 12.1016 },
  'prague-nuremberg': { label: 'Nuremberg, Germany', lat: 49.4521, lng: 11.0767 },
  'prague-augsburg': { label: 'Augsburg, Germany', lat: 48.3705, lng: 10.8978 },
  'prague-munich': { label: 'Munich, Germany', lat: 48.1351, lng: 11.582 },
  'prague-frankfurt': { label: 'Frankfurt, Germany', lat: 50.1109, lng: 8.6821 },
  'prague-stuttgart': { label: 'Stuttgart, Germany', lat: 48.7758, lng: 9.1829 },
  'prague-cologne': { label: 'Cologne, Germany', lat: 50.9375, lng: 6.9603 },
  'prague-dusseldorf': { label: 'Düsseldorf, Germany', lat: 51.2277, lng: 6.7735 },
  'prague-berlin': { label: 'Berlin, Germany', lat: 52.52, lng: 13.405 },
  'prague-hamburg': { label: 'Hamburg, Germany', lat: 53.5511, lng: 9.9937 },
  'prague-linz': { label: 'Linz, Austria', lat: 48.3069, lng: 14.2858 },
  'prague-vienna': { label: 'Vienna, Austria', lat: 48.2082, lng: 16.3738 },
  'prague-salzburg': { label: 'Salzburg, Austria', lat: 47.8095, lng: 13.055 },
  'prague-graz': { label: 'Graz, Austria', lat: 47.0707, lng: 15.4395 },
  'prague-innsbruck': { label: 'Innsbruck, Austria', lat: 47.2692, lng: 11.4041 },
  'prague-bratislava': { label: 'Bratislava, Slovakia', lat: 48.1486, lng: 17.1077 },
  'prague-kosice': { label: 'Košice, Slovakia', lat: 48.7164, lng: 21.2611 },
  'prague-budapest': { label: 'Budapest, Hungary', lat: 47.4979, lng: 19.0402 },
  'prague-wroclaw': { label: 'Wrocław, Poland', lat: 51.1079, lng: 17.0385 },
  'prague-krakow': { label: 'Kraków, Poland', lat: 50.0647, lng: 19.945 },
  'prague-warsaw': { label: 'Warsaw, Poland', lat: 52.2297, lng: 21.0122 },
  'prague-basel': { label: 'Basel, Switzerland', lat: 47.5596, lng: 7.5886 },
  'prague-zurich': { label: 'Zurich, Switzerland', lat: 47.3769, lng: 8.5417 },
  'prague-bern': { label: 'Bern, Switzerland', lat: 46.948, lng: 7.4474 },
  'prague-geneva': { label: 'Geneva, Switzerland', lat: 46.2044, lng: 6.1432 },
  'prague-venice': { label: 'Venice, Italy', lat: 45.4408, lng: 12.3155 },
  'prague-verona': { label: 'Verona, Italy', lat: 45.4384, lng: 10.9916 },
  'prague-milan': { label: 'Milan, Italy', lat: 45.4642, lng: 9.19 },
  'prague-brussels': { label: 'Brussels, Belgium', lat: 50.8503, lng: 4.3517 },
  'prague-amsterdam': { label: 'Amsterdam, Netherlands', lat: 52.3676, lng: 4.9041 },
  'prague-strasbourg': { label: 'Strasbourg, France', lat: 48.5734, lng: 7.7521 },
  'prague-paris': { label: 'Paris, France', lat: 48.8566, lng: 2.3522 },
}

/**
 * Query string for /book that pre-fills a route (BookingWizard deeplink params).
 * `reverse` builds city → Prague (inbound mirror pages). Returns '' for an
 * unknown slug so the link still opens an empty form.
 */
export function routeBookQuery(slug: string, opts: { reverse?: boolean } = {}): string {
  const city = ROUTE_CITIES[slug]
  if (!city) return ''
  const [a, b] = opts.reverse ? [city, PRAGUE] : [PRAGUE, city]
  const q = new URLSearchParams({
    type: 'transfer',
    from: a.label,
    fromPlaceId: `route:${a === PRAGUE ? 'prague' : slug}`,
    fromLat: String(a.lat),
    fromLng: String(a.lng),
    to: b.label,
    toPlaceId: `route:${b === PRAGUE ? 'prague' : slug}`,
    toLat: String(b.lat),
    toLng: String(b.lng),
  })
  return `?${q.toString()}`
}
