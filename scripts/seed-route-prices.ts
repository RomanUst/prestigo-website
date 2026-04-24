// prestigo/scripts/seed-route-prices.ts
// Phase 44 — one-time seed of 50 intercity routes (idempotent UPSERT on slug).
// Run with: source prestigo/.env.local && npx tsx prestigo/scripts/seed-route-prices.ts

import { createSupabaseServiceClient } from '../lib/supabase'

type RouteSeed = {
  slug: string
  from_label: string
  to_label: string
  distance_km: number
  e_class_eur: number
  s_class_eur: number
  v_class_eur: number
  display_order: number
  place_ids: string[]
}

const ROUTES: RouteSeed[] = [
  // Czechia
  { slug: 'prague-kutna-hora',        from_label: 'Prague', to_label: 'Kutná Hora',        distance_km: 70,  e_class_eur: 110,  s_class_eur: 180,  v_class_eur: 120,  display_order: 1,  place_ids: [] },
  { slug: 'prague-plzen',             from_label: 'Prague', to_label: 'Plzeň',             distance_km: 90,  e_class_eur: 140,  s_class_eur: 230,  v_class_eur: 155,  display_order: 2,  place_ids: [] },
  { slug: 'prague-pardubice',         from_label: 'Prague', to_label: 'Pardubice',         distance_km: 110, e_class_eur: 170,  s_class_eur: 280,  v_class_eur: 190,  display_order: 3,  place_ids: [] },
  { slug: 'prague-hradec-kralove',    from_label: 'Prague', to_label: 'Hradec Králové',    distance_km: 115, e_class_eur: 180,  s_class_eur: 295,  v_class_eur: 195,  display_order: 4,  place_ids: [] },
  { slug: 'prague-liberec',           from_label: 'Prague', to_label: 'Liberec',           distance_km: 105, e_class_eur: 165,  s_class_eur: 270,  v_class_eur: 180,  display_order: 5,  place_ids: [] },
  { slug: 'prague-karlovy-vary',      from_label: 'Prague', to_label: 'Karlovy Vary',      distance_km: 130, e_class_eur: 200,  s_class_eur: 330,  v_class_eur: 220,  display_order: 6,  place_ids: [] },
  { slug: 'prague-marianske-lazne',   from_label: 'Prague', to_label: 'Mariánské Lázně',   distance_km: 165, e_class_eur: 255,  s_class_eur: 420,  v_class_eur: 280,  display_order: 7,  place_ids: [] },
  { slug: 'prague-frantiskovy-lazne', from_label: 'Prague', to_label: 'Františkovy Lázně', distance_km: 175, e_class_eur: 270,  s_class_eur: 445,  v_class_eur: 300,  display_order: 8,  place_ids: [] },
  { slug: 'prague-cesky-krumlov',     from_label: 'Prague', to_label: 'Český Krumlov',     distance_km: 175, e_class_eur: 270,  s_class_eur: 445,  v_class_eur: 300,  display_order: 9,  place_ids: [] },
  { slug: 'prague-ceske-budejovice',  from_label: 'Prague', to_label: 'České Budějovice',  distance_km: 155, e_class_eur: 240,  s_class_eur: 395,  v_class_eur: 265,  display_order: 10, place_ids: [] },
  { slug: 'prague-brno',              from_label: 'Prague', to_label: 'Brno',              distance_km: 205, e_class_eur: 320,  s_class_eur: 525,  v_class_eur: 350,  display_order: 11, place_ids: [] },
  { slug: 'prague-olomouc',           from_label: 'Prague', to_label: 'Olomouc',           distance_km: 280, e_class_eur: 435,  s_class_eur: 715,  v_class_eur: 480,  display_order: 12, place_ids: [] },
  { slug: 'prague-zlin',              from_label: 'Prague', to_label: 'Zlín',              distance_km: 310, e_class_eur: 480,  s_class_eur: 790,  v_class_eur: 530,  display_order: 13, place_ids: [] },
  { slug: 'prague-ostrava',           from_label: 'Prague', to_label: 'Ostrava',           distance_km: 370, e_class_eur: 575,  s_class_eur: 945,  v_class_eur: 635,  display_order: 14, place_ids: [] },
  // Germany
  { slug: 'prague-dresden',           from_label: 'Prague', to_label: 'Dresden',           distance_km: 150, e_class_eur: 235,  s_class_eur: 385,  v_class_eur: 255,  display_order: 15, place_ids: [] },
  { slug: 'prague-leipzig',           from_label: 'Prague', to_label: 'Leipzig',           distance_km: 260, e_class_eur: 405,  s_class_eur: 665,  v_class_eur: 445,  display_order: 16, place_ids: [] },
  { slug: 'prague-passau',            from_label: 'Prague', to_label: 'Passau',            distance_km: 220, e_class_eur: 340,  s_class_eur: 560,  v_class_eur: 375,  display_order: 17, place_ids: [] },
  { slug: 'prague-erfurt',            from_label: 'Prague', to_label: 'Erfurt',            distance_km: 250, e_class_eur: 390,  s_class_eur: 640,  v_class_eur: 430,  display_order: 18, place_ids: [] },
  { slug: 'prague-regensburg',        from_label: 'Prague', to_label: 'Regensburg',        distance_km: 285, e_class_eur: 440,  s_class_eur: 725,  v_class_eur: 485,  display_order: 19, place_ids: [] },
  { slug: 'prague-nuremberg',         from_label: 'Prague', to_label: 'Nuremberg',         distance_km: 360, e_class_eur: 560,  s_class_eur: 920,  v_class_eur: 615,  display_order: 20, place_ids: [] },
  { slug: 'prague-augsburg',          from_label: 'Prague', to_label: 'Augsburg',          distance_km: 430, e_class_eur: 665,  s_class_eur: 1095, v_class_eur: 735,  display_order: 21, place_ids: [] },
  { slug: 'prague-munich',            from_label: 'Prague', to_label: 'Munich',            distance_km: 385, e_class_eur: 595,  s_class_eur: 980,  v_class_eur: 660,  display_order: 22, place_ids: [] },
  { slug: 'prague-frankfurt',         from_label: 'Prague', to_label: 'Frankfurt',         distance_km: 455, e_class_eur: 705,  s_class_eur: 1160, v_class_eur: 780,  display_order: 23, place_ids: [] },
  { slug: 'prague-stuttgart',         from_label: 'Prague', to_label: 'Stuttgart',         distance_km: 545, e_class_eur: 845,  s_class_eur: 1390, v_class_eur: 930,  display_order: 24, place_ids: [] },
  { slug: 'prague-cologne',           from_label: 'Prague', to_label: 'Cologne',           distance_km: 610, e_class_eur: 945,  s_class_eur: 1555, v_class_eur: 1045, display_order: 25, place_ids: [] },
  { slug: 'prague-dusseldorf',        from_label: 'Prague', to_label: 'Düsseldorf',        distance_km: 640, e_class_eur: 990,  s_class_eur: 1630, v_class_eur: 1095, display_order: 26, place_ids: [] },
  { slug: 'prague-berlin',            from_label: 'Prague', to_label: 'Berlin',            distance_km: 350, e_class_eur: 545,  s_class_eur: 895,  v_class_eur: 600,  display_order: 27, place_ids: [] },
  { slug: 'prague-hamburg',           from_label: 'Prague', to_label: 'Hamburg',           distance_km: 680, e_class_eur: 1055, s_class_eur: 1735, v_class_eur: 1165, display_order: 28, place_ids: [] },
  // Austria
  { slug: 'prague-linz',              from_label: 'Prague', to_label: 'Linz',              distance_km: 195, e_class_eur: 300,  s_class_eur: 495,  v_class_eur: 335,  display_order: 29, place_ids: [] },
  { slug: 'prague-vienna',            from_label: 'Prague', to_label: 'Vienna',            distance_km: 295, e_class_eur: 455,  s_class_eur: 750,  v_class_eur: 505,  display_order: 30, place_ids: [] },
  { slug: 'prague-salzburg',          from_label: 'Prague', to_label: 'Salzburg',          distance_km: 305, e_class_eur: 475,  s_class_eur: 780,  v_class_eur: 520,  display_order: 31, place_ids: [] },
  { slug: 'prague-graz',              from_label: 'Prague', to_label: 'Graz',              distance_km: 450, e_class_eur: 700,  s_class_eur: 1150, v_class_eur: 770,  display_order: 32, place_ids: [] },
  { slug: 'prague-innsbruck',         from_label: 'Prague', to_label: 'Innsbruck',         distance_km: 545, e_class_eur: 845,  s_class_eur: 1390, v_class_eur: 930,  display_order: 33, place_ids: [] },
  // Slovakia
  { slug: 'prague-bratislava',        from_label: 'Prague', to_label: 'Bratislava',        distance_km: 330, e_class_eur: 510,  s_class_eur: 840,  v_class_eur: 565,  display_order: 34, place_ids: [] },
  { slug: 'prague-kosice',            from_label: 'Prague', to_label: 'Košice',            distance_km: 580, e_class_eur: 900,  s_class_eur: 1480, v_class_eur: 990,  display_order: 35, place_ids: [] },
  // Hungary
  { slug: 'prague-budapest',          from_label: 'Prague', to_label: 'Budapest',          distance_km: 535, e_class_eur: 830,  s_class_eur: 1365, v_class_eur: 915,  display_order: 36, place_ids: [] },
  // Poland
  { slug: 'prague-wroclaw',           from_label: 'Prague', to_label: 'Wrocław',           distance_km: 285, e_class_eur: 440,  s_class_eur: 725,  v_class_eur: 485,  display_order: 37, place_ids: [] },
  { slug: 'prague-krakow',            from_label: 'Prague', to_label: 'Kraków',            distance_km: 385, e_class_eur: 595,  s_class_eur: 980,  v_class_eur: 660,  display_order: 38, place_ids: [] },
  { slug: 'prague-warsaw',            from_label: 'Prague', to_label: 'Warsaw',            distance_km: 660, e_class_eur: 1025, s_class_eur: 1685, v_class_eur: 1130, display_order: 39, place_ids: [] },
  // Switzerland
  { slug: 'prague-basel',             from_label: 'Prague', to_label: 'Basel',             distance_km: 680, e_class_eur: 1055, s_class_eur: 1735, v_class_eur: 1165, display_order: 40, place_ids: [] },
  { slug: 'prague-zurich',            from_label: 'Prague', to_label: 'Zurich',            distance_km: 690, e_class_eur: 1070, s_class_eur: 1760, v_class_eur: 1180, display_order: 41, place_ids: [] },
  { slug: 'prague-bern',              from_label: 'Prague', to_label: 'Bern',              distance_km: 780, e_class_eur: 1210, s_class_eur: 1990, v_class_eur: 1335, display_order: 42, place_ids: [] },
  { slug: 'prague-geneva',            from_label: 'Prague', to_label: 'Geneva',            distance_km: 885, e_class_eur: 1370, s_class_eur: 2255, v_class_eur: 1515, display_order: 43, place_ids: [] },
  // Italy
  { slug: 'prague-venice',            from_label: 'Prague', to_label: 'Venice',            distance_km: 780, e_class_eur: 1210, s_class_eur: 1990, v_class_eur: 1335, display_order: 44, place_ids: [] },
  { slug: 'prague-verona',            from_label: 'Prague', to_label: 'Verona',            distance_km: 830, e_class_eur: 1285, s_class_eur: 2115, v_class_eur: 1420, display_order: 45, place_ids: [] },
  { slug: 'prague-milan',             from_label: 'Prague', to_label: 'Milan',             distance_km: 1010, e_class_eur: 1565, s_class_eur: 2575, v_class_eur: 1725, display_order: 46, place_ids: [] },
  // Belgium / Netherlands
  { slug: 'prague-brussels',          from_label: 'Prague', to_label: 'Brussels',          distance_km: 950, e_class_eur: 1475, s_class_eur: 2425, v_class_eur: 1625, display_order: 47, place_ids: [] },
  { slug: 'prague-amsterdam',         from_label: 'Prague', to_label: 'Amsterdam',         distance_km: 915, e_class_eur: 1420, s_class_eur: 2335, v_class_eur: 1565, display_order: 48, place_ids: [] },
  // France
  { slug: 'prague-strasbourg',        from_label: 'Prague', to_label: 'Strasbourg',        distance_km: 715, e_class_eur: 1110, s_class_eur: 1825, v_class_eur: 1225, display_order: 49, place_ids: [] },
  { slug: 'prague-paris',             from_label: 'Prague', to_label: 'Paris',             distance_km: 1050, e_class_eur: 1630, s_class_eur: 2680, v_class_eur: 1795, display_order: 50, place_ids: [] },
]

async function seed(): Promise<void> {
  if (ROUTES.length !== 50) {
    console.error(`Expected 50 routes, got ${ROUTES.length}`)
    process.exit(1)
  }

  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('route_prices')
    .upsert(ROUTES, { onConflict: 'slug' })
    .select('slug')

  if (error) {
    console.error('Seed failed:', error.message)
    process.exit(1)
  }

  console.log(`Seeded ${data?.length ?? 0} route prices`)
  process.exit(0)
}

seed()
