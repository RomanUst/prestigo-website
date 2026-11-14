---
phase: 92-quotes
plan: 05
status: complete
executed_by: orchestrator
completed: 2026-11-14
---

# 92-05 Summary: PDF render packages and fonts

## Task 1 — owner approval
The owner approved the packages and versions on 2026-11-14: asked "ставить ли две библиотеки для PDF (puppeteer-core 25.16.0 и @sparticuz/chromium-min 153.0.0)", reply "2 ок". Recorded in `92-CONTEXT.md` ("D-14 packages approved"). Registry facts checked by the orchestrator before the install: puppeteer-core 25.16.0 published 2026-10-22 (repository github.com/puppeteer/puppeteer), @sparticuz/chromium-min 153.0.0 published 2026-09-11 (repository github.com/Sparticuz/chromium).

## Task 2 — install and fonts
- Plain `npm install` first (added `opencc-js`, already in package.json), then `npm install --save-exact puppeteer-core@25.16.0 @sparticuz/chromium-min@153.0.0`.
- Neither package has a preinstall, install or postinstall script.
- Integrity (package-lock.json, equal to the registry `dist.integrity`):
  - puppeteer-core 25.16.0 `sha512-VA5Pf54N8shfopNkZZXCdiiwfnnY8ZJYAMqFQRhlH5mGUhfwf53Ar770GPtdpTDLUqvQeYpIBtC9/G2Jij2IJw==`
  - @sparticuz/chromium-min 153.0.0 `sha512-NptrPP1GRzu0YSt1VnD5vus2baVoQrQbiIaOVDO5Hdgw1vsrvGXFO9hoTE0wIb0tmlrLAzAi1tUJZS2OOGagrg==`
- Fonts from github.com/google/fonts at commit `29b4ec6df2522a8aee279414b78a07910b065874`, with source URL, size and sha256 in `lib/quotes/pdf-fonts/SOURCES.txt`: Inter, Fraunces, NotoSansArabic, NotoSansDevanagari, NotoSansSC, NotoSansTC, plus OFL.txt. Total 31 MB (NotoSansSC 17.8 MB, NotoSansTC 11.9 MB).
- Commit `6325ca5e` chore(92-05): pin PDF render packages and add OFL fonts.

## Deviation (found after wave 1)
The install deduped the app's own `zod` from 4.3.6 to 4.6.7 (chromium-bidi needs ^4.6.5) and `ws` from 8.20.0 to 8.23.0. zod 4.6 parses a missing `z.unknown()` key differently: the card-checkout consent check answered 400 instead of 422 (`tests/card-checkout-intent.test.ts`, `tests/card-checkout-cash.test.ts`). Fixed by pinning the app's zod exactly at 4.3.6 (chromium-bidi keeps a nested 4.6.7); both tests pass again. `git diff package.json` therefore shows three lines, not two: the two new packages and `zod` `^4.3.6` -> `4.3.6`. The `ws` bump (transitive, Supabase realtime) is left in the lockfile.

## Task 3 — guard test
`tests/quote-pdf-deps.test.ts` (13 tests): exact pins, lock version and sha512 integrity of both packages, the app's zod equal to its pin, the six fonts present with the recorded size and sha256, the licence file.

## For later plans
- 31 MB of fonts are in the repo; 92-07 decides how they are traced into the serverless function.
- 92-07 and 92-32 must confirm the bundle fits the Vercel function limits.
