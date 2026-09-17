# Requirements: Prestigo v3.0 — Site Internationalization (i18n)

**Defined:** 2026-09-03
**Core Value:** Every page — booking, content, or service — must convert a visitor into a confirmed booking or a qualified lead without friction. v3.0 extends that reach to non-English speakers **without sacrificing the existing English SEO positions.**

## Milestone Scope

Make the entire public site multilingual. English stays the default at the site root (existing URLs unchanged → zero ranking risk); six additional locales are served under URL subpaths with full SEO wiring (hreflang, localized metadata, per-locale sitemap entries). All user-facing content — UI chrome, booking flow, account, and the full SEO content set (route pages, service pages, blog, legal) — is translated by an AI-only, re-runnable pipeline.

**Locales (7 total):**

| Locale | Code | URL | Script / Notes |
|--------|------|-----|----------------|
| English | `en` | root (no prefix, default) | existing URLs, source of truth |
| Russian | `ru` | `/ru/` | Cyrillic |
| Spanish | `es` | `/es/` | Latin |
| French | `fr` | `/fr/` | Latin |
| Arabic | `ar` | `/ar/` | **RTL** + Noto Sans Arabic |
| Hindi | `hi` | `/hi/` | Devanagari + Noto Sans Devanagari |
| Chinese (Simplified) | `zh` | `/zh/` | **CJK** + Noto Sans SC (infra sized for future JA/KO) |

## v1 Requirements (this milestone)

### Internationalization Foundation

- [x] **I18N-01**: Adopt `next-intl` with `app/[locale]/` routing and `localePrefix: 'as-needed'` — EN resolves at root with no `/en` prefix and existing English URLs are unchanged.
- [x] **I18N-02**: Compose the next-intl locale middleware into the existing `middleware.ts` chain so per-request CSP nonce, Supabase `updateSession`, and CSRF Origin-guard all continue to work byte-for-byte, with locale detection added.
- [x] **I18N-03**: `<html lang>` and `dir` are set dynamically per locale (`dir="rtl"` for `ar`).
- [x] **I18N-04**: Typed, single-source locale config (`en, ru, es, fr, ar, hi, zh`); admin/api/auth/driver routes stay non-localized at root.

### String Externalization

- [x] **STR-01**: All UI-chrome strings (Nav, Footer, Hero, Services, Fleet, HowItWorks, Testimonials, CookieBanner, FeatureStrip, etc.) are moved into message catalogs (`messages/<locale>.json`) with namespaces and consumed via `useTranslations`/`getTranslations`.
- [x] **STR-02**: Booking flow (wizard/EntryBar/vehicle cards), account + auth pages, forms, validation/error/toast text are fully externalized.

### Content Externalization

- [x] **CNT-01**: The 29–30 route-page bodies (inclusions, day-trip configs, FAQ, hero copy) move to a locale-aware content model.
- [x] **CNT-02**: Home long-form, the 8 service pages, about/faq/contact/corporate, and legal pages are localizable.
- [x] **CNT-03**: Blog moves to per-locale content (`content/blog/<locale>/`); listing and `[slug]` render the active locale.

### Translation Production

- [x] **TR-01**: A re-runnable AI translation pipeline (`scripts/i18n-translate.mjs`) with a locked brand glossary and a do-not-translate list (prices/numbers, "Prestigo", E/S/V-Class names, proper nouns), premium tone per locale. EN is the source of truth; re-runs are idempotent.
- [x] **TR-02**: Complete translations for `ru, es, fr, ar, hi, zh` across every catalog and content file.

### Non-Latin & RTL Infrastructure

- [ ] **RTL-01**: Arabic renders correctly right-to-left — physical-direction Tailwind classes (~42 files) audited and converted to logical properties; no mirrored-layout breakage.
- [ ] **FONT-01**: Noto Sans Arabic / Devanagari / SC loaded per locale via `next/font`.

### SEO

- [ ] **SEO-01**: `getAlternates()` emits all 6 hreflang alternates + `x-default` on every page.
- [ ] **SEO-02**: `generateMetadata` produces localized title/description/OG per locale.
- [ ] **SEO-03**: The sitemap emits every locale URL with a full alternates cluster.
- [ ] **SEO-04**: JSON-LD carries `inLanguage` and localized text fields.

### UX & Verification

- [ ] **UX-01**: Language switcher UI with `NEXT_LOCALE` cookie persistence.
- [ ] **UX-02**: First-visit language auto-detection via `Accept-Language` (no crawler cloaking; localized URLs remain directly indexable).
- [ ] **VER-01**: Cross-locale E2E green — every locale renders, switcher works, booking completes per-locale (incl. RTL), guest checkout intact, GA4/Meta analytics carry a locale dimension, no CSP regression, no EN leakage.

## v2 Requirements (deferred)

### Additional Locales

- **LOC-CS**: Czech (`/cs/`) — remove the current `/cs → /` redirect; infra already supports it.
- **LOC-DE**: German (`/de/`) — highest practical intercity-route audience; deferred by owner's world-language choice.
- **LOC-JA / LOC-KO**: Japanese / Korean — reuse CJK font infra from `zh`.

### Localization Depth

- **L10N-PRICE**: Locale-aware price/number/currency formatting (v3.0 keeps numeric prices in €).
- **L10N-HUMAN**: Human proofreading pass over AI translations (premium copy QA).
- **L10N-ADMIN**: Localized admin/driver operational UI.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Localizing admin / driver / api routes | Operational surface; English-only is fine, keeps them off the `[locale]` tree |
| Per-locale currency conversion | Prices stay numeric €; only display strings translate |
| CS / DE / JA / KO content | Infra is built to support them; content deferred to a later milestone |
| Human translation / proofreading | Owner chose AI-only production for this milestone |
| Per-locale ccTLD or subdomains | Subpath strategy chosen (single domain, preserves EN ranking) |

## Traceability

Populated during roadmap creation (Phases 68–75).

| Requirement | Phase | Status |
|-------------|-------|--------|
| I18N-01 | 68 | Complete |
| I18N-02 | 68 | Complete |
| I18N-03 | 68 | Complete |
| I18N-04 | 68 | Complete |
| STR-01 | 69 | Complete |
| STR-02 | 70 | Complete |
| CNT-01 | 71 | Complete |
| CNT-02 | 71 | Complete |
| CNT-03 | 71 | Complete |
| TR-01 | 72 | Complete |
| TR-02 | 72, 73 | Complete |
| RTL-01 | 73 | Pending |
| FONT-01 | 73 | Pending |
| SEO-01 | 74 | Pending |
| SEO-02 | 74 | Pending |
| SEO-03 | 74 | Pending |
| SEO-04 | 74 | Pending |
| UX-01 | 74 | Pending |
| UX-02 | 74 | Pending |
| VER-01 | 75 | Pending |

**Coverage:**

- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-03*
*Last updated: 2026-09-03 after milestone definition*
