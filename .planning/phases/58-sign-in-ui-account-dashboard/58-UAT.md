---
status: complete
phase: 58-sign-in-ui-account-dashboard
source: [58-01-SUMMARY.md, 58-02-SUMMARY.md, 58-03-SUMMARY.md, 58-04-SUMMARY.md, 58-05-SUMMARY.md, 58-REVIEW-FIX.md]
started: 2026-06-16T04:37:32Z
updated: 2026-06-16T07:55:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server, clear ephemeral state, start fresh. Server boots without errors and the homepage loads with live data.
result: pass

### 2. Guest sees "Sign in" in Nav
expected: While signed out, the Nav (desktop and mobile) shows a "Sign in" link pointing to /login, next to "Book now". No account dropdown is visible.
result: pass
note: "Initial run hit a local-env issue (.env.local was missing NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY, causing a 500). Fixed by adding both keys from the rideprestigo Supabase project; not a phase 58 code bug. User confirmed pass after fix."

### 3. Signed-in user sees account dropdown (no flash)
expected: After signing in, the Nav immediately shows an account trigger button (avatar circle + chevron) instead of "Sign in" — no flash of "Sign in" before the dropdown appears, even on a fresh page load.
result: pass
note: "Hit two real bugs while testing, both fixed: (1) CSP blocked all local dev JS hydration site-wide (middleware.ts fix), (2) /account, /account/trips, /account/profile, /login were missing <Nav /> entirely (added to all four). User confirmed via screenshot: avatar circle 'U' + chevron visible in Nav on /account, no Sign in flash."

### 4. Account dropdown menu — open, navigate, sign out
expected: Clicking the account trigger opens a dropdown with "My trips", "Profile", and "Sign out". Arrow Down/Up move focus between items, Home/End jump to first/last. Clicking "Sign out" signs the user out and returns "Sign in" to the Nav.
result: pass

### 5. Account overview page
expected: Navigating to /account shows "My Account" heading, "Signed in as {email}", and two cards — "My Trips" (View trips → /account/trips) and "Profile" (Edit profile → /account/profile).
result: pass

### 6. Trips empty state
expected: Navigating to /account/trips shows a "No trips yet" empty state with body text and a "Book a transfer" button linking to /book. No trip data is queried or shown (this is expected — trip history ships in a later phase).
result: pass

### 7. Edit profile (personal account)
expected: On /account/profile, editing full name and phone and saving persists the change — reloading the page shows the updated values. Email is shown read-only with "Email cannot be changed here."
result: pass

### 8. Switch to corporate account type
expected: Toggling the account type to "Corporate" reveals Company name / IČO / DIČ-VAT fields. Filling them in and saving persists the corporate fields; switching back to "Personal" hides them again.
result: pass

### 9. Saved passengers — add, edit, set default, delete
expected: On /account/profile, adding a passenger (name + phone) shows it in the list. Editing it updates the displayed values. Marking it "default" shows a "Default" badge and unmarks any previous default. Deleting it (with confirmation) removes it from the list.
result: pass

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0

## Gaps

- truth: "Login page buttons (Google, Apple, send link, create account) should respond to clicks"
  status: fixed
  reason: |
    User reported: "на странице не работают кнопки ни гугл ни апл ни просто отправить ссылку ни создать аккаунт"
    Root cause: middleware.ts buildCspStatic()/buildCsp() dev-mode script-src only allowed
    'unsafe-inline' 'unsafe-eval' https: — with no 'self' and no http: scheme. Next.js dev
    (npm run dev) serves all JS chunks over http://localhost, which doesn't match the https:
    scheme-source, so script-src-elem blocked every external <script src> tag. This broke
    React hydration completely in local dev across the whole site (not just /login) — buttons
    rendered from SSR HTML but had zero attached event handlers. Pre-existing bug from the CSP
    nonce work, unrelated to phase 58 code; phase 58 just happened to be the first feature that
    needed real client interactivity tested locally after that CSP landed.
  severity: blocker
  fix: "Added 'self' to the development-only script-src branches in both buildCsp() and buildCspStatic() in middleware.ts. Production CSP unchanged (scripts are same-origin https there too, so 'self' would be safe to add but wasn't necessary to fix the bug)."
  artifacts: [middleware.ts]
  verified: "Confirmed tab-switch (Send a link / Use password) now works via direct DOM click — pure client state change, no network involved. Confirmed Google OAuth button now reaches Supabase SDK and resolves a valid authorize URL (was previously silently doing nothing pre-fix)."
  note: "A second, separate confound during testing: the cookie-consent modal ('Welcome aboard') intercepts clicks until dismissed — this is expected behavior, not a bug, but worth knowing about when testing in a fresh browser session."

- truth: "Nav (with account dropdown) should be visible on /account, /account/trips, /account/profile, and /login"
  status: fixed
  reason: |
    Discovered while verifying test 3: user's screenshot of /account showed no navigation bar
    at all — page started directly at the "My Account" heading. grep confirmed none of
    app/account/page.tsx, app/account/trips/page.tsx, app/account/profile/page.tsx, or
    app/login/page.tsx imported <Nav />, unlike every marketing page (services, fleet, routes,
    etc.) which all render <Nav /> explicitly (root layout.tsx intentionally has no Nav — see
    D-09 comment about static rendering). Phase 58 added these four pages without including
    the Nav component, so the NAV-01/NAV-02 dropdown had nowhere to render on the very pages
    where signed-in users land most.
  severity: blocker
  fix: "Added `import Nav from '@/components/Nav'` and `<Nav />` to all four pages, matching the existing marketing-page pattern (Nav is position:fixed so it's safe as a non-wrapping sibling)."
  artifacts: [app/account/page.tsx, app/account/trips/page.tsx, app/account/profile/page.tsx, app/login/page.tsx]
  verified: "Confirmed via screenshot: /login now renders the full Nav bar (Services/Fleet/Routes/.../Sign in/Book now) above the login card, with no console or server errors. Also fixed an unrelated pre-existing TS error in components/account/ProfileForm.tsx (PassengerEditorProps had the wrong type for addAction/updateAction — useActionState dispatch is (formData) => void, not the action signature itself); npx tsc --noEmit is now clean."
