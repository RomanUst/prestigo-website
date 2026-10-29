# Chatwoot Dashboard App (Bookings panel)

Owner-facing. The Dashboard App shows a customer's booking history, read-only, in the Chatwoot conversation sidebar
(PANEL-01, PANEL-02, Phase 84). Companion to [inbound-webhooks.md](inbound-webhooks.md) (Phase 83). Names only below:
no secret value, no customer address and no price ever goes into this file (a test pins that). Operator sections
(registration, access, troubleshooting) are added by plan 84-06; this file starts with the CVE gate.

## CVE-2025-12245 (PANEL-02 gate, D-13)

**Decision (D-13, re-worded 2026-10-26):** the gate is "scoped with evidence, no upstream fix, compensating control
shipped". Chatwoot stays pinned; this phase does not touch `infra/vps/chatwoot/compose.yml`.

### Scope

- The flaw is in the **website widget SDK**, `app/javascript/sdk/IFrameHelper.js`: `initPostMessageCommunication`
  assigns `window.onmessage` and reacts to any string starting with `chatwoot-widget:` with no check of `event.origin`.
  The `popoutChatWindow` event it dispatches then opens a window with a caller-supplied `baseUrl` and the widget
  session cookie, which is the exfiltration path.
- The **Dashboard App path is not affected.** The Dashboard App frame (`DashboardApp/Frame.vue`) checks
  `event.source` before it accepts a message, and the panel page is served by us in a frame, not by the SDK.
- The only place the vulnerable SDK runs for us is the public site, where `components/chat/load-chat-widget.ts`
  loads `/packs/js/sdk.js` after a visitor clicks "Chat on site".

### Status

- Advisory GHSA-hgg8-54gw-8v33 (CVE-2025-12245, CVSS 5.3) lists **no patched version** (`vulnerabilities: []`).
  OSV shows "last affected 4.7.0, fixed: none". The vendor did not respond to the reporter.
- The vulnerable code is unchanged between v4.7.0, v4.18.0 and v4.19.1 (the latest release checked, see the
  evidence log). So a Chatwoot upgrade would not close it, and no upgrade is scheduled for this CVE.
- Pinned image: `chatwoot/chatwoot:v4.18.0-ce` (from `infra/vps/chatwoot/compose.yml`). It is at or above the patched
  version of every Chatwoot advisory the repository publishes: CVE-2026-72719 (>= 4.9.0), CVE-2026-44707 (4.13.0),
  CVE-2026-44706 (4.11.2), CVE-2025-21628 (3.16.0).

### Compensating control

`installWidgetOriginGuard` in `components/chat/load-chat-widget.ts` registers one capture-phase `message` listener on
`window` before the SDK script is injected (and before `chatwootSDK.run` on the re-run path). It calls
`stopImmediatePropagation()` for a string message that starts with `chatwoot-widget:` when `event.origin` is not the
widget origin (`new URL(baseUrl).origin`). It runs first because it is a capture listener registered before the SDK
assigns its own handler, so the SDK handler never sees a foreign-origin message. Messages from the widget origin,
and any message without the prefix, pass unchanged, so the live widget keeps working. Proof: `tests/chat-widget-origin-guard.test.ts`.

### Evidence log

| Date | Check | Result |
|---|---|---|
| 2026-10-26 | Research: advisory, OSV, IFrameHelper.js at v4.7.0, v4.18.0, v4.19.1, develop | `vulnerabilities: []`; OSV fixed: none; `initPostMessageCommunication` identical in all four |
| 2026-10-29 | `gh api /advisories/GHSA-hgg8-54gw-8v33` | `{"cve":"CVE-2025-12245","updated":"2025-10-27T09:30:27Z","vulns":[]}` (no patched version) |
| 2026-10-29 | `gh api repos/chatwoot/chatwoot/releases --jq '.[0].tag_name'` | v4.19.1 is the newest release |
| 2026-10-29 | `gh api repos/chatwoot/chatwoot/security-advisories` | four advisories, patched in >= 4.9.0, 4.13.0, 4.11.2, 3.16.0; all at or below the pinned v4.18.0 |
| 2026-10-29 | `IFrameHelper.js` at v4.18.0 vs v4.19.1 (curl, diff) | files byte-identical (344 lines each); `window.onmessage` handler checks only the `chatwoot-widget:` prefix, no origin |

### Re-check recipe

Run on **every Chatwoot version bump** and **before the Phase 84 go-live**. Append a dated row to the evidence log.

```bash
gh api /advisories/GHSA-hgg8-54gw-8v33 --jq '{cve:.cve_id,vulns:.vulnerabilities,updated:.updated_at}'
gh api repos/chatwoot/chatwoot/security-advisories --jq '.[] | [.ghsa_id,.cve_id,.vulnerabilities[0].patched_versions]|@tsv'
NEWEST=$(gh api repos/chatwoot/chatwoot/releases --jq '.[0].tag_name')
for v in v4.18.0 "$NEWEST"; do curl -sSL "https://raw.githubusercontent.com/chatwoot/chatwoot/$v/app/javascript/sdk/IFrameHelper.js" | grep -n "initPostMessageCommunication" -A8; done
```

Reading the result: if `vulns` now lists a patched version at or below a release we can run, plan the bump (and
keep the guard, it is cheap). If `initPostMessageCommunication` gained an `origin` check, note the version here.
If neither changed, the compensating control stays the answer.
