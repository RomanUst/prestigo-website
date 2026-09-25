# Phase 75: E2E Verification & Launch - Discussion Log

> Human reference only. Decisions are captured in 75-CONTEXT.md.

**Date:** 2026-09-24
**Areas discussed:** Per-locale booking, EN-leak audit, Locale in analytics, E2E format & launch

## Per-locale booking
| Question | Options | Selected |
|---|---|---|
| Depth | Up to payment form / 1 real payment + refund / real payment ×7 | Up to payment form |
| Environment | Production / local dev / both | Production |
| Post-booking language | Record current state / email must be localized | Record current state |
| Test rows | Marker + delete after / marker keep / stop before DB write | Marker + delete after |
| Guest vs account | Guest ×7 + account in 1–2 / guest only / both ×7 | Guest ×7, account RU+AR |

## EN-leak audit
| Question | Options | Selected |
|---|---|---|
| Method | Static + rendered / rendered only / manual screenshots | Static + rendered |
| Surfaces | Visible text / errors-placeholders-aria / meta-JSON-LD / Stripe+Maps | All four |
| Translation | In-session + freeze manifest / in-session only / wait for API credit | In-session + freeze manifest |
| Intentional fallback | Allowlist (fix hi headings) / translate everything | Allowlist |

## Locale in analytics
| Question | Options | Selected |
|---|---|---|
| GA4 | site_locale param + custom dimension / user property / both | site_locale + custom dimension |
| Server events | Yes via booking / client only | Yes via booking |
| Meta | custom_data.site_locale / leave Meta | custom_data.site_locale |

## E2E format & launch
| Question | Options | Selected |
|---|---|---|
| Format | QA scripts + report / Playwright in CI / one-off browser pass | QA scripts + report |
| Launch | GSC / Rich Results + hreflang / milestone close / announcement / Other | GSC, Rich Results + hreflang, milestone close, announcement ("Other" ticked with no text — treated as none) |
| Baseline | v3.0-touched files / full suite | v3.0-touched files |

## Claude's Discretion
Script structure, static-scan heuristics, where booking locale is persisted, site_locale injection mechanics, plan breakdown.

## Deferred Ideas
Localized client emails; Playwright in CI; translating all blog posts; extra locales.
