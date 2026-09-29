---
phase: 77-chatwoot-deployment-core-channels
plan: 12
subsystem: infra
tags: [chatwoot, csp, cwv, consent, qa-probe, production-launch]
requires:
  - phase: 77-04
    provides: chat_widget_probe.py (consent/click/overlap/cwv modes)
  - phase: 77-08
    provides: exact-origin chat CSP
  - phase: 77-10
    provides: ChatLauncher mount
provides:
  - csp_regression.py --expect-added (reviewed, enumerated CSP additions)
  - post-launch CSP golden (11 route classes)
  - production gate evidence for INBOX-02 / INBOX-04
affects: [77-13]
key-files:
  modified:
    - scripts/qa/csp_regression.py
    - scripts/qa/baselines/csp_baseline.json
    - scripts/qa/chat_widget_probe.py
    - scripts/qa/baselines/cwv_chat_baseline.json
decisions:
  - "Probe click/cwv modes answer the first-visit cookie modal (it is full-screen and intercepts pointer events); metrics are still read with the modal showing, like the baseline"
  - "No thresholds loosened; two gates are open and need an owner decision (see Gate Status)"
status: blocked-on-owner
commits: 4
plan_head_before: ae963c1b7c5ddd3966b98859ea608cbe3b21b13c
plan_head_after: 60c7caa49f9c2b873b42cd851b8b0ea7349ee19b
actuals:
  tokens: 9000
  tasks: 3
  commits: 4
---

# Phase 77 Plan 12: Production launch gates Summary

The chat launcher is live on rideprestigo.com; consent gating, real widget load with zero CSP violations, and the reviewed CSP diff all pass on production. Two gates are OPEN and were not loosened: `/book` TBT regressed in three consecutive sweeps, and the overlap probe flags the `/book` sticky trip-type wrapper. The plan is NOT complete until the owner decides on those.

## Deploy

- Task 1: owner chose **push-main** (orchestrator).
- Pushed `ad9f1c17..ae963c1b main -> main` at **2026-09-29T12:02:21Z** (deploy time). Launcher marker (`aria-controls="chat-launcher-menu"`) first seen in production HTML at 12:05:14Z (about 3 min); `curl -s https://rideprestigo.com/ | grep -c 'aria-controls="chat-launcher-menu"'` = 1.
- Pre-launch CWV reference: `c63d10a4` (capturedAt 2026-09-29T11:53:22Z, earlier than deploy time). Client bundle check clean: `! grep -rlE "CHATWOOT_WIDGET_HMAC_SECRET|createHmac" .next/static` (T-77-32).
- Rollback if the owner wants the launcher off: the mount is the `import ChatLauncher` line and the `<ChatLauncher />` element in `app/[locale]/layout.tsx`, added by `b371d84b` (a plain `git revert b371d84b` would also delete the component that later commits extend and conflict). Restore the layout with `git show ad9f1c17:"app/[locale]/layout.tsx" > "app/[locale]/layout.tsx"`, commit `revert(77-12): unmount ChatLauncher`, push main; about 90 s to production. replyTo and privacy changes are safe to keep.

## Gate Status

| Gate | Command | Result |
|------|---------|--------|
| Launcher live | poll / for marker | PASS (12:05:14Z) |
| Click probe en / (step 5) | `--click ... --locales en --pages /` | PASS, 0 findings (after probe fix, see Deviations) |
| Consent, 7 locales x 3 pages | `--consent ... --expect-launcher` | PASS, 21 combos, 0 findings (first run had one transient `en /` goto timeout at 60 s; clean rerun of that row and then the full 21-row rerun both 0 findings) |
| Click en+ar on /, /routes/prague-vienna, /book | `--click ... --locales en,ar --pages /,/routes/prague-vienna,/book` | PASS, 6 combos, 0 findings, zero CSP violations |
| CSP reviewed diff | `csp_regression.py --compare --expect-added https://chat.rideprestigo.com wss://chat.rideprestigo.com` | PASS, 11 route classes, 0 findings; single-token run fails (exit 1) as designed |
| CSP golden re-captured + plain compare | `--capture`, `--compare` | PASS, 0 findings; acceptance python assert OK |
| Overlap /book and / at 375 px | `--overlap ... --pages /book,/` | OPEN, 1 finding on /book (see below); / clean |
| CWV compare | `--cwv-compare` | OPEN, /book TBT regression (see below) |

## CSP reviewed diff (identical on all 11 route classes)

```
-script-src 'unsafe-inline' https:;
+script-src 'unsafe-inline' https: https://chat.rideprestigo.com;
-frame-src https://js.stripe.com https://hooks.stripe.com;
+frame-src https://js.stripe.com https://hooks.stripe.com https://chat.rideprestigo.com;
-img-src ... https://*.clarity.ms;
+img-src ... https://*.clarity.ms https://chat.rideprestigo.com;
-connect-src ... https://appleid.apple.com;
+connect-src ... https://appleid.apple.com https://chat.rideprestigo.com wss://chat.rideprestigo.com;
```

No other directive changed; Report-Only unchanged. Golden committed as `20571fd6 security: 77-12 CSP baseline — reviewed chat origin addition`.

## CWV before/after (baseline `c63d10a4`, three production sweeps)

Limit column is the probe's allowed delta (10 percent, CLS 0.02 absolute); launcher INP limit is 200 ms.

| page | metric | before | sweep 1 | sweep 2 | sweep 3 |
|------|--------|--------|---------|---------|---------|
| / | lcp_ms | 7444 | 5360 | 6684 | 5668 |
| / | tbt_ms | 1214 | 1130 | 1143 | 1194 |
| / | cls | 0.027 | 0.027 | 0.027 | 0.027 |
| / | launcher_inp_ms | - | 200 | 200 | 200 |
| /routes/prague-vienna | lcp_ms | 4536 | 4492 | 4728 | 4780 |
| /routes/prague-vienna | tbt_ms | 838 | 877 | 879 | **927 (+89 > 84, REGRESSION)** |
| /routes/prague-vienna | cls | 0.001 | 0.001 | 0.001 | 0.000 |
| /routes/prague-vienna | launcher_inp_ms | - | 200 | **208 (REGRESSION)** | 200 |
| /book | lcp_ms | 4428 | 4472 | 4624 | 4384 |
| /book | tbt_ms | 1046 | **1773 (+727)** | **1649 (+603)** | **1571 (+525)** |
| /book | cls | 0.032 | 0.032 | 0.032 | 0.032 |
| /book | launcher_inp_ms | - | 200 | **208 (REGRESSION)** | 200 |

Reading:
- `/` and route page LCP/CLS/TBT are within thresholds (home CLS 0.027 is the known WINDOWS #31 pre-existing lab noise, equal before and after, so no delta). Route-page TBT +89 in one of three sweeps is marginal noise-scale.
- **`/book` TBT is +525 to +727 ms above the baseline in all three sweeps.** The lab box is stable across the sweeps for `/` (TBT 1130-1194 vs 1214 baseline), so this is not a generally slower box. The baseline's own /book raw runs were 1039, 974, 3477, 1077, 1046 (one outlier). The only page-affecting code in `ad9f1c17..ae963c1b` is the `<ChatLauncher />` mount in the public layout plus middleware CSP; cause on /book specifically is not isolated (previous-deployment A/B was not possible: Vercel deployment URLs 302 to SSO).
- Launcher INP sits exactly at the 200 ms limit (208 ms in 2 of 12 measurements under 4x CPU throttling); the limit is inclusive of 200 only.

## Overlap evidence (`/book`, 375x812)

Probe finding: `launcher overlaps {'tag':'div', rect left 24 top 630 right 351 bottom 678}`. Element is `div[role="tablist"][aria-label="Trip type"]` (`position:sticky;top:0;z-index:10`). Launcher rect [303, 660, 359, 716] (`bottom-24` raised offset on /book). Measured tab buttons inside the wrapper: TRANSFER [24,630,135,674], HOURLY [143,630,238,674] — both end at x=238, launcher starts at x=303, so **no visible control overlaps the launcher**; only the empty right part of the wrapper box does, and only in the scroll-0 position (when stuck, the wrapper sits at top:0 under the nav). At 320x640 the launcher [248,488,304,544] is clear of the wrapper [24,698,296,746]. Screenshot at 375 px checked: launcher sits right of the HOURLY tab, above the Pickup input. This matches the known local finding. The probe was not changed to exempt it (a fix belongs in either the probe's element-vs-box rule or /book's wrapper width, owner decision).

## Deviations from Plan

**1. [Rule 3 - Blocking] `--click` could never click on production**
- **Found during:** Task 2 step 5
- **Issue:** the first-visit cookie consent dialog is a full-screen modal (`z-[400]`) that intercepts pointer events; the probe's fresh context timed out clicking the launcher.
- **Fix:** seed the same "necessary only" `prestigo_consent_v2` decision `--overlap` already uses (constant `CONSENT_SEED_JS`). The chat gate is the click itself and independent of cookie consent.
- **Files modified:** scripts/qa/chat_widget_probe.py
- **Commit:** 02bf4858

**2. [Rule 3 - Blocking] `--cwv-compare` launcher INP click blocked by the same modal**
- **Fix:** metrics are read with the modal showing exactly as in the baseline; only before the launcher click is the modal element removed and the event-duration buffer cleared, so launcher_inp_ms counts only the launcher click.
- **Files modified:** scripts/qa/chat_widget_probe.py
- **Commit:** 60c7caa4

**3. [Plan step] `--expect-added` implemented per the interfaces block** (token boundary regex, static-route presence check, Report-Only must match exactly, per-route unified diff). Commit 6b10c6be.

## Decision for the owner (gates not loosened)

Options: (a) accept /book TBT as lab noise given LCP/CLS unchanged and INP at the limit (not supported by 3/3 consistent sweeps); (b) revert the launcher mount and investigate /book hydration (ChatLauncher imports `trackMetaEvent` from MetaPixel and lucide icons into the shared layout chunk) — lazy-load or defer the launcher on /book; (c) keep the launcher and fix forward with a follow-up plan. Revert command (mount only): `git show ad9f1c17:"app/[locale]/layout.tsx" > "app/[locale]/layout.tsx"`, commit and push main, then confirm `curl -s https://rideprestigo.com/ | grep -c 'aria-controls="chat-launcher-menu"'` = 0. The plan's revert path applies to consent leaks / booking-blocking defects; none occurred (consent 21/21 clean, zero CSP violations, /book click works in en and ar).

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Files exist (csp_regression.py, csp_baseline.json, chat_widget_probe.py, this SUMMARY); commits 02bf4858, 6b10c6be, 20571fd6, 60c7caa4 present on the worktree branch.
