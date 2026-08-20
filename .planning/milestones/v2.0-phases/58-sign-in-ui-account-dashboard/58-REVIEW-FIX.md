---
phase: 58-sign-in-ui-account-dashboard
fixed_at: 2026-06-15T23:06:00Z
review_path: .planning/phases/58-sign-in-ui-account-dashboard/58-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 58: Code Review Fix Report

**Fixed at:** 2026-06-15T23:06:00Z
**Source review:** .planning/phases/58-sign-in-ui-account-dashboard/58-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (3 Critical, 6 Warning; IN-02 skipped per scope=critical_warning)
- Fixed: 9
- Skipped: 0

## Fixed Issues

### CR-01: `account_type` field accepted without server-side validation

**Files modified:** `app/account/actions.ts`
**Commit:** 33af307
**Applied fix:** Added `VALID_ACCOUNT_TYPES = ['personal', 'corporate'] as const` and `AccountType` type at module scope. After reading `account_type` from FormData, validate it against the allowlist and return `{ error: 'Invalid account type.' }` for any value outside the set. The validated value is then typed as `AccountType` before being passed to the DB.

---

### CR-02: `updateProfile` silently no-ops when no profile row exists

**Files modified:** `app/account/actions.ts`
**Commit:** 33af307
**Applied fix:** Replaced `.update({...}).eq('user_id', user.id)` with `.upsert({ user_id: user.id, ...fields }, { onConflict: 'user_id' })`. This handles both insert (new user, no profile row) and update (existing row) in a single call, eliminating the silent no-op.

---

### CR-03: `PassengerEditor` nested inside render — React remounts on every render

**Files modified:** `components/account/ProfileForm.tsx`
**Commit:** c0e72b9
**Applied fix:** Hoisted `PassengerEditor` to module scope (before `ProfileForm`). Added `PassengerEditorProps` interface with all previously-closed-over values passed explicitly as props (`editingId`, `editingPassenger`, `addAction`, `updateAction`, `addPending`, `updatePending`, `addState`, `updateState`, `onCancel`). The Cancel button's `onClick` now calls `onCancel` prop instead of directly calling `setEditorOpen`/`setEditingId`. `SavedPassenger` type narrowed to `Pick` of only UI-relevant columns (aligns with WR-04).

---

### WR-01: Nav dropdown missing `aria-controls` link between trigger and panel

**Files modified:** `components/Nav.tsx`
**Commit:** d71c542
**Applied fix:** Added `id="account-menu-trigger"`, `aria-haspopup="true"`, and `aria-controls="account-menu"` to the trigger button. Added `id="account-menu"` and `aria-labelledby="account-menu-trigger"` to the dropdown `div[role="menu"]`.

---

### WR-02: Dropdown menu not keyboard-navigable with arrow keys

**Files modified:** `components/Nav.tsx`
**Commit:** d71c542
**Applied fix:** Added `handleMenuKeyDown` function above the return statement. It queries all `[role="menuitem"]` elements within `dropdownRef`, finds the current focused index, and moves focus with ArrowDown (next), ArrowUp (previous), Home (first), End (last). Wired to the dropdown div via `onKeyDown={handleMenuKeyDown}`.

---

### WR-03: `is_default` checkbox sends nothing when unchecked

**Files modified:** `components/account/ProfileForm.tsx`
**Commit:** c0e72b9
**Applied fix:** Added `<input type="hidden" name="is_default" value="false" />` immediately before the checkbox. When unchecked, only `"false"` is submitted; when checked, `"true"` (from the checkbox `value`) overrides it per HTML form-submission spec. Intent is now explicit and the server action always receives the field.

---

### WR-04: Profile page over-fetches with `SELECT *` for saved_passengers

**Files modified:** `app/account/profile/page.tsx`
**Commit:** edd0592
**Applied fix:** Changed `.select('*')` to `.select('id, full_name, phone, email, notes, is_default')`. Removes `user_id`, `created_at`, and `updated_at` from the RSC payload and client component props.

---

### WR-05: `addPassenger`/`updatePassenger` accept empty `full_name` and `phone`

**Files modified:** `app/account/actions.ts`
**Commit:** 33af307
**Applied fix:** In both `addPassenger` and `updatePassenger`, changed the raw cast to `.trim()` calls and added early-return guards: `if (!full_name) return { error: 'Full name is required.' }` and `if (!phone) return { error: 'Phone number is required.' }`. This enforces validation server-side regardless of whether the caller is a browser (with HTML `required`) or a programmatic fetch.

---

### WR-06: Nav "Sign in" flashes on load for authenticated users

**Files modified:** `components/Nav.tsx`
**Commit:** d71c542
**Applied fix:** Added `supabase.auth.getUser().then(({ data: { user } }) => { if (active) setUser(user) })` at the start of the auth `useEffect`, before the `onAuthStateChange` subscription. This reads from the local session cache synchronously (no network round-trip in most cases) and populates `user` state before `onAuthStateChange` fires, eliminating the flash.

---

### IN-03: Dead `onSubmit` handler in `PassengerEditor`

**Files modified:** `components/account/ProfileForm.tsx`
**Commit:** c0e72b9
**Applied fix:** Removed the empty `onSubmit={() => { // Close editor on successful save }}` prop from the `<form>` element. The form now relies solely on the `action` prop (Server Action) for submission handling.

---

## Skipped Issues

None — all 9 in-scope findings were fixed.

---

_Fixed: 2026-06-15T23:06:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
