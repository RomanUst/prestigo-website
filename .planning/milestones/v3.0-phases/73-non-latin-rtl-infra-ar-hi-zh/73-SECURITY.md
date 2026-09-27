---
phase: 73
slug: non-latin-rtl-infra-ar-hi-zh
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-20
---

# Phase 73 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Non-Latin & RTL infra (ar/hi/zh): translation-pipeline output, Noto font delivery,
> logical-property/RTL conversion, and bidi-isolation of DNT tokens.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Anthropic API → repo files | ar/hi/zh strings/content produced by a locked-system-prompt translation run, written to JSON/MDX consumed at build/render | Semi-trusted machine text (no end-user input) |
| glossary.json (owner-editable) → translator system prompt | DNT/tone rules feed the translator prompt; zod-validated, fails loud | Owner-authored config |
| next/font build fetch → self-hosted asset | Noto `.woff2` fetched from Google at build time, then self-hosted under `/_next/static` | Static font binaries (no runtime 3rd-party origin) |
| content JSON → rendered HTML | Translated prose with embedded DNT price tokens crosses into React render under `dir="rtl"` | Semi-trusted text + server/DB-sourced price values |
| faqs data → FAQPage JSON-LD `<script>` | FAQ answer text serialized via `JSON.stringify` into structured data | Plain-string answer text |
| .env.local secret → i18n-translate script | `ANTHROPIC_API_KEY` read internally at run time for a local/CI translation run | Secret credential (never printed/committed) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-73-13-01 | Tampering | FAQPage JSON-LD `acceptedAnswer.text` | high | mitigate | JSON-LD source kept on the plain `interpolate()`-derived `f.a` string; the `interpolateBidi()` ReactNode is NEVER passed into `JSON.stringify`. Verified: `acceptedAnswer: { '@type': 'Answer', text: f.a }` (plain string) present, `text: f.a` across 30/30 route pages + 1 service page. | closed |
| T-73-14-02 | Tampering | FAQPage JSON-LD text field | high | mitigate | `tests/rtl-backstop.test.ts` CR-02 block asserts `text: f.a` (plain string) remains the JSON-LD source across all 30 pages — regression to a ReactNode fails the gate. Confirmed by render-test `<bdi>`-in-prose / plain-JSON-LD split (73-13/73-14). | closed |
| T-73-01 | Tampering (XSS) | rendering of translated strings/content | medium | mitigate | All translated copy rendered through React (auto-escaped) / next-intl `t`/`t.rich` fixed-tag whitelist. Only `dangerouslySetInnerHTML` in touched surfaces is the standard JSON-LD serializer (`JSON.stringify(pageSchema)` of a controlled object). No new HTML-string injection surface. | closed |
| T-73-04 | Tampering (glossary/DNT bypass) | translation pipeline verifiers | medium | mitigate | `verifyDntPreserved` + `verifyPluralCategories` run per unit; a failing unit falls back to EN and is excluded from the manifest, never silently shipped. Structural key-diff re-confirmed 0 missing keys vs en for ar/hi/zh (VERIFICATION truth 1). | closed |
| T-73-14-01 | Repudiation | `tests/rtl-backstop.test.ts` CR-02 gate | medium | mitigate | Strengthened per-field + negative assertions make a future silent regression (dropping `interpolateBidi` on the prose fields, or leaking a ReactNode into JSON-LD text) fail the gate instead of passing green (closes GAP-2 false-confidence hole). | closed |
| T-73-02 | Spoofing (RTL bidi-override) | RTL text rendering of DNT tokens | low | mitigate | `<bdi>` / `unicode-bidi: isolate` scopes each DNT run; translator prohibits emitting U+202A–U+202E / U+2066–U+2069; content leakage/DNT-verified upstream. D-11 checklist confirms prices/phone/times stay LTR & un-reversed. | closed |
| T-73-05 | Tampering (accidental content/SEO change) | route/service pages | low | mitigate | Pure `text-*` logical-axis swap; byte-parity snapshot + grep-count gates catch unintended diffs; indexable/noindex metadata untouched. | closed |
| T-73gap-11 | Information Disclosure | `scripts/i18n-translate.mjs` run | low | mitigate | `ANTHROPIC_API_KEY` read internally from `process.env`/.env.local, never printed or committed; only `messages/*.json` committed. No `sk-ant-` literal found in committed tree. | closed |
| T-73-03 | Information Disclosure | next/font Noto loaders | low | accept | Fonts self-hosted after build-time fetch (same class as existing Fraunces/Inter); no new runtime origin, no 3rd-party font-CDN preconnect. | closed |
| T-73-13-02 | Information Disclosure | `interpolateBidi` `<bdi>` render | low | accept | `interpolateBidi` builds `<bdi>` via `React.createElement` (auto-escaped); no `dangerouslySetInnerHTML` on prose sites — no injection surface. | closed |
| T-73gap-07 | Tampering | Nav.tsx / TestimonialsCarousel.tsx | low | accept | Presentational client-component direction-logic edits (inline style + key-handler direction); no new attack surface, no package install. | closed |
| T-73gap-08 | Tampering | lib/content-interpolate.ts | low | accept | Helper wraps values via `React.createElement` (auto-escaped), never string-concatenated HTML; no injection surface, no package install. | closed |
| T-73gap-09 | Tampering | route/service `page.tsx` files | low | accept | React `createElement`/JSX auto-escaped `<bdi>`; no string HTML; no package install. | closed |
| T-73gap-10 | Tampering | app/globals.css / blog page.tsx | low | accept | CSS logical-property value swaps + static-JSX re-scoping only; no input, no dependency, no injection surface. | closed |
| T-73gap-12 | Repudiation | 73-RTL-QA.md record | low | accept | Human QA pass recorded with who/when in the Harvest note; automated backstop test provides re-runnable evidence for the code-level half. | closed |
| T-73-SC | Tampering (supply chain) | npm/pip/cargo installs | low | accept | No new packages across the entire phase — verified: zero `package.json`/lockfile changes in phase-73 history. Noto loaders are first-party Next.js infra; logical utilities are core Tailwind v4. Package-legitimacy gate N/A. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `high` (workflow.security_block_on) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-73-01 | T-73-03 | Noto fonts self-hosted after build-time fetch — same delivery class as existing self-hosted Fraunces/Inter; no new runtime third-party origin. | Roman (owner) | 2026-09-20 |
| AR-73-02 | T-73-SC | No new dependencies added in the phase; loaders/utilities are first-party framework infra. | Roman (owner) | 2026-09-20 |
| AR-73-03 | T-73gap-07/08/09/10, T-73-13-02 | Presentational RTL/bidi conversions rendered via React `createElement`/JSX auto-escaping; no HTML-string injection surface introduced. | Roman (owner) | 2026-09-20 |
| AR-73-04 | T-73gap-12 | QA repudiation accepted — human walkthrough recorded with attribution + a re-runnable automated backstop for the code-level half. | Roman (owner) | 2026-09-20 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-20 | 16 | 16 | 0 | secure-phase (ASVS L1, block-on: high) — orchestrator grep-depth verification |

**Method:** Register authored at plan time across all 14 PLAN threat models (`register_authored_at_plan_time: true`). ASVS L1 short-circuit applied — grep-level mitigation verification confirmed each disposition. Both high-severity threats (FAQPage JSON-LD `text: f.a` plain-string carve-out) verified present across 30/30 route pages and guarded by the strengthened CR-02 backstop; corroborated by 73-VERIFICATION.md (truths 2 & 6) and the live render test. No new dependencies, no committed secrets.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-20
