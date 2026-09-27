# Phase 74: SEO — hreflang, Localized Metadata, Sitemap, Structured Data, Switcher - Context

**Gathered:** 2026-09-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Finish the SEO wiring for the multilingual site so search engines and users treat the 7 locales (EN root + `/ru /es /fr /ar /hi /zh`) correctly. Six deliverables:

1. **hreflang alternates** — every indexable page emits its full alternates cluster (up to 6 locales + `x-default`), replacing the current hardcoded `{ en, x-default }` blocks (~56 inline `languages:` sites across `app/[locale]/**`).
2. **Localized metadata** — `generateMetadata` produces per-locale title/description/OG (SEO-02), sourced from the Phase 71/72 content model + catalogs.
3. **Sitemap** — every locale URL emitted with a full alternates cluster (SEO-03), extending the single `entry()` helper in `app/sitemap.ts`.
4. **Structured data** — JSON-LD carries `inLanguage` and localized text fields (SEO-04).
5. **Language switcher** — UI component with `NEXT_LOCALE` cookie persistence (UX-01). Does not exist yet — built from scratch.
6. **First-visit detection** — soft, crawler-safe locale suggestion via `Accept-Language` (UX-02).

**Out of scope:** admin/driver panels (`app/(internal)/`, EN+LTR); any new translated content (Phases 71–73 own that); the broken-`/fleet`-localization and per-locale OG images (deferred below); the already-shipped `.avif` middleware-matcher hotfix (landed on `main` 2026-09-21, commit `25522d2`, separate from this phase).

</domain>

<decisions>
## Implementation Decisions

### Language switcher (UX-01)
- **D-01:** Placement — **header**, where the current `A ▾` control already sits (left of the "Забронировать"/Book button in `SiteChrome`/header). The slot is effectively already reserved.
- **D-02:** Labels — **endonyms**: `English, Русский, Español, Français, العربية, हिन्दी, 中文`. Each language named in itself (best-practice: a user always recognizes their own). No flags (language ≠ country). — **Reversibility:** reversible — a label map.
- **D-03:** Switch behavior — **stay on the same page in the target locale** (`/ru/routes/prague-vienna` → `/es/routes/prague-vienna`), never jump to home. Must go through the `@/i18n/routing` locale-aware navigation (Phase 70 pattern), not string concatenation. When the target locale lacks a translation, EN-fallback renders (Phase 71 D-07). — **Reversibility:** reversible.
- Presentation (dropdown vs other) is Claude's discretion — the `A ▾` affordance implies a dropdown.

### First-visit auto-detection (UX-02)
- **D-04:** On first visit, if `Accept-Language` matches a supported locale, show a **soft, dismissible banner** ("Continue in English? / Продолжить на русском?"). The URL is **never changed without a click** — zero cloaking risk, crawler and user see the same page. The choice is written to the `NEXT_LOCALE` cookie. — **Reversibility:** reversible.
- **D-05:** **No automatic URL redirect — ever.** Not on `Accept-Language`, not on the `NEXT_LOCALE` cookie. A returning visitor with `NEXT_LOCALE=ru` hitting `/` is **not** redirected; the cookie drives the banner/UI memory, not the address bar. Maximum SEO safety; crawler and user always see the same URL. Banner is shown once (dismissal remembered). — **Reversibility:** reversible.
- **D-05a (implication):** `routing.localeDetection` in `i18n/routing.ts` **stays `false`.** UX-02 is satisfied by the custom banner, not next-intl's built-in redirecting detection. The existing "Do not flip this on early" comment in `i18n/routing.ts` becomes permanent for this design.

### hreflang coverage (SEO-01 / SEO-03)
- **D-06:** **No hreflang cluster on `noindex` pages.** The 20 `noindex` `prague-to-{city}` routes (and any other noindex page) do not participate in hreflang — Google requires every URL in a cluster to be indexable and self-canonical; mixing sends contradictory signals. Their locale variants are likewise `noindex`. — **Reversibility:** costly — the alternates helper must know each page's index status, shaping its signature.
- **D-07:** hreflang cluster is **content-aware**: a locale alternate is emitted **only when a genuine translation exists**. EN-fallback pages (untranslated blog per Phase 71 D-07, the 3 EN-only `JSX_POSTS` per D-08) are excluded from the cluster and stay self-canonical → EN. No claiming a "Russian" URL that actually serves EN. — **Reversibility:** costly — `getAlternates()` becomes translation-aware, read by every page + the sitemap.
- **D-06/07 implication:** the centralized `getAlternates(path, …)` helper (Claude's discretion to design/centralize) must take both **index status** and **translation availability** into account — it is not a blind 6-locale emitter. Same logic feeds `app/sitemap.ts`.

### Localized OG / metadata (SEO-02 / SEO-04)
- **D-08:** **One shared, text-neutral `og-image.jpg`** for all locales (current brand/vehicle image, no baked-in text). Only `og:title`, `og:description`, and the OG image `alt` are localized. Zero image-generation work; avoids RTL/CJK text-rendering complexity in `ar/hi/zh`. — **Reversibility:** reversible.
- **D-09:** JSON-LD gets `inLanguage` set to the active locale (BCP-47 tag) and localized text fields (name/description sourced from the content model), while locale-invariant data (prices, `priceValidUntil`, Place ID, ratings) stays as-is. EN structured-data output must remain byte-for-byte unchanged (Phase 71 constraint). — **Reversibility:** reversible.

### Claude's Discretion
- Whether/how to centralize the ~56 inline `alternates` blocks into a shared `getAlternates(path, opts)` helper vs edit in place (recommend centralize) — architecture.
- The helper's exact signature and how it reads index status + translation availability (per-page config, content-model presence check, route metadata).
- BCP-47 tag mapping per locale for `inLanguage` / hreflang (`en`, `ru`, `es`, `fr`, `ar`, `hi`, `zh` → e.g. `zh-Hans`).
- Dropdown component internals, cookie write mechanics, banner render location in `SiteChrome`.
- Sitemap alternates-cluster construction reusing the same helper.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 74: SEO — hreflang, Localized Metadata, Sitemap, Structured Data, Switcher" — summary line (getAlternates→6+x-default, locale-aware generateMetadata, sitemap all-locale + alternates, JSON-LD inLanguage, switcher + NEXT_LOCALE cookie, Accept-Language detection). ⚠ Only a summary line exists — no `### Phase 74:` detail section yet (see deferred note; `/gsd-plan-phase` needs it added first).
- `.planning/REQUIREMENTS.md` — SEO-01 (getAlternates all 6 + x-default), SEO-02 (localized title/description/OG), SEO-03 (sitemap every locale URL + alternates cluster), SEO-04 (JSON-LD inLanguage + localized text), UX-01 (switcher + NEXT_LOCALE cookie), UX-02 (Accept-Language first-visit detection, no cloaking).

### Established i18n patterns (dependencies — LOCKED)
- `.planning/phases/71-content-externalization-marketing-seo-pages/71-CONTEXT.md` — content model (`content/routes|pages|blog/<locale>/`), EN-fallback loaders, blog D-07 (untranslated → EN body + canonical→EN), D-08 (3 JSX_POSTS EN-only). Directly constrains D-07 hreflang content-awareness.
- `.planning/phases/72-ai-translation-pipeline-catalogs/72-CONTEXT.md` — RU/ES/FR catalogs+content + glossary/DNT; metadata title/description are content-sourced and translated.
- `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-CONTEXT.md` — AR/HI/ZH translations, RTL, per-locale Noto fonts; `<html lang/dir>` + `rtlLocales` wiring already exists.
- `.planning/phases/70-string-externalization-booking-account/70-PATTERNS.md` — next-intl Server/Client translation + `@/i18n/routing` navigation patterns (switcher MUST use these).

### Existing code to modify
- `middleware.ts` — next-intl composed middleware; `routing.localeDetection` stays false (D-05a). Matcher now excludes `.avif/.ico` (hotfix 25522d2).
- `i18n/routing.ts` / `i18n/locales.ts` — locale list (7), `localePrefix: 'as-needed'`, `rtlLocales`, locale-aware `Link`/navigation.
- `app/sitemap.ts` — single `entry()` helper currently emits `{ en, x-default }`; extend to full per-locale + alternates (SEO-03).
- `app/[locale]/**/page.tsx` + `*/layout.tsx` — ~56 inline `alternates.languages` blocks (all currently `{ en, x-default }`) to expand/centralize.
- `lib/jsonld.ts` — `buildRouteJsonLd` / `buildAirportTransferJsonLd` / `businessNode`; add `inLanguage` + localized fields; keep `priceValidUntil` (futureIsoDate(365)) drift-normalization contract for the byte-parity snapshot tests.
- `app/[locale]/page.tsx` (home) — reference `generateMetadata` + alternates shape.
- `components/` header/`SiteChrome` — host for the new language switcher + first-visit banner.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `entry()` helper in `app/sitemap.ts` — single choke point for sitemap alternates; change once, applies to all URLs.
- `@/i18n/routing` locale-aware `Link`/`usePathname`/navigation — the switcher and "same page in new locale" behavior build on this (no string concatenation).
- `lib/jsonld.ts` builders + `futureIsoDate()` — extend for `inLanguage`; preserve date-drift normalization.
- Content-model loaders (`getPageContent`, `getRouteContent`) already resolve by locale with EN-fallback — the natural place to detect "translation exists" for D-07.

### Established Patterns
- `localePrefix: 'as-needed'` — EN at root (no `/en`), others prefixed; `x-default` → EN root, canonical stays EN-root form.
- Content-sourced metadata (title/description/ogTitle already read from the content model on home) — localized metadata extends this pattern site-wide.
- noindex handled per-page via `robots:` in metadata (e.g. `app/[locale]/routes/page.tsx`) — the index-status signal D-06 needs.

### Integration Points
- Switcher/banner mount in shared header (`SiteChrome`) — must not break RTL (`/ar`) or the CSP nonce setup.
- `getAlternates()` output consumed by both page `generateMetadata` and `app/sitemap.ts` — keep one source of truth.

</code_context>

<specifics>
## Specific Ideas

- Header switcher visually replaces/becomes the existing `A ▾` control.
- Banner copy is a two-choice prompt ("Continue in English? / Продолжить на русском?"), dismissible, shown once.
- Endonym set (verbatim): `English · Русский · Español · Français · العربية · हिन्दी · 中文`.

</specifics>

<deferred>
## Deferred Ideas

- **Per-locale OG images with baked-in translated text** (incl. RTL/CJK rendering) — future content/design phase; this phase ships one shared neutral image.
- **Localize the `/fleet` page** — `/ru/fleet` currently renders the EN fleet page (hardcoded EN `vehicles[]` in `app/[locale]/fleet/page.tsx`, title "Our Fleet"). This is a Phase 71-style content-externalization gap, not Phase 74 (SEO) scope. Flag for a content follow-up.
- **Auto-redirect by locale/cookie** — explicitly rejected for SEO safety (D-05); noted in case a future business decision revisits it.

</deferred>

---

*Phase: 74-SEO — hreflang, Localized Metadata, Sitemap, Structured Data, Switcher*
*Context gathered: 2026-09-21*

## Post-UAT revision (2026-09-24)

- **UX-02 revised (owner decision during UAT):** the first-visit language suggestion no longer ships as a separate bottom banner. It lives inside the cookie consent modal header (`components/CookieBanner.tsx`, detection in `i18n/suggest-locale.ts`): one prompt instead of two, and the consent text can be read in the visitor's language after switching. D-04 (crawler-safe, client-only decision) and D-05 (no automatic redirect) are unchanged. Trade-off accepted: visitors who already gave consent get no suggestion (header LocaleSwitcher remains). Reason for revisiting: UAT found the standalone banner never rendered in production (next-intl sets NEXT_LOCALE on every response) and its full-width bar clashed with the /book mobile price bar.

