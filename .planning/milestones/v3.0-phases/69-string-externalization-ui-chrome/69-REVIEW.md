---
phase: 69-string-externalization-ui-chrome
reviewed: 2026-09-04T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - app/(internal)/layout.tsx
  - components/CookieBanner.tsx
  - components/FeatureStrip.tsx
  - components/Fleet.tsx
  - components/Footer.tsx
  - components/Hero.tsx
  - components/HeroBackground.tsx
  - components/HeroRating.tsx
  - components/HeroTypewriter.tsx
  - components/HeroWhatsApp.tsx
  - components/HowItWorks.tsx
  - components/Nav.tsx
  - components/Services.tsx
  - components/SiteChrome.tsx
  - components/Testimonials.tsx
  - components/TestimonialsCarousel.tsx
  - i18n/request.ts
  - i18n/routing.ts
  - messages/en.json
  - tests/TestimonialsCarousel.test.tsx
  - tests/helpers/renderWithIntl.tsx
  - tests/i18n-navigation.test.tsx
  - tests/nav-auth.test.tsx
  - vitest.config.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 69: Code Review Report

**Reviewed:** 2026-09-04
**Depth:** standard
**Files Reviewed:** 22 (+ vitest.config.ts, non-source)
**Status:** issues_found

## Summary

Phase 69 wires next-intl message catalogs into the UI-chrome components (Nav, Hero cluster, Footer, Services, Fleet, HowItWorks, FeatureStrip, Testimonials, CookieBanner) and turns `SiteChrome` into an async Server Component that provides `NextIntlClientProvider` to the whole tree, shared by both the localized (`app/[locale]/layout.tsx`) and internal (`app/(internal)/layout.tsx`) layouts.

I traced every `t()`/`t.raw()`/`t.rich()` call site against `messages/en.json` and confirmed key names, interpolation placeholders, and catalog-array ordering (`Nav.items`, `Footer.services/routes/blog`, `Services.cards`, `Fleet.vehicles`, `HowItWorks.steps`, `FeatureStrip.pillars`, `Hero.words`) all line up index-for-index with the corresponding structural-config arrays in code, and diffed every changed file against its pre-Phase-69 version to confirm the rendered EN text is byte-identical to before. `t.rich('priceAnchor', …)` and `t.rich('consentBody', …)` correctly supply both the interpolation values and every named rich-text tag used in the message string. Internal links across all reviewed files consistently go through `Link`/`usePathname` from `@/i18n/routing` (not `next/link`/`next/navigation`), while `tel:`/`mailto:`/`wa.me`/social/`#fragment` links correctly stay as raw `<a>`. I ran the full vitest suite (1184 passed / 0 failed) and `tsc --noEmit` (only pre-existing, phase-unrelated errors in `tests/account-trips.test.tsx` / `tests/passenger-actions.test.ts` / self-referential typing in unrelated `tests/nav-auth.test.tsx` lines) plus `eslint` against the file set — no new errors, one pre-existing warning, one newly-relevant warning (see WR-01).

No blockers were found: the async `SiteChrome` + `NextIntlClientProvider` composition is correctly threaded through both root layouts, `getLocale()`'s fallback-to-`defaultLocale` behavior for `/admin` and `/driver` (which next-intl's middleware never touches) is consistent with the hard-coded `lang="en"` in `app/(internal)/layout.tsx`, and no CSRF/CSP/auth logic was touched. The issues below are externalization-completeness gaps and one latent React-hooks correctness smell introduced by the refactor pattern.

## Warnings

### WR-01: `HeroTypewriter`'s rotation interval closure now has a real stale-array dependency gap

**File:** `components/HeroTypewriter.tsx:41-51`
**Issue:** Before this phase, `words` was a module-level `const` array, so omitting it from the `useEffect` dependency array (`[reducedMotion, interacted]`) was safe — the array could never change identity. Phase 69 changed `words` to `t.raw('words') as string[]`, a **render-scoped** value recomputed from `useTranslations` on every render. ESLint's `react-hooks/exhaustive-deps` now correctly flags this:
```
51:6  warning  React Hook useEffect has a missing dependency: 'words.length'
```
Today this is benign only because the message catalog can't change without a full remount (locale is tied to the route segment), so `words.length` is stable for the effect's lifetime in production. But it's a latent bug: the `setInterval` callback closes over whatever `words` reference existed when the effect last ran, so if `words` ever becomes non-static (e.g. a future edit hook, live-reload of messages, or messages resolved asynchronously per-render), the modulo index math will silently use a stale length. It's also the kind of regression that's easy to reintroduce elsewhere now that every "structural array zipped with an i18n catalog" component follows this same pattern.
**Fix:** Add `words.length` to the dependency array (harmless — it won't change under current constraints, but it makes the effect correct-by-construction and keeps CI lint clean):
```diff
-  }, [reducedMotion, interacted])
+  }, [reducedMotion, interacted, words.length])
```

### WR-02: "NEW" badge externalized in Nav but left hardcoded in Footer and Services

**File:** `components/Footer.tsx:75`, `components/Services.tsx:64`
**Issue:** `Nav.tsx` (same phase, same file set) converted its identical `isNew` badge from a hardcoded `<span>...NEW</span>` to `{t('new')}` (`Nav.new` key added to `messages/en.json`). `Footer.tsx` and `Services.tsx` have the exact same `isNew`-driven badge pattern (`Footer.serviceHrefs[2].isNew`, `Services` `Multi-day` card) but were **not** converted — they still render the literal string `NEW` directly. Since this phase's whole purpose is externalizing UI-chrome strings, and a `Nav.new` (or equivalent shared) key already exists in the catalog, this is an incomplete externalization: when locales 72/73 translate `Nav.new`, the "NEW" badges in the footer and services grid will silently stay in English forever, producing an inconsistent multi-language experience across otherwise-fully-translated chrome.
**Fix:** Add a shared `new` key (e.g. promote `Nav.new` to a `Common.new` namespace, or add `Footer.new`/`Services.new`) and use it in both spots:
```diff
-                    <span className="font-body font-light text-[10px] tracking-[0.14em] uppercase px-1.5 py-0.5 border border-copper/60 text-copper-light leading-none">NEW</span>
+                    <span className="font-body font-light text-[10px] tracking-[0.14em] uppercase px-1.5 py-0.5 border border-copper/60 text-copper-light leading-none">{t('new')}</span>
```

### WR-03: "Skip to content" skip-link left hardcoded in `SiteChrome`

**File:** `components/SiteChrome.tsx:127-129`
**Issue:** `SiteChrome` is explicitly called out as shared chrome that must be "provably byte-for-byte identical" across locales and is the primary target of "UI-chrome string externalization." It was upgraded this phase to wrap `children` in `NextIntlClientProvider`, yet the skip-link text it renders directly (`Skip to content`) was not converted to a translation key, even though every other piece of chrome in this component (Nav, Footer, CookieBanner, analytics wrappers) now flows through the message catalog. This is a scope gap in an in-scope, actively-touched file — for RTL locale `ar` and the other five locales, the accessibility skip-link (a WCAG-relevant control, not just decorative copy) will stay in English while the rest of the page is localized.
**Fix:** Add a key (e.g. `Common.skipToContent`) and use it:
```diff
+        <NextIntlClientProvider locale={locale} messages={messages}>
+          <a href="#main-content" className="skip-link btn-primary">
+            {t('skipToContent')}
+          </a>
```

## Info

### IN-01: Repeated `useTranslations('CookieBanner')` / `useTranslations('Testimonials')` calls in nested sub-components

**File:** `components/CookieBanner.tsx:370` (`Toggle`), `components/TestimonialsCarousel.tsx:13` (`StarBadge`)
**Issue:** `Toggle` and `StarBadge` are nested function components that re-invoke `useTranslations(<same namespace>)` that the parent component already called. Functionally harmless (next-intl's hook is cheap and reads from context), but it's duplicated wiring — every future edit to these namespaces has two call sites to keep in sync instead of one prop drill.
**Fix:** Thread the parent's `t` (or the specific translated strings) down as a prop instead of re-resolving the hook inside the child, e.g. `<Toggle checked={...} toggleLabel={checked ? t('toggleEnabled') : t('toggleDisabled')} ... />`.

### IN-02: `t.raw()` return values type-cast without runtime validation

**File:** `components/FeatureStrip.tsx:16`, `components/Fleet.tsx:18-23`, `components/Footer.tsx:28-30`, `components/HowItWorks.tsx:15`, `components/Nav.tsx:25`, `components/Services.tsx:33`, `components/HeroTypewriter.tsx:14`
**Issue:** Every catalog-array read uses `t.raw('key') as SomeType`. `next-intl`'s `.raw()` returns `any`, so the `as` assertion is a compile-time-only guarantee; nothing verifies at runtime that `messages/<locale>.json` actually has an array of the expected length/shape at that path (e.g. if a future locale-translation pass truncates an array or a key gets renamed). Because it's zipped by array index against the parallel structural-config array (`vehicles[i]`, `NAV_LINKS[i]`, `stepConfig[i]`, …), a mismatched-length catalog would silently render `undefined` for the tail items rather than throwing where the mistake was made.
**Fix:** Non-blocking for this phase (EN catalog is verified correct), but worth a lightweight runtime assertion (e.g. `if (catalog.length !== vehicles.length) throw ...` in dev) once the locale stub files in Phase 72/73 start diverging from `en.json`, to fail fast on catalog drift instead of silently under-rendering.

---

_Reviewed: 2026-09-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
