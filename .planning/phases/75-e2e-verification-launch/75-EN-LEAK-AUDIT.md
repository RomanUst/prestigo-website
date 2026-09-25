# Phase 75: EN-Leak Audit (D-06 two-layer audit)

**Recorded:** 2026-09-25
**Scope:** VER-01 "no EN leakage" — systematic pre-fix inventory across the static (AST) and rendered (production) layers, mapped to the fix plan that owns each finding.

This file is the ground-truth inventory both fix plans (75-06..75-16) and the final re-verification (75-20) work against. It is populated in two passes:

- **Static layer** (this section) — `node scripts/qa/en_leak_static.mjs`, an AST scan of every `.tsx` file under `app/[locale]/**` and `components/**`.
- **Rendered layer** (Task 2, appended below) — `python3 scripts/qa/en_leak_rendered.py`, a Playwright scan of production pages across all 6 non-EN locales.

## Static layer (pre-fix baseline)

**Command:** `node scripts/qa/en_leak_static.mjs --json scripts/qa/out/en_leak_static.json`
**Result:** exit 1 (leaks exist, as expected pre-fix) — 89 files with findings, 703 total findings.

**Rules:**
- **R1** — hardcoded JSX text (2+ non-allowlisted Latin words, at least one lowercase letter).
- **R2** — hardcoded string-literal `placeholder`/`aria-label`/`alt`/`title`/`label` attributes.
- **R3** — locale-dropping navigation: a raw `<a href="/...">` (string or template literal), a default import from `next/link`, a `useRouter` import from `next/navigation`, or a `redirect()` call (from `next/navigation`) with a root-relative string-literal argument.
- **R4** — object-literal `title`/`body`/`q`/`a`/`name`/`description` leaves outside `schema`/`jsonLd`/`ld`/`graph`/`metadata`-named containers and outside `generateMetadata()` — review-only, never fails the run (mostly the `multi-day` `EXAMPLES` array and `fleet`/`routes` FAQ/vehicle data objects, which are genuine content-model leaks worth fixing but not yet proven as JSX-rendered leaks by this layer alone — the rendered layer below confirms which of these actually reach the DOM).

Per the plan's allowlist design, three files are fully excluded (D-09 EN-only `JSX_POSTS`: `prague-vienna-transfer-vs-train`, `prague-airport-to-city-center`, `prague-airport-taxi-vs-chauffeur`) and `app/[locale]/book/confirmation/page.tsx` has R1/R2 suppressed (D-05 recorded-as-is) while its R3 navigation is still checked and flagged below.

| File | R1 | R2 | R3 | R4 | Sample strings | Owning plan |
|---|---|---|---|---|---|---|
| `app/[locale]/about/page.tsx` | 0 | 1 | 3 | 0 | `alt="About PRESTIGO — Prague's Premium Chauffeur Service"`; `href="/authors/"` | 75-11 |
| `app/[locale]/account/page.tsx` | 0 | 0 | 1 | 0 | `default import from next/link ('Link')` | 75-15 |
| `app/[locale]/account/reset-password/page.tsx` | 0 | 0 | 1 | 0 | `useRouter imported from next/navigation` | 75-15 |
| `app/[locale]/account/trips/page.tsx` | 0 | 0 | 2 | 0 | `default import from next/link ('Link')`; `redirect('/login?next=/account/trips')` | 75-15 |
| `app/[locale]/authors/roman-ustyugov/page.tsx` | 6 | 0 | 2 | 0 | `Author profile`; `Areas of expertise` | 75-11 |
| `app/[locale]/blog/[slug]/page.tsx` | 5 | 0 | 2 | 0 | `Skip the taxi rank.`; `Chauffeur inside Arrivals.` | 75-13 |
| `app/[locale]/blog/page.tsx` | 0 | 0 | 3 | 0 | `href="/book"`; `href="/book"` | 75-13 |
| `app/[locale]/book/confirmation/page.tsx` | 0 | 0 | 1 | 0 | `default import from next/link ('Link')` | 75-14 (R3 next/link import only — text findings suppressed per D-05) |
| `app/[locale]/book/loading.tsx` | 0 | 1 | 0 | 0 | `aria-label="Loading booking form"` | 75-06 |
| `app/[locale]/book/multi-day/page.tsx` | 12 | 2 | 0 | 31 | `title: "Executive trip — Prague to Vienna"`; `description: "A classic Central European business circuit. Day one mov` | 75-07 |
| `app/[locale]/book/page.tsx` | 16 | 0 | 0 | 26 | `Instant Booking`; `Your transfer,` | 75-06 |
| `app/[locale]/contact/page.tsx` | 4 | 1 | 0 | 0 | `alt="Contact PRESTIGO — Premium Chauffeur Prague"`; `Service area: Central Europe` | 75-11 |
| `app/[locale]/corporate/CorporateForm.tsx` | 11 | 4 | 0 | 0 | `Request received.`; `Your corporate account request has been forwarded to our team.` | 75-12 |
| `app/[locale]/data-deletion/page.tsx` | 0 | 0 | 1 | 0 | `href="/privacy"` | 75-11 |
| `app/[locale]/faq/page.tsx` | 0 | 0 | 2 | 0 | `href="/contact"`; `href="/book"` | 75-11 |
| `app/[locale]/fleet/page.tsx` | 29 | 1 | 2 | 29 | `description: "The first choice for airport transfers and city rides. C`; `description: "For those who travel at the highest level. Rear massagin` | 75-08 |
| `app/[locale]/not-found.tsx` | 6 | 0 | 3 | 0 | `default import from next/link ('Link')`; `This road doesn't` | 75-16 |
| `app/[locale]/page.tsx` | 0 | 0 | 0 | 1 | `name: "Roman Ustyugov"` | 75-13 |
| `app/[locale]/privacy/page.tsx` | 0 | 0 | 1 | 0 | `href="/contact"` | 75-11 |
| `app/[locale]/routes/page.tsx` | 33 | 1 | 6 | 21 | `q: "Can I stop en route between Prague and my destination?"`; `a: "Yes — stops are included at no extra cost on every intercity route` | 75-09 |
| `app/[locale]/routes/prague-berlin/page.tsx` | 0 | 1 | 6 | 0 | `alt="Berlin — private chauffeur transfer from Prague to Berlin"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-bratislava/page.tsx` | 0 | 1 | 6 | 0 | `alt="Bratislava — private chauffeur transfer from Prague to Bratislava`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-brno/page.tsx` | 0 | 1 | 6 | 0 | `alt="Brno — private chauffeur transfer from Prague to Brno"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-budapest/page.tsx` | 0 | 1 | 6 | 0 | `alt="Budapest — private chauffeur transfer from Prague to Budapest"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-ceske-budejovice/page.tsx` | 0 | 1 | 6 | 0 | `alt="České Budějovice — private chauffeur transfer from Prague to Česk`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-cesky-krumlov/page.tsx` | 0 | 1 | 6 | 0 | `alt="Český Krumlov — private chauffeur transfer from Prague to Český K`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-dresden/page.tsx` | 0 | 1 | 6 | 0 | `alt="Dresden — private chauffeur transfer from Prague to Dresden"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-frantiskovy-lazne/page.tsx` | 0 | 1 | 6 | 0 | `alt="Františkovy Lázně — private chauffeur transfer from Prague to Fra`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-graz/page.tsx` | 0 | 1 | 6 | 0 | `alt="Graz — private chauffeur transfer from Prague to Graz"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-hradec-kralove/page.tsx` | 0 | 1 | 6 | 0 | `alt="Hradec Králové — private chauffeur transfer from Prague to Hradec`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-karlovy-vary/page.tsx` | 0 | 1 | 6 | 0 | `alt="Karlovy Vary — private chauffeur transfer from Prague to Karlovy `; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-krakow/page.tsx` | 0 | 1 | 6 | 0 | `alt="Kraków — private chauffeur transfer from Prague to Kraków"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-kutna-hora/page.tsx` | 0 | 1 | 6 | 0 | `alt="Kutná Hora — private chauffeur transfer from Prague to Kutná Hora`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-leipzig/page.tsx` | 0 | 1 | 6 | 0 | `alt="Leipzig — private chauffeur transfer from Prague to Leipzig"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-liberec/page.tsx` | 0 | 1 | 6 | 0 | `alt="Liberec — private chauffeur transfer from Prague to Liberec"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-linz/page.tsx` | 0 | 1 | 6 | 0 | `alt="Linz — private chauffeur transfer from Prague to Linz"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-marianske-lazne/page.tsx` | 0 | 1 | 6 | 0 | `alt="Mariánské Lázně — private chauffeur transfer from Prague to Mariá`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-munich/page.tsx` | 0 | 1 | 6 | 0 | `alt="Munich — private chauffeur transfer from Prague to Munich"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-nuremberg/page.tsx` | 0 | 1 | 6 | 0 | `alt="Nuremberg — private chauffeur transfer from Prague to Nuremberg"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-olomouc/page.tsx` | 0 | 1 | 6 | 0 | `alt="Olomouc — private chauffeur transfer from Prague to Olomouc"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-ostrava/page.tsx` | 0 | 1 | 6 | 0 | `alt="Ostrava — private chauffeur transfer from Prague to Ostrava"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-pardubice/page.tsx` | 0 | 1 | 6 | 0 | `alt="Pardubice — private chauffeur transfer from Prague to Pardubice"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-passau/page.tsx` | 0 | 1 | 6 | 0 | `alt="Passau — private chauffeur transfer from Prague to Passau"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-plzen/page.tsx` | 0 | 1 | 6 | 0 | `alt="Plzeň — private chauffeur transfer from Prague to Plzeň"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-regensburg/page.tsx` | 0 | 1 | 6 | 0 | `alt="Regensburg — private chauffeur transfer from Prague to Regensburg`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-salzburg/page.tsx` | 0 | 1 | 6 | 0 | `alt="Salzburg — private chauffeur transfer from Prague to Salzburg"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-vienna/page.tsx` | 0 | 1 | 6 | 0 | `alt="Vienna — private chauffeur transfer from Prague to Vienna"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-warsaw/page.tsx` | 0 | 1 | 6 | 0 | `alt="Warsaw — private chauffeur transfer from Prague to Warsaw"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-wroclaw/page.tsx` | 0 | 1 | 6 | 0 | `alt="Wrocław — private chauffeur transfer from Prague to Wrocław"`; `href="/book"` | 75-10 |
| `app/[locale]/routes/prague-zlin/page.tsx` | 0 | 1 | 6 | 0 | `alt="Zlín — private chauffeur transfer from Prague to Zlín"`; `href="/book"` | 75-10 |
| `app/[locale]/services/airport-transfer/page.tsx` | 0 | 1 | 3 | 0 | `alt="Prague Airport meet & greet chauffeur transfer — PRESTIGO"`; `href="/book"` | 75-11 |
| `app/[locale]/services/city-rides/page.tsx` | 0 | 1 | 3 | 0 | `alt="Prague City Rides — PRESTIGO"`; `href="/book"` | 75-11 |
| `app/[locale]/services/concierge/page.tsx` | 0 | 1 | 4 | 0 | `alt="Concierge chauffeur service in Prague — PRESTIGO"`; `href="/book"` | 75-11 |
| `app/[locale]/services/corporate-accounts/page.tsx` | 0 | 1 | 3 | 0 | `alt="Corporate Chauffeur Accounts Prague — PRESTIGO"`; `href="/corporate"` | 75-11 |
| `app/[locale]/services/group-transfers/page.tsx` | 0 | 1 | 3 | 0 | `alt="Group Transfers Prague — PRESTIGO"`; `href="/contact"` | 75-11 |
| `app/[locale]/services/intercity-routes/page.tsx` | 0 | 1 | 6 | 0 | `alt="Intercity Routes from Prague — PRESTIGO"`; `href="/routes"` | 75-11 |
| `app/[locale]/services/page.tsx` | 0 | 0 | 1 | 0 | `href="/book"` | 75-11 |
| `app/[locale]/services/vip-events/page.tsx` | 0 | 1 | 3 | 0 | `alt="VIP & Events Chauffeur Prague — PRESTIGO"`; `href="/contact"` | 75-11 |
| `app/[locale]/terms/page.tsx` | 0 | 0 | 4 | 0 | `href="/book"`; `href="/privacy"` | 75-11 |
| `components/ArticleByline.tsx` | 0 | 0 | 1 | 0 | `default import from next/link ('Link')` | 75-13 |
| `components/BlogCard.tsx` | 1 | 0 | 1 | 0 | `href="/blog/"`; `Read article →` | 75-13 |
| `components/BookingSection.tsx` | 4 | 0 | 0 | 0 | `Instant booking`; `Book your` | 75-13 |
| `components/ContactForm.tsx` | 11 | 3 | 0 | 0 | `Something went wrong.`; `We could not send your message. Please try again or contact us directl` | 75-12 |
| `components/Footer.tsx` | 1 | 0 | 0 | 0 | `Spojovací 685, Vysoký Újezd` | 75-13 |
| `components/HourlyBookingSection.tsx` | 4 | 0 | 0 | 0 | `Hourly booking`; `Hire a car with` | 75-13 |
| `components/Routes.tsx` | 4 | 0 | 1 | 0 | `Popular routes`; `Point to point or multi-city. We connect the key destinations of Centr` | 75-13 |
| `components/RoutesBento.tsx` | 1 | 0 | 1 | 0 | `href="/routes/"`; `View route` | 75-13 |
| `components/RoutesMap.tsx` | 0 | 1 | 0 | 0 | `aria-label="Map of Prestigo chauffeur routes radiating from Prague acr` | 75-13 |
| `components/booking/BookingWidget.tsx` | 0 | 0 | 1 | 0 | `useRouter imported from next/navigation` | 75-14 |
| `components/booking/BookingWizard.tsx` | 0 | 0 | 1 | 0 | `useRouter imported from next/navigation` | 75-14 |
| `components/booking/TripTypeTabs.tsx` | 0 | 0 | 1 | 0 | `useRouter imported from next/navigation` | 75-14 |
| `components/booking/steps/StepStub.tsx` | 1 | 0 | 0 | 0 | `Complete your journey details — coming next.` | 75-14 |

### UNOWNED (admin panel — explicitly out of i18n scope per STATE.md; no Phase 75 fix plan)

`app/(internal)/admin/**` is outside the `app/[locale]` tree entirely (never walked by this scanner). `components/admin/**` IS walked (it's under `components/`) and its real, hardcoded-EN findings are recorded here for completeness — but per STATE.md's explicit "Do NOT localize: `app/admin/*`" guardrail, the admin panel is never a Phase 75 fix target. These rows are informational only.

| File | R1 | R2 | R3 | R4 | Sample strings |
|---|---|---|---|---|---|
| `components/admin/AdminBookingWizard.tsx` | 0 | 1 | 0 | 0 | `aria-label="New Booking"` |
| `components/admin/AdminSidebar.tsx` | 1 | 0 | 1 | 0 | `default import from next/link ('Link')`; `Sign out` |
| `components/admin/AdminStep6Create.tsx` | 3 | 2 | 0 | 0 | `label="Return date"`; `label="Date & time"` |
| `components/admin/BookingChangeHistory.tsx` | 4 | 0 | 0 | 0 | `Loading history…`; `Couldn't load change history — try again.` |
| `components/admin/BookingsTable.tsx` | 60 | 8 | 0 | 0 | `bookings are final and cannot be edited.`; `This booking originated from a GNet partner — edits are recorded local` |
| `components/admin/DispatchDefault.tsx` | 1 | 0 | 0 | 0 | `Shows bookings from the last N days, plus all upcoming trips.` |
| `components/admin/DriverAssignmentSection.tsx` | 5 | 0 | 0 | 1 | `name: "Driver assigned"`; `Driver Note` |
| `components/admin/DriverForm.tsx` | 1 | 0 | 0 | 0 | `Vehicle Info` |
| `components/admin/DriversTable.tsx` | 3 | 2 | 0 | 0 | `No drivers yet.`; `Add your first driver to start assigning them to bookings.` |
| `components/admin/ManualBookingForm.tsx` | 13 | 8 | 0 | 0 | `New Booking`; `For account ·` |
| `components/admin/PricingForm.tsx` | 12 | 0 | 0 | 0 | `EUR / km`; `EUR / day` |
| `components/admin/PromoCard.tsx` | 6 | 0 | 0 | 0 | `Promo active`; `Regular price (EUR)` |
| `components/admin/PromoCodeForm.tsx` | 2 | 0 | 0 | 0 | `Expiry Date`; `Usage Limit` |
| `components/admin/PromoCodesTable.tsx` | 4 | 1 | 0 | 0 | `No expiry`; `No promo codes yet.` |
| `components/admin/RoutesTable.tsx` | 1 | 0 | 0 | 0 | `Route saved · /routes/` |
| `components/admin/ZoneMap.tsx` | 1 | 0 | 0 | 0 | `Loading map...` |
| `components/admin/ZoneMapInner.tsx` | 4 | 2 | 0 | 0 | `placeholder="Zone name"`; `Discard zone` |

**Totals:** 89 files with findings, 703 findings (R1=270, R2=76, R3=248, R4=109).

**Notable structural findings for fix-plan sizing:**
- `app/[locale]/book/page.tsx` (75-06) and `app/[locale]/book/multi-day/page.tsx` (75-07) confirm RESEARCH.md Pitfall 6's exact scope — hero + "How booking works"/"Example itineraries" chrome, zero `useTranslations` import.
- `app/[locale]/corporate/CorporateForm.tsx` (75-12) confirms RESEARCH.md Pitfall 5 — full component externalization, not a one-line placeholder fix.
- `components/booking/BookingWidget.tsx`, `BookingWizard.tsx`, `TripTypeTabs.tsx` (75-14) and 6 account/auth pages (75-15) are real `useRouter`(next/navigation)/`next/link`/`redirect()` locale-dropping navigation defects — confirms the ~210-link estimate from STATE.md's Phase 75 input note is concentrated in these specific files, not spread evenly across the site.
- `app/[locale]/routes/prague-*/page.tsx` (all 29, 75-10) each carry exactly 1 R2 (hero `alt`) + 6 R3 (raw `<a href>` CTAs) findings — a uniform, mechanical fix once one page's pattern is fixed (per-page content strings themselves already flow through `getRouteContent()`/`content.*`, not raw JSX text, so R1=0 across every route page).
- `app/[locale]/book/multi-day/page.tsx`'s 31 R4 findings are the `EXAMPLES` const (day-trip itinerary titles/descriptions) — genuine content-model leaks, reachable in the DOM; the rendered layer below confirms this.

## Rendered layer (pre-fix baseline)

**Command:** `python3 scripts/qa/en_leak_rendered.py https://rideprestigo.com` (all 6 non-EN locales, default page set).
**Result:** exit 1 (leaks exist, as expected pre-fix) — 6 locales × 26 pages checked, 2003 text leaks, 1404 link leaks.

**Method:** for `ru`/`ar`/`hi`/`zh` any visible-text/attr/meta/FAQ/route-Service string containing a non-allowlisted run of 2+ Latin words is a leak (Latin script is inherently suspicious on a non-Latin-script locale); for `es`/`fr` (both Latin-script) a string is only a leak when it is byte-identical to the same page's EN rendering AND still has 3+ non-allowlisted words after stripping — this is why `es`/`fr` totals are consistently lower than `ru`/`ar`/`hi`/`zh` (partially-translated copy with an occasional Latin loanword is not byte-identical to EN, so it doesn't trip the stricter `es`/`fr` rule even though the same page trips the looser Latin-run rule on `ru`/`ar`/`hi`/`zh`). Link leaks (internal `<a href>` missing the locale prefix) are identical across every locale (234 each) — a structural code defect, not a translation gap.

| Locale | Pages checked | Total text leaks | Total link leaks |
|---|---|---|---|
| ru | 26 | 380 | 234 |
| es | 26 | 232 | 234 |
| fr | 26 | 232 | 234 |
| ar | 26 | 373 | 234 |
| hi | 26 | 405 | 234 |
| zh | 26 | 381 | 234 |

**Per-page detail** (rows with zero leaks/allowlisted/linkLeaks omitted for brevity — e.g. `es`/`fr` `/login` has zero of all three and is proven clean, not untested; see the JSON for the full empty-included set):

| Locale | Page | Leaks | Allowlisted | Link leaks | Owning plan |
|---|---|---|---|---|---|
| ru | `/` | 20 | 0 | 8 | 75-13 |
| ru | `/about` | 2 | 0 | 3 | 75-11 |
| ru | `/fleet` | 33 | 0 | 4 | 75-08 |
| ru | `/services` | 4 | 0 | 17 | 75-11 |
| ru | `/services/airport-transfer` | 23 | 0 | 3 | 75-11 |
| ru | `/services/city-rides` | 14 | 0 | 3 | 75-11 |
| ru | `/services/intercity-routes` | 5 | 0 | 11 | 75-11 |
| ru | `/services/vip-events` | 4 | 0 | 3 | 75-11 |
| ru | `/services/group-transfers` | 2 | 0 | 3 | 75-11 |
| ru | `/services/concierge` | 11 | 0 | 8 | 75-11 |
| ru | `/routes` | 32 | 0 | 92 | 75-09 |
| ru | `/routes/prague-vienna` | 2 | 0 | 11 | 75-10 |
| ru | `/routes/prague-ceske-budejovice` | 4 | 0 | 11 | 75-10 |
| ru | `/routes/prague-marianske-lazne` | 2 | 0 | 11 | 75-10 |
| ru | `/corporate` | 3 | 0 | 0 | 75-11 |
| ru | `/contact` | 19 | 0 | 4 | 75-11 |
| ru | `/faq` | 3 | 0 | 2 | 75-11 |
| ru | `/book` | 62 | 0 | 0 | 75-06 |
| ru | `/book/multi-day` | 84 | 0 | 0 | 75-07 |
| ru | `/blog` | 9 | 0 | 16 | 75-13 |
| ru | `/login` | 4 | 0 | 0 | 75-11 |
| ru | `/authors/roman-ustyugov` | 23 | 0 | 2 | 75-11 |
| ru | `/blog/beyond-transport-luxury-chauffeur-service-prague` | 12 | 0 | 13 | 75-13 |
| ru | `/blog/prague-airport-to-city-center` | 0 | 277 | 7 | 75-13 |
| ru | `/this-page-does-not-exist` | 3 | 0 | 1 | 75-16 (404 page) |
| ru | `/book/confirmation` | 0 | 5 | 1 | 75-14 (link only — D-05 text allowlisted) |
| es | `/` | 9 | 0 | 8 | 75-13 |
| es | `/about` | 2 | 0 | 3 | 75-11 |
| es | `/fleet` | 11 | 0 | 4 | 75-08 |
| es | `/services` | 1 | 0 | 17 | 75-11 |
| es | `/services/airport-transfer` | 9 | 0 | 3 | 75-11 |
| es | `/services/city-rides` | 8 | 0 | 3 | 75-11 |
| es | `/services/intercity-routes` | 2 | 0 | 11 | 75-11 |
| es | `/services/vip-events` | 2 | 0 | 3 | 75-11 |
| es | `/services/group-transfers` | 1 | 0 | 3 | 75-11 |
| es | `/services/concierge` | 7 | 0 | 8 | 75-11 |
| es | `/routes` | 8 | 0 | 92 | 75-09 |
| es | `/routes/prague-vienna` | 2 | 0 | 11 | 75-10 |
| es | `/routes/prague-ceske-budejovice` | 2 | 0 | 11 | 75-10 |
| es | `/routes/prague-marianske-lazne` | 2 | 0 | 11 | 75-10 |
| es | `/corporate` | 1 | 0 | 0 | 75-11 |
| es | `/contact` | 9 | 0 | 4 | 75-11 |
| es | `/faq` | 1 | 0 | 2 | 75-11 |
| es | `/book` | 53 | 0 | 0 | 75-06 |
| es | `/book/multi-day` | 76 | 0 | 0 | 75-07 |
| es | `/blog` | 1 | 0 | 16 | 75-13 |
| es | `/authors/roman-ustyugov` | 14 | 0 | 2 | 75-11 |
| es | `/blog/beyond-transport-luxury-chauffeur-service-prague` | 9 | 0 | 13 | 75-13 |
| es | `/blog/prague-airport-to-city-center` | 0 | 225 | 7 | 75-13 |
| es | `/this-page-does-not-exist` | 2 | 0 | 1 | 75-16 (404 page) |
| es | `/book/confirmation` | 0 | 1 | 1 | 75-14 (link only — D-05 text allowlisted) |
| fr | `/` | 9 | 0 | 8 | 75-13 |
| fr | `/about` | 2 | 0 | 3 | 75-11 |
| fr | `/fleet` | 11 | 0 | 4 | 75-08 |
| fr | `/services` | 1 | 0 | 17 | 75-11 |
| fr | `/services/airport-transfer` | 9 | 0 | 3 | 75-11 |
| fr | `/services/city-rides` | 8 | 0 | 3 | 75-11 |
| fr | `/services/intercity-routes` | 2 | 0 | 11 | 75-11 |
| fr | `/services/vip-events` | 2 | 0 | 3 | 75-11 |
| fr | `/services/group-transfers` | 1 | 0 | 3 | 75-11 |
| fr | `/services/concierge` | 7 | 0 | 8 | 75-11 |
| fr | `/routes` | 8 | 0 | 92 | 75-09 |
| fr | `/routes/prague-vienna` | 2 | 0 | 11 | 75-10 |
| fr | `/routes/prague-ceske-budejovice` | 2 | 0 | 11 | 75-10 |
| fr | `/routes/prague-marianske-lazne` | 2 | 0 | 11 | 75-10 |
| fr | `/corporate` | 1 | 0 | 0 | 75-11 |
| fr | `/contact` | 9 | 0 | 4 | 75-11 |
| fr | `/faq` | 1 | 0 | 2 | 75-11 |
| fr | `/book` | 53 | 0 | 0 | 75-06 |
| fr | `/book/multi-day` | 76 | 0 | 0 | 75-07 |
| fr | `/blog` | 1 | 0 | 16 | 75-13 |
| fr | `/authors/roman-ustyugov` | 14 | 0 | 2 | 75-11 |
| fr | `/blog/beyond-transport-luxury-chauffeur-service-prague` | 9 | 0 | 13 | 75-13 |
| fr | `/blog/prague-airport-to-city-center` | 0 | 225 | 7 | 75-13 |
| fr | `/this-page-does-not-exist` | 2 | 0 | 1 | 75-16 (404 page) |
| fr | `/book/confirmation` | 0 | 1 | 1 | 75-14 (link only — D-05 text allowlisted) |
| ar | `/` | 20 | 0 | 8 | 75-13 |
| ar | `/about` | 2 | 0 | 3 | 75-11 |
| ar | `/fleet` | 33 | 0 | 4 | 75-08 |
| ar | `/services` | 5 | 0 | 17 | 75-11 |
| ar | `/services/airport-transfer` | 15 | 0 | 3 | 75-11 |
| ar | `/services/city-rides` | 17 | 0 | 3 | 75-11 |
| ar | `/services/intercity-routes` | 5 | 0 | 11 | 75-11 |
| ar | `/services/vip-events` | 4 | 0 | 3 | 75-11 |
| ar | `/services/group-transfers` | 2 | 0 | 3 | 75-11 |
| ar | `/services/concierge` | 12 | 0 | 8 | 75-11 |
| ar | `/routes` | 32 | 0 | 92 | 75-09 |
| ar | `/routes/prague-vienna` | 2 | 0 | 11 | 75-10 |
| ar | `/routes/prague-ceske-budejovice` | 4 | 0 | 11 | 75-10 |
| ar | `/routes/prague-marianske-lazne` | 2 | 0 | 11 | 75-10 |
| ar | `/corporate` | 1 | 0 | 0 | 75-11 |
| ar | `/contact` | 19 | 0 | 4 | 75-11 |
| ar | `/faq` | 3 | 0 | 2 | 75-11 |
| ar | `/book` | 62 | 0 | 0 | 75-06 |
| ar | `/book/multi-day` | 84 | 0 | 0 | 75-07 |
| ar | `/blog` | 7 | 0 | 16 | 75-13 |
| ar | `/login` | 4 | 0 | 0 | 75-11 |
| ar | `/authors/roman-ustyugov` | 23 | 0 | 2 | 75-11 |
| ar | `/blog/beyond-transport-luxury-chauffeur-service-prague` | 12 | 0 | 13 | 75-13 |
| ar | `/blog/prague-airport-to-city-center` | 0 | 277 | 7 | 75-13 |
| ar | `/this-page-does-not-exist` | 3 | 0 | 1 | 75-16 (404 page) |
| ar | `/book/confirmation` | 0 | 5 | 1 | 75-14 (link only — D-05 text allowlisted) |
| hi | `/` | 21 | 0 | 8 | 75-13 |
| hi | `/about` | 2 | 0 | 3 | 75-11 |
| hi | `/fleet` | 33 | 0 | 4 | 75-08 |
| hi | `/services` | 5 | 0 | 17 | 75-11 |
| hi | `/services/airport-transfer` | 23 | 0 | 3 | 75-11 |
| hi | `/services/city-rides` | 14 | 0 | 3 | 75-11 |
| hi | `/services/intercity-routes` | 7 | 0 | 11 | 75-11 |
| hi | `/services/vip-events` | 5 | 0 | 3 | 75-11 |
| hi | `/services/group-transfers` | 5 | 0 | 3 | 75-11 |
| hi | `/services/concierge` | 16 | 0 | 8 | 75-11 |
| hi | `/routes` | 32 | 0 | 92 | 75-09 |
| hi | `/routes/prague-vienna` | 12 | 0 | 11 | 75-10 |
| hi | `/routes/prague-ceske-budejovice` | 2 | 0 | 11 | 75-10 |
| hi | `/routes/prague-marianske-lazne` | 2 | 0 | 11 | 75-10 |
| hi | `/corporate` | 3 | 0 | 0 | 75-11 |
| hi | `/contact` | 22 | 0 | 4 | 75-11 |
| hi | `/faq` | 4 | 0 | 2 | 75-11 |
| hi | `/book` | 62 | 0 | 0 | 75-06 |
| hi | `/book/multi-day` | 84 | 0 | 0 | 75-07 |
| hi | `/blog` | 9 | 0 | 16 | 75-13 |
| hi | `/login` | 4 | 0 | 0 | 75-11 |
| hi | `/authors/roman-ustyugov` | 23 | 0 | 2 | 75-11 |
| hi | `/blog/beyond-transport-luxury-chauffeur-service-prague` | 12 | 0 | 13 | 75-13 |
| hi | `/blog/prague-airport-to-city-center` | 0 | 277 | 7 | 75-13 |
| hi | `/this-page-does-not-exist` | 3 | 0 | 1 | 75-16 (404 page) |
| hi | `/book/confirmation` | 0 | 5 | 1 | 75-14 (link only — D-05 text allowlisted) |
| zh | `/` | 20 | 0 | 8 | 75-13 |
| zh | `/about` | 2 | 0 | 3 | 75-11 |
| zh | `/fleet` | 33 | 0 | 4 | 75-08 |
| zh | `/services` | 4 | 0 | 17 | 75-11 |
| zh | `/services/airport-transfer` | 21 | 0 | 3 | 75-11 |
| zh | `/services/city-rides` | 16 | 0 | 3 | 75-11 |
| zh | `/services/intercity-routes` | 5 | 0 | 11 | 75-11 |
| zh | `/services/vip-events` | 4 | 0 | 3 | 75-11 |
| zh | `/services/group-transfers` | 2 | 0 | 3 | 75-11 |
| zh | `/services/concierge` | 11 | 0 | 8 | 75-11 |
| zh | `/routes` | 32 | 0 | 92 | 75-09 |
| zh | `/routes/prague-vienna` | 4 | 0 | 11 | 75-10 |
| zh | `/routes/prague-ceske-budejovice` | 4 | 0 | 11 | 75-10 |
| zh | `/routes/prague-marianske-lazne` | 2 | 0 | 11 | 75-10 |
| zh | `/corporate` | 2 | 0 | 0 | 75-11 |
| zh | `/contact` | 19 | 0 | 4 | 75-11 |
| zh | `/faq` | 4 | 0 | 2 | 75-11 |
| zh | `/book` | 62 | 0 | 0 | 75-06 |
| zh | `/book/multi-day` | 84 | 0 | 0 | 75-07 |
| zh | `/blog` | 9 | 0 | 16 | 75-13 |
| zh | `/login` | 4 | 0 | 0 | 75-11 |
| zh | `/authors/roman-ustyugov` | 23 | 0 | 2 | 75-11 |
| zh | `/blog/beyond-transport-luxury-chauffeur-service-prague` | 11 | 0 | 13 | 75-13 |
| zh | `/blog/prague-airport-to-city-center` | 0 | 277 | 7 | 75-13 |
| zh | `/this-page-does-not-exist` | 3 | 0 | 1 | 75-16 (404 page) |
| zh | `/book/confirmation` | 0 | 5 | 1 | 75-14 (link only — D-05 text allowlisted) |

**Verified against the RESEARCH.md/CONTEXT.md pre-fix expectations:**
- `ru` `/fleet` (33 leaks) and `/book` (62 leaks) both confirm the known planning-time-discovered whole-EN pages.
- `ru` `/routes/prague-vienna` link leaks present (11 — Related Routes CTAs plus the vehicle-card "Book Online" CTA and hero CTAs), confirming the known ~210-link locale-dropping-navigation estimate.
- `/blog/prague-airport-to-city-center` (D-09 EN-only JSX post) shows 0 leaks / 277 allowlisted on every non-`es`/`fr` locale (225 on `es`/`fr`, since the diff-against-EN rule allowlists the same count differently) and 7 link leaks — the D-09 text exemption works exactly as designed, but the post's OWN internal navigation (e.g. its "Read more" / related-post links) still drops the locale prefix and is a real, unallowlisted `75-13`-owned link defect worth fixing regardless of the D-09 text exemption.
- `/book/confirmation` (D-05 recorded-as-is) shows 0 leaks / N allowlisted (text correctly exempted) but 1 real link leak (`/book`, from its `next/link` default import — matches the static layer's R3 finding for this exact file) — confirms D-05 exempts TEXT only, never navigation, per the plan's own design.
- `/this-page-does-not-exist` (negative control) returns real "Page not found" / "Back to Home" leaks on every locale — proving `app/[locale]/not-found.tsx` (75-16) is itself unlocalized, and that the scanner correctly handles a 404/empty-content page without crashing (the empty-page edge case).
- **Stripe Elements locale / Google Places `language` (D-07 scope)** are NOT verifiable by this static-DOM rendered scan (both render inside third-party iframes/widgets whose internal locale is not exposed via `document.title`/text-node inspection) — confirmed out of this layer's reach per RESEARCH.md; verified instead at the booking E2E layer (plan 75-03/75-05).

**Deviation note:** the first rendered run against production surfaced every `LocaleSwitcher` endonym label (`Español`, `Français`, `العربية`, …) as a false-positive leak on every single page, because `components/LocaleSwitcher.tsx`'s dropdown menu is always mounted in the DOM (opacity/pointer-events toggle, not conditional render — the same underlying fact 75-01's `switcher_audit.py` had to work around). Fixed (Rule 1) by walking the full ancestor chain in `EXTRACT_JS`'s `isHiddenByAncestor()` — checking `display`/`visibility`/`opacity` at every ancestor level plus a defensive `role="menu"` check — since `getComputedStyle(el).opacity` only reports an element's OWN opacity, not an ancestor's composited effective opacity.
