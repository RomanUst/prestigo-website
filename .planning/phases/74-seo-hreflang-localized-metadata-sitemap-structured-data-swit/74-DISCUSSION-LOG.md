# Phase 74: SEO — hreflang, Localized Metadata, Sitemap, Structured Data, Switcher - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-21
**Phase:** 74-SEO — hreflang, Localized Metadata, Sitemap, Structured Data, Switcher
**Areas discussed:** Language switcher (UI), First-visit auto-detection, hreflang coverage, Localized OG/metadata

---

## Language switcher — Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Header, near Book button | Where the `A ▾` icon already sits | ✓ |
| Footer | SEO-classic, less visible | |
| Both header + footer | Max visibility + footer SEO links | |

**User's choice:** Header, near "Забронировать".
**Notes:** The `A ▾` control on the live site already reserves this slot.

## Language switcher — Labels

| Option | Description | Selected |
|--------|-------------|----------|
| Endonyms (English, Русский, Español…) | Each language named in itself | ✓ |
| Endonym + code/flag | e.g. "RU · Русский" or flag | |
| Codes only (EN, RU, ES…) | Compact, less clear for hi/zh | |

**User's choice:** Endonyms.

## Language switcher — Switch behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Same page in new locale | `/ru/x` → `/es/x`; EN-fallback if untranslated | ✓ |
| Always home of new locale | Simpler, loses context | |

**User's choice:** Same page in the target locale (matches hreflang cluster).

---

## First-visit auto-detection — Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Soft banner suggestion | Dismissible prompt, URL unchanged, choice → cookie | ✓ |
| Auto-redirect to locale | Aggressive, SEO/UX risk | |
| Nothing automatic | Manual switcher + cookie only | |

**User's choice:** Soft banner suggestion.

## First-visit auto-detection — Returning visitor (cookie)

| Option | Description | Selected |
|--------|-------------|----------|
| No redirect; banner/UI memory | URL never auto-changes — max SEO safety | ✓ |
| Auto-redirect to /ru by cookie | Convenient, higher signal-mismatch risk | |

**User's choice:** No redirect ever. Implies `localeDetection` stays `false`.

---

## hreflang coverage — noindex routes

| Option | Description | Selected |
|--------|-------------|----------|
| No hreflang on noindex | Clusters need indexable + self-canonical URLs | ✓ |
| Full cluster everywhere | Uniform but contradicts noindex | |

**User's choice:** No hreflang on the 20 noindex `prague-to-{city}` routes.

## hreflang coverage — EN-fallback pages

| Option | Description | Selected |
|--------|-------------|----------|
| hreflang by translation availability | Only real translations enter cluster; fallback self-canonical→EN | ✓ |
| Always all 6 locales | Simpler, contradicts canonical→EN | |
| Claude's discretion | Defer to best practice | |

**User's choice:** Content-aware hreflang (aligns with Phase 71 D-07).

---

## Localized OG/metadata — OG image

| Option | Description | Selected |
|--------|-------------|----------|
| One shared neutral og-image.jpg | Localize only og:title/description/alt | ✓ |
| Per-locale images with text | Prettier, large gen effort (RTL/CJK) | |
| Dynamic OG (next/og) | Flexible, new infra + fonts | |

**User's choice:** One shared neutral image; localize text fields only.

---

## Claude's Discretion

- Centralization of the ~56 inline `alternates` blocks into a shared `getAlternates()` helper (recommend centralize).
- Helper signature + how it reads index-status and translation-availability.
- BCP-47 tag mapping per locale (e.g. `zh-Hans`) for `inLanguage`/hreflang.
- Switcher dropdown internals, cookie write mechanics, banner render location.
- Sitemap alternates-cluster construction reusing the helper.

## Deferred Ideas

- Per-locale OG images with baked-in translated text (RTL/CJK) — future content/design phase.
- Localize the `/fleet` page (`/ru/fleet` currently renders EN, hardcoded `vehicles[]`) — Phase 71-style content gap, not Phase 74.
- Auto-redirect by locale/cookie — explicitly rejected for SEO safety.

## Out-of-band (this session)

- Diagnosed + fixed a production bug surfaced during discussion: all `/public/**/*.avif` returned 404 because the next-intl middleware matcher excluded `svg|png|jpg|jpeg|gif|webp` but not `avif` (broke every `/vehicles/*.avif` fleet photo, EN + all locales). One-line matcher fix (`avif|ico` added), 56 middleware/i18n tests green, committed to `main` (`25522d2`) → auto-deployed to prod; verified origin/optimizer serve 200. Separate from Phase 74 scope.
