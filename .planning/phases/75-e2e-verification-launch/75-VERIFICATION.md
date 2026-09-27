---
phase: 75-e2e-verification-launch
verified: 2026-09-27T15:00:00Z
status: gaps_found
score: 8/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 6/10
  gaps_closed:
    - "GAP-2: Meta Pixel + CAPI carry custom_data.site_locale without breaking eventId dedup (ROADMAP SC #4) — env var re-entered without trailing newline + code-side normalizeMetaPixelId() hardening; production evidence 14/14 metaHits=true/metaSiteLocale=true across all 7 locales x 2 pages (evidence/75-30-analytics-locale-audit.json, independently spot-checked: consent-gated pixel design confirmed in components/MetaPixel.tsx, so curl-without-consent showing 0 fbq( is expected, not a regression)."
    - "GAP-3: overflow_audit.py reports 0 issues at 320/375/768/1024/1280px (ROADMAP SC #5) — [overflow-wrap:anywhere] hyphens-auto added to /fleet maintenance card; production evidence evidence/75-30-overflow-{320,375,768,1024,1280}.json all `{}` (independently re-fetched evidence/75-30-overflow-768.json = `{}`)."
  gaps_remaining:
    - "GAP-1: RU/AR sign-in + account ('My trips') booking path (ROADMAP SC #2, explicit clause) — plan 75-22 was SKIPPED by explicit user decision ('пропускаем') because no E2E test account/credentials file was ever supplied. Recorded as known debt, not closed. VER-01 cannot be marked complete while this ROADMAP-explicit clause is unproven."
    - "GAP-4 (partial): 'No English leaks onto localized pages' — the specifically-named ROADMAP SC #3 leaks remain fixed, and the tracked residual-leak ledger closed further (329->20 text leaks, 90->0 link leaks). But en_leak_rendered.py still exits 1 (20 meta findings: English og/twitter-adjacent description + title on /login and the localized 404, ru/ar/hi/zh; es/fr affected but unflagged by the scanner) — WINDOWS #24/#26 remain open. Independent re-verification (code review 75-REVIEW.md, corroborated live by this verifier via curl) also found the phase goal is not fully met beyond the tracked ledger: (a) WR-01 — /<locale>/blog/<unknown-slug> 404s (e.g. mistyped blog URLs) render an English, brand-doubled title with no lang attribute in the raw SSR HTML (independently reproduced: curl https://rideprestigo.com/ru/blog/totally-made-up-slug-zzz999 -> 404, <html id=\"__next_error__\">, <title>Page Not Found — PRESTIGO | PRESTIGO</title>) — this class of URL is not covered by notfound_audit.py at all; (b) WR-02 — twitter:title/twitter:description are the English site default on every non-EN page sitewide, including pages 75-28 just localized (independently reproduced on /ru/fleet and /ru/authors/roman-ustyugov: og:title is localized Russian but twitter:title stays 'PRESTIGO — Premium Chauffeur Service Prague'); the rendered scanner does not read twitter:* at all (WR-03); (c) WR-04 — the blog byline still visibly renders English 'By', 'Published' and an en-GB-formatted date on every localized post (independently reproduced on /ru/blog/beyond-transport-luxury-chauffeur-service-prague), invisible to the scanner because React splits the text into separate DOM nodes (WR-03)."
  regressions: []
gaps:
  - truth: "RU and AR sign-in + account ('My trips') booking path is verified (ROADMAP SC #2)"
    status: failed
    reason: "scripts/qa/.e2e-account.json was never provided. Plan 75-22 (Task 1, blocking-human checkpoint) required the user to create a production E2E test account and the credentials file; the user explicitly chose to skip this step on 2026-09-27 ('пропускаем'). 75-22-SUMMARY.md and deferred-items.md both record this as known debt, 'not closed'. This remains the only SC #2 clause never executed, successfully or otherwise."
    artifacts:
      - path: "scripts/qa/.e2e-account.json"
        issue: "File does not exist (gitignored; git check-ignore confirms; user decided not to create it)"
    missing:
      - "The E2E test account credentials file, then a re-run of `booking_e2e.py --locales \"\" --account ru,ar` with a recorded pass/fail per locale, OR an explicit accepted override for this ROADMAP-explicit clause"
  - truth: "No English leaks onto localized pages (phase goal, broader than the specific named leaks in ROADMAP SC #3; also GAP-4 in the ledger)"
    status: partial
    reason: "Substantially improved since the initial verification (text leaks 329->20, link leaks 90->0) but en_leak_rendered.py still exits 1 in production: 20 meta findings (English description/og-adjacent text on /login and the localized 404, ru/ar/hi/zh). Independent re-verification by this verifier (via curl, corroborating 75-REVIEW.md's code review) also surfaced three leak classes the tracked ledger/QA harness does not measure at all: (1) mistyped-blog-slug 404s render an English, brand-doubled, unlocalized title (no notfound_audit.py coverage of this URL class); (2) twitter:title/description are the English site default sitewide on every non-EN page, including pages this phase certifies as localized; (3) the blog byline's 'By'/'Published'/date text stays visible English on every localized post (scanner blind to split JSX text nodes). None of these are fabricated-work — they are honestly documented in 75-REVIEW.md and deferred-items.md — but the phase goal text 'no English leaks onto localized pages' is not literally true in production today."
    artifacts:
      - path: "app/[locale]/layout.tsx"
        issue: "components/SiteChrome.tsx English siteMetadata (og/twitter defaults) is only partially overridden by /login (title+description only) and the catch-all 404 (title+robots only); twitter block is never overridden anywhere in app/[locale]"
      - path: "app/[locale]/blog/[slug]/page.tsx"
        issue: "generateMetadata's not-found branch returns a hardcoded, non-absolute English title instead of the localized NotFound.metaTitle used by the catch-all route"
      - path: "components/ArticleByline.tsx, components/BlogCard.tsx"
        issue: "'By', 'Published', 'Updated' words and formatBylineDate() (hardcoded en-GB) are still English literals, unlocalized"
      - path: "scripts/qa/en_leak_rendered.py"
        issue: "metaTexts() never reads twitter:title/twitter:description; visibleTextNodes() checks one DOM text node at a time and misses JSX-interpolation-split English (e.g. 'Published' + '{date}')"
    missing:
      - "Localized description/openGraph/twitter overrides for /login and the catch-all 404 (WINDOWS #24/#26)"
      - "Localized 404 title for the app/[locale]/blog/[slug] dynamic-segment not-found branch (new finding, WR-01, not yet a WINDOWS row)"
      - "Sitewide locale-aware twitter:* metadata (new finding, WR-02, broader than WINDOWS #26 — not yet a WINDOWS row)"
      - "Localized By/Published/Updated labels + locale-aware date formatting on ArticleByline/BlogCard (WR-04, tracked in deferred-items.md but with no WINDOWS row)"
      - "en_leak_rendered.py: read twitter:* meta, and check per-element joined text to catch split JSX nodes (WR-03)"
deferred:
  - truth: "Metricool announcement drafts created (ROADMAP SC #7 clause)"
    addressed_in: "User decision, 2026-09-27 (75-LAUNCH.md Task 2 result)"
    evidence: "User explicitly answered 'Без анонса' (no announcement) — a deliberate decision, not an omission. Unchanged since initial verification."
human_verification: []
---

# Phase 75: E2E Verification & Launch Verification Report (Re-verification)

**Phase Goal:** Prove the multilingual site works end-to-end on production for all 7 locales and close milestone v3.0. Every locale renders, the switcher works, the guest booking flow reaches a localized Stripe payment form in every locale (incl. RTL /ar), no English leaks onto localized pages (systematic static + rendered audit, fixes translated in-session), GA4 and Meta events carry a site_locale dimension (client and server-side via the booking), hreflang clusters validate, Rich Results pass, CSP has no regression, and the vitest red baseline in v3.0-touched files is cleared. Launch = GSC sitemap resubmit + indexing baseline, milestone close, and Metricool announcement drafts.

**Verified:** 2026-09-27
**Status:** gaps_found
**Re-verification:** Yes — after gap-closure plans 75-22..75-30 (PR #38, merge `65a1eb4d`, Vercel Production `success`)

## What changed since the initial verification

Gap-closure plans 75-22 through 75-30 ran. Per 75-22-SUMMARY.md, 75-30-SUMMARY.md and this verifier's independent production checks:

- **GAP-1 (RU/AR account path):** plan 75-22's Task 1 (blocking-human checkpoint requiring the user to create an E2E test account) was **skipped by explicit user decision**. GAP-1 stays open.
- **GAP-2 (Meta Pixel site_locale):** **closed.** Env var re-entered + `normalizeMetaPixelId()` hardening shipped. Production evidence: 14/14 pass.
- **GAP-3 (overflow at 768px):** **closed.** CSS fix on `/fleet` maintenance cards shipped. Production evidence: 0 issues at all 5 widths.
- **GAP-4 (residual EN leaks):** **partially closed.** Link leaks fully closed (90->0). Text leaks reduced (329->20) but not zero — 20 meta findings remain, and this verifier's independent re-check (informed by 75-REVIEW.md's code review of the gap-closure diff) found further leak classes the QA harness itself cannot detect.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every locale renders correctly | ✓ VERIFIED (regression-checked) | Unchanged from initial verification (147/147 URLs). Re-confirmed live: `curl https://rideprestigo.com/ar` -> `lang="ar" dir="rtl"`; hreflang cluster on `/` still complete (8 `<link rel="alternate">` incl. `zh-Hans` + `x-default`); CSP header unchanged shape. |
| 2 | The switcher works for all 42 ordered pairs + 21 rotating cases | ✓ VERIFIED (regression-checked) | Unchanged (63/63 prior). Re-confirmed live: `locale-switcher-trigger-` id present in homepage HTML. |
| 3a | Guest booking reaches a rendered Stripe form in all 7 locales incl. /ar RTL | ✓ VERIFIED | Unchanged from initial verification; not re-run in this pass (guest path was not touched by gap-closure code; no plan in 75-22..75-30 modified the booking wizard). |
| 3b | RU and AR **sign-in + account path** verified (ROADMAP SC #2, explicit clause) | ✗ FAILED | GAP-1 not closed. Plan 75-22 Task 1 skipped by user decision ("пропускаем"). `scripts/qa/.e2e-account.json` still does not exist. See gap #1. |
| 4 | No English leakage: named leaks in SC #3 fixed; systematic two-layer audit run | ⚠️ PARTIAL | Static layer unchanged (0 actionable customer-facing findings). Rendered layer improved (329->20 text, 90->0 link) but not zero. `en_leak_rendered.py` exits 1 in production. Independently reproduced additional untracked leak classes (WR-01/02/04 from 75-REVIEW.md) via curl — see gap #2. |
| 5a | GA4 carries a `site_locale` param on captured hits, all 7 locales | ✓ VERIFIED | Unchanged from initial verification. |
| 5b | Meta Pixel + CAPI carry `custom_data.site_locale`, no dedup break | ✓ VERIFIED | **Flipped from FAILED.** `evidence/75-30-analytics-locale-audit.json`: 14/14 `metaHits=1`/`metaSiteLocale=true` across all 7 locales x 2 pages, `all_pass: true`. Root cause (trailing-newline env var, WINDOWS #15) fixed by the user re-entering the Vercel env vars; code hardened with `normalizeMetaPixelId()` (`lib/meta-pixel-id.ts`, unit-tested 19/19). This verifier independently confirmed `components/MetaPixel.tsx` is consent-gated by design (loads only after marketing consent) — a bare `curl` showing 0 `fbq(` calls is therefore expected behavior, not a regression; the production evidence (Playwright with consent state) is the correct verification method here. |
| 6a | hreflang clusters reciprocal, JSON-LD passes, no CSP drift | ✓ VERIFIED (regression-checked) | Unchanged (3 pre-existing D-09 EN-only allowlist errors; 0 JSON-LD/CSP findings). Re-confirmed live. |
| 6b | Rich Results Test passes on sampled locale URLs | ✓ VERIFIED (human-reported) | Unchanged; user reported "все ок" for all 5 sampled URLs prior to gap closure, and gap-closure did not touch JSON-LD. |
| 6c | Overflow audit stays at 0 issues (all widths) | ✓ VERIFIED | **Flipped from FAILED.** `evidence/75-30-overflow-{320,375,768,1024,1280}.json` are all `{}` (0 issues). `[overflow-wrap:anywhere] hyphens-auto` added to the `/fleet` maintenance card (`app/[locale]/fleet/page.tsx`). Independently re-fetched `evidence/75-30-overflow-768.json` — confirmed `{}`. |
| 7 | vitest green for all v3.0-touched files; pre-existing unrelated failures listed | ✓ VERIFIED | 75-30's pre-deploy gate reports 2796 tests green (build on top of the 2692 confirmed at initial verification, plus gap-closure test additions). The 5 known worktree-only next-intl import failures remain documented and unrelated to any touched file. Not independently re-run in full in this pass (no code changes since 75-30's own full run; re-running the entire suite again would not produce new evidence per verifier guidance on full-suite reruns). |
| 8 | Launch: sitemap resubmitted, indexing baseline, Metricool drafts, milestone audited/closed | ⚠️ PARTIAL (deferred item, unchanged) | Unchanged from initial verification. Metricool announcement explicitly declined by user (not a gap). Milestone close correctly still pending, contingent on this verification. |

**Score:** 8/10 truths verified (up from 6/10). 1 explicit FAILED remains against literal ROADMAP wording (RU/AR account path, GAP-1); 1 PARTIAL remains (residual EN leaks, GAP-4, improved but not closed). 2 human-reported/deferred items (6b, 8) not counted against the denominator twice, consistent with the initial verification's convention.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/phases/75-e2e-verification-launch/75-QA-RESULTS.md` | Gap-closure re-verification sections | ✓ VERIFIED | "Gap closure re-verification (plan 75-30)" section present with per-gap tables and 8 evidence JSON references |
| `.planning/phases/75-e2e-verification-launch/evidence/75-30-*.json` | Raw production audit output, committed | ✓ VERIFIED | 8 files present and tracked (`git ls-files evidence` = 9 incl. 75-23's file). Independently spot-checked `75-30-analytics-locale-audit.json` and `75-30-overflow-768.json` — contents match the narrative. |
| `.planning/phases/75-e2e-verification-launch/75-EN-LEAK-RESIDUAL.md` | Every remaining production finding dispositioned | ✓ VERIFIED | 261 rows, final-status column added by 75-30; 20 meta rows correctly left un-dispositioned as "remaining" (not silently classified) |
| `.planning/WINDOWS.md` | Ledger entries #15/#22/#23 closed on production PASS; #24/#25 stay open; new #26 added | ✓ VERIFIED | Independently confirmed via `grep`: #15/#22/#23 `status: fixed` with `resolved_at` timestamps; #24/#25 `status: open`; #26 present, `status: open` |
| `.planning/phases/75-e2e-verification-launch/75-REVIEW.md` | Code review of the gap-closure diff | ✓ VERIFIED | 0 critical, 6 warning, 5 info findings; this verifier independently reproduced WR-01, WR-02 and WR-04 live in production via curl (see gap #2) |
| `scripts/qa/.e2e-account.json` | E2E test account credentials (git-ignored) | ✗ MISSING | Still does not exist; `git check-ignore` confirms path is ignored but file was never created (user decision to skip) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `lib/meta-pixel-id.ts` normalizeMetaPixelId | `components/MetaPixel.tsx` fbq('init', ...) | Env var trim+digits-only before script injection | ✓ WIRED | Production evidence confirms Meta hits fire with `site_locale`; code review confirms the digits-only regex also closes an inline-script-injection path |
| `app/[locale]/[...rest]/page.tsx` catch-all | `app/[locale]/not-found.tsx` localized boundary | `notFound()` synchronous throw | ✓ WIRED | Independently confirmed via curl: `/zh/this-page-does-not-exist` returns 404, and after hydration (per notfound_audit.py evidence) renders the localized heading/title |
| `app/[locale]/blog/[slug]/page.tsx` not-found branch | Localized `NotFound.metaTitle` | **NOT connected** — hardcoded English title instead | ✗ NOT WIRED | New finding (WR-01), independently reproduced: `curl https://rideprestigo.com/ru/blog/totally-made-up-slug-zzz999` -> `x-matched-path: /[locale]/blog/[slug]`, 404, `<title>Page Not Found — PRESTIGO \| PRESTIGO</title>`, no `lang` attribute on `<html>` |
| `app/[locale]/layout.tsx` default `siteMetadata` | `twitter:*` meta tags on every localized page | **NOT connected** — no page overrides `twitter` | ✗ NOT WIRED | New finding (WR-02), independently reproduced on `/ru/fleet` and `/ru/authors/roman-ustyugov`: `og:title` is localized Russian, `twitter:title` stays the English site default |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|--------------|--------|----------|
| VER-01 | All 30 phase-75 plans (`requirements: [VER-01]` in every PLAN frontmatter) | Cross-locale E2E green: render, switcher, booking, analytics locale, no EN leakage, CSP, hreflang, Rich Results, vitest baseline, launch | ⚠️ PARTIALLY SATISFIED | 8 of 10 underlying facets now pass (up from 6/10): render, switcher, guest booking, GA4, **Meta site_locale (newly closed)**, hreflang/JSON-LD/CSP, **overflow (newly closed)**, vitest. 2 facets remain unmet: RU/AR account path (GAP-1, skipped by user decision) and full EN-leak closure (GAP-4, partial). REQUIREMENTS.md still correctly shows VER-01 as "Pending" — this verification confirms that status is still accurate. |

No orphaned requirements: REQUIREMENTS.md maps only VER-01 to Phase 75, and every plan declares it.

### Anti-Patterns Found

No new TBD/FIXME/XXX/HACK/PLACEHOLDER debt markers were introduced by the gap-closure plans' application-code changes (30 files reviewed in 75-REVIEW.md, 0 critical findings). The 6 WARNING findings (WR-01..WR-06) are real functional gaps in the "no English leaks" and "no silent tracking outage" goals, not stubs or fabricated work — they are honestly documented with production evidence in 75-REVIEW.md, and this verifier independently reproduced three of them (WR-01, WR-02, WR-04) live. They are folded into gap #2 above rather than listed as separate gaps, since they are all facets of the same unmet truth ("no English leaks onto localized pages").

### Behavioral Spot-Checks / Live Production Checks (this verifier, 2026-09-27, second pass)

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| `/ar` still renders RTL (regression) | `curl https://rideprestigo.com/ar` | `lang="ar" dir="rtl"` | ✓ PASS |
| Switcher trigger id still present (regression) | `curl https://rideprestigo.com/` | `id="locale-switcher-trigger-..."` found | ✓ PASS |
| hreflang cluster still complete (regression) | `curl https://rideprestigo.com/` | 8 `<link rel="alternate">` incl. `zh-Hans`, `x-default` | ✓ PASS |
| CSP header still matches static policy (regression) | `curl -D-` | unchanged shape | ✓ PASS |
| Catch-all 404 localized post-hydration boundary reached | `curl https://rideprestigo.com/zh/this-page-does-not-exist` | 404, body contains `页面` (zh text) | ✓ PASS (matches GAP-4a evidence; title/lang only correct after hydration — see IN-05, informational) |
| Meta Pixel init script not in raw HTML (expected — consent-gated) | `curl https://rideprestigo.com/ \| grep -c "fbq("` | 0 | ✓ EXPECTED (design is consent-gated; not evidence of a regression — see evidence/75-30-analytics-locale-audit.json for the correct consent-simulated check) |
| GAP-4 meta remainder reproduces live | `curl https://rideprestigo.com/ru/login \| grep twitter:title` | `PRESTIGO — Premium Chauffeur Service Prague` (English) | ✓ CONFIRMS documented gap (WINDOWS #26) |
| WR-01 reproduces live | `curl https://rideprestigo.com/ru/blog/totally-made-up-slug-zzz999` | 404, English doubled-brand title, no `lang` attr | ✓ CONFIRMS new finding, not yet a WINDOWS row |
| WR-02 reproduces live | `curl https://rideprestigo.com/ru/fleet \| grep twitter:title` vs `og:title` | `twitter:title` English, `og:title` localized Russian | ✓ CONFIRMS new finding, not yet a WINDOWS row |
| WR-04 reproduces live | `curl https://rideprestigo.com/ru/blog/beyond-transport-...` | `>By<`, `Published ` visible in raw HTML | ✓ CONFIRMS new finding, tracked in deferred-items.md with no WINDOWS row |
| Overflow evidence file content | `cat evidence/75-30-overflow-768.json` | `{}` | ✓ PASS |
| Analytics evidence file content | `cat evidence/75-30-analytics-locale-audit.json` | 14/14 `pass: true` | ✓ PASS |
| Notfound evidence file content | `cat evidence/75-30-notfound-audit.json` | 14/14 `pass: true` | ✓ PASS |
| Merge commit present on `main` | `git log --oneline \| grep 65a1eb4d` | `Merge pull request #38 from RomanUst/release/phase-75-gaps` | ✓ PASS |

### Human Verification Required

None. The two items that previously required human action (Meta Pixel Vercel env-var fix; GA4 custom-dimension registration) were both completed and confirmed by the user prior to this re-verification pass. The RU/AR account-path item is no longer a "needs human action to proceed" item — it is a **known, explicitly-declined gap** (the user chose not to supply credentials), which belongs in the gaps list, not human verification.

### Gaps Summary

Two of the four gaps from the initial verification are now closed with independently-verified production evidence: **Meta Pixel + CAPI `site_locale`** (GAP-2, 14/14 pass, root cause fixed by env-var re-entry + code hardening) and the **`/ru/fleet` 768px overflow regression** (GAP-3, 0 issues at all 5 widths, CSS fix confirmed).

Two gaps remain open:

1. **GAP-1 — RU/AR signed-in account booking path (ROADMAP SC #2, explicit clause).** The user explicitly chose to skip the credential-creation checkpoint ("пропускаем"). This is a deliberate decision, not an omission, but the SC clause itself is still unmet — the signed-in path has never been executed, successfully or otherwise, on production.

2. **GAP-4 — residual English leaks (partial).** The tracked ledger closed further (link leaks 90->0, text leaks 329->20), but 20 meta findings remain in production (`en_leak_rendered.py` exits 1), and this verifier's independent re-check — informed by the gap-closure code review (75-REVIEW.md) — found and live-reproduced three additional leak classes the QA harness cannot currently detect: an English, unlocalized title on mistyped-blog-slug 404s; site-wide English `twitter:*` metadata even on pages whose `og:*` metadata is correctly localized; and persistently-English "By"/"Published"/date text in the blog byline (invisible to the scanner because of split JSX text nodes). None of this is fabricated or stubbed work — it is honestly self-documented by the executor and the code reviewer — but the phase goal text "no English leaks onto localized pages" is not literally true in production today.

Both remaining gaps require either further app-code fix plans or an explicit accepted override before VER-01 can be marked complete and milestone v3.0 closed.

**This looks like it could be accepted as a deliberate scope reduction for GAP-1.** If the user wants to proceed without ever proving the RU/AR signed-in path, an override can be recorded:

```yaml
overrides:
  - must_have: "RU and AR sign-in + account ('My trips') booking path is verified (ROADMAP SC #2)"
    reason: "No E2E test account was created; user explicitly decided to skip this verification step and accept the guest-path proof as sufficient for launch."
    accepted_by: "<name>"
    accepted_at: "<ISO timestamp>"
```

GAP-4 is not a good override candidate — it is not a deliberate alternative implementation, it is unfinished localization work with concrete, reproducible English text visible to end users (byline dates, share-card previews, 404 titles on the site's most common broken-link class). Recommended path: a small follow-up plan covering WR-01 (localize the blog `[slug]` 404 title), WR-02 (sitewide locale-aware `twitter:*`), and WR-04 (localize By/Published/Updated + date formatting), then re-run `en_leak_rendered.py` and this verification.

---

*Verified: 2026-09-27T15:00:00Z*
*Verifier: Claude (gsd-verifier)*
