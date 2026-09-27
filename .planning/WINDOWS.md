---
schema_version: 1
open_count: 11
waived_count: 0
fixed_count: 14
total_count: 25
last_updated: 2026-09-26T22:18:26.809Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 68 | deviation | middleware.ts |  | Rule 1 fix: useNonceCsp was decided from locale-stripped pathname, letting /ru/admin acquire a nonce CSP (T-68-04); fixed to use raw pathname | fixed |  | 2026-09-03T19:22:48.763Z | 2026-09-03T19:23:16.955Z |
| 2 | 68 | deviation | app/sitemap.ts |  | Rule 1 fix: lastModFor() sourceFile paths pointed at pre-move app/ locations, silently degrading every sitemap lastModified to build-time fallback | fixed |  | 2026-09-03T19:22:49.040Z | 2026-09-03T19:23:17.234Z |
| 3 | 68 | deviation | app/[locale]/blog/[slug]/page.tsx |  | Rule 1 fix: dynamic MDX import relative path depth broken by the route move (3 levels -> 4 levels) | fixed |  | 2026-09-03T19:22:49.320Z | 2026-09-03T19:23:17.518Z |
| 4 | 68 | deviation | .husky/pre-commit |  | Rule 1 fix: stale app/blog/ exclusion in EUR-price-check hook broken by the move to app/[locale]/blog/, would have false-positive-blocked future blog commits | fixed |  | 2026-09-03T19:22:49.602Z | 2026-09-03T19:23:17.796Z |
| 5 | 68 | deviation | tests/confirmation-page.test.tsx |  | Rule 1 fix: stale @/app/book/confirmation/page import missed by the plan's declared stale-prefix sweep (book was omitted) | fixed |  | 2026-09-03T19:22:49.877Z | 2026-09-03T19:23:18.078Z |
| 6 | 73 | stub | messages/hi.json |  | ~10 hi heading units (whyBook.headingLine1 across ~9 route files; corporate.json usagePatterns.headingItalic) drop the 'Prestigo'/'PRESTIGO' DNT token in translation -> verifier EN-fallback by design (T-73-04). --check passes (keys present). Deferred: revisit glossary/verifier so these headings translate around the DNT token instead of falling back. | fixed |  | 2026-09-19T08:28:32.086Z | 2026-09-25T15:04:14.311Z |
| 7 | 73 | deviation | app/[locale]/about/page.tsx |  | 7 static pages (about/terms/corporate/privacy/faq/blog-index/contact) render EN content on every locale (en/ru/es/fr/ar/hi/zh) due to unforwarded getLocale() in force-static pages — pre-existing, not fixed in 73-06, see deferred-items.md | fixed |  | 2026-09-19T12:22:00.327Z | 2026-09-23T21:33:05.201Z |
| 8 | 73 | deviation | content/routes/en/prague-marianske-lazne.json |  | i18n-translate pipeline run (73-11 Task 2) hit 'credit balance too low' Anthropic API errors for 6 route files (prague-marianske-lazne, prague-olomouc, prague-pardubice, prague-plzen, prague-wroclaw, prague-zlin) and content/pages/en/corporate.json across all 6 target locales (ar/hi/zh/ru/es/fr). Manifest correctly not advanced (no partial writes); EN sources unchanged. Needs Anthropic billing top-up then a full re-run of node scripts/i18n-translate.mjs (no --locales filter) to pick these up. | open |  | 2026-09-19T20:18:02.957Z |  |
| 9 | 74 | stub | messages/ru.json | 790 | Common.firstVisitBanner keys shipped as EN-fallback text (Anthropic API billing gate blocked AI translation); manifest untouched so next real pipeline run retranslates automatically | fixed |  | 2026-09-23T21:28:41.975Z | 2026-09-23T21:31:45.030Z |
| 10 | 74 | stub | messages/es.json | 790 | Common.firstVisitBanner keys shipped as EN-fallback text (Anthropic API billing gate blocked AI translation); manifest untouched so next real pipeline run retranslates automatically | fixed |  | 2026-09-23T21:28:46.369Z | 2026-09-23T21:31:45.207Z |
| 11 | 74 | stub | messages/fr.json | 790 | Common.firstVisitBanner keys shipped as EN-fallback text (Anthropic API billing gate blocked AI translation); manifest untouched so next real pipeline run retranslates automatically | fixed |  | 2026-09-23T21:28:48.035Z | 2026-09-23T21:31:45.380Z |
| 12 | 74 | stub | messages/ar.json | 790 | Common.firstVisitBanner keys shipped as EN-fallback text (Anthropic API billing gate blocked AI translation); manifest untouched so next real pipeline run retranslates automatically | fixed |  | 2026-09-23T21:28:49.933Z | 2026-09-23T21:31:45.552Z |
| 13 | 74 | stub | messages/hi.json | 790 | Common.firstVisitBanner keys shipped as EN-fallback text (Anthropic API billing gate blocked AI translation); manifest untouched so next real pipeline run retranslates automatically | fixed |  | 2026-09-23T21:28:51.597Z | 2026-09-23T21:31:45.733Z |
| 14 | 74 | stub | messages/zh.json | 790 | Common.firstVisitBanner keys shipped as EN-fallback text (Anthropic API billing gate blocked AI translation); manifest untouched so next real pipeline run retranslates automatically | fixed |  | 2026-09-23T21:28:53.493Z | 2026-09-23T21:31:45.904Z |
| 15 | 75 | deviation | components/MetaPixel.tsx |  | Production Meta Pixel never fires: NEXT_PUBLIC_META_PIXEL_ID/META_PIXEL_ID env var has a trailing newline, so fbq('init','<id>\\n') throws a SyntaxError on script insertion (appendChild); fbq stays undefined on every real page load. Env var needs re-entry in Vercel without trailing newline (human action). | open |  | 2026-09-25T12:39:18.185Z |  |
| 16 | 75 | deviation | lib/routes.ts |  | 75-09: per-route h2/description/notes (30 unique route blurbs) intentionally stay English on the /routes hub across all locales -- out of this plan's scope per files_modified/must_haves (chrome/labels only); separate from the already-translated dedicated /routes/<slug> pages | open |  | 2026-09-25T14:43:54.229Z |  |
| 17 | 75 | deviation | tests/account-trips.test.tsx |  | Pre-existing ERR_MODULE_NOT_FOUND at import (next-intl/server.react-server.js hardcoded relative path) on 5 test files unrelated to plan 75-12's scope; not fixed per scope boundary | open |  | 2026-09-25T19:30:56.319Z |  |
| 18 | 75 | unrun-verify | tests/login-actions.test.ts |  | Known worktree-only next-intl/server import failure (relative vi.importActual path resolves outside the worktree's next/headers export map) prevents running this suite in-worktree; logic independently verified via a scratch composition check and will run/pass on main (matches 75-11-SUMMARY.md precedent). | open |  | 2026-09-25T21:05:40.466Z |  |
| 19 | 75 | unrun-verify | tests/account-trips.test.tsx |  | Same known worktree-only next-intl/server import failure (see entry #18) — this file IS in plan 75-15's own scope (extended with new D-04 locale-redirect test cases), so the new assertions could not be executed in-worktree either; logic independently verified via a scratch mock-composition check and will run/pass on main. | open |  | 2026-09-25T21:08:17.526Z |  |
| 20 | 75 | deviation | components/ArticleByline.tsx |  | next/link default import drops locale prefix on the byline link (75-EN-LEAK-AUDIT.md R3, attributed to 75-13 but out of files_modified scope) - deferred, see deferred-items.md | fixed |  | 2026-09-26T16:26:15.319Z | 2026-09-26T19:44:16.722Z |
| 21 | 75 | deviation | lib/email.ts |  | D-05 recorded: client emails (email.ts/email-corporate.ts/email-bespoke.ts) are 100% English-only, locale never threaded through -- new capability, not fixed in 75-20 | open |  | 2026-09-26T22:18:07.075Z |  |
| 22 | 75 | deviation | app/[locale]/not-found.tsx |  | Systemic gap: every locale's unmatched-path 404 renders un-localized root app/not-found.tsx (English) because no catch-all route exists under app/[locale]/ to reach the already-localized boundary -- root-caused in 75-20, explains 75-19-SUMMARY.md's zh/<unknown> observation (universal, not zh-specific) | open |  | 2026-09-26T22:18:13.476Z |  |
| 23 | 75 | deviation | app/[locale]/fleet/page.tsx |  | overflow_audit 768px: new regression on /ru/fleet -- 2 maintenance-copy paragraphs overflow their container with translated (longer) Russian text; 320/375/1024/1280px clean -- 75-20 recorded not fixed, candidate follow-up for 75-08 | open |  | 2026-09-26T22:18:25.711Z |  |
| 24 | 75 | deviation | scripts/qa/en_leak_allowlist.json |  | en_leak_rendered residual gaps (75-20): person names (Roman Ustyugov) flagged as leaks on ar/ru/hi/zh, and mid-sentence brand/tech-term Latin runs (Mercedes E-Class, USB-A/USB-C, Wi-Fi, Visa) still trip the 2+/3+-word heuristic when embedded inline -- allowlist needs a proper-noun category and inline-DNT handling; not fixed in 75-20 (scanner/allowlist change out of scope) | open |  | 2026-09-26T22:18:26.259Z |  |
| 25 | 75 | unrun-verify | scripts/qa/booking_e2e.py |  | D-04 RU/AR signed-in account booking path unverified in 75-20: scripts/qa/.e2e-account.json never provided (75-19-SUMMARY.md), both locales auto-skipped. Guest-path locale-following is proven for both ru/ar; only the signed-in variant is unverified. Re-run booking_e2e.py --locales "" --account ru,ar once credentials file exists. | open |  | 2026-09-26T22:18:26.809Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "68",
    "file": "middleware.ts",
    "line": null,
    "description": "Rule 1 fix: useNonceCsp was decided from locale-stripped pathname, letting /ru/admin acquire a nonce CSP (T-68-04); fixed to use raw pathname",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-03T19:22:48.763Z",
    "resolved_at": "2026-09-03T19:23:16.955Z"
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "68",
    "file": "app/sitemap.ts",
    "line": null,
    "description": "Rule 1 fix: lastModFor() sourceFile paths pointed at pre-move app/ locations, silently degrading every sitemap lastModified to build-time fallback",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-03T19:22:49.040Z",
    "resolved_at": "2026-09-03T19:23:17.234Z"
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "68",
    "file": "app/[locale]/blog/[slug]/page.tsx",
    "line": null,
    "description": "Rule 1 fix: dynamic MDX import relative path depth broken by the route move (3 levels -> 4 levels)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-03T19:22:49.320Z",
    "resolved_at": "2026-09-03T19:23:17.518Z"
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "68",
    "file": ".husky/pre-commit",
    "line": null,
    "description": "Rule 1 fix: stale app/blog/ exclusion in EUR-price-check hook broken by the move to app/[locale]/blog/, would have false-positive-blocked future blog commits",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-03T19:22:49.602Z",
    "resolved_at": "2026-09-03T19:23:17.796Z"
  },
  {
    "id": 5,
    "kind": "deviation",
    "phase": "68",
    "file": "tests/confirmation-page.test.tsx",
    "line": null,
    "description": "Rule 1 fix: stale @/app/book/confirmation/page import missed by the plan's declared stale-prefix sweep (book was omitted)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-03T19:22:49.877Z",
    "resolved_at": "2026-09-03T19:23:18.078Z"
  },
  {
    "id": 6,
    "kind": "stub",
    "phase": "73",
    "file": "messages/hi.json",
    "line": null,
    "description": "~10 hi heading units (whyBook.headingLine1 across ~9 route files; corporate.json usagePatterns.headingItalic) drop the 'Prestigo'/'PRESTIGO' DNT token in translation -> verifier EN-fallback by design (T-73-04). --check passes (keys present). Deferred: revisit glossary/verifier so these headings translate around the DNT token instead of falling back.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-19T08:28:32.086Z",
    "resolved_at": "2026-09-25T15:04:14.311Z"
  },
  {
    "id": 7,
    "kind": "deviation",
    "phase": "73",
    "file": "app/[locale]/about/page.tsx",
    "line": null,
    "description": "7 static pages (about/terms/corporate/privacy/faq/blog-index/contact) render EN content on every locale (en/ru/es/fr/ar/hi/zh) due to unforwarded getLocale() in force-static pages — pre-existing, not fixed in 73-06, see deferred-items.md",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-19T12:22:00.327Z",
    "resolved_at": "2026-09-23T21:33:05.201Z"
  },
  {
    "id": 8,
    "kind": "deviation",
    "phase": "73",
    "file": "content/routes/en/prague-marianske-lazne.json",
    "line": null,
    "description": "i18n-translate pipeline run (73-11 Task 2) hit 'credit balance too low' Anthropic API errors for 6 route files (prague-marianske-lazne, prague-olomouc, prague-pardubice, prague-plzen, prague-wroclaw, prague-zlin) and content/pages/en/corporate.json across all 6 target locales (ar/hi/zh/ru/es/fr). Manifest correctly not advanced (no partial writes); EN sources unchanged. Needs Anthropic billing top-up then a full re-run of node scripts/i18n-translate.mjs (no --locales filter) to pick these up.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-19T20:18:02.957Z",
    "resolved_at": null
  },
  {
    "id": 9,
    "kind": "stub",
    "phase": "74",
    "file": "messages/ru.json",
    "line": 790,
    "description": "Common.firstVisitBanner keys shipped as EN-fallback text (Anthropic API billing gate blocked AI translation); manifest untouched so next real pipeline run retranslates automatically",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-23T21:28:41.975Z",
    "resolved_at": "2026-09-23T21:31:45.030Z"
  },
  {
    "id": 10,
    "kind": "stub",
    "phase": "74",
    "file": "messages/es.json",
    "line": 790,
    "description": "Common.firstVisitBanner keys shipped as EN-fallback text (Anthropic API billing gate blocked AI translation); manifest untouched so next real pipeline run retranslates automatically",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-23T21:28:46.369Z",
    "resolved_at": "2026-09-23T21:31:45.207Z"
  },
  {
    "id": 11,
    "kind": "stub",
    "phase": "74",
    "file": "messages/fr.json",
    "line": 790,
    "description": "Common.firstVisitBanner keys shipped as EN-fallback text (Anthropic API billing gate blocked AI translation); manifest untouched so next real pipeline run retranslates automatically",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-23T21:28:48.035Z",
    "resolved_at": "2026-09-23T21:31:45.380Z"
  },
  {
    "id": 12,
    "kind": "stub",
    "phase": "74",
    "file": "messages/ar.json",
    "line": 790,
    "description": "Common.firstVisitBanner keys shipped as EN-fallback text (Anthropic API billing gate blocked AI translation); manifest untouched so next real pipeline run retranslates automatically",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-23T21:28:49.933Z",
    "resolved_at": "2026-09-23T21:31:45.552Z"
  },
  {
    "id": 13,
    "kind": "stub",
    "phase": "74",
    "file": "messages/hi.json",
    "line": 790,
    "description": "Common.firstVisitBanner keys shipped as EN-fallback text (Anthropic API billing gate blocked AI translation); manifest untouched so next real pipeline run retranslates automatically",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-23T21:28:51.597Z",
    "resolved_at": "2026-09-23T21:31:45.733Z"
  },
  {
    "id": 14,
    "kind": "stub",
    "phase": "74",
    "file": "messages/zh.json",
    "line": 790,
    "description": "Common.firstVisitBanner keys shipped as EN-fallback text (Anthropic API billing gate blocked AI translation); manifest untouched so next real pipeline run retranslates automatically",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-23T21:28:53.493Z",
    "resolved_at": "2026-09-23T21:31:45.904Z"
  },
  {
    "id": 15,
    "kind": "deviation",
    "phase": "75",
    "file": "components/MetaPixel.tsx",
    "line": null,
    "description": "Production Meta Pixel never fires: NEXT_PUBLIC_META_PIXEL_ID/META_PIXEL_ID env var has a trailing newline, so fbq('init','<id>\\n') throws a SyntaxError on script insertion (appendChild); fbq stays undefined on every real page load. Env var needs re-entry in Vercel without trailing newline (human action).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-25T12:39:18.185Z",
    "resolved_at": null
  },
  {
    "id": 16,
    "kind": "deviation",
    "phase": "75",
    "file": "lib/routes.ts",
    "line": null,
    "description": "75-09: per-route h2/description/notes (30 unique route blurbs) intentionally stay English on the /routes hub across all locales -- out of this plan's scope per files_modified/must_haves (chrome/labels only); separate from the already-translated dedicated /routes/<slug> pages",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-25T14:43:54.229Z",
    "resolved_at": null
  },
  {
    "id": 17,
    "kind": "deviation",
    "phase": "75",
    "file": "tests/account-trips.test.tsx",
    "line": null,
    "description": "Pre-existing ERR_MODULE_NOT_FOUND at import (next-intl/server.react-server.js hardcoded relative path) on 5 test files unrelated to plan 75-12's scope; not fixed per scope boundary",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-25T19:30:56.319Z",
    "resolved_at": null
  },
  {
    "id": 18,
    "kind": "unrun-verify",
    "phase": "75",
    "file": "tests/login-actions.test.ts",
    "line": null,
    "description": "Known worktree-only next-intl/server import failure (relative vi.importActual path resolves outside the worktree's next/headers export map) prevents running this suite in-worktree; logic independently verified via a scratch composition check and will run/pass on main (matches 75-11-SUMMARY.md precedent).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-25T21:05:40.466Z",
    "resolved_at": null
  },
  {
    "id": 19,
    "kind": "unrun-verify",
    "phase": "75",
    "file": "tests/account-trips.test.tsx",
    "line": null,
    "description": "Same known worktree-only next-intl/server import failure (see entry #18) — this file IS in plan 75-15's own scope (extended with new D-04 locale-redirect test cases), so the new assertions could not be executed in-worktree either; logic independently verified via a scratch mock-composition check and will run/pass on main.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-25T21:08:17.526Z",
    "resolved_at": null
  },
  {
    "id": 20,
    "kind": "deviation",
    "phase": "75",
    "file": "components/ArticleByline.tsx",
    "line": null,
    "description": "next/link default import drops locale prefix on the byline link (75-EN-LEAK-AUDIT.md R3, attributed to 75-13 but out of files_modified scope) - deferred, see deferred-items.md",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-26T16:26:15.319Z",
    "resolved_at": "2026-09-26T19:44:16.722Z"
  },
  {
    "id": 21,
    "kind": "deviation",
    "phase": "75",
    "file": "lib/email.ts",
    "line": null,
    "description": "D-05 recorded: client emails (email.ts/email-corporate.ts/email-bespoke.ts) are 100% English-only, locale never threaded through -- new capability, not fixed in 75-20",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-26T22:18:07.075Z",
    "resolved_at": null
  },
  {
    "id": 22,
    "kind": "deviation",
    "phase": "75",
    "file": "app/[locale]/not-found.tsx",
    "line": null,
    "description": "Systemic gap: every locale's unmatched-path 404 renders un-localized root app/not-found.tsx (English) because no catch-all route exists under app/[locale]/ to reach the already-localized boundary -- root-caused in 75-20, explains 75-19-SUMMARY.md's zh/<unknown> observation (universal, not zh-specific)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-26T22:18:13.476Z",
    "resolved_at": null
  },
  {
    "id": 23,
    "kind": "deviation",
    "phase": "75",
    "file": "app/[locale]/fleet/page.tsx",
    "line": null,
    "description": "overflow_audit 768px: new regression on /ru/fleet -- 2 maintenance-copy paragraphs overflow their container with translated (longer) Russian text; 320/375/1024/1280px clean -- 75-20 recorded not fixed, candidate follow-up for 75-08",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-26T22:18:25.711Z",
    "resolved_at": null
  },
  {
    "id": 24,
    "kind": "deviation",
    "phase": "75",
    "file": "scripts/qa/en_leak_allowlist.json",
    "line": null,
    "description": "en_leak_rendered residual gaps (75-20): person names (Roman Ustyugov) flagged as leaks on ar/ru/hi/zh, and mid-sentence brand/tech-term Latin runs (Mercedes E-Class, USB-A/USB-C, Wi-Fi, Visa) still trip the 2+/3+-word heuristic when embedded inline -- allowlist needs a proper-noun category and inline-DNT handling; not fixed in 75-20 (scanner/allowlist change out of scope)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-26T22:18:26.259Z",
    "resolved_at": null
  },
  {
    "id": 25,
    "kind": "unrun-verify",
    "phase": "75",
    "file": "scripts/qa/booking_e2e.py",
    "line": null,
    "description": "D-04 RU/AR signed-in account booking path unverified in 75-20: scripts/qa/.e2e-account.json never provided (75-19-SUMMARY.md), both locales auto-skipped. Guest-path locale-following is proven for both ru/ar; only the signed-in variant is unverified. Re-run booking_e2e.py --locales \"\" --account ru,ar once credentials file exists.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-26T22:18:26.809Z",
    "resolved_at": null
  }
]
````
