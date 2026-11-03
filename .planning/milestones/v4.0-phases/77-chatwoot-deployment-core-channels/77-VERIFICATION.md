---
phase: 77-chatwoot-deployment-core-channels
verified: 2026-09-29T14:00:00Z
status: passed
score: 6/6 must-haves verified
covered_files:
  - .planning/phases/77-chatwoot-deployment-core-channels/77-01-PLAN.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-01-SUMMARY.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-02-PLAN.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-02-SUMMARY.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-03-PLAN.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-03-SUMMARY.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-04-PLAN.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-04-SUMMARY.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-05-PLAN.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-05-SUMMARY.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-06-PLAN.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-06-SUMMARY.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-07-PLAN.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-07-SUMMARY.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-08-PLAN.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-08-SUMMARY.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-09-PLAN.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-09-SUMMARY.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-10-PLAN.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-10-SUMMARY.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-11-PLAN.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-11-SUMMARY.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-12-PLAN.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-12-SUMMARY.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-13-PLAN.md
  - .planning/phases/77-chatwoot-deployment-core-channels/77-13-SUMMARY.md
covered_digest: "v2:sha256:e98638a9299f9f011ea7329e1bd9787e0853075fccad7c7c68c0f39d934e29cc"
behavior_unverified: 0
overrides_applied: 2
overrides:
  - must_have: "No measurable LCP/INP regression on /book (plan 77-12 CWV gate: /book TBT within 10 percent of baseline; launcher INP <= 200 ms)"
    reason: "Owner chose keep live and fix forward. /book TBT +525..+727 ms in three production lab sweeps was traced to production-only third-party variance, not the launcher: local production build of /book with the launcher gives TBT median 34 ms (7 runs); production TBT swings +/-400 ms run to run with identical code; PageSpeed Insights on production / shows TBT 60 ms, CLS 0. LCP and CLS on /book are within threshold in all sweeps. Launcher INP is at 200 ms (208 ms in 2 of 12 throttled lab samples). Thresholds were not widened."
    accepted_by: "Roman (owner) via 77-12-SUMMARY Owner decision section"
    accepted_at: "2026-09-29T00:00:00Z"
  - must_have: "Launcher does not overlap page content on /book at 375x812 (chat_widget_probe --overlap)"
    reason: "Probe false positive: it measures the box of the full-width role=tablist wrapper, not its controls. Tabs end at x=238, launcher starts at x=303; no control is covered. 320px and / are clean."
    accepted_by: "Roman (owner) via 77-12-SUMMARY Owner decision section"
    accepted_at: "2026-09-29T00:00:00Z"
advisory:
  - finding: "chat_widget_probe --overlap still exits with 1 finding on /book (re-run during this verification). The probe was not fixed; it will keep failing for any future run until the probe rule or the /book tablist wrapper width changes."
    category: other
    reason: "Accepted false positive; a follow-up should teach the probe to measure controls, or narrow the wrapper, so the gate is green again."
    evidence_status: "reproduced live 2026-09-29"
  - finding: "Launcher INP sits at the 200 ms limit under 4x CPU throttling (208 ms in 2 of 12 samples). No field (CrUX/RUM) data exists to confirm real-user INP."
    category: other
    reason: "Lab only; watch after traffic accumulates."
    evidence_status: "77-12-SUMMARY sweep table"
  - finding: "Clarity loads before the cookie decision (pre-existing, noted in 77-12 owner section). Not caused by chat, but a consent question adjacent to INBOX-02."
    category: other
    reason: "Out of phase scope; tracked as a follow-up by the owner decision."
    evidence_status: "77-12-SUMMARY"
coincidental_reliance_items: []
human_verification: []
---

# Phase 77: Chatwoot Deployment + Core Channels Verification Report

**Phase Goal:** Chatwoot is live and unifies email, website-widget and Telegram conversations into one inbox, with canned responses and automation replacing the manual `send-*.mjs` ops scripts.
**Verified:** 2026-09-29
**Status:** passed (with two owner-accepted overrides and three advisories)
**Re-verification:** No, initial verification

Stance: SUMMARY claims were treated as unproven. Each truth below was re-checked against code, config-as-code, tests run in this session, live read-only Chatwoot API readbacks, and live probes against production.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Emails to info@/bookings@ arrive as Chatwoot conversations, replies are sent from the same address; mailboxes are connected to Chatwoot only | VERIFIED | Live `inspect --status`: `inbox Email info@ Channel::Email present`, `inbox Email bookings@ Channel::Email present`. Live `inspect --activity --since 2026-09-29T12:56:20Z`: #40 (bookings@) and #41 (info@) both `ch-email`, `assignee_is_owner=true`, `team=bookings`, `last_outgoing=sent`, resolved. Owner confirmed in Gmail that replies arrived From info@ and From bookings@ (77-11-SUMMARY owner confirmation; 77-13 UAT). Chatwoot-only rule: 77-11 D-14 audit (no forwarders or autoresponders; UptimeRobot and MANAGER_EMAIL moved to the owner's personal address; MX unchanged at Hostinger); runbook records the desktop mail app as removed and a written webmail-emergency-only rule. See judgement call J4 on D-13. |
| 2 | Chat button on all 7 locales (RTL-correct in ar); no third-party script or cookie until clicked; click opens the Chatwoot widget; zero CSP violations; no measurable LCP/INP regression on home, route, /book | VERIFIED (with override for /book gate) | Code: `components/ChatLauncher.tsx` mounted in `app/[locale]/layout.tsx:46`; loader is reachable only via a dynamic import inside the click handler (`handleChatOnSite`), enforced by test `chat-launcher.test.tsx` "the loader is reachable only through a dynamic import in the click handler". `components/chat/load-chat-widget.ts` fetches base URL and token from `/api/chatwoot/identity` at click time and injects `sdk.js` only then. Position flips to left for RTL; `ChatLauncher` namespace has 10 keys in each of the 7 locale files. Live: `chat_widget_probe.py --consent https://rideprestigo.com --expect-launcher` returned "21 locale x page combos checked, 0 findings"; `csp_regression.py --compare` returned "11 route classes checked, 0 findings"; homepage HTML contains the launcher (`aria-controls="chat-launcher-menu"` count 1) and 0 references to `chat.rideprestigo.com`. CSP diff is exactly one origin added to script/frame/img/connect (+wss) in `middleware.ts` lines 104-110; Report-Only unchanged (77-12). CWV: LCP and CLS within thresholds on /, route and /book in all sweeps; /book TBT gate failed in 3/3 lab sweeps and was accepted by owner with evidence (see J1, override). |
| 3 | Signed-in customer's widget conversation is identified via HMAC and attaches to their existing Chatwoot contact | VERIFIED | `lib/chatwoot-identity.ts` computes HMAC-SHA256 server-side from the Supabase session user id (`app/api/chatwoot/identity/route.ts` accepts no request parameters). Live anonymous call returns `user:null` with base URL and token (identity is session-derived). Inbox `hmac_mandatory=true` confirmed by live `inspect --status`. Loader re-reads identity on every open and `reset()`s on identity change (review CR-01 fixed, test present). Tests (chatwoot-identity, chat-launcher) pass. 77-13: Supabase auth user for the owner's sign-in email; `inspect --contact <email> --expect-identifier <id>` -> `contact_found=true identifier_matches=true`; owner UAT step (signed-in chat, no pre-chat email form) passed. |
| 4 | Messages to the Prestigo Telegram bot arrive as Chatwoot conversations and can be answered from Chatwoot | VERIFIED | Live: inbox `Telegram Channel::Telegram present`; conversation #39 in inbox `PrestigoChauffeurBot`, label `ch-telegram`, owner-assigned, team bookings, `last_outgoing=sent`. Owner confirmed receipt of the reply in Telegram. Site launcher links `TELEGRAM_CHAT_URL` from `lib/contact-channels.ts`. Bot profile localized in 7 languages via `infra/chatwoot/telegram/`. See J3 on inbox naming. |
| 5 | Owner sees conversation volume, first-response time and resolution time per channel in Chatwoot reports | VERIFIED | Live `inspect --report --since 2026-09-28`: Website 3 conv / FR 67 s / res 272 s; Email bookings@ 2 / 29 s / 221 s; Email info@ 36 / 1830 s / 3960 s; PrestigoChauffeurBot (Telegram) 2 / 347 s / 5347 s; plus per-label rows `ch-email`, `ch-telegram`, `ch-web`. Every channel shows volume, first-response and resolution. Native Chatwoot reports (no custom code), owner UAT step 7 passed. Caveat: two first-response values (#39, #41) exist only because a test reply was sent through the API with owner approval (77-13 Deviations) - this proves the report path, not real operator latency; info@ average is inflated by imported history (J4). |
| 6 | Every message previously sent by root `send-*.mjs` scripts (time change, vehicle change, payment help, post-trip review, login help) is a canned response, multilingual; new conversations are auto-assigned and labeled by channel/topic | VERIFIED | `infra/chatwoot/canned-responses/`: exactly 5 topic files (time-change from `send-time-change-email.mjs`, vehicle-change, payment-help, review-request from `send-young-posttrip-review.mjs`, login-help from `generate-login-link.mjs`), each with all 7 locales (ar, en, es, fr, hi, ru, zh) = 35 templates. Live `inspect --status`: `canned=35`, `labels=11`, `teams=Bookings(owner),B2B(owner)`, `automation_rules=110`. Automation config has 4 channel rules (website, email info@, email bookings@, telegram), 7 topic rule families x 7 locales of keywords, and a b2b team-routing rule. Live activity readback proves it works: #39/#40/#41/#42/#43/#44 all carry the expected `ch-*` label, `assignee_is_owner=true`, and team; #42 got `payment`, #43 got `b2b` and team `b2b` from keywords. Owner UAT step 4 (canned responses used from Chatwoot) passed. Two other root scripts (`send-invoice-tltgo.mjs`, `send-maxime-traveltime-reply.mjs`) are one-off customer replies outside the five OPS-01 topics; not in scope. |

**Score:** 6/6 truths verified (0 present-but-behavior-unverified). Behavior-dependent truths (no load before click, identity reset on sign-out, automation assign/label) are each backed by a passing test run in this session (8 files, 536 tests, all pass) and by a live readback or production probe.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components/ChatLauncher.tsx` | Brand launcher + channels menu | VERIFIED | 197 lines, substantive; mounted in public layout; wired to loader via click-only dynamic import |
| `components/chat/load-chat-widget.ts` | Click-time loader, identity/context, locale map | VERIFIED | Substantive; timeout, CSP-violation fail-fast, identity re-read and reset |
| `lib/chat-visit-context.ts`, `lib/chat-widget-contract.ts` | Visit context, contract | VERIFIED | Imported by loader; tests pass |
| `lib/chatwoot-identity.ts`, `app/api/chatwoot/identity/route.ts` | Server HMAC + config route | VERIFIED | Live route returns enabled config, `user:null` anonymous; no request params |
| `middleware.ts` CSP + `scripts/qa/csp_baseline.json` | Exact-origin CSP as reviewed diff | VERIFIED | Live csp_regression compare 0 findings on 11 classes |
| `infra/chatwoot/*` (sync, inspect, canned, labels, teams, attributes, automation, inboxes) | Config-as-code | VERIFIED | Live counts match repo (35 canned, 11 labels, 16 attributes, 2 teams); sync idempotent per 77-11/77-13 |
| `infra/chatwoot/telegram/*` | Bot profile in 7 langs | VERIFIED | present, 46-line profile + 232-line script |
| `lib/email*.ts` replyTo | Customer emails reply to bookings@ (D-11) | VERIFIED | `CUSTOMER_REPLY_TO` on customer-facing sends; `tests/email-reply-to.test.ts` passes |
| Privacy disclosure (7 locales) | chat, Hostinger, Backblaze, Telegram | VERIFIED | `content/pages/{en,ar,zh}/privacy.json` each match 9 times; all 7 locale files listed in 77-05 |
| `scripts/qa/chat_widget_probe.py`, `csp_regression.py` | Production gates | VERIFIED | Both run green live except the accepted overlap false positive |
| `infra/vps/runbooks/chatwoot-channels.md` | Channel runbook + "Verified 2026-09-29" | VERIFIED | Present, contains verified table and known limitations |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `app/[locale]/layout.tsx` | `ChatLauncher` | import + render | WIRED |
| `ChatLauncher` click | `load-chat-widget` | dynamic `import()` in handler only | WIRED |
| `load-chat-widget` | `/api/chatwoot/identity` | `fetch(WIDGET_CONFIG_PATH)` at click | WIRED (live 200) |
| identity route | Supabase session + `customer_profiles` | `auth.getUser()`, `.from('customer_profiles')` | WIRED |
| identity route | HMAC | `buildWidgetConfig` -> `computeIdentifierHash` | WIRED |
| `middleware.ts` | chat origin | script/frame/img/connect/wss sources | WIRED (live compare) |
| `infra/chatwoot/sync.mjs` | Chatwoot API | idempotent create/update | WIRED (live counts match) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Widget identity | `user.identifier`, `identifierHash` | Supabase `auth.getUser()` + server HMAC | Yes (contact identifier matches auth user id live) | FLOWING |
| Widget base URL/token | config response | Vercel env at request time | Yes (live response) | FLOWING |
| Conversation visit context | `buildVisitContext` | window.location, referrer, booking store on /book | Yes (tests) | FLOWING |
| Reports | native Chatwoot `summary_reports` | Chatwoot DB | Yes (live readback) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase unit tests | `npx vitest run` on 8 chat/chatwoot/email-reply-to test files | 8 files, 536 tests pass | PASS |
| No third-party load before click; consent | `chat_widget_probe.py --consent https://rideprestigo.com --expect-launcher` | 21 combos, 0 findings | PASS |
| CSP vs reviewed baseline | `csp_regression.py --compare https://rideprestigo.com` | 11 route classes, 0 findings | PASS |
| Launcher in prod HTML, chat host absent | `curl / \| grep` | launcher 1, chat host 0 | PASS |
| Identity route | `curl /api/chatwoot/identity` | `enabled:true`, `user:null` anonymous | PASS |
| Overlap /book 375px | `chat_widget_probe.py --overlap` | 1 finding (accepted false positive, J2) | ACCEPTED |
| Chatwoot status/activity/report | `inspect.mjs` (read-only) | see truths 1, 4, 5, 6 | PASS |

### Probe Execution

The phase's declared probes are `scripts/qa/chat_widget_probe.py` and `csp_regression.py` (run above). The `--overlap` mode is the only non-zero result and is an owner-accepted false positive.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| INBOX-01 | 77-02, 77-11, 77-13 | SATISFIED | Truth 1 |
| INBOX-02 | 77-04, 77-05, 77-07, 77-09, 77-10, 77-12 | SATISFIED | Truth 2 |
| INBOX-03 | 77-01, 77-07, 77-08, 77-09, 77-10, 77-12, 77-13 | SATISFIED | Truth 3 |
| INBOX-04 | 77-04, 77-08, 77-10, 77-12 | SATISFIED (CSP clean; LCP/CLS in bounds; /book TBT accepted by owner override) | Truth 2 |
| INBOX-05 | 77-06, 77-13 | SATISFIED | Truth 4 |
| INBOX-06 | 77-09, 77-13 | SATISFIED | Truth 5 |
| OPS-01 | 77-03, 77-07, 77-13 | SATISFIED | Truth 6 |
| OPS-02 | 77-03, 77-07, 77-13 | SATISFIED | Truth 6 |

All 8 IDs are claimed by at least one plan and mapped to Phase 77 in REQUIREMENTS.md; no orphaned requirements. Bookkeeping note for the orchestrator: REQUIREMENTS.md still shows all 8 as unchecked / "Pending" - flip them to complete.

### Judgement Calls Assessed

- **J1 /book TBT accepted with evidence.** Reasonable, and gates were not loosened. Roadmap SC2 speaks of LCP/INP; TBT was a plan-level proxy. LCP on /book (4428 -> 4472/4624/4384 ms) and CLS (0.032 unchanged) are in bounds. The A/B evidence (local build with launcher 34 ms median TBT; production swinging +/-400 ms with identical code; PSI TBT 60 ms) makes the launcher an implausible cause of +500-700 ms. Weakness: the causal claim rests on inference, not a same-environment before/after A/B (Vercel URLs behind SSO), and INP is at the limit in lab. Recorded as override + advisory, not a gap.
- **J2 /book overlap false positive.** Accepted; geometry evidence (tabs end x=238, launcher starts x=303) supports it. The gate still returns non-zero today; advisory to fix the probe or wrapper.
- **J3 Telegram inbox named `PrestigoChauffeurBot`.** Accepted. It is the `Channel::Telegram` inbox (status shows it present, reports and activity attribute channel `ch-telegram` correctly). Only cosmetic: the plan's string check for "Telegram" would not match by name.
- **J4 D-13 history import.** This is a real deviation from D-13/COVERAGE ("no history import"): Chatwoot's IMAP connector pulled ~20 existing info@ INBOX messages into conversations, some auto-labelled `booking-new`. No data loss, owner-directed no deletion, documented in the runbook with a rule to archive old mail before connecting future mailboxes. It does not affect INBOX-01 (arrival and same-address replies work) but it inflates info@ report averages (36 conversations, 1830 s first response). Not a gap; owner tidy-up pending.
- **J5 Hindi widget chrome.** Cannot be verified programmatically (Chatwoot-hosted iframe). Owner UAT step 8 passed in Hindi; widget locale mapping (`hi`) and `zh -> zh_CN` are code-tested. Accepted as owner-verified; residual risk is limited to Chatwoot's own translations.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| all phase implementation files | TBD/FIXME/XXX scan | none | No debt markers found |

Code review (77-REVIEW.md): 1 Critical + 7 Warning fixed and shipped (aa91b8bc..7535ca71, in production); 6 Info items deliberately skipped (IN-02..05, 07, 08), none affecting goal truths.

### Human Verification Required

None pending. The visual, real-time and external-service checks (Arabic RTL and Hindi look, mobile push, Gmail From headers, Telegram receipt, continuity round trip) were performed by the owner in the 8-step UAT recorded in 77-13-SUMMARY and the runbook.

### Gaps Summary

No blocking gaps. The phase goal is achieved in the codebase and on production: email, website widget and Telegram flow into one Chatwoot inbox, replies leave from the correct channel, the five `send-*.mjs` message families exist as 35 multilingual canned responses, and automation assigns and labels every conversation, proven by live readbacks. Residual items (advisories): overlap probe still red on /book; launcher INP at the lab limit with no field data; imported info@ history to tidy; Clarity-before-consent is a separate consent question.

---

_Verified: 2026-09-29_
_Verifier: Claude (gsd-verifier)_
