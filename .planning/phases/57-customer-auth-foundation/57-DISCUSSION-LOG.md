# Phase 57: Customer Auth Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 57-customer-auth-foundation
**Areas discussed:** Email sign-in method, Account type (personal/corporate), Routes and post-login landing, Admin/customer separation + sign-out

---

## Email sign-in method

| Option | Description | Selected |
|--------|-------------|----------|
| Только magic-link | Passwordless link to email; simplest, no password storage/reset | |
| Magic-link + пароль (опционально) | Magic-link primary, password also allowed; needs reset flow | ✓ |
| Только пароль | Classic email+password; familiar but needs reset + email verify | |

**User's choice:** Magic-link + optional password
**Notes:** Implies password reset flow and email confirmation must be included (D-02).

---

## Account type (personal / corporate)

| Option | Description | Selected |
|--------|-------------|----------|
| При регистрации; default personal | Email reg asks type; OAuth defaults personal, changeable later | ✓ |
| Всегда спрашивать после OAuth | Post-OAuth onboarding screen to pick type | |
| Только personal сейчас | All personal now; would narrow AUTH-04 scope | |

**User's choice:** At registration; default personal (OAuth → personal, changeable later)
**Notes:** No blocking onboarding interstitial in this phase (D-03, D-04).

### Corporate fields in customer_profiles

| Option | Description | Selected |
|--------|-------------|----------|
| Минимум: название компании | account_type + company_name (nullable) only | ✓ |
| Название + IČO/VAT | Adds company_vat/ico for earlier B2B billing | |
| Базовый профиль: full_name + phone | Adds shared profile fields for booking auto-fill | |

**User's choice:** Minimal — account_type + company_name
**Notes:** IČO/VAT/billing deferred to later phase (D-05).

---

## Routes and post-login landing

| Option | Description | Selected |
|--------|-------------|----------|
| /login + /account/* | Separate /login, protected /account/*; admin unchanged | ✓ |
| /account/login + /account/* | Everything under /account incl. login | |
| /signin + /account/* | Same as first but "signin" wording | |

**User's choice:** /login + /account/* (D-07)

### Post-login landing

| Option | Description | Selected |
|--------|-------------|----------|
| На страницу, с которой начал (return-to) | Return to originating URL, else /account | ✓ |
| Всегда на /account | Always account dashboard | |
| На главную (/) | Home with logged-in header state | |

**User's choice:** Return-to, fallback /account (D-08)

---

## Admin / customer separation + sign-out

### Logged-in customer hits /admin

| Option | Description | Selected |
|--------|-------------|----------|
| Middleware редиректит на / | Non-admin user on /admin/* → redirect home | ✓ |
| Оставить как есть (403 от getAdminUser) | Middleware passes any user; server returns bare 403 | |
| Middleware редиректит на /account | Non-admin user on /admin/* → their account | |

**User's choice:** Middleware redirects non-admin users from /admin/* to / (D-11)

### Sign-out surface

| Option | Description | Selected |
|--------|-------------|----------|
| Меню аккаунта в хедере + /account | Header account menu + /account sign-out, full session clear | ✓ |
| Только внутри /account | Sign-out only inside account pages | |

**User's choice:** Header account menu + /account
**Notes:** Full header nav is Phase 58 (NAV); authoritative sign-out surface that must work this phase is /account. Header affordance can be minimal (D-13, D-14).

---

## Claude's Discretion

- Form layout/copy for /login and registration (UI-SPEC to refine)
- Browser Supabase client setup and server-action vs client-call sign-in
- OAuth callback route name and return-to param name
- account_type as Postgres enum vs checked text
- Email template wording

## Deferred Ideas

- Corporate billing fields (IČO/VAT, billing address) — later B2B phase
- Post-OAuth account-type onboarding interstitial
- Full account-aware header nav — Phase 58 (NAV)
- "My bookings" view / booking auto-fill from profile — later booking-account phase
