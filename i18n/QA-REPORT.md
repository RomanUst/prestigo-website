# i18n Translation Pipeline — QA Report

Generated: 2026-09-16T16:20:23.085Z

## Key Completeness (vs `messages/en.json`)

### ru
- Missing: 0
- Extra: 0

### es
- Missing: 0
- Extra: 0

### fr
- Missing: 0
- Extra: 0

## No-English-Leakage Check (units processed this run)

### ru
- `content/pages/en/data-deletion.json::requestReceived.paragraph2EmailLabel`: "info@rideprestigo.com"
- `content/pages/en/data-deletion.json::section2.paragraph1EmailLabel`: "info@rideprestigo.com"
- `content/pages/en/privacy.json::section1.contactEmailLabel`: "info@rideprestigo.com"
- `content/pages/en/privacy.json::section1.contactSuffix`: "."
- `content/pages/en/privacy.json::section8.outroEmailLabel`: "info@rideprestigo.com"
- `content/pages/en/privacy.json::section9.authorityName`: "Úřad pro ochranu osobních údajű"
- `content/pages/en/privacy.json::section9.authorityUrlLabel`: "www.uoou.cz"
- `content/pages/en/terms.json::section2.bookingLinkLabel`: "rideprestigo.com/book"
- `content/pages/en/terms.json::section10.suffix`: "."

### es
- `content/routes/en/prague-zlin.json::relatedHeading.italic`: "Moravia."
- `content/pages/en/about.json::founder.headingLine1`: "Roman Ustyugov,"
- `content/pages/en/blog.json::hero.label`: "Blog"
- `content/pages/en/data-deletion.json::requestReceived.paragraph2EmailLabel`: "info@rideprestigo.com"
- `content/pages/en/data-deletion.json::section2.paragraph1EmailLabel`: "info@rideprestigo.com"
- `content/pages/en/privacy.json::section1.contactEmailLabel`: "info@rideprestigo.com"
- `content/pages/en/privacy.json::section1.contactSuffix`: "."
- `content/pages/en/privacy.json::section7.title`: "Cookies"
- `content/pages/en/privacy.json::section8.outroEmailLabel`: "info@rideprestigo.com"
- `content/pages/en/privacy.json::section9.authorityName`: "Úřad pro ochranu osobních údajű"
- `content/pages/en/privacy.json::section9.authorityUrlLabel`: "www.uoou.cz"
- `content/pages/en/terms.json::section2.bookingLinkLabel`: "rideprestigo.com/book"
- `content/pages/en/terms.json::section10.suffix`: "."

### fr
- `content/routes/en/prague-zlin.json::hero.label`: "Prague → Zlín"
- `content/pages/en/about.json::founder.headingLine1`: "Roman Ustyugov,"
- `content/pages/en/blog.json::hero.label`: "Blog"
- `content/pages/en/data-deletion.json::requestReceived.paragraph2EmailLabel`: "info@rideprestigo.com"
- `content/pages/en/data-deletion.json::section2.paragraph1EmailLabel`: "info@rideprestigo.com"
- `content/pages/en/privacy.json::section1.contactEmailLabel`: "info@rideprestigo.com"
- `content/pages/en/privacy.json::section1.contactSuffix`: "."
- `content/pages/en/privacy.json::section7.title`: "Cookies"
- `content/pages/en/privacy.json::section8.outroEmailLabel`: "info@rideprestigo.com"
- `content/pages/en/privacy.json::section9.authorityName`: "Úřad pro ochranu osobních údajű"
- `content/pages/en/privacy.json::section9.authorityUrlLabel`: "www.uoou.cz"
- `content/pages/en/services/airport-transfer.json::faqsHeading`: "Questions"
- `content/pages/en/services/concierge.json::faqHeading`: "Questions"
- `content/pages/en/terms.json::section2.bookingLinkLabel`: "rideprestigo.com/book"
- `content/pages/en/terms.json::section10.suffix`: "."

## DNT / ICU-Variable / Plural-Category Preservation

- No DNT/ICU/plural preservation failures this run.

## MDX Structural Invariants

- No MDX structural-invariant failures this run.

## Sampled Diff (for the owner’s manual native-speaker spot-check)

### ru
- `content/routes/en/prague-zlin.json::hero.label`
  - EN: Prague → Zlín
  - RU: Прага → Злин
- `content/routes/en/prague-zlin.json::hero.headlineLine1`
  - EN: Prague to Zlín,
  - RU: Из Праги в Злин,
- `content/routes/en/prague-zlin.json::hero.headlineItalic`
  - EN: Baťa's city.
  - RU: город Бати.
- `content/routes/en/prague-zlin.json::hero.intro`
  - EN: 310 km east to Moravia's functionalist city. Built by the Baťa shoe empire, Zlín is a rare monument to 20th-century industrial urbanism — three and a half hours, one fixed price.
  - RU: 310 км на восток, в моравский город функционализма. Построенный обувной империей Бати, Злин — редкий памятник промышленного урбанизма XX века. Три с половиной часа, одна фиксированная цена.
- `content/routes/en/prague-zlin.json::openingParagraphs`
  - EN: A private transfer from Prague to Zlín covers 310 km and takes approximately 3.5 hours door to door. Fixed fare starts at €{ePrice} in a Mercedes E-Class for up to 3 passengers; groups of up to 6 travel in the V-Class from €{vPrice}; the S-Class is available from €{sPrice} for executive or VIP travel. Every booking includes the driver's time, fuel, Czech motorway vignette, bottled water, onboard Wi-Fi, phone charger, and child seats on request at no extra cost. Nothing is added at drop-off. The fare is agreed before departure and does not change regardless of traffic or waiting time at your destination. Stops en route — Brno or Uherské Hradiště — are available at the fixed fare when arranged at booking. Your chauffeur monitors traffic before every departure and reroutes without asking if there is a delay.,This is not a shared shuttle. Not a ride-hail app. A private Mercedes, one chauffeur, and a fare that does not change.
  - RU: Индивидуальный трансфер из Праги в Злин — это 310 км и примерно 3,5 часа пути от двери до двери. Фиксированная стоимость начинается от €{ePrice} в Mercedes E-Class для не более трёх пассажиров; группы до 6 человек едут в V-Class от €{vPrice}; S-Class доступен от €{sPrice} для поездок руководителей и VIP-гостей. В каждый заказ включены время водителя, топливо, чешская автомобильная виньетка, бутилированная вода, Wi-Fi в салоне, зарядное устройство для телефона, а также детские кресла по запросу без дополнительной оплаты. При высадке ничего не добавляется. Стоимость согласуется до начала поездки и не меняется независимо от ситуации на дорогах или времени ожидания в пункте назначения. Остановки в пути — в Брно или Угерске-Градиште — доступны в рамках фиксированной стоимости, если они согласованы при бронировании. Ваш водитель проверяет дорожную обстановку перед каждой поездкой и меняет маршрут без лишних вопросов, если возникает задержка.,Это не совместный шаттл. Не приложение для вызова такси. Индивидуальный Mercedes, один водитель и стоимость, которая не меняется.

### es
- `content/routes/en/prague-zlin.json::hero.label`
  - EN: Prague → Zlín
  - ES: Praga → Zlín
- `content/routes/en/prague-zlin.json::hero.headlineLine1`
  - EN: Prague to Zlín,
  - ES: De Praga a Zlín,
- `content/routes/en/prague-zlin.json::hero.headlineItalic`
  - EN: Baťa's city.
  - ES: la ciudad de Baťa.
- `content/routes/en/prague-zlin.json::hero.intro`
  - EN: 310 km east to Moravia's functionalist city. Built by the Baťa shoe empire, Zlín is a rare monument to 20th-century industrial urbanism — three and a half hours, one fixed price.
  - ES: 310 km hacia el este, hasta la ciudad funcionalista de Moravia. Construida por el imperio del calzado Baťa, Zlín es un raro monumento al urbanismo industrial del siglo XX: tres horas y media, un precio fijo.
- `content/routes/en/prague-zlin.json::openingParagraphs`
  - EN: A private transfer from Prague to Zlín covers 310 km and takes approximately 3.5 hours door to door. Fixed fare starts at €{ePrice} in a Mercedes E-Class for up to 3 passengers; groups of up to 6 travel in the V-Class from €{vPrice}; the S-Class is available from €{sPrice} for executive or VIP travel. Every booking includes the driver's time, fuel, Czech motorway vignette, bottled water, onboard Wi-Fi, phone charger, and child seats on request at no extra cost. Nothing is added at drop-off. The fare is agreed before departure and does not change regardless of traffic or waiting time at your destination. Stops en route — Brno or Uherské Hradiště — are available at the fixed fare when arranged at booking. Your chauffeur monitors traffic before every departure and reroutes without asking if there is a delay.,This is not a shared shuttle. Not a ride-hail app. A private Mercedes, one chauffeur, and a fare that does not change.
  - ES: Un traslado privado de Praga a Zlín cubre 310 km y dura aproximadamente 3,5 horas de puerta a puerta. La tarifa fija parte de {ePrice} € en un Mercedes E-Class para un máximo de 3 pasajeros; los grupos de hasta 6 personas viajan en el V-Class desde {vPrice} €; el S-Class está disponible desde {sPrice} € para viajes ejecutivos o VIP. Cada reserva incluye el tiempo del chófer, el combustible, la viñeta de autopista checa, agua embotellada, Wi-Fi a bordo, cargador de teléfono y sillas infantiles a petición sin coste adicional. No se añade nada al llegar. La tarifa se acuerda antes de la salida y no cambia, independientemente del tráfico o del tiempo de espera en su destino. Las paradas en ruta —Brno o Uherské Hradiště— están disponibles con la tarifa fija si se acuerdan en el momento de la reserva. Su chófer consulta el estado del tráfico antes de cada salida y modifica la ruta sin necesidad de preguntar si hay retrasos.,No es un servicio compartido. No es una aplicación de transporte. Un Mercedes privado, un chófer y una tarifa que no cambia.

### fr
- `content/routes/en/prague-zlin.json::hero.label`
  - EN: Prague → Zlín
  - FR: Prague → Zlín
- `content/routes/en/prague-zlin.json::hero.headlineLine1`
  - EN: Prague to Zlín,
  - FR: De Prague à Zlín,
- `content/routes/en/prague-zlin.json::hero.headlineItalic`
  - EN: Baťa's city.
  - FR: la ville de Baťa.
- `content/routes/en/prague-zlin.json::hero.intro`
  - EN: 310 km east to Moravia's functionalist city. Built by the Baťa shoe empire, Zlín is a rare monument to 20th-century industrial urbanism — three and a half hours, one fixed price.
  - FR: 310 km vers l'est, jusqu'à la cité fonctionnaliste de Moravie. Édifiée par l'empire de la chaussure Baťa, Zlín est un rare monument de l'urbanisme industriel du XXe siècle — trois heures et demie, un prix fixe.
- `content/routes/en/prague-zlin.json::openingParagraphs`
  - EN: A private transfer from Prague to Zlín covers 310 km and takes approximately 3.5 hours door to door. Fixed fare starts at €{ePrice} in a Mercedes E-Class for up to 3 passengers; groups of up to 6 travel in the V-Class from €{vPrice}; the S-Class is available from €{sPrice} for executive or VIP travel. Every booking includes the driver's time, fuel, Czech motorway vignette, bottled water, onboard Wi-Fi, phone charger, and child seats on request at no extra cost. Nothing is added at drop-off. The fare is agreed before departure and does not change regardless of traffic or waiting time at your destination. Stops en route — Brno or Uherské Hradiště — are available at the fixed fare when arranged at booking. Your chauffeur monitors traffic before every departure and reroutes without asking if there is a delay.,This is not a shared shuttle. Not a ride-hail app. A private Mercedes, one chauffeur, and a fare that does not change.
  - FR: Un transfert privé de Prague à Zlín couvre 310 km et demande environ 3 h 30 de porte à porte. Le tarif fixe débute à {ePrice} € en Mercedes E-Class pour 3 passagers au maximum ; les groupes jusqu'à 6 personnes voyagent en V-Class à partir de {vPrice} € ; la S-Class est proposée à partir de {sPrice} € pour un déplacement d'affaires ou VIP. Chaque réservation comprend le temps du chauffeur, le carburant, la vignette autoroutière tchèque, l'eau en bouteille, le Wi-Fi à bord, un chargeur de téléphone et les sièges enfant sur demande, sans supplément. Rien n'est ajouté à l'arrivée. Le tarif est convenu avant le départ et ne varie pas, quels que soient la circulation ou le temps d'attente à destination. Des arrêts en chemin — Brno ou Uherské Hradiště — sont possibles au tarif fixe s'ils sont convenus lors de la réservation. Votre chauffeur surveille le trafic avant chaque départ et modifie l'itinéraire de lui-même en cas de retard.,Ce n'est pas une navette partagée. Ni une application de VTC. Une Mercedes privée, un chauffeur, et un tarif qui ne change pas.
