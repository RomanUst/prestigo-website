# Deferred Items — Phase 71

Out-of-scope discoveries logged during plan execution (not auto-fixed per
deviation-rules scope boundary — pre-existing, unrelated to the current
task's changes).

## Worktree-local node_modules deficiency breaks 5 pre-existing test files

**Found during:** 71-01, Task 3 (full-suite verification run)

**Files affected (pre-existing, last touched Phase 70-08, untouched by 71-01):**
- `tests/account-trips.test.tsx`
- `tests/auth-customer.test.ts`
- `tests/login-actions.test.ts`
- `tests/passenger-actions.test.ts`
- `tests/profile-actions.test.ts`

**Issue:** These tests redirect `next-intl/server` to the real
`server.react-server.js` build via a literal relative path
(`'../node_modules/next-intl/dist/esm/development/server.react-server.js'`).
This git worktree's own `node_modules/` is a near-empty stub (only a `.vite`
cache directory) — real dependencies resolve only via Node's upward
directory-walk for bare specifiers (landing on the main checkout's
`node_modules` several levels up), which a literal relative path does not
do. The same 5 files fail identically on `main` if `node_modules` there were
similarly stubbed; this is an execution-environment gap, not a regression
introduced by Phase 71.

**Why not fixed here:** Out of scope per the deviation-rules scope boundary —
these files are unrelated to the 71-01 plan's `files_modified` list, and the
fix (repopulating `node_modules` or reworking the relative-path convention)
is an infrastructure concern for a different task, not this content-model
plan.

**Workaround used in 71-01's own new test** (`tests/route-page-render.test.tsx`):
mocked `getLocale`/`getTranslations` directly against the real
`messages/en.json` (plain string/nested-key lookup) instead of redirecting
to the real react-server build — sufficient fidelity for byte-parity
purposes since the `RoutePage` namespace uses no ICU features, and avoids
the fragile relative-path dependency entirely.

**Verification that this is pre-existing:** `git log --oneline -1 -- <files>`
returns `b8185e7 test(70-08): phase gate — account tests + resync stubs` —
last touched in Phase 70-08, before Phase 71 began.
