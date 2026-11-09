---
phase: 89-cancellation-policy-cash-guarantee-no-show
scope: wave 10 (wording + All clients tile), diff 452e3ad6..0608b977
reviewed: 2026-11-09T18:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - components/admin/CardFlowSettings.tsx
  - app/api/admin/settings/route.ts
  - lib/cancellation-wording.ts
  - lib/no-show-wait.ts
  - lib/llms-content.ts
  - app/llms.txt/route.ts
  - app/llms-full.txt/route.ts
  - app/[locale]/faq/page.tsx
  - app/[locale]/terms/page.tsx
  - app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx
findings:
  critical: 1
  warning: 7
  info: 4
  total: 12
status: issues_found
---

# Phase 89 (wave 10): Code Review Report, public wording and the All clients tile

**Reviewed:** 2026-11-09T18:00:00Z
**Depth:** standard
**Files Reviewed:** 10 source files. The content JSON files in the same diff were read where the source renders them (terms, faq, book, routes, contact, airport-transfer, flight-delays).
**Status:** issues_found

## Summary

The mechanics are correct:
- `/api/admin/settings` keeps the required order: enforceMaxBody, then getAdminUser (401/403), then the JSON parse (400), then zod (400), then the cross-field checks (422). CSRF is enforced by middleware, since `/api/admin` is in `CSRF_STRICT_ORIGIN_REQUIRED`. `'on'` matches the 087 CHECK and the only reader, `lib/payments/config.ts`.
- `CardFlowSettings` writes exactly `{ card_flow_mode: 'on' }` and only after the confirm dialog. Neither a click nor an arrow key saves it directly.
- `fillPolicyDeep` handles plural forms correctly for every locale tested (ru one/few/many, ar one/two/few/many, hi one/other, zh plain). No unfilled `{var}` sits outside `terms.section4` or `faq.sections`. FAQ JSON-LD is built from the filled copy.
- The wording matches the engine. "Up to N hours before pickup" agrees with the inclusive `nowMs <= freeUntilMs`. "Trips of up to {km} km" agrees with `distanceKm <= kmThreshold`. The hourly window is separate, the fee is "up to {percent}%", and the waits come from `getNoShowThresholds`.
- The build manifest (`.next/prerender-manifest.json`) shows `/[locale]/faq` and `/[locale]/terms` as ISR with `initialRevalidateSeconds: 300`, so dropping `force-static` did not make them dynamic.

The defects are about what is published compared with what is enforced:
- A public FAQ landing page in all 7 locales still states the retired one-hour rule.
- The new public terms are not gated by the same switch that gates the enforced terms.
- Two other public texts now contradict the live card / cash-guarantee flow.
- Some admin-configurable numbers are still typed into content.

## Critical Issues

### CR-01: The flight-delays FAQ still promises "free cancellation up to one hour before pickup" in all 7 locales

**File:** `content/pages/en/faq/flight-delays.json:63`. Same sentence in `ru/fr/ar/hi:63`, `es:105`, `zh:105`. Rendered by `app/[locale]/faq/[slug]/page.tsx` through LandingView.
**Issue:** The editorial paragraph says: "If you decide not to travel, the free cancellation window — up to one hour before pickup — still applies." (es: "cancelación gratuita hasta una hora antes de la recogida"; ru: "не позднее чем за час до подачи"; ar: "حتى ساعة واحدة قبل موعد الاستقبال"; zh: "接送时间前一小时以上"; hi: "पिकअप से एक घंटा पहले तक".)

With the flag at `on`, every new booking stores the live policy. The defaults are `freeHoursLong = 12` and `freeHoursHourly = 12`. `evaluateCancellation` returns `late` from 12 h before pickup on any trip over 100 km, on hourly hire, and on any trip with unknown distance. A fee of up to `feePercent` (default 100%) can then be charged. So a public page tells the client a cancellation is free when the engine treats it as chargeable. It is also the page a delayed-flight client is most likely to read just before cancelling.

The change list in `tests/public-cancellation-wording.test.ts` (`SURFACES`/`EN_FILES`) is hand-picked and does not include `content/pages/*/faq/*.json`. That is why the guard passed. The phrase "up to one hour before pickup" (spelled out, not "1 hour") would also slip past the `OLD_PHRASES` regex `/up to 1 hour/i`.
**Fix:** Replace the clause in all 7 locales with the neutral wording used elsewhere in this wave, for example in EN:
```text
If you decide not to travel, you can still cancel free of charge until the deadline shown at checkout and in your confirmation email.
```
Then add `content/pages/%L/faq/*.json` (and `services/*.json`) to `EN_FILES`, and add `/(one|1) hour before (the )?(scheduled )?pickup/i` to `OLD_PHRASES`. Also do a grep pass for "hour" near "cancel" over all of `content/pages/en/**`, not only the surface list.

## Warnings

### WR-01: The public terms, FAQ and llms are not gated by `card_flow_mode`; on rollback (or before the flip) they describe terms the engine does not apply

**File:** `app/[locale]/terms/page.tsx:227-229`, `app/[locale]/faq/page.tsx:73-75`, `app/llms.txt/route.ts:10`, `app/llms-full.txt/route.ts:10`, `lib/llms-content.ts:56-65`
**Issue:**
- **What the engine applies.** The stored-terms gate is `isPolicyPublic` (`lib/payments/config.ts:113`). In mode `off`, and in `canary` for unlisted emails, new bookings keep NULL `cancel_policy*` columns. They get `LEGACY_POLICY` (1 h free on every trip), no Manage link (`manageUrlFromRow` returns undefined without a stored policy), and pay-now with no saved card or cash option.
- **What the public pages say.** `/terms`, `/faq`, `/llms.txt` and `/llms-full.txt` publish the new windows unconditionally. They also say "You cancel from the link in your confirmation email", "every confirmation email has a link to cancel the booking online", and "When you book, we save your card with Stripe as a guarantee. This also applies to bookings you pay in cash".
- **Consequence.** In any mode other than `on`, the public terms contradict both the booking and the emails.
- **The dialog invites this state.** The confirm dialog tells the owner "You can switch back at any time" (`CardFlowSettings.tsx:462-464`), and the "Off" tile saves at once with no dialog.
- **It has already happened once.** It did so in production between the merge (2026-11-09 15:11 UTC) and the flip (16:30 UTC).
- **Bookings made earlier.** The terms page has no transition clause. The owner dialog says "Bookings made earlier keep their terms", but the public Terms of Service no longer state the terms those bookings were made under (1 h, no Manage link).

**Fix:** Do one of the following:
- (a) Read `getPaymentSettings()` in `getPolicyNumbers()`. When `mode !== 'on'`, render the legacy section (keep the old section-4 text as a second key), and have `cancellationBlock` print the legacy line.
- (b) Make the "Off" and "Owner test only" tiles go through a confirm dialog that warns that the public terms will be wrong until the wording is reverted.

In both cases, add one sentence to terms section 4, for example: "Bookings made before 9 November 2026 keep the cancellation terms in force when they were made."

### WR-02: The book page payment FAQ says the fare is charged at confirmation and that cash is not accepted, which contradicts the live flow and the new terms

**File:** `content/pages/en/book.json:59` (`faq.items[1].a`). Same text in all 6 translations, for example `ru/book.json`.
**Issue:** "The full fare is charged at the moment you confirm, not after the trip … We do not accept cash inside the vehicle". With `card_flow_mode = 'on'`, transfer and hourly clients get `card_hold`, where the card is authorised `payment_hold_lead_hours` before pickup, or `cash_guarantee` ("Pay cash to driver"). Terms section 4 and the new FAQ ("Why is my card saved if I pay cash to the driver?") say the opposite on the same site. This wave edited `book.json` (items 0 and the guarantee bullet) but left item 1. The book FAQ also feeds FAQ structured data, so search engines get both statements. The `prague-airport-taxi.json` "How can I pay?" answer also leaves out cash.
**Fix:** Rewrite `faq.items[1].a` in all locales. Describe pay now, pay by card (held before pickup and charged after), and pay cash to the driver with the card saved as a guarantee. Remove "We do not accept cash inside the vehicle" and "charged at the moment you confirm". Add the item to `SURFACES` in `tests/public-cancellation-wording.test.ts`.

### WR-03: The terms and FAQ say every booking saves a card, but round-trip and daily bookings stay pay-now

**File:** `content/pages/en/terms.json:47-48` ("Saved card as a guarantee"), `content/pages/en/faq.json:81-83`, and the same keys in every locale.
**Issue:** "When you book, we save your card with Stripe as a guarantee." `CARD_FLOW_TRIP_TYPES = ['transfer', 'hourly']` (`lib/payments/config.ts:30`). `round_trip` and `daily` keep pay-now (D-19), so the card is charged, not saved. A legal statement that is false for some bookings is a defect even if the money outcome is benign. The owner dialog and the CardFlowSettings helper (line 352-353) correctly say "one-way transfer or an hourly ride". The client-facing terms do not.
**Fix:** "When you book a one-way transfer or an hourly ride and choose to pay by card later or in cash to the driver, we save your card with Stripe as a guarantee." Translate it into the six locales.

### WR-04: A 0-hour window renders as "up to 0 hours before pickup" in the terms and FAQ, but as "until the pickup time" in llms

**File:** `content/pages/*/terms.json` section4 items[0], `content/pages/*/faq.json` cancellation answer, `lib/cancellation-wording.ts:103-107`, compared with `lib/llms-content.ts:51-54`
**Issue:**
- **0 is allowed.** `POLICY_BOUNDS.hours.min = 0`, and the settings route accepts `cancel_free_hours_* = 0` (`route.ts:24-26`). So 0 is a legal admin value. The engine then makes cancellation free until the pickup instant.
- **What the pages render.** The plural blocks have no `=0` arm, so the terms render "You can cancel free of charge up to 0 hours before pickup". ru renders "не позднее чем за 0 часов до подачи" (`many`), and ar "0 ساعة" (`zero` falls to `other`).
- **llms is different.** `llms-content.freeWindow` special-cases 0 as "until the pickup time".
- **Result.** The two public sources word the same policy differently, and the page wording reads as "no free cancellation". No test covers 0 for the page path. Only `tests/llms-content.test.ts:203` covers 0, for llms.

**Fix:** Add an `=0 {…until the pickup time…}` arm to every hour plural block in the 7 locales. `fill()` already checks `=${n}` first. Add a `getPolicyNumbers`-stubbed test that renders terms and FAQ with `freeHoursShort: 0` and asserts no "0 hour".

### WR-05: The airport waiting time is typed as "60 minutes" in new and old content while the terms and FAQ read it from the admin setting

**File:** `content/pages/en/services/airport-transfer.json:132` (new FAQ added in this diff, "Up to 60 minutes of free waiting after landing is included at both terminals"), also `:42` and `:66`, the six translations, and `content/pages/*/faq/flight-delays.json` ("60 minutes free from actual landing").
**Issue:** D-24 and the header of `lib/cancellation-wording.ts` say no hour, km or percent is typed in a locale file. `noshow_wait_airport_min` is admin-editable (1..240), and `/terms` and `/faq` now print it live (`{waitAirportMin}`). If the owner sets 45, the terms say the driver waits 45 minutes and the airport page still says 60. This wave added a new hard-coded instance (line 132) in a file it touched.
**Fix:** Do one of the following:
- Route `services/airport-transfer.json` and `faq/flight-delays.json` through `fillPolicyDeep` on their pages and replace "60" with `{waitAirportMin, plural, …}`.
- Drop the number ("free waiting after landing is included").

Extend the public wording guard to fail on a literal wait-minute number in these files.

### WR-06: An ISR revalidation that hits a DB error silently republishes the default numbers over a correct cached page

**File:** `lib/cancellation-wording.ts:28-45`, `lib/cancellation-settings.ts:22-41`, `app/[locale]/terms/page.tsx:4`, `app/[locale]/faq/page.tsx:4`
**Issue:** `getCancellationPolicy()` and `getNoShowThresholds()` swallow every error and return `DEFAULT_POLICY` / 30 / 60. That suits a build without env. During a 300 s ISR revalidation in production, though, a transient Supabase error renders a successful page with the defaults, and Next replaces the good cached page with it. If the owner has set non-default values (for example 24 h on long trips), the public terms flip to 12 h for at least one revalidate window while bookings snapshot 24 h. If the render threw instead, Next would keep serving the last good page. The same applies to `/llms*.txt`, where it lasts one hour.
**Fix:** Separate "no env at build" from "runtime read failure". For example, `getPolicyNumbers({ strict: true })` returns defaults only when `SUPABASE_URL` is absent and throws on a query error, so ISR keeps the stale page. Or call `revalidatePath` only after a successful read.

### WR-07: Saving a policy or wait setting does not revalidate `/terms`, `/faq` or `/llms*.txt`, so published and snapshotted numbers diverge for up to 5 minutes or 1 hour

**File:** `app/api/admin/settings/route.ts:163-168`, `app/llms.txt/route.ts:7`, `app/llms-full.txt/route.ts:7`
**Issue:** The PATCH writes `pricing_globals` and returns, with no `revalidatePath`. New bookings snapshot the new numbers immediately (`create-payment-intent`, `card-checkout/intent`). The terms and FAQ keep the old numbers for up to 300 s, and llms for up to 3600 s. During that time a client can book under terms that differ from the published Terms of Service. The project already uses `revalidatePath('/[locale]', 'layout')` for price edits (memory: PR #57).
**Fix:** After a successful update whose keys intersect `cancel_*` or `noshow_wait_*`, call:
```ts
revalidatePath('/[locale]/terms', 'page'); revalidatePath('/[locale]/faq', 'page')
revalidatePath('/llms.txt'); revalidatePath('/llms-full.txt')
```

### WR-08: The dialog's safe button says "Keep owner test only" even when the current mode is Off

**File:** `components/admin/CardFlowSettings.tsx:490`
**Issue:** The "All clients" dialog can be opened from the Off tile (click, or ArrowLeft from Off wraps to All clients through `(index - 1 + len) % len`). The cancel button always reads "Keep owner test only", but it keeps `off`. A safety dialog whose safe button mislabels the state that will remain is confusing, and the owner may expect the canary to be on afterwards.
**Fix:** `{mode === 'off' ? 'Keep card payment off' : 'Keep owner test only'}`, and update the test at `tests/CardFlowSettings.test.tsx:365-383` to cover both labels.

## Info

### IN-01: The FAQ and terms pages do not call `setRequestLocale(locale)` after leaving `force-static`

**File:** `app/[locale]/faq/page.tsx:72-73`, `app/[locale]/terms/page.tsx:225-226`
**Issue:** Project rule (CLAUDE.md, memory "getLocale() forces dynamic rendering"): pages must use `params.locale` together with `setRequestLocale`. The current build shows ISR, because Footer's server-side `useTranslations` resolves from the layout. The guard that `force-static` used to give is gone, though, and any future `getTranslations()` or `getLocale()` in these pages or their server children would silently make them dynamic.
**Fix:** Add `setRequestLocale(locale)` after `await params` in both pages and in their `generateMetadata`.

### IN-02: Dead revert in `confirmOpenToAll`

**File:** `components/admin/CardFlowSettings.tsx:161-170`
**Issue:** `mode` is never set optimistically on this path, so `setMode(previous)` in `catch` is a no-op. It misleads readers into thinking an optimistic update happened.
**Fix:** Remove `previous` and the `setMode(previous)` call.

### IN-03: `getPolicyNumbers` reads `pricing_globals` twice in separate queries

**File:** `lib/cancellation-wording.ts:29-33`
**Issue:** `getCancellationPolicy()` and `getNoShowThresholds()` each query `pricing_globals` id 1. The two reads are not atomic, so a page can mix numbers from before and after a save. Low impact, but one select of the seven columns would be simpler and consistent.
**Fix:** Do one select of all seven columns with the same `pick`/`validMinutes` guards.

### IN-04: "Longer trips" also covers trips with unknown distance and daily hire, and the wording does not say so

**File:** `lib/llms-content.ts:59`, the terms and FAQ templates
**Issue:** `freeHoursFor` gives the long window to `distanceKm === null` and to any non-hourly type, including `daily` and `round_trip` legs. The public text names only "trips of up to N km", "longer trips" and "hourly bookings". It is not wrong for the client (the window is shown at checkout and in the email), but a manually entered booking without a distance gets the long window, which the published text does not mention.
**Fix:** Optionally add "(or when the distance is not known)" to the long-trip clause, or ensure admin-created bookings always carry `distance_km`.

---

_Reviewed: 2026-11-09T18:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
