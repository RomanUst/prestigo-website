---
phase: 77-chatwoot-deployment-core-channels
reviewed: 2026-09-29T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - .husky/pre-commit
  - app/[locale]/layout.tsx
  - app/[locale]/login/actions.ts
  - app/api/chatwoot/identity/route.ts
  - app/globals.css
  - components/ChatLauncher.tsx
  - components/Hero.tsx
  - components/chat/load-chat-widget.ts
  - infra/chatwoot/inspect.mjs
  - infra/chatwoot/lib/client.mjs
  - infra/chatwoot/sync.mjs
  - infra/chatwoot/telegram/set-bot-profile.mjs
  - infra/vps/env/chatwoot-integration.env.example
  - lib/chat-visit-context.ts
  - lib/chat-widget-contract.ts
  - lib/chatwoot-identity.ts
  - lib/contact-channels.ts
  - lib/email.ts
  - lib/email-bespoke.ts
  - lib/email-corporate.ts
  - middleware.ts
  - scripts/qa/chat_widget_probe.py
  - scripts/qa/csp_regression.py
  - scripts/qa/secret_gate_probe.sh
findings:
  critical: 1
  warning: 7
  info: 8
  total: 16
status: fixes_applied
fixes_applied: 2026-09-29
fix_status:
  CR-01: fixed
  WR-01: fixed
  WR-02: fixed
  WR-03: fixed
  WR-04: fixed
  WR-05: fixed
  WR-06: fixed
  WR-07: fixed
  IN-01: fixed
  IN-06: fixed
  IN-02: skipped
  IN-03: skipped
  IN-04: skipped
  IN-05: skipped
  IN-07: skipped
  IN-08: skipped
---

# Phase 77: Code Review Report

**Reviewed:** 2026-09-29
**Depth:** standard
**Files Reviewed:** 24
**Status:** fixes_applied (CR-01, WR-01..WR-07, IN-01, IN-06 fixed; other Info items skipped)

## Summary

The server side of the chat integration is sound: identity is derived only from the Supabase session, the HMAC is computed server-side, the base URL must be an https origin, and control characters and query strings are stripped from the visit context. The config-as-code client redacts the token and sends the hyphenated header as described. `tsc --noEmit` shows no new errors outside `tests/`.

The main defect is in the client lifecycle. Sign-out cleans cookies but leaves the already-loaded widget alive in memory, so the shared-device isolation goal (D-05 / T-77-20) is not met for soft navigations. Several smaller robustness gaps sit around it: a retry path that skips identity, a hard-coded CSP host, an `--expect-added` check that cannot detect leakage into the admin CSP, and a price gate with narrow coverage.

## Critical Issues

### CR-01: Sign-out does not reset the loaded widget; the next visitor can see the previous customer's chat (T-77-20 defeated)

**Fix status:** fixed (aa91b8bc) — Loader re-reads identity on every open and reset()s the widget when it changed (sign-out, login, other account); Nav sign-out forms also reset a loaded widget. D-02 intact: nothing loads before the click.

**File:** `app/[locale]/login/actions.ts:218-231`, `components/chat/load-chat-widget.ts:191-196`
**Issue:** `customerSignOut` is a Server Action that ends in `redirect()`, which is a soft client navigation. `LocaleLayout` and `ChatLauncher` stay mounted. If the widget was opened in this tab, `window.$chatwoot`, the iframe and its in-memory conversation and contact state survive. Only the `cw_*` cookies are deleted server-side.

`performOpen()` then short-circuits with `if (window.$chatwoot) { existing.toggle('open'); return }`. It never re-checks or re-applies identity. Two consequences:
1. Sign-out on a shared device: the next person clicks "Chat on site" and gets the previous customer's identified conversation, with name, email and history.
2. Login mid-visit: an anonymous widget is reused, so `setUser`/HMAC identity is never applied, and the chat is opened as anonymous even though the user is signed in.

The cookie deletion helps only after a full reload.

**Fix:** Reset the widget on sign-out and on identity change. Export a helper from the loader and call it from the Nav sign-out forms (`components/Nav.tsx:306` and `:419`), or unconditionally from an `onSubmit`:
```ts
// load-chat-widget.ts
export function resetChatWidget(): void {
  window.$chatwoot?.reset?.() // clears cookies and reloads the iframe
  inFlight = null
}
```
```tsx
<form action={customerSignOut} onSubmit={() => window.$chatwoot?.reset?.()}>
```
Also add `reset: () => void` to `WidgetApi`. In `performOpen`, remember the identifier used at load time. If the identity route now returns a different identifier (or none), call `reset()` and re-run instead of `toggle('open')`.

## Warnings

### WR-01: Retry after a timeout or error skips settings, identity and visit context

**Fix status:** fixed (5f1b9b18) — Explicit configured/ready tracking replaces window.$chatwoot truthiness; a retry waits for ready and then applies identity and visit context.

**File:** `components/chat/load-chat-widget.ts:191-196, 218-237`
**Issue:** The SDK assigns `window.$chatwoot` synchronously inside `run()`, before `chatwoot:ready`. This is the reason for the "Re-read" comment at line 220. If the first attempt rejects (10 s timeout, `chatwoot:error`, or ready arriving late), `ChatLauncher` shows the error. But `window.$chatwoot` now exists, so the next click takes the `existing.toggle('open')` shortcut. It never runs `setUser`, `setLocale`, `setCustomAttributes`, `setConversationCustomAttributes`, or the on-message hook. The widget then opens without identity or visit context, even for a signed-in customer. In the case where a late "ready" event arrives, the first attempt's post-ready block is never executed either.
**Fix:** Use a module-level flag (e.g. `configured = true`, set only after the post-ready block completes) instead of `window.$chatwoot` truthiness. If `$chatwoot` exists but `configured` is false, re-enter the flow and wait for readiness before applying identity. Alternatively, reset the SDK state when an attempt fails.

### WR-02: CSP hard-codes `chat.rideprestigo.com` while the widget base URL comes from an env var

**Fix status:** fixed (adapted) (da7d8231) — The Phase 76 isolation guard forbids the host literal outside middleware CSP lines, so a shared constant is impossible. Instead a test pins every CSP chat origin to one host equal to the infra instance host, and the loader fails immediately with a console error on a CSP block of the widget origin. CSP not widened.

**File:** `middleware.ts:95-101` versus `lib/chat-widget-contract.ts:27-44`, `lib/chatwoot-identity.ts:42`
**Issue:** `CHATWOOT_BASE_URL` (Vercel env) drives `sdk.js`, iframe and websocket URLs. The CSP allow-list is a literal host. `isSafeWidgetBaseUrl` only checks "https origin". If the env value ever differs (typo, staging, host rename), `sdk.js`/the iframe are blocked by CSP and the site shows only the generic "chat failed" message. Note that `script-src` also carries `https:`, so only the `frame-src`, `connect-src` and `img-src` entries actually block.
**Fix:** Put the host in one shared constant (e.g. in `lib/chat-widget-contract.ts`, imported by `middleware.ts` and used by `isSafeWidgetBaseUrl`) and have the identity route return `{ enabled: false }` if the env origin does not equal it.

### WR-03: `--expect-added` cannot detect the chat origin leaking into the nonce CSP (/admin, /driver)

**Fix status:** fixed (a98961ac) — --expect-added now fails when an expected token appears on a nonce-CSP route or in default-src.

**File:** `scripts/qa/csp_regression.py:170-187`
**Issue:** For every route class the check strips the tokens and compares the result to the baseline. The presence requirement (`is_static and not any(...)`) applies only to static-policy routes. Nothing asserts absence on nonce-CSP routes. If the chat origin were added to `buildCsp()` (the D-09 violation the middleware comment forbids), stripping it makes the policy equal the baseline and the check reports pass, with the leak visible only as a "REVIEWED DIFF" printout. The tokens are also allowed in any directive, including `default-src`.
**Fix:** For baselines containing `nonce-`, fail if any expected token is present in `cur_csp`. Optionally pass a `{token: allowed directives}` map and verify placement.

### WR-04: D-18 price gate has narrow coverage and checks the wrong tree

**Fix status:** fixed (bcaf45c5) — Price gate moved to scripts/qa/chatwoot_price_gate.mjs: scans staged blobs, case-insensitive, localized currency words; secret_gate_probe.sh extended, all probes BLOCKED/ALLOWED as expected.

**File:** `.husky/pre-commit:21-34`, `scripts/qa/secret_gate_probe.sh:130-156`
**Issue:**
- The regex `€|EUR|CZK|Kč` is case-sensitive with no word boundaries. It matches substrings of unrelated uppercase words and misses the forms used in the shipped locales: "euros" (es/fr), "euro", "евро" (ru), "欧元" (zh), "يورو" (ar), "यूरो" (hi), "koruna". Canned responses are the customer-facing content this gate exists to protect. A grep of the current canned files finds none, so this is a coverage gap rather than a live violation.
- The scan reads the working tree, not the staged index. An unrelated untracked file (or a probe file left by `secret_gate_probe.sh` if the script dies before its trap runs) blocks all commits. A file staged with a price and then edited in the working tree passes.

**Fix:** Scan the staged blobs of `infra/chatwoot`, e.g. `git diff --cached --name-only -- infra/chatwoot | while read f; do git show ":$f" | grep -qiE '...' ...`. Use `-i` and add the localized currency words plus `[0-9]+\s?(euros?|kc|czk)`. If the working-tree design is intentional, document the trade-off in the hook header.

### WR-05: `set-bot-profile.mjs` silently does nothing when the path needs URL-encoding

**Fix status:** fixed (71f3391f) — Entry-point check uses pathToFileURL(realpathSync(argv[1])); also covers symlinked dirs (macOS /var).

**File:** `infra/chatwoot/telegram/set-bot-profile.mjs:239`
**Issue:** `import.meta.url === \`file://${process.argv[1]}\`` is false whenever the absolute path contains a space, `#`, `%`, or other URL-escaped characters. `main()` then never runs, so `--apply` exits 0 with no output and looks like success. `sync.mjs` and `inspect.mjs` correctly use `pathToFileURL`.
**Fix:**
```js
import { fileURLToPath, pathToFileURL } from 'node:url'
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
```

### WR-06: Chatwoot API client has no request timeout and forwards the token header on redirects

**Fix status:** fixed (760113a4) — redirect: error plus AbortSignal.timeout (30 s, injectable); timeout surfaces as ChatwootApiError.

**File:** `infra/chatwoot/lib/client.mjs:126-132`
**Issue:** `fetchImpl(...)` is called with no `AbortSignal`, so a stalled connection hangs `sync.mjs`/`inspect.mjs` forever. It also uses the default `redirect: 'follow'`. Undici strips only `authorization`, `cookie` and `proxy-authorization` on a cross-origin redirect, so the custom `api-access-token` header (the owner's full Application API token) would be sent to whatever host a redirect points at.
**Fix:**
```js
res = await fetchImpl(url, { method, headers, body, redirect: 'error', signal: AbortSignal.timeout(30_000) })
```

### WR-07: QA probes pass vacuously when the launcher is absent

**Fix status:** fixed (8a84ec90) — --overlap exits 3 when no launcher was found; --cwv-compare reports every page without launcher_inp_ms. --consent without --expect-launcher left as is: it is the deliberate pre-launcher mode.

**File:** `scripts/qa/chat_widget_probe.py:771-773` (`--overlap`), `:322-338, 447-452` (`--cwv-compare`), `:501-508` (`--consent` without `--expect-launcher`)
**Issue:** `--overlap` does `continue  # launcher not deployed` and exits 0 if no page has the launcher. In `--cwv-compare`, a missing launcher (or empty event durations) means `launcher_inp_ms` is never recorded and the row is silently omitted, so the "regression" verdict never covers the launcher. As launch gates, these should fail loudly. `--click` already handles this with exit 3.
**Fix:** Count pages where the launcher was found. Return 3 (or 1) from `--overlap` if zero were found. In `--cwv-compare`, fail if any page produced no `launcher_inp_ms`.

## Info

### IN-01: Stale file reference in the middleware comment

**Fix status:** fixed (a5bd0579) — Comment now cites components/chat/load-chat-widget.ts.

**File:** `middleware.ts:83`
**Issue:** The comment cites `components/ChatWidgetLoader.tsx`, which does not exist. The loader is `components/chat/load-chat-widget.ts`.
**Fix:** Update the reference.

### IN-02: Chat origin added to `script-src` is a no-op

**Fix status:** skipped — Out of the requested fix scope (cheap Info items only: IN-01, IN-06).

**File:** `middleware.ts:95-96`
**Issue:** `script-src` already contains the `https:` scheme source, so the extra host adds nothing and suggests a tighter policy than what is enforced.
**Fix:** Drop it, or add a comment saying it is documentation only.

### IN-03: `HeroWhatsApp` is now unreferenced by the app

**Fix status:** skipped — Out of the requested fix scope (cheap Info items only: IN-01, IN-06).

**File:** `components/Hero.tsx:73-78`, `components/HeroWhatsApp.tsx`, `lib/contact-channels.ts:5`
**Issue:** Only a test file imports `HeroWhatsApp`. `contact-channels.ts` still says its number "matches components/HeroWhatsApp.tsx", so two copies of the number remain in the repo.
**Fix:** Remove the component and point the test at `WHATSAPP_CHAT_URL`, or keep it deliberately and say why.

### IN-04: `/book` detection is inconsistent between the launcher and the loader

**Fix status:** skipped — Out of the requested fix scope (cheap Info items only: IN-01, IN-06).

**File:** `components/chat/load-chat-widget.ts:106` versus `components/ChatLauncher.tsx:52`
**Issue:** The loader uses `pathname.startsWith('/book')`, which would also match any future `/bookings*` route. The launcher uses `=== '/book' || startsWith('/book/')`. On a stray match, stale persisted wizard data (origin/destination) would be sent to Chatwoot.
**Fix:** Share one `isBookingPath()` helper.

### IN-05: Duplicated helpers between `sync.mjs` and `inspect.mjs`

**Fix status:** skipped — Out of the requested fix scope (cheap Info items only: IN-01, IN-06).

**File:** `infra/chatwoot/sync.mjs:201-210, 628-637` and `infra/chatwoot/inspect.mjs:40-50, 176-185`
**Issue:** `unwrapList` and the automation-rule pager are duplicated, and `inspect.mjs` already imports `buildInboxRefs` from `sync.mjs`. The copies can drift; `inspect`'s `unwrapList` already differs by handling `res.data.payload`.
**Fix:** Move both into `lib/client.mjs` (or `lib/util.mjs`).

### IN-06: A customer email still advertises the sales mailbox

**Fix status:** fixed (a71818d5) — D-11 confirmed in 77-CONTEXT.md; template text uses CUSTOMER_REPLY_TO (bookings@).

**File:** `lib/email.ts:681`
**Issue:** The round-trip confirmation says "Reply to this email or contact roman@rideprestigo.com". D-11 (see the comment at line 7) reserves `roman@` for EspoCRM and routes customer replies to `bookings@`.
**Fix:** Use `CUSTOMER_REPLY_TO` in the template text.

### IN-07: `send-message` probe can pass on an empty needle; the INP metric does not exercise the chat load

**Fix status:** skipped — Out of the requested fix scope (cheap Info items only: IN-01, IN-06).

**File:** `scripts/qa/chat_widget_probe.py:733-735`, `:334-338`
**Issue:** `--send-message ""` gives `needle == ''`, and `'' in innerText` is true immediately. The "launcher INP" only measures opening the menu, not the "Chat on site" click that does the fetch and injects the SDK.
**Fix:** Reject empty TEXT in argument handling. Measure the click on the menu item too.

### IN-08: Bot profile script does not validate Telegram field limits

**Fix status:** skipped — Out of the requested fix scope (cheap Info items only: IN-01, IN-06).

**File:** `infra/chatwoot/telegram/set-bot-profile.mjs:49-65`, `:169`
**Issue:** `buildProfileCalls` checks only non-empty. Telegram limits are name 64, description 512 and short description 120 characters. A future edit that exceeds a limit fails partway through `--apply` after some of the 21 calls have already succeeded. The current data is within limits. `--expect-username` is compared case-sensitively although Telegram usernames are case-insensitive.
**Fix:** Validate lengths in `buildProfileCalls` so `--dry-run` catches them. Compare usernames with `toLowerCase()`.

---

_Reviewed: 2026-09-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
