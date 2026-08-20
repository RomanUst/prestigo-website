---
phase: 58-sign-in-ui-account-dashboard
reviewed: 2026-06-12T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - components/Nav.tsx
  - app/account/page.tsx
  - app/account/trips/page.tsx
  - app/account/actions.ts
  - app/account/profile/page.tsx
  - components/account/ProfileForm.tsx
  - tests/nav-auth.test.tsx
  - tests/account-trips.test.tsx
  - tests/profile-actions.test.ts
  - tests/passenger-actions.test.ts
  - supabase/migrations/047_customer_profiles_profile_fields.sql
  - supabase/migrations/048_saved_passengers.sql
findings:
  critical: 3
  warning: 6
  info: 3
  total: 12
status: issues_found
---

# Phase 58: Code Review Report

**Reviewed:** 2026-06-12
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 58 delivers the auth-aware Nav, account dashboard pages, profile/passenger server actions, and supporting DB migrations. The security posture for the server actions is generally sound: ownership is derived from the session exclusively, fields are extracted by name, and RLS + application-layer `.eq('user_id', user.id)` provide defence-in-depth. The middleware auth gate is correctly wired. However, three blockers must be addressed before ship: an unchecked `account_type` input that can corrupt the DB constraint, a silent no-op on `updateProfile` when the `customer_profiles` row does not yet exist, and a `PassengerEditor` component defined inside the render function that causes React to remount it on every render (state loss and flash). Several ARIA/accessibility gaps were found in the Nav dropdown, plus a missing input validation layer and notable test coverage gaps.

---

## Critical Issues

### CR-01: `account_type` field accepted without server-side validation — DB CHECK constraint breach possible

**File:** `app/account/actions.ts:34`

**Issue:** `account_type` is read directly from `FormData` as a raw string and passed straight to Postgres. The `customer_profiles` table has `CHECK (account_type IN ('personal', 'corporate'))`. Any client that forges a FormData payload (e.g. via `fetch`) with `account_type = 'evil'` will trigger a Postgres CHECK violation. Currently this surfaces as the generic `"Something went wrong."` error, but more critically: if RLS ever allows the write (or if the CHECK constraint is accidentally dropped in a future migration), arbitrary values would be persisted. The server action is the last line of defence for data integrity — it must validate the enum before touching the DB.

**Fix:**
```typescript
// app/account/actions.ts, after reading account_type
const VALID_ACCOUNT_TYPES = ['personal', 'corporate'] as const
type AccountType = typeof VALID_ACCOUNT_TYPES[number]

const raw_account_type = formData.get('account_type') as string
if (!VALID_ACCOUNT_TYPES.includes(raw_account_type as AccountType)) {
  return { error: 'Invalid account type.' }
}
const account_type: AccountType = raw_account_type as AccountType
```

---

### CR-02: `updateProfile` silently succeeds when no `customer_profiles` row exists (IDOR-adjacent silent no-op)

**File:** `app/account/actions.ts:39-44`

**Issue:** The action uses `.update(...).eq('user_id', user.id)`. If the authenticated user has no `customer_profiles` row — possible for users created before migration 044 ran, or in test environments where the trigger that creates the row failed — Supabase/PostgREST returns `{ error: null, count: 0 }` (no rows matched). The action inspects only `error`, not `count`, so it returns `{ success: true }` even though zero rows were written. The user sees "Changes saved." but nothing persisted.

**Fix:**
```typescript
const { error, count } = await supabase
  .from('customer_profiles')
  .update({ full_name, phone, account_type, company_name, ico, vat_id })
  .eq('user_id', user.id)

if (error) return { error: 'Something went wrong. Please try again.' }
if (count === 0) {
  // Row doesn't exist yet — upsert or return a specific error
  const { error: insertError } = await supabase
    .from('customer_profiles')
    .insert({ user_id: user.id, full_name, phone, account_type, company_name, ico, vat_id })
  if (insertError) return { error: 'Something went wrong. Please try again.' }
}
```
Alternatively, replace `.update()` with `.upsert()` using `onConflict: 'user_id'`.

---

### CR-03: `PassengerEditor` defined as a nested function inside the render — React remounts on every render

**File:** `components/account/ProfileForm.tsx:107-239`

**Issue:** `PassengerEditor` is declared as a plain function inside the body of `ProfileForm`. React uses referential identity to compare component types between renders: because `PassengerEditor` is re-created on every render of `ProfileForm`, React treats it as a new component type every time and unmounts/remounts the entire sub-tree. Consequences:
1. Any uncontrolled input values (name, phone) are wiped if the parent re-renders while the editor is open (e.g. when `deletePending` flips).
2. `useActionState` for `addAction`/`updateAction` resets to `null` on every remount, causing success/error messages to flash and disappear.
3. Focus is lost, breaking keyboard navigation.

**Fix:** Hoist `PassengerEditor` to module scope and pass the required state/actions as props:

```typescript
// Hoist to module level, outside ProfileForm
interface PassengerEditorProps {
  editingId: string | null
  editingPassenger: SavedPassenger | undefined
  addAction: (...args: Parameters<typeof addPassenger>) => void
  updateAction: (...args: Parameters<typeof updatePassenger>) => void
  addPending: boolean
  updatePending: boolean
  addState: { error?: string; success?: boolean } | null
  updateState: { error?: string; success?: boolean } | null
  onCancel: () => void
}

function PassengerEditor({ editingId, editingPassenger, ... }: PassengerEditorProps) {
  // ... same JSX
}
```

---

## Warnings

### WR-01: Nav dropdown missing `aria-controls` link between trigger button and menu panel

**File:** `components/Nav.tsx:130-131`

**Issue:** The account trigger `<button>` has `aria-expanded` but no `aria-controls` pointing to the dropdown's `id`. Without `aria-controls`, screen readers cannot jump programmatically from the trigger to the menu panel. The `role="menu"` `<div>` at line 175 also has no `id` attribute.

**Fix:**
```tsx
// Trigger button:
<button
  id="account-menu-trigger"
  aria-controls="account-menu"
  aria-haspopup="true"
  aria-expanded={menuOpen}
  ...
>

// Dropdown panel:
<div
  id="account-menu"
  role="menu"
  aria-labelledby="account-menu-trigger"
  ...
>
```

---

### WR-02: Dropdown menu items not keyboard-navigable with arrow keys — only Tab works

**File:** `components/Nav.tsx:192-285`

**Issue:** The `role="menu"` container has `<Link>` elements with `role="menuitem"` but no `onKeyDown` handler to support arrow-key navigation (Up/Down) or Home/End. ARIA authoring practices for the `menu` role require that arrow keys move focus between `menuitem` elements. Currently, pressing Down from the trigger does nothing; only Tab cycles through items. This fails WCAG 2.1 SC 2.1.1 (keyboard) and the ARIA menu button pattern.

**Fix:** Add a `keydown` handler on the menu container that intercepts ArrowUp/ArrowDown and moves focus via `querySelectorAll('[role="menuitem"]')` + `.focus()`. Alternatively, change `role="menu"` to `role="list"` (removing the arrow-key obligation) if the dropdown is not intended to be a true ARIA menu.

---

### WR-03: `is_default` checkbox value is only submitted when checked — unchecking sends `null` not `"false"`, causing incorrect `is_default=false` reads

**File:** `components/account/ProfileForm.tsx:186-201`, `app/account/actions.ts:80,142`

**Issue:** The checkbox uses `value="true"`. When unchecked, HTML forms do not include the field in the submission at all. The server action reads `formData.get('is_default') === 'true'`, which correctly evaluates to `false` when the field is absent. **This is actually correct for `addPassenger`.** However for `updatePassenger` the same pattern is used — and if a user edits an existing default passenger (checking the box is pre-checked) and submits without changing it, the value is `"true"`, which is correct. But if a user edits a non-default passenger and leaves the box unchecked, the absent field resolves to `false`, also correct. The real risk is UX confusion: if the user opens an edit form for a default passenger and the browser pre-checks the box from `defaultChecked`, then immediately submits (without the user ever touching the checkbox), the field is submitted as `"true"` and triggers the "clear other defaults first" branch unnecessarily, causing N extra DB writes per edit. This is a minor correctness/efficiency concern but worth documenting. The deeper issue is that `defaultChecked` on an uncontrolled input is correct, but for edit mode the value reflects the initial state regardless of what the user did — this is standard HTML, but worth verifying with an explicit hidden field fallback.

**Fix:** Add a hidden sentinel field to guarantee `is_default` is always present in FormData:
```tsx
{/* Ensures is_default is always in FormData, even when checkbox is unchecked */}
<input type="hidden" name="is_default" value="false" />
<input
  id="pax-default"
  name="is_default"
  type="checkbox"
  value="true"
  defaultChecked={editingPassenger?.is_default ?? false}
/>
```
HTML uses the last value for duplicate names when `value="true"` overrides `value="false"` on check; when unchecked only `"false"` is submitted. This makes the intent explicit.

---

### WR-04: Profile page passes `passengers` from `SELECT *` — over-fetches columns, exposes all internal fields to client component

**File:** `app/account/profile/page.tsx:18-23`

**Issue:** The `saved_passengers` query uses `.select('*')`, which includes internal columns (`created_at`, `updated_at`, `user_id`) that are serialised and sent to the client component as props. `user_id` in particular is a UUID that is then rendered into the DOM (inside passenger rows) and visible in RSC payloads. This is not a direct IDOR but unnecessarily leaks the user UUID to the client.

**Fix:**
```typescript
supabase
  .from('saved_passengers')
  .select('id, full_name, phone, email, notes, is_default')
  .eq('user_id', user!.id)
  .order('created_at', { ascending: true }),
```

---

### WR-05: `addPassenger` / `updatePassenger` do not validate that `full_name` and `phone` are non-empty strings

**File:** `app/account/actions.ts:76-77, 138-139`

**Issue:** Both actions cast `formData.get('full_name')` and `formData.get('phone')` directly to `string` without checking for empty or whitespace-only values. A caller that submits blank `full_name=""` bypasses the HTML `required` attribute (which is not enforced server-side) and inserts a row with an empty string name into `saved_passengers`, which violates the application contract even though the DB column is just `TEXT NOT NULL` (empty string satisfies the constraint).

**Fix:**
```typescript
const full_name = (formData.get('full_name') as string).trim()
const phone = (formData.get('phone') as string).trim()

if (!full_name) return { error: 'Full name is required.' }
if (!phone) return { error: 'Phone number is required.' }
```

---

### WR-06: Nav initial auth state is always `null` — causes "Sign in" flash for authenticated users on every page load

**File:** `components/Nav.tsx:13, 35-45`

**Issue:** `user` state initialises to `null`. The `onAuthStateChange` subscription fires asynchronously after mount. On every page load, an authenticated user will see the "Sign in" button render first for one frame (or more) before the subscription callback fires and switches to the account trigger. On slow connections this flash can persist for hundreds of milliseconds.

**Fix:** Call `supabase.auth.getSession()` synchronously in a `useMemo` or use an initial `getUser()` call in a second `useEffect` that runs concurrently with the subscription setup:

```typescript
useEffect(() => {
  let active = true
  // Eagerly resolve the current session to avoid Sign in flash
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (active) setUser(user)
  })
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!active) return
    setUser(session?.user ?? null)
  })
  return () => {
    active = false
    sub.subscription.unsubscribe()
  }
}, [supabase])
```

---

## Info

### IN-01: Nav mobile menu does not render auth affordances when burger is closed — creates a brief state gap

**File:** `components/Nav.tsx:350`

**Issue:** The mobile auth affordances (`My trips`, `Profile`, `Sign out`) are rendered with the condition `user ? open ? (...) : null`. This means a signed-in user who never opens the burger menu never sees any mobile auth UI. This is intentional per the comment, but means that a screen reader navigating sequentially through the DOM (without opening the menu) will skip the account links entirely. The desktop dropdown is available, but on narrow viewports only the burger menu is visible. Consider adding a visually-hidden "Account" link that is always in the DOM for screen reader users.

---

### IN-02: `profile-actions.test.ts` mock chain does not call two `.eq()` calls — test for ownership scoping is insufficiently strict

**File:** `tests/profile-actions.test.ts:25-30`

**Issue:** The `mockEq` in `profile-actions.test.ts` is a single function that returns `{ error: null }` directly. The `updateProfile` action calls `.update({...}).eq('user_id', user.id)` — only one `.eq()`. The test at line 150 verifies `mockEq` was called with `('user_id', 'session-user-uuid')`, which is correct. However if a future change added a second `.eq()` call (e.g. to also scope by `id`), the current mock would break silently because `mockEq` is not chained. This is a fragility issue, not a current bug. The `passenger-actions.test.ts` correctly handles multi-`.eq()` chains with the `mockEqDelete`/`mockEqUpdate` approach — the profile test should be updated to match.

---

### IN-03: Commented-out `onSubmit` handler body in `PassengerEditor`

**File:** `components/account/ProfileForm.tsx:121-123`

**Issue:** The `onSubmit` prop contains an empty comment block:
```tsx
onSubmit={() => {
  // Close editor on successful save (state reset handled by action)
}}
```
This is dead code — the handler does nothing. The comment suggests the editor was originally planned to close on submit, but this logic was never implemented (the editor stays open after a successful save; the user must click Cancel). Either implement the close-on-success behaviour or remove the handler entirely.

**Fix:** Remove the `onSubmit` prop if no behaviour is needed. If auto-close is desired, use a `useEffect` that watches the action state:
```typescript
useEffect(() => {
  if (editingId ? updateState?.success : addState?.success) {
    setEditorOpen(false)
    setEditingId(null)
  }
}, [editingId, updateState, addState])
```

---

_Reviewed: 2026-06-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
