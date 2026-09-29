---
phase: 78-whatsapp-cloud-api-channel-coexistence
plan: 09
subsystem: infra
tags: [whatsapp, chatwoot, webhook-signature, meta-graph-api, security, node]
requires:
  - phase: 78-whatsapp-cloud-api-channel-coexistence
    provides: "lib/graph.mjs Graph client (createGraphClient, loadMetaConfig, MetaApiError) from plan 78-03"
  - phase: 77-chatwoot-deployment-core-channels
    provides: "lib/client.mjs Chatwoot client, parseEnvFile, redaction conventions"
provides:
  - "infra/chatwoot/whatsapp-channel.mjs: --probe, --harden [--dry-run], --sync-templates, --register-webhook, --number [--expect-e164] [--expect-currency], --register"
  - "lib/client.mjs error-body redaction for WhatsApp provider_config keys"
  - "tests/whatsapp-channel.test.ts fake Chatwoot + webhook + Graph harness (40 tests)"
  - "infra/chatwoot/README.md WhatsApp tooling section"
affects: [78-11, 78-12, 78-05]
tech-stack:
  added: []
  patterns: ["one fetchImpl fake serving Chatwoot API, webhook endpoint and Graph", "output scrubber that removes every credential value the process has seen", "hidden TTY prompt via readline over a muted Writable"]
key-files:
  created:
    - infra/chatwoot/whatsapp-channel.mjs
    - tests/whatsapp-channel.test.ts
  modified:
    - infra/chatwoot/lib/client.mjs
    - infra/chatwoot/README.md
key-decisions:
  - "loadMetaConfig (78-03) only knows token, WABA id and Graph version, so whatsapp-channel.mjs adds loadChannelMeta: same env-then-file order, resolves META_WA_APP_SECRET and META_WA_PHONE_NUMBER_ID, reports every missing name at once, then delegates validation to loadMetaConfig. lib/graph.mjs is untouched (parallel plans 78-07/78-08 are not affected)."
  - "Usage errors (unknown argument, malformed --expect-e164, PIN-style flag) exit 1; API/config errors exit 2; the Chatwoot client is created lazily so --number and --register need no Chatwoot config and --register refuses a non-TTY before touching any config."
  - "Every string value of the inbox provider_config is added to the output scrubber during --harden, so an error body that echoes the hash in any (even escaped) form cannot reach the output; client.mjs regex redaction is the first layer, the scrubber the second."
requirements-completed: [WA-01]
status: complete
duration: 40min
completed: 2026-09-29
commits: 3
plan_head_before: 5e364e705863cadb8382b2b5c8ba585cb17b9952
plan_head_after: 72d94f6ba2766aee7a3667ebad44c78e251731b9
actuals:
  tokens: 15000
  tasks: 3
  commits: 3
---

# Phase 78 Plan 09: WhatsApp channel operations tool Summary

**One safe command each to prove and enforce webhook signature verification on the manual WhatsApp channel, read the number's Meta status and currency, and register the number with the owner's own PIN, without ever printing a credential.**

## Accomplishments

- `--probe`: three message-less POSTs (unsigned, `sha256=` + 64 zeros, correct HMAC-SHA256 over the exact raw body) to `<base>/webhooks/whatsapp/<inbox phone_number as stored>`; plain fetch with no Chatwoot/Meta header, `redirect: 'error'`, 30 s timeout. Payload is metadata only (test asserts no `messages`/`statuses` key at any depth).
- `--harden [--dry-run]`: reads the admin inbox view, merges `app_secret` into the FULL existing provider_config in memory (`mergeAppSecret`, non-mutating), one PATCH, re-reads and proves `source`, `api_key`, `phone_number_id` unchanged. Second run sends no PATCH. A rejected PATCH exits 2 with the redacted error plus the rails-runner fallback pointer and leaves the stored config untouched; a rerun completes.
- `--sync-templates` / `--register-webhook`: exactly one POST to the matching inbox path.
- `--number`: Graph phone status, WABA currency, WABA membership; enum-only lines (free text becomes `unknown`); `--expect-e164` (digits compared, number never printed), `--expect-currency`.
- `--register`: refuses without a TTY (before any config load or request), reads status first (`register=already_connected` does nothing), hidden double prompt, 6-digit + match validation before any request, exactly one POST, PIN scrubbed from every output line. A pty run confirmed no echo.
- `lib/client.mjs`: error bodies redact `api_key`, `app_secret`, `app_secret_key`, `client_secret`, `api_secret`, `verification_pin`, `business_management_token` (string or bare-number values); existing token redaction unchanged.

## Exact output contract

- `--probe`: `unsigned=<code> wrong_signature=<code> signed=<code>`, then `verdict=enforced` (401/401/200, exit 0) or `verdict=NOT ENFORCED` (exit 1); `whatsapp inbox missing` exit 1.
- `--harden`: `app_secret=configured|updated|unchanged|not_saved`, then `source_preserved=`, `api_key_preserved=`, `phone_number_id_preserved=` (not printed for `unchanged`); dry run `plan app_secret=set|unchanged`. Exit 1 if any preservation boolean is false or the secret was not saved.
- `--sync-templates`: `sync_templates=requested`; `--register-webhook`: `register_webhook=ok`.
- `--number`: `status=`, `code_verification_status=`, `platform_type=`, `name_status=`, `quality_rating=`, `messaging_limit_tier=`, `currency=`, `number_in_waba=`, plus `number_matches=` / `currency_matches=` when expected. Exit 1 when status is not CONNECTED, the id is not in the WABA, or an expectation fails.
- `--register`: `register=already_connected|ok|failed`. Exit codes: 0 ok, 1 expectation failed / refused / usage, 2 API or config error.

## Task Commits

1. Task 1 (tracer): `d0a807d7` - `--probe` end to end (8 tests; tracer gate re-ran `<verify>` green before expansion)
2. Task 2: `00d7ecbd` - `--harden`, recovery levers, client redaction (22 tests total)
3. Task 3: `72d94f6b` - `--number`, `--register`, README (40 tests total)

## Deviations from Plan

### Auto-fixed / plan-scope notes

**1. [Rule 3 - Blocking] loadMetaConfig does not resolve META_WA_APP_SECRET / META_WA_PHONE_NUMBER_ID**
- **Found during:** Task 1. The plan's interfaces block says these come from `loadMetaConfig()`, but the 78-03 implementation only handles token, WABA id and version.
- **Fix:** `loadChannelMeta` in `whatsapp-channel.mjs` (exported) resolves the two extra keys with the same env-then-file order and delegates to `loadMetaConfig` for validation. `lib/graph.mjs` not modified (it is not in this plan's `files_modified`).
- **Commit:** d0a807d7

**2. [Rule 2 - Missing critical functionality] output scrubber**
- Beyond the plan: every out/err line passes a scrubber removing the app secret, Meta token, Chatwoot token, every string value of the inbox provider_config (harden) and the PIN. Needed because a client-side regex cannot catch a provider_config echoed inside an escaped JSON string (proved by the rejected-PATCH test).
- **Commit:** 00d7ecbd

**3. Extra parseArgs strictness:** `--dry-run` only with `--harden`; `--expect-*` only with `--number`; `--expect-currency` must be a 3-letter uppercase code.

**4. TDD:** RED runs were observed for Task 2 (14 failing tests before implementation). Task 3 tests and implementation were written together and went green in one run (no separate RED run); Task 1's only failure was a test bug (`"field":"messages"` is a value, not a key) fixed in the test.

**5. Sentinel/ledger files** for cwd-drift and plan head could not be created (the sandbox blocks commands that touch the worktree git dir); `commits:` was measured against the known base `5e364e70...`, as in plan 78-03.

## Verification

- `npx vitest run tests/whatsapp-channel.test.ts tests/whatsapp-graph.test.ts tests/chatwoot-sync.test.ts tests/chatwoot-inspect.test.ts`: 171 passed (40 in the new file; `grep -c "it("` = 40).
- `npx eslint --quiet` on the mjs files and the test: clean. `npx tsc --noEmit`: no errors in the new test file.
- `node infra/chatwoot/whatsapp-channel.mjs --register < /dev/null` exits 1 (TTY refusal); `--number --pin x < /dev/null` exits 1 (unknown argument).
- README passes the price gate's own `hasCurrencyToken` (exit 0); pre-commit hooks passed on all three commits.
- No live Chatwoot or Meta call was made; tests ran with `node_modules` symlinked from the main checkout (git-ignored, not committed). The orchestrator should re-run the suite after merge.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-78-26..31 mitigated and tested; T-78-SC no installs, Node built-ins only).

## Self-Check: PASSED

- infra/chatwoot/whatsapp-channel.mjs, tests/whatsapp-channel.test.ts exist; client.mjs and README.md modified.
- Commits d0a807d7, 00d7ecbd, 72d94f6b exist on the worktree branch.
