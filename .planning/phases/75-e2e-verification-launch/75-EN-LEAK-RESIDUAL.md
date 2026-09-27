# Phase 75 — EN-leak residual ledger (plan 75-26, GAP-4b / WINDOWS #24)

**Run date:** 2026-09-27 (fresh production scan, after plan 75-26 scanner/allowlist changes)
**Command:** `python3 scripts/qa/en_leak_rendered.py https://rideprestigo.com` (all 6 non-EN locales x 26 pages, default PAGES list)
**Raw output:** `scripts/qa/out/en_leak_rendered.json` (gitignored; regenerate with the command above)

**Totals:** 159 text findings + 90 link findings = 249 rows (exit 1 — findings present, all dispositioned below).

| Run | Scanner rules | Text | Link |
|-----|---------------|------|------|
| 75-20 post-fix sweep | pre-75-26 (plain substring strip; dnt/placeNames/tierNames only) | 329 | 90 |
| 2026-09-27 control re-run of the pre-75-26 scanner copy | same as above | 329 | 90 |
| 2026-09-27 after 75-26 Tasks 1-2 (properNouns + inlineTerms + structural strip, boundary-aware) | 75-26 initial allowlist | 193 | 90 |
| **2026-09-27 final (this ledger)** | 75-26 final allowlist (+ Czech/Austrian street/station/venue names, koncese/ŘPZD, i-Size, Railjet, Samsung, V 300 d trim) | **159** | **90** |

Per locale (final run):

| Locale | Text | Link |
|--------|------|------|
| ru | 31 | 15 |
| es | 8 | 15 |
| fr | 8 | 15 |
| ar | 19 | 15 |
| hi | 74 | 15 |
| zh | 19 | 15 |
| **total** | **159** | **90** |

## Disposition rules

Every row has exactly one disposition:

- `fix:75-25` — the 404 surface (`/this-page-does-not-exist`): unlocalized `app/not-found.tsx` is reached on every locale (no catch-all under `app/[locale]/`), incl. its locale-dropping home link `/`.
- `fix:75-27` — locale-dropping internal links in blog MDX (`content/blog/<loc>/*.mdx` via `mdx-components.tsx` `a`) and in the EN-only JSX post `app/[locale]/blog/prague-airport-to-city-center/page.tsx`.
- `fix:75-28` — `/login` metadata (falls back to the EN default title/description), author byline/bio/meta/alt/aria (`lib/authors.ts`, `app/[locale]/authors/roman-ustyugov/page.tsx`, `components/ArticleByline.tsx`), hardcoded homepage testimonial quote/role/source label (`lib/google-reviews.ts`), blog category labels (`content/blog/<loc>/*.mdx` frontmatter `category`). **All `fix:75-28` rows below: fixed in 75-28 (pending deploy)** — sources changed: `app/[locale]/login/layout.tsx`, `components/ArticleByline.tsx` (+ its 4 call sites), `app/[locale]/authors/roman-ustyugov/page.tsx`, `content/pages/*/authors/roman-ustyugov.json`, `lib/google-reviews.ts` + `components/TestimonialsCarousel.tsx`, `lib/blog-categories.ts` + `components/BlogCard.tsx` + `app/[locale]/blog/[slug]/page.tsx`, `messages/*.json` (Auth.login.meta*, Testimonials.hardcoded, BlogCategories).
- `fix:75-29` — Latin loanwords / untranslated fragments inside translated catalogs (`content/pages/<loc>`, `content/routes/<loc>`, `messages/<loc>.json`): hi travel loanwords (airport, pickup, driver, chauffeur, Arrivals, flight, live, checkout, door-to-door, vignette, Terminal …) and ru `Fast-track` / `Airport Transfer` / `reverse charge`. Whether hi keeps Latin loanwords is the user decision taken in 75-29.
  - **75-29 decision (user, 2026-09-27): `keep-per-glossary`.** hi keeps Latin travel/tech loanwords per `i18n/glossary.json` locales.hi.toneGuide ("common English tech/travel terms (airport, flight, terminal) stay as-is"). They are classified with hi-scoped (`"locales": ["hi"]`) `inlineTerms` in `scripts/qa/en_leak_allowlist.json`, each with a reason: airport, Airport, flight, terminal, Terminal, Arrivals, arrivals, pickup, drop-off, driver, chauffeur, door-to-door, Door-to-door, vignette, checkout, live. Only genuinely untranslated words and phrases were rewritten (e.g. `Airport transfers`, `Airport Transfer`, transfer, dispatch, global, class, passenger, last-minute, air-traffic-control, inbound leg). ru follows the ru toneGuide: `Fast-track` → «ускоренное прохождение (паспортного) контроля», `Prague Airport Transfer` and `reverse charge` → Russian.
  - **All 67 `fix:75-29` rows are annotated:** 26 × "fixed in 75-29 (pending deploy)" (leaf rewritten; kept hi loanwords listed) and 41 × "classified (75-29)" (leaf unchanged; only kept hi loanwords remained). `en_leak_catalog.py --locales hi,ru` reports 0 non-allowlisted rows for every file on the audited pages that holds a `fix:75-29` row. Production proof comes in the 75-30 re-scan.
- `classified:<reason>` — correct-as-is text that fits no allowlist category; must also exist in `classifiedResidual`. **None in this run** — `classifiedResidual` stays `[]`. Every non-actionable token found (person/venue/street/station names, official Czech terms, brand/tech/model tokens) fit `properNouns` or `inlineTerms` and is now stripped by the scanner instead of being listed here.

## Disposition summary (rows per disposition x locale)

| Disposition | ru | es | fr | ar | hi | zh | total |
|---|---|---|---|---|---|---|---|
| `fix:75-25` | 4 | 3 | 3 | 4 | 4 | 4 | 22 |
| `fix:75-27` | 14 | 14 | 14 | 14 | 14 | 14 | 84 |
| `fix:75-28` (fixed in 75-28, pending deploy) | 16 | 6 | 6 | 16 | 16 | 16 | 76 |
| `fix:75-29` (resolved in 75-29: 26 fixed + 41 classified, pending deploy) | 12 | 0 | 0 | 0 | 55 | 0 | 67 |
| `classified:*` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **total** | **46** | **23** | **23** | **34** | **89** | **34** | **249** |

Link findings: 90 = 84 `fix:75-27` (6 locales x 9 on the MDX post + 6 x 5 on the EN-only JSX post) + 6 `fix:75-25` (404 home link `/`, one per locale).
Distinct locale-dropping hrefs: `/`, `/blog/prague-airport-meet-and-greet`, `/book`, `/routes`, `/services/airport-transfer`, `/services/corporate-accounts`, `/services/intercity-routes`.

## Findings (every row of the final run)

Kinds: `text` visible text node, `attr` placeholder/aria-label/alt/title, `meta` title/description/og, `faq` FAQPage JSON-LD, `service` route Service JSON-LD, `identical-to-en` es/fr string byte-identical to EN, `link` locale-dropping internal href. Values truncated to 100 chars.

| # | Locale | Page | Kind | Value | Disposition | Source (file :: JSON key) |
|---|--------|------|------|-------|-------------|---------------------------|
| 1 | ru | `/` | text | Our driver was waiting before we even cleared customs. Seamless from landing to hotel. | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 2 | ru | `/` | text | CFO · Frankfurt | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 3 | ru | `/` | text | Verified booking · Airport transfer | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 4 | ru | `/services/airport-transfer` | text | Prestigo Prague Airport Transfer — это трансфер с личным водителем по фиксированной цене из аэропорт… | `fix:75-29` | content/pages/ru/services/airport-transfer.json :: hero.intro — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 5 | ru | `/services/airport-transfer` | text | Для VIP-гостей, дипломатических и корпоративных прилётов заранее может быть организован Mercedes-Ben… | `fix:75-29` | content/pages/ru/services/airport-transfer.json :: meetGreet.paragraph2 — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 6 | ru | `/services/airport-transfer` | text | Fast-track на паспортном контроле по запросу | `fix:75-29` | content/pages/ru/services/airport-transfer.json :: meetGreet.items[4] — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 7 | ru | `/services/airport-transfer` | text | Да. Для VIP-гостей, дипломатических и корпоративных прилётов мы предоставляем Mercedes-Benz S-Class … | `fix:75-29` | content/pages/ru/services/airport-transfer.json :: faqs[4].a — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 8 | ru | `/services/airport-transfer` | text | Можно ли организовать fast-track в аэропорту Праги? | `fix:75-29` | content/pages/ru/services/airport-transfer.json :: faqs[5].q — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 9 | ru | `/services/airport-transfer` | text | Fast-track на паспортном контроле и досмотре может быть добавлен к любому бронированию со встречей п… | `fix:75-29` | content/pages/ru/services/airport-transfer.json :: faqs[5].a — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 10 | ru | `/services/airport-transfer` | meta | Встреча с табличкой в аэропорту Праги и трансфер с личным водителем из PRG. Встреча в зоне прилёта, … | `fix:75-29` | content/pages/ru/services/airport-transfer.json :: metadata.description — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 11 | ru | `/services/airport-transfer` | meta | Встреча с табличкой в аэропорту Праги и трансфер с личным водителем из PRG. Встреча в зоне прилёта, … | `fix:75-29` | content/pages/ru/services/airport-transfer.json :: metadata.description — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 12 | ru | `/services/airport-transfer` | faq | Да. Для VIP-гостей, дипломатических и корпоративных прилётов мы предоставляем Mercedes-Benz S-Class … | `fix:75-29` | content/pages/ru/services/airport-transfer.json :: faqs[4].a — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 13 | ru | `/services/airport-transfer` | faq | Можно ли организовать fast-track в аэропорту Праги? | `fix:75-29` | content/pages/ru/services/airport-transfer.json :: faqs[5].q — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 14 | ru | `/services/airport-transfer` | faq | Fast-track на паспортном контроле и досмотре может быть добавлен к любому бронированию со встречей п… | `fix:75-29` | content/pages/ru/services/airport-transfer.json :: faqs[5].a — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 15 | ru | `/corporate` | faq | Каждая поездка по корпоративному аккаунту фиксируется в момент заказа с уникальным номером, классом … | `fix:75-29` | content/pages/ru/corporate.json :: faqs[2].a — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 16 | ru | `/blog` | text | Intercity Routes | `fix:75-28` | content/blog/ru/*.mdx frontmatter category (rendered by lib/blog.ts) — **fixed in 75-28 (pending deploy)**: `lib/blog-categories.ts` + `components/BlogCard.tsx` + `messages/<loc>.json` BlogCategories.* |
| 17 | ru | `/blog` | text | Intercity Routes | `fix:75-28` | content/blog/ru/*.mdx frontmatter category (rendered by lib/blog.ts) — **fixed in 75-28 (pending deploy)**: `lib/blog-categories.ts` + `components/BlogCard.tsx` + `messages/<loc>.json` BlogCategories.* |
| 18 | ru | `/login` | meta | PRESTIGO — Premium Chauffeur Service Prague | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 19 | ru | `/login` | meta | Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed … | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 20 | ru | `/login` | meta | PRESTIGO — Premium Chauffeur Service Prague | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 21 | ru | `/login` | meta | Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed … | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 22 | ru | `/authors/roman-ustyugov` | text | Founder of PRESTIGO. 10+ years in luxury transportation and 5★ hospitality in Prague. | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` + `content/pages/*/authors/roman-ustyugov.json` bioShort |
| 23 | ru | `/authors/roman-ustyugov` | meta | Roman Ustyugov — Founder & Chief Experience Officer at PRESTIGO, Prague. 10+ years in luxury ground … | `fix:75-28` | app/[locale]/authors/roman-ustyugov/page.tsx — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` generateMetadata + `content/pages/*/authors/roman-ustyugov.json` metadata.* |
| 24 | ru | `/authors/roman-ustyugov` | meta | Roman Ustyugov — Founder of PRESTIGO Chauffeur Service | `fix:75-28` | app/[locale]/authors/roman-ustyugov/page.tsx — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` generateMetadata + `content/pages/*/authors/roman-ustyugov.json` metadata.* |
| 25 | ru | `/authors/roman-ustyugov` | meta | Roman Ustyugov — Founder & Chief Experience Officer at PRESTIGO, Prague. 10+ years in luxury ground … | `fix:75-28` | app/[locale]/authors/roman-ustyugov/page.tsx — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` generateMetadata + `content/pages/*/authors/roman-ustyugov.json` metadata.* |
| 26 | ru | `/blog/beyond-transport-luxury-chauffeur-service-prague` | text | Founder & Chief Experience Officer | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` (locale prop) + `content/pages/*/authors/roman-ustyugov.json` jobTitle |
| 27 | ru | `/blog/beyond-transport-luxury-chauffeur-service-prague` | attr | About the author, Roman Ustyugov | `fix:75-28` | components/ArticleByline.tsx (aria-label template) — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` + `content/pages/*/authors/roman-ustyugov.json` labels.aboutAuthorAria |
| 28 | ru | `/blog/beyond-transport-luxury-chauffeur-service-prague` | attr | Roman Ustyugov — Founder of PRESTIGO chauffeur service in Prague | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` (locale prop) + `content/pages/*/authors/roman-ustyugov.json` imageAlt |
| 29 | ru | `/this-page-does-not-exist` | text | Page not found | `fix:75-25` | app/not-found.tsx |
| 30 | ru | `/this-page-does-not-exist` | text | Back to Home | `fix:75-25` | app/not-found.tsx |
| 31 | ru | `/this-page-does-not-exist` | meta | Page Not Found — PRESTIGO | `fix:75-25` | app/not-found.tsx |
| 32 | ru | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /blog/prague-airport-meet-and-greet | `fix:75-27` | content/blog/ru/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 33 | ru | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/corporate-accounts | `fix:75-27` | content/blog/ru/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 34 | ru | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/intercity-routes | `fix:75-27` | content/blog/ru/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 35 | ru | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /routes | `fix:75-27` | content/blog/ru/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 36 | ru | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/ru/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 37 | ru | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/ru/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 38 | ru | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/corporate-accounts | `fix:75-27` | content/blog/ru/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 39 | ru | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/ru/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 40 | ru | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /routes | `fix:75-27` | content/blog/ru/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 41 | ru | `/blog/prague-airport-to-city-center` | link | /services/airport-transfer | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 42 | ru | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 43 | ru | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 44 | ru | `/blog/prague-airport-to-city-center` | link | /services/airport-transfer | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 45 | ru | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 46 | ru | `/this-page-does-not-exist` | link | / | `fix:75-25` | app/not-found.tsx |
| 47 | es | `/` | identical-to-en | Our driver was waiting before we even cleared customs. Seamless from landing to hotel. | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 48 | es | `/` | identical-to-en | Verified booking · Airport transfer | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 49 | es | `/authors/roman-ustyugov` | identical-to-en | Founder of PRESTIGO. 10+ years in luxury transportation and 5★ hospitality in Prague. | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` + `content/pages/*/authors/roman-ustyugov.json` bioShort |
| 50 | es | `/blog/beyond-transport-luxury-chauffeur-service-prague` | identical-to-en | Founder & Chief Experience Officer | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` (locale prop) + `content/pages/*/authors/roman-ustyugov.json` jobTitle |
| 51 | es | `/blog/beyond-transport-luxury-chauffeur-service-prague` | identical-to-en | About the author, Roman Ustyugov | `fix:75-28` | components/ArticleByline.tsx (aria-label template) — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` + `content/pages/*/authors/roman-ustyugov.json` labels.aboutAuthorAria |
| 52 | es | `/blog/beyond-transport-luxury-chauffeur-service-prague` | identical-to-en | Roman Ustyugov — Founder of PRESTIGO chauffeur service in Prague | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` (locale prop) + `content/pages/*/authors/roman-ustyugov.json` imageAlt |
| 53 | es | `/this-page-does-not-exist` | identical-to-en | Page not found | `fix:75-25` | app/not-found.tsx |
| 54 | es | `/this-page-does-not-exist` | identical-to-en | Back to Home | `fix:75-25` | app/not-found.tsx |
| 55 | es | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /blog/prague-airport-meet-and-greet | `fix:75-27` | content/blog/es/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 56 | es | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/corporate-accounts | `fix:75-27` | content/blog/es/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 57 | es | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/intercity-routes | `fix:75-27` | content/blog/es/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 58 | es | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /routes | `fix:75-27` | content/blog/es/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 59 | es | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/es/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 60 | es | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/es/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 61 | es | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/corporate-accounts | `fix:75-27` | content/blog/es/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 62 | es | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/es/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 63 | es | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /routes | `fix:75-27` | content/blog/es/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 64 | es | `/blog/prague-airport-to-city-center` | link | /services/airport-transfer | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 65 | es | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 66 | es | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 67 | es | `/blog/prague-airport-to-city-center` | link | /services/airport-transfer | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 68 | es | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 69 | es | `/this-page-does-not-exist` | link | / | `fix:75-25` | app/not-found.tsx |
| 70 | fr | `/` | identical-to-en | Our driver was waiting before we even cleared customs. Seamless from landing to hotel. | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 71 | fr | `/` | identical-to-en | Verified booking · Airport transfer | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 72 | fr | `/authors/roman-ustyugov` | identical-to-en | Founder of PRESTIGO. 10+ years in luxury transportation and 5★ hospitality in Prague. | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` + `content/pages/*/authors/roman-ustyugov.json` bioShort |
| 73 | fr | `/blog/beyond-transport-luxury-chauffeur-service-prague` | identical-to-en | Founder & Chief Experience Officer | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` (locale prop) + `content/pages/*/authors/roman-ustyugov.json` jobTitle |
| 74 | fr | `/blog/beyond-transport-luxury-chauffeur-service-prague` | identical-to-en | About the author, Roman Ustyugov | `fix:75-28` | components/ArticleByline.tsx (aria-label template) — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` + `content/pages/*/authors/roman-ustyugov.json` labels.aboutAuthorAria |
| 75 | fr | `/blog/beyond-transport-luxury-chauffeur-service-prague` | identical-to-en | Roman Ustyugov — Founder of PRESTIGO chauffeur service in Prague | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` (locale prop) + `content/pages/*/authors/roman-ustyugov.json` imageAlt |
| 76 | fr | `/this-page-does-not-exist` | identical-to-en | Page not found | `fix:75-25` | app/not-found.tsx |
| 77 | fr | `/this-page-does-not-exist` | identical-to-en | Back to Home | `fix:75-25` | app/not-found.tsx |
| 78 | fr | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /blog/prague-airport-meet-and-greet | `fix:75-27` | content/blog/fr/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 79 | fr | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/corporate-accounts | `fix:75-27` | content/blog/fr/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 80 | fr | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/intercity-routes | `fix:75-27` | content/blog/fr/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 81 | fr | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /routes | `fix:75-27` | content/blog/fr/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 82 | fr | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/fr/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 83 | fr | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/fr/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 84 | fr | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/corporate-accounts | `fix:75-27` | content/blog/fr/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 85 | fr | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/fr/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 86 | fr | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /routes | `fix:75-27` | content/blog/fr/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 87 | fr | `/blog/prague-airport-to-city-center` | link | /services/airport-transfer | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 88 | fr | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 89 | fr | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 90 | fr | `/blog/prague-airport-to-city-center` | link | /services/airport-transfer | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 91 | fr | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 92 | fr | `/this-page-does-not-exist` | link | / | `fix:75-25` | app/not-found.tsx |
| 93 | ar | `/` | text | Our driver was waiting before we even cleared customs. Seamless from landing to hotel. | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 94 | ar | `/` | text | CFO · Frankfurt | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 95 | ar | `/` | text | Verified booking · Airport transfer | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 96 | ar | `/blog` | text | Intercity Routes | `fix:75-28` | content/blog/ar/*.mdx frontmatter category (rendered by lib/blog.ts) — **fixed in 75-28 (pending deploy)**: `lib/blog-categories.ts` + `components/BlogCard.tsx` + `messages/<loc>.json` BlogCategories.* |
| 97 | ar | `/blog` | text | Intercity Routes | `fix:75-28` | content/blog/ar/*.mdx frontmatter category (rendered by lib/blog.ts) — **fixed in 75-28 (pending deploy)**: `lib/blog-categories.ts` + `components/BlogCard.tsx` + `messages/<loc>.json` BlogCategories.* |
| 98 | ar | `/login` | meta | PRESTIGO — Premium Chauffeur Service Prague | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 99 | ar | `/login` | meta | Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed … | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 100 | ar | `/login` | meta | PRESTIGO — Premium Chauffeur Service Prague | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 101 | ar | `/login` | meta | Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed … | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 102 | ar | `/authors/roman-ustyugov` | text | Founder of PRESTIGO. 10+ years in luxury transportation and 5★ hospitality in Prague. | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` + `content/pages/*/authors/roman-ustyugov.json` bioShort |
| 103 | ar | `/authors/roman-ustyugov` | meta | Roman Ustyugov — Founder & Chief Experience Officer at PRESTIGO, Prague. 10+ years in luxury ground … | `fix:75-28` | app/[locale]/authors/roman-ustyugov/page.tsx — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` generateMetadata + `content/pages/*/authors/roman-ustyugov.json` metadata.* |
| 104 | ar | `/authors/roman-ustyugov` | meta | Roman Ustyugov — Founder of PRESTIGO Chauffeur Service | `fix:75-28` | app/[locale]/authors/roman-ustyugov/page.tsx — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` generateMetadata + `content/pages/*/authors/roman-ustyugov.json` metadata.* |
| 105 | ar | `/authors/roman-ustyugov` | meta | Roman Ustyugov — Founder & Chief Experience Officer at PRESTIGO, Prague. 10+ years in luxury ground … | `fix:75-28` | app/[locale]/authors/roman-ustyugov/page.tsx — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` generateMetadata + `content/pages/*/authors/roman-ustyugov.json` metadata.* |
| 106 | ar | `/blog/beyond-transport-luxury-chauffeur-service-prague` | text | Founder & Chief Experience Officer | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` (locale prop) + `content/pages/*/authors/roman-ustyugov.json` jobTitle |
| 107 | ar | `/blog/beyond-transport-luxury-chauffeur-service-prague` | attr | About the author, Roman Ustyugov | `fix:75-28` | components/ArticleByline.tsx (aria-label template) — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` + `content/pages/*/authors/roman-ustyugov.json` labels.aboutAuthorAria |
| 108 | ar | `/blog/beyond-transport-luxury-chauffeur-service-prague` | attr | Roman Ustyugov — Founder of PRESTIGO chauffeur service in Prague | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` (locale prop) + `content/pages/*/authors/roman-ustyugov.json` imageAlt |
| 109 | ar | `/this-page-does-not-exist` | text | Page not found | `fix:75-25` | app/not-found.tsx |
| 110 | ar | `/this-page-does-not-exist` | text | Back to Home | `fix:75-25` | app/not-found.tsx |
| 111 | ar | `/this-page-does-not-exist` | meta | Page Not Found — PRESTIGO | `fix:75-25` | app/not-found.tsx |
| 112 | ar | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /blog/prague-airport-meet-and-greet | `fix:75-27` | content/blog/ar/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 113 | ar | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/corporate-accounts | `fix:75-27` | content/blog/ar/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 114 | ar | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/intercity-routes | `fix:75-27` | content/blog/ar/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 115 | ar | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /routes | `fix:75-27` | content/blog/ar/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 116 | ar | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/ar/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 117 | ar | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/ar/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 118 | ar | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/corporate-accounts | `fix:75-27` | content/blog/ar/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 119 | ar | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/ar/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 120 | ar | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /routes | `fix:75-27` | content/blog/ar/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 121 | ar | `/blog/prague-airport-to-city-center` | link | /services/airport-transfer | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 122 | ar | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 123 | ar | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 124 | ar | `/blog/prague-airport-to-city-center` | link | /services/airport-transfer | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 125 | ar | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 126 | ar | `/this-page-does-not-exist` | link | / | `fix:75-25` | app/not-found.tsx |
| 127 | hi | `/` | text | Airport transfers | `fix:75-29` | messages/hi.json :: Hero.priceAnchor — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 128 | hi | `/` | text | Our driver was waiting before we even cleared customs. Seamless from landing to hotel. | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 129 | hi | `/` | text | CFO · Frankfurt | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 130 | hi | `/` | text | Verified booking · Airport transfer | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 131 | hi | `/services/airport-transfer` | text | टर्मिनल 2 शेंगेन आगमन संभालता है — जर्मनी, ऑस्ट्रिया, फ़्रांस, नीदरलैंड्स तथा अधिकांश EU मार्गों से … | `fix:75-29` | content/pages/hi/services/airport-transfer.json :: features[3].body — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Arrivals) |
| 132 | hi | `/services/airport-transfer` | text | प्रत्येक Prestigo एयरपोर्ट ट्रांसफर एक पूर्ण मीट एंड ग्रीट है। आपके बाहर निकलने से पूर्व ही आपका शोफ… | `fix:75-29` | content/pages/hi/services/airport-transfer.json :: meetGreet.paragraph1 — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Arrivals) |
| 133 | hi | `/services/airport-transfer` | text | मीट एंड ग्रीट का अर्थ है कि आपका शोफ़र प्राग वाक्लाव हावेल (PRG) के Arrivals हॉल के भीतर आपके नाम का… | `fix:75-29` | content/pages/hi/services/airport-transfer.json :: faqs[3].a — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Arrivals) |
| 134 | hi | `/services/airport-transfer` | text | सितंबर 2023 से PRG पर आधिकारिक टैक्सी रैंक विशेष रूप से Uber के पास है। मध्य प्राग तक एक सामान्य Ube… | `fix:75-29` | content/pages/hi/services/airport-transfer.json :: faqs[7].a — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Arrivals) |
| 135 | hi | `/services/airport-transfer` | meta | PRG से प्राग एयरपोर्ट मीट एंड ग्रीट तथा शोफ़र ट्रांसफर। Arrivals पर नेम-बोर्ड के साथ स्वागत, फ्लाइट … | `fix:75-29` | content/pages/hi/services/airport-transfer.json :: metadata.description — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Arrivals) |
| 136 | hi | `/services/airport-transfer` | meta | PRG से प्राग एयरपोर्ट मीट एंड ग्रीट तथा शोफ़र ट्रांसफर। Arrivals पर नेम-बोर्ड के साथ स्वागत, फ्लाइट … | `fix:75-29` | content/pages/hi/services/airport-transfer.json :: metadata.description — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Arrivals) |
| 137 | hi | `/services/airport-transfer` | faq | मीट एंड ग्रीट का अर्थ है कि आपका शोफ़र प्राग वाक्लाव हावेल (PRG) के Arrivals हॉल के भीतर आपके नाम का… | `fix:75-29` | content/pages/hi/services/airport-transfer.json :: faqs[3].a — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Arrivals) |
| 138 | hi | `/services/airport-transfer` | faq | सितंबर 2023 से PRG पर आधिकारिक टैक्सी रैंक विशेष रूप से Uber के पास है। मध्य प्राग तक एक सामान्य Ube… | `fix:75-29` | content/pages/hi/services/airport-transfer.json :: faqs[7].a — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Arrivals) |
| 139 | hi | `/services/city-rides` | text | Airport ट्रांसफ़र बिंदु-से-बिंदु होते हैं: Arrivals पर पिकअप, प्राग स्थित आपके पते पर ड्रॉप-ऑफ़। सिट… | `fix:75-29` | content/pages/hi/services/city-rides.json :: features[2].body — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Airport, Arrivals) |
| 140 | hi | `/services/city-rides` | text | न्यूनतम बुकिंग दो घंटे की है। इस अवधि में आप बिना किसी समय-दबाव के airport आगमन, होटल चेक-इन तथा ओल्… | `fix:75-29` | content/pages/hi/services/city-rides.json :: editorial[2] — **fixed in 75-29 (pending deploy)**: untranslated words rewritten; kept loanwords airport, flight, terminal classified (hi-scoped inlineTerms, keep-per-glossary) |
| 141 | hi | `/services/city-rides` | text | यदि आपका प्रति घंटा हायर airport पर समाप्त होता है, तो हम सहजता से अपनी airport ट्रांसफ़र सेवा में प… | `fix:75-29` | content/pages/hi/services/city-rides.json :: useCases[5].body — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: airport) |
| 142 | hi | `/services/city-rides` | faq | Airport ट्रांसफ़र बिंदु-से-बिंदु होते हैं: Arrivals पर पिकअप, प्राग स्थित आपके पते पर ड्रॉप-ऑफ़। सिट… | `fix:75-29` | content/pages/hi/services/city-rides.json :: features[2].body — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Airport, Arrivals) |
| 143 | hi | `/services/intercity-routes` | text | इंटरसिटी प्रस्थान किसी भी समय संचालित होते हैं। वियना में 09:00 की मीटिंग हेतु प्राग से 04:30 का प्र… | `fix:75-29` | content/pages/hi/services/intercity-routes.json :: features[3].body — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: airport, flight) |
| 144 | hi | `/services/intercity-routes` | text | लंबी दूरी की यात्रा के मानकों से मध्य यूरोप सघन है, किंतु जब समय और सुविधा महत्वपूर्ण हों, तब सार्वज… | `fix:75-29` | content/pages/hi/services/intercity-routes.json :: editorial[0] — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: ) |
| 145 | hi | `/services/intercity-routes` | faq | इंटरसिटी प्रस्थान किसी भी समय संचालित होते हैं। वियना में 09:00 की मीटिंग हेतु प्राग से 04:30 का प्र… | `fix:75-29` | content/pages/hi/services/intercity-routes.json :: features[3].body — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: airport, flight) |
| 146 | hi | `/services/vip-events` | text | VIP ट्रांसफ़र किसी अधिक महँगे वाहन में किया गया airport ट्रांसफ़र मात्र नहीं है। यह एक समन्वित संचाल… | `fix:75-29` | content/pages/hi/services/vip-events.json :: editorial[0] — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: airport) |
| 147 | hi | `/services/group-transfers` | text | कॉन्फ्रेंस समूहों में आगमन के जटिल स्वरूप बनते हैं: दो दिनों में एक दर्जन फ्लाइट, Terminal 1 और Term… | `fix:75-29` | content/pages/hi/services/group-transfers.json :: features[1].body — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Terminal) |
| 148 | hi | `/services/group-transfers` | text | प्राग के ग्रुप ट्रांसफर हेतु एक विवरण पूर्व में ही ध्यान देने योग्य है: वाक्लाव हावेल एयरपोर्ट पर दो… | `fix:75-29` | content/pages/hi/services/group-transfers.json :: editorial[2] — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Terminal) |
| 149 | hi | `/services/group-transfers` | faq | कॉन्फ्रेंस समूहों में आगमन के जटिल स्वरूप बनते हैं: दो दिनों में एक दर्जन फ्लाइट, Terminal 1 और Term… | `fix:75-29` | content/pages/hi/services/group-transfers.json :: features[1].body — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Terminal) |
| 150 | hi | `/services/concierge` | text | यह सेवा अपनी अलग मूल्य-सूची वाला कोई पृथक उत्पाद नहीं है। यह वह मानक है जिसे हम हर PRESTIGO यात्रा प… | `fix:75-29` | content/pages/hi/services/concierge.json :: editorial[2] — **fixed in 75-29 (pending deploy)**: untranslated words rewritten; kept loanwords airport classified (hi-scoped inlineTerms, keep-per-glossary) |
| 151 | hi | `/services/concierge` | text | Airport Transfer | `fix:75-29` | content/pages/hi/services/concierge.json :: pairsWell[0].title — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 152 | hi | `/services/concierge` | text | PRG पर आगमन पर नाम-पट्ट के साथ स्वागत, सामान सँभाला हुआ, flight पर नज़र। | `fix:75-29` | content/pages/hi/services/concierge.json :: pairsWell[0].body — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: flight) |
| 153 | hi | `/services/concierge` | text | नहीं। सेवा का यह स्तर हर यात्रा पर PRESTIGO का मानक है, कोई सशुल्क अतिरिक्त सुविधा नहीं — आपके trans… | `fix:75-29` | content/pages/hi/services/concierge.json :: faqs[5].a — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 154 | hi | `/services/concierge` | faq | नहीं। सेवा का यह स्तर हर यात्रा पर PRESTIGO का मानक है, कोई सशुल्क अतिरिक्त सुविधा नहीं — आपके trans… | `fix:75-29` | content/pages/hi/services/concierge.json :: faqs[5].a — **fixed in 75-29 (pending deploy)**: untranslated words rewritten |
| 155 | hi | `/routes/prague-vienna` | text | निजी chauffeur के साथ प्राग से वियना की यात्रा D1 और A5 के माध्यम से 330 किमी का door-to-door ट्रांस… | `fix:75-29` | content/routes/hi/prague-vienna.json :: hero.intro — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: chauffeur, door-to-door, drop-off, pickup, vignette) |
| 156 | hi | `/routes/prague-vienna` | text | से आरंभ होता है, जिसमें सभी टोल तथा चेक और ऑस्ट्रियाई, दोनों vignette सम्मिलित हैं। प्राग के किसी भी… | `fix:75-29` | content/routes/hi/prague-vienna.json :: hero.intro — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: chauffeur, door-to-door, drop-off, pickup, vignette) |
| 157 | hi | `/routes/prague-vienna` | meta | प्राग से वियना निजी chauffeur ट्रांसफर — Mercedes E, S अथवा V-Class में 330 किमी door-to-door। €455 … | `fix:75-29` | content/routes/hi/prague-vienna.json :: metadata.description — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: chauffeur, door-to-door) |
| 158 | hi | `/routes/prague-vienna` | meta | प्राग से वियना निजी chauffeur ट्रांसफर — Mercedes E, S अथवा V-Class में 330 किमी door-to-door। €455 … | `fix:75-29` | content/routes/hi/prague-vienna.json :: metadata.description — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: chauffeur, door-to-door) |
| 159 | hi | `/routes/prague-vienna` | faq | ब्रनो से होकर D1 मोटरवे के माध्यम से, तत्पश्चात मिकुलोव–ड्रासेनहोफेन सीमा तक D52 और वियना तक ऑस्ट्रि… | `fix:75-29` | content/routes/hi/prague-vienna.json :: faqs[0].a — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: door-to-door) |
| 160 | hi | `/routes/prague-vienna` | faq | दोनों देश शेंगेन क्षेत्र के भीतर हैं। मिकुलोव–ड्रासेनहोफेन पर कोई नियमित सीमा जाँच नहीं होती। सभी Pr… | `fix:75-29` | content/routes/hi/prague-vienna.json :: faqs[3].a — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: chauffeur, vignette) |
| 161 | hi | `/routes/prague-vienna` | faq | अनुरोध पर जर्मन बोलने वाला chauffeur उपलब्ध है — वियना में कॉन्सियर्ज से समन्वय अथवा आगमन पर व्यावसा… | `fix:75-29` | content/routes/hi/prague-vienna.json :: faqs[5].a — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: chauffeur) |
| 162 | hi | `/routes/prague-vienna` | service | प्राग से वियना निजी chauffeur ट्रांसफर — Mercedes E, S अथवा V-Class में 330 किमी door-to-door। €455 … | `fix:75-29` | content/routes/hi/prague-vienna.json :: metadata.description — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: chauffeur, door-to-door) |
| 163 | hi | `/corporate` | faq | हमारे कॉर्पोरेट क्लाइंट वे लॉ फ़र्म, कंसल्टिंग प्रैक्टिस, निवेश संस्थान, दूतावास, वैश्विक नियोक्ता, … | `fix:75-29` | content/pages/hi/corporate.json :: whoUses.paragraphs[0] — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: airport) |
| 164 | hi | `/contact` | text | निर्धारित दिन, आपका नियुक्त शोफ़र सहमत स्थान पर पहुँचता है — समय पर, वर्दी में, नाम-पट्टिका हाथ में … | `fix:75-29` | content/pages/hi/contact.json :: whatHappensNext.steps[2].body — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: airport, flight) |
| 165 | hi | `/contact` | text | मुझे प्राग Václav Havel (PRG) से airport ट्रांसफ़र की आवश्यकता है। | `fix:75-29` | content/pages/hi/contact.json :: commonEnquiries.faqs[0].q — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: airport) |
| 166 | hi | `/contact` | text | बुकिंग फ़ॉर्म अथवा WhatsApp का प्रयोग करें। अपना flight नंबर, आगमन terminal और गंतव्य पता उपलब्ध करा… | `fix:75-29` | content/pages/hi/contact.json :: commonEnquiries.faqs[0].a — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: flight, terminal) |
| 167 | hi | `/faq` | faq | जी नहीं। समस्त airport पिकअप के लिए 60 मिनट की निःशुल्क प्रतीक्षा सम्मिलित है। हम आपकी flight को वास… | `fix:75-29` | content/pages/hi/faq.json :: sections[1].faqs[2].a — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: airport, flight) |
| 168 | hi | `/book` | text | आपका chauffeur आपकी फ़्लाइट (airport pickup के लिए) अथवा आपके शेड्यूल (निर्धारित ट्रांसफर के लिए) पर… | `fix:75-29` | content/pages/hi/book.json :: howItWorks.steps[3].body — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: airport, chauffeur, pickup) |
| 169 | hi | `/book` | text | PRESTIGO की बुकिंग कोई अनुरोध नहीं, बल्कि एक प्रतिबद्धता है। पुष्टि करते ही आपकी यात्रा हमारे dispat… | `fix:75-29` | content/pages/hi/book.json :: afterYouBook.intro — **fixed in 75-29 (pending deploy)**: untranslated words rewritten; kept loanwords airport, chauffeur, driver, pickup classified (hi-scoped inlineTerms, keep-per-glossary) |
| 170 | hi | `/book` | text | बुकिंग संदर्भ, pickup समय, driver का संपर्क तथा एक live स्टेटस लिंक — सामान्यतः भुगतान के दस सेकंड क… | `fix:75-29` | content/pages/hi/book.json :: afterYouBook.items[0].b — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: driver, live, pickup) |
| 171 | hi | `/book` | text | अधिकांश बुकिंग में, आपका driver pickup से घंटों अथवा दिनों पहले पुष्ट कर दिया जाता है। सेम-डे बुकिंग… | `fix:75-29` | content/pages/hi/book.json :: afterYouBook.items[1].b — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: driver, pickup) |
| 172 | hi | `/book` | text | airport pickup के लिए फ़्लाइट ट्रैकिंग | `fix:75-29` | content/pages/hi/book.json :: afterYouBook.items[2].t — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: airport, pickup) |
| 173 | hi | `/book` | text | आपका driver live ATC डेटा के आधार पर आपकी फ़्लाइट पर नज़र रखता है। यदि आप पहले पहुँचते हैं, तो गाड़ी… | `fix:75-29` | content/pages/hi/book.json :: afterYouBook.items[2].b — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: driver, live) |
| 174 | hi | `/book` | text | airport pickup के लिए आपका chauffeur PRESTIGO नामपट्ट के साथ Arrivals में प्रतीक्षा करता है। आपको उस… | `fix:75-29` | content/pages/hi/book.json :: afterYouBook.items[3].b — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Arrivals, airport, chauffeur, pickup) |
| 175 | hi | `/book` | text | प्राग में अधिकांश प्रीमियम chauffeur यात्राएँ ग्लोबल एग्रीगेटर्स द्वारा बेची जाती हैं, जो ऑपरेटर की … | `fix:75-29` | content/pages/hi/book.json :: whyBookDirect.intro — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: chauffeur, driver) |
| 176 | hi | `/book` | text | आपके द्वारा चुकाया गया हर यूरो सीधे ऑपरेटर और driver तक जाता है। किसी global एग्रीगेटर के माध्यम से … | `fix:75-29` | content/pages/hi/book.json :: whyBookDirect.items[0].body — **fixed in 75-29 (pending deploy)**: untranslated words rewritten; kept loanwords driver classified (hi-scoped inlineTerms, keep-per-glossary) |
| 177 | hi | `/book` | text | हाँ। निर्धारित pickup से एक घंटे पहले तक रद्दीकरण निःशुल्क है — मूल भुगतान माध्यम को धनवापसी एक कार्… | `fix:75-29` | content/pages/hi/book.json :: faq.items[0].a — **fixed in 75-29 (pending deploy)**: untranslated words rewritten; kept loanwords driver, drop-off, pickup classified (hi-scoped inlineTerms, keep-per-glossary) |
| 178 | hi | `/book` | text | ऑनलाइन बुकिंग checkout पर क्रेडिट अथवा डेबिट कार्ड से भुगतान की जाती हैं — हम Visa, Mastercard, Amer… | `fix:75-29` | content/pages/hi/book.json :: faq.items[1].a — **fixed in 75-29 (pending deploy)**: untranslated words rewritten; kept loanwords chauffeur, checkout, driver, drop-off classified (hi-scoped inlineTerms, keep-per-glossary) |
| 179 | hi | `/book` | text | हाँ, प्रत्येक बुकिंग में उदार प्रतीक्षा समय सम्मिलित है। Václav Havel Airport (PRG) पर pickup हेतु, … | `fix:75-29` | content/pages/hi/book.json :: faq.items[2].a — **fixed in 75-29 (pending deploy)**: untranslated words rewritten; kept loanwords Airport, chauffeur, pickup classified (hi-scoped inlineTerms, keep-per-glossary) |
| 180 | hi | `/book` | text | बुकिंग की पुष्टि के क्षण से ही आपका driver निर्धारित समय के बजाय live air-traffic-control डेटा का उप… | `fix:75-29` | content/pages/hi/book.json :: faq.items[3].a — **fixed in 75-29 (pending deploy)**: untranslated words rewritten; kept loanwords arrivals, chauffeur, driver, live, pickup classified (hi-scoped inlineTerms, keep-per-glossary) |
| 181 | hi | `/book` | text | तीनों के लिए हाँ, सटीक क्षमता आपके चुने गए वाहन class पर निर्भर करती है। E-Class में 2 बड़े सूटकेस त… | `fix:75-29` | content/pages/hi/book.json :: faq.items[4].a — **fixed in 75-29 (pending deploy)**: untranslated words rewritten; kept loanwords pickup classified (hi-scoped inlineTerms, keep-per-glossary) |
| 182 | hi | `/book` | text | बिलकुल — हमारी अधिकांश कॉर्पोरेट तथा हॉस्पिटैलिटी बुकिंग व्यवहार में इसी तरह काम करती हैं। checkout … | `fix:75-29` | content/pages/hi/book.json :: faq.items[5].a — **fixed in 75-29 (pending deploy)**: untranslated words rewritten; kept loanwords airport, arrivals, chauffeur, checkout, driver, pickup classified (hi-scoped inlineTerms, keep-per-glossary) |
| 183 | hi | `/book` | meta | अपने प्राग chauffeur को 60 सेकंड में बुक करें। निश्चित मूल्य, तुरंत पुष्टि, फ़्लाइट ट्रैकिंग सम्मिलि… | `fix:75-29` | content/pages/hi/book.json :: metadata.description — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Airport, chauffeur) |
| 184 | hi | `/book` | meta | अपने प्राग chauffeur को 60 सेकंड में बुक करें। निश्चित मूल्य, तुरंत पुष्टि, फ़्लाइट ट्रैकिंग सम्मिलि… | `fix:75-29` | content/pages/hi/book.json :: metadata.description — **classified (75-29)**: hi travel/tech loanwords kept in Latin per i18n/glossary.json locales.hi.toneGuide (keep-per-glossary; hi-scoped inlineTerms: Airport, chauffeur) |
| 185 | hi | `/blog` | text | Intercity Routes | `fix:75-28` | content/blog/hi/*.mdx frontmatter category (rendered by lib/blog.ts) — **fixed in 75-28 (pending deploy)**: `lib/blog-categories.ts` + `components/BlogCard.tsx` + `messages/<loc>.json` BlogCategories.* |
| 186 | hi | `/blog` | text | Intercity Routes | `fix:75-28` | content/blog/hi/*.mdx frontmatter category (rendered by lib/blog.ts) — **fixed in 75-28 (pending deploy)**: `lib/blog-categories.ts` + `components/BlogCard.tsx` + `messages/<loc>.json` BlogCategories.* |
| 187 | hi | `/login` | meta | PRESTIGO — Premium Chauffeur Service Prague | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 188 | hi | `/login` | meta | Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed … | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 189 | hi | `/login` | meta | PRESTIGO — Premium Chauffeur Service Prague | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 190 | hi | `/login` | meta | Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed … | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 191 | hi | `/authors/roman-ustyugov` | text | Founder of PRESTIGO. 10+ years in luxury transportation and 5★ hospitality in Prague. | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` + `content/pages/*/authors/roman-ustyugov.json` bioShort |
| 192 | hi | `/authors/roman-ustyugov` | meta | Roman Ustyugov — Founder & Chief Experience Officer at PRESTIGO, Prague. 10+ years in luxury ground … | `fix:75-28` | app/[locale]/authors/roman-ustyugov/page.tsx — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` generateMetadata + `content/pages/*/authors/roman-ustyugov.json` metadata.* |
| 193 | hi | `/authors/roman-ustyugov` | meta | Roman Ustyugov — Founder of PRESTIGO Chauffeur Service | `fix:75-28` | app/[locale]/authors/roman-ustyugov/page.tsx — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` generateMetadata + `content/pages/*/authors/roman-ustyugov.json` metadata.* |
| 194 | hi | `/authors/roman-ustyugov` | meta | Roman Ustyugov — Founder & Chief Experience Officer at PRESTIGO, Prague. 10+ years in luxury ground … | `fix:75-28` | app/[locale]/authors/roman-ustyugov/page.tsx — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` generateMetadata + `content/pages/*/authors/roman-ustyugov.json` metadata.* |
| 195 | hi | `/blog/beyond-transport-luxury-chauffeur-service-prague` | text | Founder & Chief Experience Officer | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` (locale prop) + `content/pages/*/authors/roman-ustyugov.json` jobTitle |
| 196 | hi | `/blog/beyond-transport-luxury-chauffeur-service-prague` | attr | About the author, Roman Ustyugov | `fix:75-28` | components/ArticleByline.tsx (aria-label template) — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` + `content/pages/*/authors/roman-ustyugov.json` labels.aboutAuthorAria |
| 197 | hi | `/blog/beyond-transport-luxury-chauffeur-service-prague` | attr | Roman Ustyugov — Founder of PRESTIGO chauffeur service in Prague | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` (locale prop) + `content/pages/*/authors/roman-ustyugov.json` imageAlt |
| 198 | hi | `/this-page-does-not-exist` | text | Page not found | `fix:75-25` | app/not-found.tsx |
| 199 | hi | `/this-page-does-not-exist` | text | Back to Home | `fix:75-25` | app/not-found.tsx |
| 200 | hi | `/this-page-does-not-exist` | meta | Page Not Found — PRESTIGO | `fix:75-25` | app/not-found.tsx |
| 201 | hi | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /blog/prague-airport-meet-and-greet | `fix:75-27` | content/blog/hi/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 202 | hi | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/corporate-accounts | `fix:75-27` | content/blog/hi/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 203 | hi | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/intercity-routes | `fix:75-27` | content/blog/hi/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 204 | hi | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /routes | `fix:75-27` | content/blog/hi/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 205 | hi | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/hi/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 206 | hi | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/hi/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 207 | hi | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/corporate-accounts | `fix:75-27` | content/blog/hi/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 208 | hi | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/hi/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 209 | hi | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /routes | `fix:75-27` | content/blog/hi/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 210 | hi | `/blog/prague-airport-to-city-center` | link | /services/airport-transfer | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 211 | hi | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 212 | hi | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 213 | hi | `/blog/prague-airport-to-city-center` | link | /services/airport-transfer | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 214 | hi | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 215 | hi | `/this-page-does-not-exist` | link | / | `fix:75-25` | app/not-found.tsx |
| 216 | zh | `/` | text | Our driver was waiting before we even cleared customs. Seamless from landing to hotel. | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 217 | zh | `/` | text | CFO · Frankfurt | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 218 | zh | `/` | text | Verified booking · Airport transfer | `fix:75-28` | lib/google-reviews.ts — **fixed in 75-28 (pending deploy)**: `lib/google-reviews.ts` (id) + `components/TestimonialsCarousel.tsx` + `messages/<loc>.json` Testimonials.hardcoded.* |
| 219 | zh | `/blog` | text | Intercity Routes | `fix:75-28` | content/blog/zh/*.mdx frontmatter category (rendered by lib/blog.ts) — **fixed in 75-28 (pending deploy)**: `lib/blog-categories.ts` + `components/BlogCard.tsx` + `messages/<loc>.json` BlogCategories.* |
| 220 | zh | `/blog` | text | Intercity Routes | `fix:75-28` | content/blog/zh/*.mdx frontmatter category (rendered by lib/blog.ts) — **fixed in 75-28 (pending deploy)**: `lib/blog-categories.ts` + `components/BlogCard.tsx` + `messages/<loc>.json` BlogCategories.* |
| 221 | zh | `/login` | meta | PRESTIGO — Premium Chauffeur Service Prague | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 222 | zh | `/login` | meta | Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed … | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 223 | zh | `/login` | meta | PRESTIGO — Premium Chauffeur Service Prague | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 224 | zh | `/login` | meta | Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed … | `fix:75-28` | app/[locale]/login/layout.tsx (no localized metadata; EN default from components/SiteChrome.tsx) — **fixed in 75-28 (pending deploy)**: `app/[locale]/login/layout.tsx` generateMetadata + `messages/<loc>.json` Auth.login.metaTitle/metaDescription |
| 225 | zh | `/authors/roman-ustyugov` | text | Founder of PRESTIGO. 10+ years in luxury transportation and 5★ hospitality in Prague. | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` + `content/pages/*/authors/roman-ustyugov.json` bioShort |
| 226 | zh | `/authors/roman-ustyugov` | meta | Roman Ustyugov — Founder & Chief Experience Officer at PRESTIGO, Prague. 10+ years in luxury ground … | `fix:75-28` | app/[locale]/authors/roman-ustyugov/page.tsx — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` generateMetadata + `content/pages/*/authors/roman-ustyugov.json` metadata.* |
| 227 | zh | `/authors/roman-ustyugov` | meta | Roman Ustyugov — Founder of PRESTIGO Chauffeur Service | `fix:75-28` | app/[locale]/authors/roman-ustyugov/page.tsx — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` generateMetadata + `content/pages/*/authors/roman-ustyugov.json` metadata.* |
| 228 | zh | `/authors/roman-ustyugov` | meta | Roman Ustyugov — Founder & Chief Experience Officer at PRESTIGO, Prague. 10+ years in luxury ground … | `fix:75-28` | app/[locale]/authors/roman-ustyugov/page.tsx — **fixed in 75-28 (pending deploy)**: `app/[locale]/authors/roman-ustyugov/page.tsx` generateMetadata + `content/pages/*/authors/roman-ustyugov.json` metadata.* |
| 229 | zh | `/blog/beyond-transport-luxury-chauffeur-service-prague` | text | Founder & Chief Experience Officer | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` (locale prop) + `content/pages/*/authors/roman-ustyugov.json` jobTitle |
| 230 | zh | `/blog/beyond-transport-luxury-chauffeur-service-prague` | attr | About the author, Roman Ustyugov | `fix:75-28` | components/ArticleByline.tsx (aria-label template) — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` + `content/pages/*/authors/roman-ustyugov.json` labels.aboutAuthorAria |
| 231 | zh | `/blog/beyond-transport-luxury-chauffeur-service-prague` | attr | Roman Ustyugov — Founder of PRESTIGO chauffeur service in Prague | `fix:75-28` | lib/authors.ts — **fixed in 75-28 (pending deploy)**: `components/ArticleByline.tsx` (locale prop) + `content/pages/*/authors/roman-ustyugov.json` imageAlt |
| 232 | zh | `/this-page-does-not-exist` | text | Page not found | `fix:75-25` | app/not-found.tsx |
| 233 | zh | `/this-page-does-not-exist` | text | Back to Home | `fix:75-25` | app/not-found.tsx |
| 234 | zh | `/this-page-does-not-exist` | meta | Page Not Found — PRESTIGO | `fix:75-25` | app/not-found.tsx |
| 235 | zh | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /blog/prague-airport-meet-and-greet | `fix:75-27` | content/blog/zh/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 236 | zh | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/corporate-accounts | `fix:75-27` | content/blog/zh/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 237 | zh | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/intercity-routes | `fix:75-27` | content/blog/zh/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 238 | zh | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /routes | `fix:75-27` | content/blog/zh/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 239 | zh | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/zh/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 240 | zh | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/zh/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 241 | zh | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /services/corporate-accounts | `fix:75-27` | content/blog/zh/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 242 | zh | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /book | `fix:75-27` | content/blog/zh/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 243 | zh | `/blog/beyond-transport-luxury-chauffeur-service-prague` | link | /routes | `fix:75-27` | content/blog/zh/beyond-transport-luxury-chauffeur-service-prague.mdx |
| 244 | zh | `/blog/prague-airport-to-city-center` | link | /services/airport-transfer | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 245 | zh | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 246 | zh | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 247 | zh | `/blog/prague-airport-to-city-center` | link | /services/airport-transfer | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 248 | zh | `/blog/prague-airport-to-city-center` | link | /book | `fix:75-27` | app/[locale]/blog/prague-airport-to-city-center/page.tsx |
| 249 | zh | `/this-page-does-not-exist` | link | / | `fix:75-25` | app/not-found.tsx |

## Unscanned-page catalog inventory

Informational, for the deferred log in plan 75-30. `python3 scripts/qa/en_leak_catalog.py` (ru/ar/hi/zh; same allowlist and helpers as the rendered scanner; ICU args/plural syntax and rich-text tags stripped; output `scripts/qa/out/en_leak_catalog.json`, exit 0 always).

Whole catalog: 212 files, 401 leaf findings; files whose page is **not** in the rendered PAGES list: 72 files with findings, 293 leaf findings. (Leaf counts are not comparable 1:1 with rendered rows — one leaf can render several times, and some leaves never render.)

| Locale | File | Page | Leaf findings |
|--------|------|------|---------------|
| ru | `content/pages/ru/data-deletion.json` | `/data-deletion` | 2 |
| ru | `content/pages/ru/privacy.json` | `/privacy` | 9 |
| ru | `content/routes/ru/prague-budapest.json` | `/routes/prague-budapest` | 1 |
| ru | `content/routes/ru/prague-dresden.json` | `/routes/prague-dresden` | 1 |
| ru | `content/routes/ru/prague-frantiskovy-lazne.json` | `/routes/prague-frantiskovy-lazne` | 1 |
| ru | `content/routes/ru/prague-graz.json` | `/routes/prague-graz` | 1 |
| ru | `content/routes/ru/prague-karlovy-vary.json` | `/routes/prague-karlovy-vary` | 3 |
| ru | `content/routes/ru/prague-leipzig.json` | `/routes/prague-leipzig` | 2 |
| ru | `content/routes/ru/prague-linz.json` | `/routes/prague-linz` | 6 |
| ru | `content/routes/ru/prague-munich.json` | `/routes/prague-munich` | 4 |
| ru | `content/routes/ru/prague-nuremberg.json` | `/routes/prague-nuremberg` | 1 |
| ru | `content/routes/ru/prague-olomouc.json` | `/routes/prague-olomouc` | 1 |
| ru | `content/routes/ru/prague-ostrava.json` | `/routes/prague-ostrava` | 4 |
| ru | `content/routes/ru/prague-pardubice.json` | `/routes/prague-pardubice` | 3 |
| ru | `content/routes/ru/prague-passau.json` | `/routes/prague-passau` | 1 |
| ru | `content/routes/ru/prague-plzen.json` | `/routes/prague-plzen` | 8 |
| ru | `content/routes/ru/prague-regensburg.json` | `/routes/prague-regensburg` | 2 |
| ru | `content/routes/ru/prague-salzburg.json` | `/routes/prague-salzburg` | 1 |
| ar | `content/pages/ar/data-deletion.json` | `/data-deletion` | 2 |
| ar | `content/pages/ar/privacy.json` | `/privacy` | 9 |
| ar | `content/routes/ar/prague-dresden.json` | `/routes/prague-dresden` | 1 |
| ar | `content/routes/ar/prague-karlovy-vary.json` | `/routes/prague-karlovy-vary` | 1 |
| ar | `content/routes/ar/prague-kutna-hora.json` | `/routes/prague-kutna-hora` | 2 |
| ar | `content/routes/ar/prague-munich.json` | `/routes/prague-munich` | 3 |
| ar | `content/routes/ar/prague-ostrava.json` | `/routes/prague-ostrava` | 4 |
| ar | `content/routes/ar/prague-pardubice.json` | `/routes/prague-pardubice` | 1 |
| ar | `content/routes/ar/prague-passau.json` | `/routes/prague-passau` | 1 |
| ar | `content/routes/ar/prague-plzen.json` | `/routes/prague-plzen` | 8 |
| ar | `content/routes/ar/prague-salzburg.json` | `/routes/prague-salzburg` | 1 |
| hi | `content/pages/hi/data-deletion.json` | `/data-deletion` | 3 |
| hi | `content/pages/hi/privacy.json` | `/privacy` | 8 |
| hi | `content/pages/hi/services/corporate-accounts.json` | `/services/corporate-accounts` | 1 |
| hi | `content/pages/hi/terms.json` | `/terms` | 3 |
| hi | `content/routes/hi/prague-bratislava.json` | `/routes/prague-bratislava` | 4 |
| hi | `content/routes/hi/prague-brno.json` | `/routes/prague-brno` | 1 |
| hi | `content/routes/hi/prague-dresden.json` | `/routes/prague-dresden` | 3 |
| hi | `content/routes/hi/prague-frantiskovy-lazne.json` | `/routes/prague-frantiskovy-lazne` | 2 |
| hi | `content/routes/hi/prague-graz.json` | `/routes/prague-graz` | 4 |
| hi | `content/routes/hi/prague-karlovy-vary.json` | `/routes/prague-karlovy-vary` | 6 |
| hi | `content/routes/hi/prague-krakow.json` | `/routes/prague-krakow` | 1 |
| hi | `content/routes/hi/prague-kutna-hora.json` | `/routes/prague-kutna-hora` | 3 |
| hi | `content/routes/hi/prague-leipzig.json` | `/routes/prague-leipzig` | 2 |
| hi | `content/routes/hi/prague-linz.json` | `/routes/prague-linz` | 4 |
| hi | `content/routes/hi/prague-nuremberg.json` | `/routes/prague-nuremberg` | 25 |
| hi | `content/routes/hi/prague-olomouc.json` | `/routes/prague-olomouc` | 2 |
| hi | `content/routes/hi/prague-ostrava.json` | `/routes/prague-ostrava` | 9 |
| hi | `content/routes/hi/prague-pardubice.json` | `/routes/prague-pardubice` | 3 |
| hi | `content/routes/hi/prague-passau.json` | `/routes/prague-passau` | 11 |
| hi | `content/routes/hi/prague-plzen.json` | `/routes/prague-plzen` | 3 |
| hi | `content/routes/hi/prague-regensburg.json` | `/routes/prague-regensburg` | 16 |
| hi | `content/routes/hi/prague-salzburg.json` | `/routes/prague-salzburg` | 7 |
| hi | `content/routes/hi/prague-warsaw.json` | `/routes/prague-warsaw` | 8 |
| zh | `content/pages/zh/data-deletion.json` | `/data-deletion` | 2 |
| zh | `content/pages/zh/privacy.json` | `/privacy` | 8 |
| zh | `content/routes/zh/prague-berlin.json` | `/routes/prague-berlin` | 1 |
| zh | `content/routes/zh/prague-bratislava.json` | `/routes/prague-bratislava` | 5 |
| zh | `content/routes/zh/prague-brno.json` | `/routes/prague-brno` | 2 |
| zh | `content/routes/zh/prague-budapest.json` | `/routes/prague-budapest` | 1 |
| zh | `content/routes/zh/prague-dresden.json` | `/routes/prague-dresden` | 5 |
| zh | `content/routes/zh/prague-graz.json` | `/routes/prague-graz` | 1 |
| zh | `content/routes/zh/prague-karlovy-vary.json` | `/routes/prague-karlovy-vary` | 5 |
| zh | `content/routes/zh/prague-krakow.json` | `/routes/prague-krakow` | 1 |
| zh | `content/routes/zh/prague-kutna-hora.json` | `/routes/prague-kutna-hora` | 3 |
| zh | `content/routes/zh/prague-leipzig.json` | `/routes/prague-leipzig` | 3 |
| zh | `content/routes/zh/prague-linz.json` | `/routes/prague-linz` | 13 |
| zh | `content/routes/zh/prague-olomouc.json` | `/routes/prague-olomouc` | 1 |
| zh | `content/routes/zh/prague-ostrava.json` | `/routes/prague-ostrava` | 4 |
| zh | `content/routes/zh/prague-pardubice.json` | `/routes/prague-pardubice` | 4 |
| zh | `content/routes/zh/prague-passau.json` | `/routes/prague-passau` | 8 |
| zh | `content/routes/zh/prague-plzen.json` | `/routes/prague-plzen` | 8 |
| zh | `content/routes/zh/prague-regensburg.json` | `/routes/prague-regensburg` | 4 |
| zh | `content/routes/zh/prague-wroclaw.json` | `/routes/prague-wroclaw` | 1 |

Per-locale unscanned totals: ru 51, ar 33, hi 129, zh 80.

Observed in these unscanned files (for 75-29/75-30 triage, not yet allowlisted because they were not verified against a rendered page in this plan):

- Likely further proper nouns (allowlist candidates): Pilsner Urquell, Colours of Ostrava, Ars Electronica, Sächsische Dampfschiffahrt, BMW Welt, Zámek Pardubice, Vlašský Dvůr, Grandhotel Pupp, Café Tomaselli, Mlýnská Kolonáda, Horní náměstí, Dolní Vítkovice, Velké Meziříčí, Devět Křížů, Hřensko, Velká Pardubická, Rozvadov/Waidhaus, Strážný/Philippsreut, Dolní Dvořiště/Wullowitz, Schönwald, Nordautobahn, Úřad pro ochranu osobních údajů, river-cruise brands (Viking, AmaWaterways, Uniworld), tech vendors on privacy/terms (Facebook, Instagram, Google Analytics/Ads/Maps Platform, Vercel, Supabase, Resend).
- Likely genuine leaks of the same families as the rendered `fix:75-29` rows: hi loanwords (airport, chauffeur, pickup, flight, door-to-door, vignette, Arrivals, terminal, driver, drop-off) across 20+ hi route files, `fast-track`/`Fast-track` (ru), `Václav Havel Airport` / `Prague Airport` English airport names, `Old Town`, `WiFi`, cookie/consent terms on privacy pages.

