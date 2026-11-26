---
phase: 94-driver-cabinet
plan: 08
subsystem: pwa
tags: [driver-cabinet, pwa, manifest, service-worker, web-push, csp, icons, security]
requires:
  - "94-02: (cabinet) layout with the noindex metadata and the light wrapper"
provides:
  - "public/driver/manifest.webmanifest: Prestigo Driver, scope /driver/, start /driver/rides, standalone, #EFE8DA"
  - "public/driver/sw.js: static push + notificationclick worker (scope /driver/)"
  - "public/driver/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon,badge-72}.png (navy + gold P)"
  - "scripts/render-driver-icons.mjs + scripts/driver-icons/{icon,badge}.svg: reproducible icon rendering"
  - "(cabinet)/layout.tsx metadata: manifest, appleWebApp, icons.apple"
  - "middleware.ts: worker-src 'self' in buildCsp and buildCspDriverHelp"
  - "next.config.ts: header entries for /driver/sw.js and /driver/manifest.webmanifest"
affects: [94-09, 94-10]
tech-stack:
  added: []
  patterns:
    - "static worker file in public/ exercised in a node vm with a stub self / clients, so push and notificationclick are unit-tested without a browser"
    - "colour literals for the PWA (#EFE8DA, navy, gold) live only in the manifest and the icon sources, both outside the admin colour-guard roots"
key-files:
  created:
    - public/driver/manifest.webmanifest
    - public/driver/sw.js
    - public/driver/icons/icon-192.png
    - public/driver/icons/icon-512.png
    - public/driver/icons/icon-maskable-512.png
    - public/driver/icons/apple-touch-icon.png
    - public/driver/icons/badge-72.png
    - scripts/render-driver-icons.mjs
    - scripts/driver-icons/icon.svg
    - scripts/driver-icons/badge.svg
    - tests/driver-cabinet-pwa.test.ts
  modified:
    - "app/(internal)/driver/(cabinet)/layout.tsx"
    - middleware.ts
    - next.config.ts
    - tests/middleware-i18n.test.ts
    - tests/middleware-tour-photos-csp.test.ts
    - tests/next-config-headers.test.ts
key-decisions:
  - "Manifest is a static file (no route handler): content is static and a route folder named like a metadata file risks the Next metadata convention"
  - "No viewport themeColor in the layout: a colour literal in TSX would trip the colour guard; the manifest carries the colour"
  - "The worker accepts a url only when it starts with /driver/ and contains no '//' or backslash, so protocol-relative and scheme urls fall back to /driver/offers (stricter than the research sketch, which only checked the prefix)"
  - "notificationclick re-validates the stored url too, not only the push handler, so a tampered notification data object still cannot open a foreign url"
  - "Icons are rendered with headless Chrome so the Fraunces serif P matches the brand; the maskable icon scales the same art to 70% inside the safe zone"
patterns-established:
  - "Pinned CSP expectations: worker-src 'self' sits directly after script-src in both nonce builders, so the help-equals-driver-plus-chat test keeps holding"
requirements-completed: [DCAB-12, DCAB-13]
status: complete
commits: 3
plan_head_before: f6fc7ecd79e60d35608bdf35c9b4ab519b2ac465
plan_head_after: 19dfeee5a8bd169f508b714daf7ef347d6025522
actuals:
  tokens: 21000
  tasks: 3
  commits: 3
completed: 2026-11-25
---

# Phase 94 Plan 08: Cabinet web app, service worker and CSP Summary

The driver cabinet can be added to the Home Screen as "Prestigo Driver" with navy and gold icons, and a static `/driver/sw.js` always shows a "New ride offer" notification for a push and opens only `/driver/` pages on tap, under a nonce CSP that now carries `worker-src 'self'`.

`commits: 3` counts the three task commits and is measured before the docs commit that adds this file.

## What was built

- **Task 1** (`c395b1c7`): manifest (`scope /driver/`, `start_url /driver/rides`, `display standalone`, 192 / 512 / maskable icons), `sw.js` (push always calls `showNotification`; defaults 'New ride offer' / 'You have a new ride offer.' / tag 'offer'; url allowed only for same-origin `/driver/` paths, else `/driver/offers`; `notificationclick` focuses and navigates an open `/driver/` window or calls `clients.openWindow`; no fetch handler, no `importScripts`, no eval) and the cabinet-only layout metadata. New vm, manifest and metadata tests.
- **Task 2** (`a26c0d49`): `scripts/render-driver-icons.mjs` renders the five PNGs from `scripts/driver-icons/icon.svg` and `badge.svg` with headless Chrome plus sharp. Sizes verified with sips (192, 512, 512, 180, 72); badge has an alpha channel with a transparent background; apple-touch-icon is fully opaque. The 512 and maskable icons were opened and show a gold serif P on navy.
- **Task 3** (`19dfeee5`): `worker-src 'self'` after `script-src` in `buildCsp` and `buildCspDriverHelp`; `next.config.ts` entries `/driver/sw.js` (Cache-Control `no-cache, no-store, must-revalidate`, Content-Type `application/javascript; charset=utf-8`, Referrer-Policy no-referrer still inherited from `/driver/:path*`) and `/driver/manifest.webmanifest` (`application/manifest+json`). No `Service-Worker-Allowed` header. Static CSP, `buildCspEmbed` and the matcher untouched.

## Verification

- `npx vitest run --exclude '.claude/**'` on tests/driver-cabinet-pwa, admin-no-hardcoded-colors, middleware-i18n, middleware-tour-photos-csp, next-config-headers, middleware-matcher, infra-vps-isolation-guard, middleware-csrf-forms and the other `tests/middleware*` / `tests/infra*` files: 303 passed, 13 files.
- `npx tsc --noEmit`: 8 errors, all in `tests/` (the known baseline); none in changed files.
- `npx eslint --quiet` on every changed TS / TSX / MJS file: clean.
- `git diff` shows tests/middleware-matcher.test.ts unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Own comment in sw.js tripped the "no importScripts" gate**
- **Found during:** Task 1 verification
- **Issue:** the header comment of `sw.js` named `importScripts` and `eval`, so the plan's `grep -c "importScripts|eval("` gate and the matching test would not be zero.
- **Fix:** reworded the comment ("loads no other script, runs no dynamic code").
- **Files modified:** public/driver/sw.js
- **Commit:** c395b1c7

**2. [Rule 2 - Missing critical functionality] Stricter url check than the research sketch**
- **Found during:** Task 1
- **Issue:** a bare `startsWith('/driver/')` accepts `/driver//evil.example` and backslash variants that some browsers normalise to another origin (T-94-39).
- **Fix:** `safeUrl()` also rejects any url containing `//` or `\`, and is applied again in `notificationclick`. Covered by `it.each` over six hostile urls.
- **Files modified:** public/driver/sw.js, tests/driver-cabinet-pwa.test.ts
- **Commit:** c395b1c7

**3. [Ordering note] Task 1 commit precedes the icons**
- The manifest test "points only at icon files that exist" needs the Task 2 PNGs, so Task 1 and Task 2 were verified together before either was committed; Task 1 was committed first, then Task 2. Both commits are individually atomic file sets.

Otherwise the plan executed as written. No auth gates, no package installs.

## Known Stubs

None.

## Threat Flags

None. All new surface (worker, manifest, CSP directive, headers) is covered by T-94-38..41 and is mitigated:

| Threat | Mitigation in place |
|--------|---------------------|
| T-94-38 scope escalation | worker at `/driver/sw.js`, no `Service-Worker-Allowed` header (test), no fetch handler (test) |
| T-94-39 open redirect | `safeUrl` in push and click handlers (vm tests) |
| T-94-40 script injection | static file, no `importScripts` / eval (test), no-store header (test) |
| T-94-41 CSP weakening | only `worker-src 'self'` added; static CSP and matcher pinned by existing tests |

## Notes for later plans

- 94-09 (push send / subscribe) registers the worker with `navigator.serviceWorker.register('/driver/sw.js', { scope: '/driver/', updateViaCache: 'none' })`; the payload contract is `{ title, body, url, tag }`.
- Real-device behaviour (Add to Home Screen on iOS 16.4+, actual push display) cannot be checked in this environment; it belongs to the phase human-verify list. The vm tests prove the handler logic, the header tests prove the delivery headers.
- Icons can be re-rendered with `node scripts/render-driver-icons.mjs` (needs Chrome and network access for Google Fonts).

## Self-Check: PASSED

- FOUND: public/driver/manifest.webmanifest, public/driver/sw.js, five PNGs under public/driver/icons/, scripts/render-driver-icons.mjs, scripts/driver-icons/icon.svg, scripts/driver-icons/badge.svg, tests/driver-cabinet-pwa.test.ts
- FOUND commits: c395b1c7, a26c0d49, 19dfeee5
