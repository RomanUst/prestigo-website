---
phase: 70
slug: string-externalization-booking-account
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-06
---

# Phase 70 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| catalog → rendered UI | Translated strings render as auto-escaped React text nodes; `t.rich` chunks render only fixed markup (constant hrefs) | UI copy (non-sensitive) |
| client → Server Action (login) | `locale` passed from client into login actions; must be an allow-listed locale, never trusted user input | route-derived locale |
| client → Server Action (account) | `locale` passed from ProfileForm into account mutations; must be allow-listed, never FormData | route-derived locale |
| Server Action → auth/session | login/account actions perform Supabase Auth + ownership checks; only their error *strings* change | session / auth result |
| account Server Action → data (ownership) | `updateProfile`/passenger mutations enforce `user_id` from `getUser()` | user profile / passengers (PII) |
| Step5 → zod validation | Validation *messages* are display copy; the validation *rules* remain the trust control | form input |
| Step6 → Stripe Elements | Stripe's own i18n is a separate system; not routed through next-intl | payment data (Stripe-controlled) |
| EXTRAS_CONFIG (data) → UI vs email | Same data array feeds translatable UI + English-only email; they diverge without editing the shared file | UI copy vs transactional email |
| analytics params → GA4/Meta | Event identifiers are a third-party reporting contract, not user copy | event names |
| build pipeline → 7 locale subpaths | Each locale catalog must resolve every key or the build throws MISSING_MESSAGE | build integrity |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-70-01-01 | Information Disclosure | messages/en.json (EntryBar) | low | mitigate | Only visible UI literals moved; no secret/token/PII in catalog | closed |
| T-70-01-02 | Tampering | messages/{6 locales}.json | low | mitigate | Stub re-sync keeps locales byte-identical to EN; `cmp` guard fails on drift | closed |
| T-70-01-03 | Denial of Service | build (7 subpaths) | low | accept | Missing key surfaces as build-time MISSING_MESSAGE, caught by wave gate | closed |
| T-70-02-01 | Spoofing / Tampering | locale param → login action | medium | mitigate | `locale` from `useLocale()` bound via `.bind(null, locale)`; never FormData (verified) | closed |
| T-70-02-02 | Elevation of Privilege | safeReturnTo() open-redirect guard | high | mitigate | `safeReturnTo()`/`auth-helpers.ts` untouched; guard present + used in login/actions.ts + callback (verified) | closed |
| T-70-02-03 | Repudiation | localized error rendering | low | mitigate | `login-actions.test.ts` asserts exact EN text; stub-sync resolves non-EN keys | closed |
| T-70-02-04 | Information Disclosure | Errors namespace | low | mitigate | Only generic error copy externalized; no exception detail/token/PII | closed |
| T-70-03-01 | Tampering | TripTypeTabs label split | low | mitigate | Only `label` moves; `kind`/`value`/`href` routing stays in code | closed |
| T-70-03-02 | Information Disclosure | messages/en.json (aria) | low | mitigate | Interpolated aria args are addresses already on screen; escaped text nodes | closed |
| T-70-03-03 | Denial of Service | 7-locale build | low | accept | Missing key = build-time MISSING_MESSAGE; stub-sync + cmp guard | closed |
| T-70-04-01 | Tampering | duplicated vehicle-class labels | low | mitigate | Consolidated to one catalog entry; negative grep + phase gate assert no residual local map | closed |
| T-70-04-02 | Information Disclosure | messages/en.json (labels) | low | mitigate | Only class labels + alt text move; pricing/image data stays in code | closed |
| T-70-04-03 | Denial of Service | 7-locale build | low | accept | Missing key = build-time MISSING_MESSAGE; stub-sync guard | closed |
| T-70-05-01 | Tampering | lib/extras.ts email coupling | medium | mitigate | UI reads from catalog by key; data file untouched (git diff empty), emails keep EN copy | closed |
| T-70-05-02 | Tampering | GA4/Meta event params | low | mitigate | Analytics identifier grep asserts event names unchanged | closed |
| T-70-05-03 | Information Disclosure | messages/en.json (extras) | low | mitigate | Only visible copy moves; pricing numbers/config flags stay in code | closed |
| T-70-06-01 | Tampering | Step5 zod validation | medium | mitigate | Only message arg changes; `.min/.email/.refine` predicates intact (verified) | closed |
| T-70-06-02 | Tampering | Step2 t.rich WhatsApp link | low | mitigate | href is a hard-coded constant (`wa.me/420725986855`); catalog edit cannot redirect (verified) | closed |
| T-70-06-03 | Information Disclosure | Step6 payment copy | low | mitigate | Only static payment-UI labels move; no card/PII/Stripe key; Elements Stripe-controlled | closed |
| T-70-07-01 | Spoofing / Elevation of Privilege | Step3Auth Supabase calls | low | mitigate | Only string literals change; auth control flow untouched (summary + tests) | closed |
| T-70-07-02 | Information Disclosure | Auth.inWizard namespace | low | mitigate | Only visible auth-form copy externalized; no token/session/PII | closed |
| T-70-07-03 | Denial of Service | 7-locale build | low | accept | Missing key = build-time MISSING_MESSAGE; stub-sync guard | closed |
| T-70-08-01 | Spoofing / Tampering | locale param → account actions | medium | mitigate | `locale` bound from `useLocale()`, never FormData (verified: no `formData.get('locale')`) | closed |
| T-70-08-02 | Elevation of Privilege | account/actions.ts ownership | high | mitigate | `getUser()`-derived `user_id` ownership at all 4 mutation sites intact; passing IDOR/mass-assignment tests (verified) | closed |
| T-70-08-03 | Repudiation | localized error rendering | low | mitigate | profile/passenger tests assert exact EN text; stub-sync resolves non-EN keys | closed |
| T-70-08-04 | Information Disclosure | Account/Errors namespaces | low | mitigate | Only visible copy externalized; no profile PII/token/session detail | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-70-01 | T-70-01-03, T-70-03-03, T-70-04-03, T-70-07-03 | Build-time DoS: a missing locale key surfaces deterministically as a `MISSING_MESSAGE` build failure (caught by the wave gate before ship), never a runtime outage. Stub re-sync + `cmp` guard keep all 7 locales byte-identical to EN. | Roman (phase owner) | 2026-09-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-06 | 26 | 26 | 0 | gsd-secure-phase (L1, ASVS-1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-06
