# Chatwoot Dashboard App (Bookings panel)

Owner-facing. The Dashboard App shows a customer's booking history, read-only, in the Chatwoot conversation sidebar
(PANEL-01, PANEL-02, Phase 84). Companion to [inbound-webhooks.md](inbound-webhooks.md) (Phase 83). Names only below:
no secret value, no customer address and no price ever goes into this file (a test pins that). Sections: how it
works, operator setup, permissions and revocation, what the panel shows, troubleshooting, registration, go-live and
UAT checklist, then the CVE gate.

## How it works

- The Dashboard App is an iframe in the Chatwoot conversation sidebar (tab "Bookings"). It loads
  `https://rideprestigo.com/embed/chatwoot-dashboard`, a page served by this site with a CSP `frame-ancestors` that
  allows only the Chatwoot origin.
- Chatwoot hands the page the current conversation through `postMessage`. The page checks the sender origin and sends
  **only the conversation id** to `/api/chatwoot/dashboard-app`. It never sends an email or a phone number (D-03).
- The server re-reads the contact of that conversation from Chatwoot, using the operator's own token, and only then
  looks up bookings. A token that Chatwoot does not accept for that conversation gets no data.
- The panel is read-only: it makes no write anywhere, in Chatwoot, the database or EspoCRM (D-08).
- Matching is booker-only, through the Phase 82 identity tables: bookings of the email or phone on the Chatwoot contact.
- The registered URL has no query string, no fragment and no secret in it (D-01).

## Operator setup

Once per browser tab session (D-02):

1. In Chatwoot open **Profile settings** and copy the **Access Token**.
2. Open any conversation, open the **Bookings** tab in the sidebar.
3. Paste the token into the field **Chatwoot access token** and press **Save token**.

Where the token lives and why:

- It is kept in the iframe's `sessionStorage` for this tab only and is cleared when the tab closes. Next session you
  paste it again.
- Persistent storage (`localStorage` or a cookie) was rejected on purpose: `rideprestigo.com` and
  `chat.rideprestigo.com` are the same site, so the marketing pages and their third-party scripts (analytics, tag
  manager, pixels) run on the same origin as the panel and could read a persistent token. A Chatwoot personal token has
  the full power of its agent.
- The token travels only in the `api-access-token` request header of `POST /api/chatwoot/dashboard-app`, with
  credentials omitted and no caching. It never appears in a URL, a body, a log line or a cookie.
- The server never stores it. The only trace is a 5-minute validation cache keyed by a hash of the token, so a
  stored value cannot be turned back into the token.
- The panel does not use the admin login cookie. Being logged in or out of `/admin` changes nothing for the panel.

## Permissions and revocation

- Any agent who can open the conversation in Chatwoot sees that conversation's bookings. There is no admin-only gate
  and nothing to set up for a second operator beyond pasting their own token (D-04).
- Chatwoot decides who may open a conversation (inbox and team membership). The panel adds nothing on top.
- To revoke: reset the agent's token in Chatwoot Profile settings, or remove the agent from the account. Access ends on
  the next refresh of the panel (D-01). The 5-minute validation cache can delay it by at most that long.
- **Forget token** (panel footer) clears the token from this tab only. It needs no confirmation: pasting the token again
  restores access.

## What the panel shows

- **Counters:** Trips and Total spent for this customer.
- **Upcoming:** all future bookings, nearest first.
- **Past:** the 10 most recent, newest first; **Show {n} more** expands in place. If the server cap is reached the last
  row links to **Open all bookings in admin**.
- **Booking card:** date and time (Europe/Prague), route, status and payment badges, reference, vehicle class,
  passengers, bags, amount, accepted driver and trip progress, flight number, customer notes, and **Open in admin**
  (opens that booking by reference). Optional rows are left out when empty.
- **Copy payment link:** shown only for a booking that is awaiting payment and has a Stripe link on `buy.stripe.com`.
  Everything else shows no button and no raw link. The panel never opens the link itself.
- **Verification hint:** "Verified customer (signed in)" means the contact came from a signed-in website session.
  "Unverified email - confirm identity before sharing booking details" means anyone could have typed that email in the
  chat form: ask the customer to confirm the route and date before you share any booking detail.
- **Phone mismatch:** "Phone matches a different customer" means the email on the contact belongs to one customer
  and the phone to another. The bookings shown are those of the email's customer; nothing about the other customer is
  shown. Check the phone number with the customer.
- **Empty state:** "No bookings" with the searched email or phone, and links **Create booking in admin** and, when a
  Lead exists, **Open Lead in EspoCRM**. No buttons, no writes.
- **No contact info:** "Add an email or phone to this contact in Chatwoot to see bookings". Edit the contact in
  Chatwoot, then press Refresh.

## Troubleshooting

| Message shown | Cause | Fix |
|---|---|---|
| Token not accepted. Copy it again from Profile settings, Access Token in Chatwoot, then paste it here. | Token wrong, reset, or the agent was removed (the server answered 401). The stored token is cleared. | Copy the Access Token again from Chatwoot Profile settings and paste it. If it still fails the agent no longer has access: ask the owner. |
| You don't have access to this conversation, so its bookings are hidden. | The token is valid but this agent cannot open this conversation (inbox or team), or it no longer exists (403). | Ask the owner to add the agent to the inbox or team in Chatwoot. |
| Can't reach Chatwoot right now. Try again in a minute. | The site could not reach Chatwoot (502): VPS down, restart in progress, network. | Wait a minute and press Refresh. If it lasts, check the Chatwoot health on the VPS (see the Chatwoot runbooks). |
| Too many requests. Wait a moment, then press Refresh. | The per-address limit was hit (429), or the limiter store is down and the route fails closed (503). | Wait a moment, press Refresh. If the limiter store is down, it clears when the store is back. |
| The panel isn't set up yet. Ask the site owner to check the Chatwoot settings. | The site is missing its Chatwoot base URL or account id setting (503 not configured). | Owner: check the Chatwoot environment settings of the site deployment, then redeploy. |
| Couldn't load bookings. Press Refresh to try again. | Unexpected server error (500) or an unreadable reply. | Press Refresh. If it repeats, read the server log line starting `[panel]` and open an issue. |
| Chatwoot didn't send the conversation. Switch to another conversation and back, or reload this page. | The handshake with Chatwoot got no answer after about 5 seconds (page loaded before Chatwoot was ready, or a Chatwoot update changed the message). | Switch conversation and back, or reload. If it always fails, re-check the Chatwoot version (see the CVE section re-check rule) and the frame message format. |
| Open this panel from a Chatwoot conversation. | The page was opened in a normal tab, or the Chatwoot origin is not configured. | Use the Bookings tab inside a conversation. Nothing is requested in this state. |

If the tab "Bookings" is missing in a conversation, the app is not registered: see **Registration**.

## Registration

The app is registered from git (`infra/chatwoot/dashboard-apps.json`), not by hand. It needs the Chatwoot
**administrator** token (the owner's, in `~/.config/prestigo/chatwoot-api.env`); an agent token cannot create it.

```bash
node infra/chatwoot/sync.mjs --dry-run --only dashboardApps   # GET requests only, prints the plan
node infra/chatwoot/sync.mjs --only dashboardApps             # apply
```

- The app is matched by title ("Bookings"). A re-run right after must print `dashboardApps: create=0 update=0`.
- Sync creates or updates only that app. Dashboard Apps an operator made by hand are never changed or deleted.
- The URL must stay free of secrets: no query string, no fragment, no token. A test pins the exact URL.

## Go-live and UAT checklist

Before the merge to `main`:

- [ ] `python3 scripts/qa/csp_regression.py --compare` is clean against production (proves the existing route classes
      did not change).
- [ ] The CVE re-check recipe below is run and a dated row is added to the evidence log.

After the production deploy:

- [ ] `curl -sI https://rideprestigo.com/embed/chatwoot-dashboard` shows a CSP with `frame-ancestors` for the Chatwoot
      origin and **no** `x-frame-options` header.
- [ ] Add `/embed/chatwoot-dashboard` to the route classes of `scripts/qa/csp_regression.py`, run
      `python3 scripts/qa/csp_regression.py --capture`, and check the baseline diff: only the new key is added.
- [ ] Register the app: `node infra/chatwoot/sync.mjs --dry-run --only dashboardApps`, then without `--dry-run`.
      Open a conversation: the Bookings tab appears.
- [ ] Known customer, stranger and name-only contact: open three conversations and check the counters, the empty
      state and the "Add an email or phone" hint.
- [ ] A second agent outside the inbox or team pastes their own token and gets "You don't have access to this
      conversation, so its bookings are hidden." Removing an agent, or resetting a token, ends access on refresh.
- [ ] Light and dark theme, sidebar width from 320 to 400 px, and **Copy payment link** inside the real Chatwoot
      iframe (clipboard may be blocked there: the fallback shows "Press Ctrl/Cmd+C to copy").
- [ ] Same result logged in and out of `/admin` (browser network tab: no admin cookie used).
- [ ] The token sits in `sessionStorage` only: nothing under Application, Local Storage for the site.

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
