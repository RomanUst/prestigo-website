---
phase: 94-driver-cabinet
plan: 04
subsystem: admin
tags: [driver-cabinet, admin, invite, disable, plate, email]
requires:
  - "94-01: drivers.cabinet_enabled / cabinet_invited_at / vehicle_plate, driver_sessions / driver_login_codes / driver_push_subscriptions, getDriverSession, createFakeDriverCabinetDb"
provides:
  - "POST /api/admin/drivers/[id]/cabinet { action: invite | enable | disable }"
  - "lib/email.ts: buildDriverCabinetInviteHtml, sendDriverCabinetInviteEmail"
  - "vehicle_plate on POST /api/admin/drivers and PATCH /api/admin/drivers/[id]"
  - "components/admin/DriverCabinetCell.tsx: DriverCabinetCell"
  - "DriversTable Plate + Cabinet columns, DriverForm Plate field, DriverAssignmentSection cabinet hint"
affects: [94-05, 94-06]
tech-stack:
  added: []
  patterns:
    - "admin route guard order copied from the sibling routes (enforceMaxBody, getAdminUser, uuid, JSON parse 400, zod 400) with an extra try/catch so an unparseable body is a 400 and not a 500"
    - "disable = flag off + three deletes by driver_id; the per-request flag check in getDriverSession already cuts the cookie, the deletes also drop push endpoints"
    - "a 502 on invite still carries the driver patch, so the chip follows the server (flag already set, Resend invite retries)"
key-files:
  created:
    - "app/api/admin/drivers/[id]/cabinet/route.ts"
    - components/admin/DriverCabinetCell.tsx
    - tests/admin-driver-cabinet.test.ts
    - tests/admin-driver-cabinet-ui.test.tsx
  modified:
    - lib/email.ts
    - app/api/admin/drivers/route.ts
    - "app/api/admin/drivers/[id]/route.ts"
    - tests/admin-drivers.test.ts
    - components/admin/DriversTable.tsx
    - components/admin/DriverForm.tsx
    - components/admin/DriverAssignmentSection.tsx
    - "app/(internal)/admin/(dashboard)/drivers/page.tsx"
key-decisions:
  - "Disable fails with 500 when any of the three cleanup deletes fails, instead of reporting success with a live session left behind"
  - "Invite is stamped with cabinet_invited_at = now() on every invite (Resend invite re-stamps); enable stamps it only when it was null, so a Disabled driver keeps the Disabled chip"
  - "DriversTable gets an onDriverChanged(id, patch) prop and the drivers page applies the patch in place, so the chip updates without a refetch"
status: complete
commits: 2
plan_head_before: 04dad3a51ac335a5ecb07d7437b1b7aec0a48e9d
plan_head_after: aa1582b86427ee0f768f95ccb5defb9d25fe6bf9
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
completed: 2026-11-25
---

# Phase 94 Plan 04: Operator controls cabinet access Summary

The operator can invite the existing drivers to the cabinet, resend the invite, disable access (a driver's open phone is signed out on its next request) and enable it again, all from the admin drivers list, and can set the plate shown on every ride.

`commits: 2` counts the two task commits and is measured before the docs commit that adds this file.

## What was built

- **Task 1 (commit b09fe938, `security:`)**: `POST /api/admin/drivers/[id]/cabinet`. Invite sets `cabinet_enabled = true` and `cabinet_invited_at = now()` on the existing row and sends the "Your Prestigo driver cabinet is ready" email (button to `/driver/login`, escaped name, no code, no token, no price); a failed email gives 502 `email_failed` with the flag already set. Enable sets the flag without an email and stamps the invite time only if it was empty. Disable clears the flag and deletes the driver's `driver_sessions`, `driver_login_codes` and `driver_push_subscriptions` rows; another driver's rows stay. The route never reads assignments or bookings (D-18). `vehicle_plate` (`safeString(16)`, trimmed, empty to null) added to the create and patch routes.
- **Task 2 (commit aa1582b8, `security:`)**: `DriverCabinetCell` (chip Not invited / Invited / Disabled, the action buttons per status, "Sending…", 4 s success lines, role=alert errors, disable confirmation in the admin `Modal` with initial focus on "Keep access" and no dismissal while saving), Plate and Cabinet columns in `DriversTable`, a Plate field in `DriverForm` (maxLength 16, autoCapitalize characters, helper text), the widened `Driver` type, and the hint line under the driver select in `DriverAssignmentSection`.

## Verification

- `npx vitest run --exclude '.claude/**' tests/admin-driver-cabinet.test.ts tests/admin-drivers.test.ts tests/admin-driver-cabinet-ui.test.tsx tests/DriverAssignmentSection.test.tsx tests/admin-no-hardcoded-colors.test.ts`: green (34 + 58 tests across the two task runs); also green: dispatch-board, bookings-workspace, booking-detail-panel, admin-booking-tour-display, driver-cabinet-email.
- Test of record for T-94-20: after `disable`, `getDriverSession()` with the cookie that worked before the call returns null (fake DB).
- `npx tsc --noEmit`: 8 errors, the old baseline in `tests/`; none in this plan's files.
- `npx eslint --quiet` on all changed source and test files: exit 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] drivers page wired to the new table prop**
- **Found during:** Task 2
- **Issue:** `app/(internal)/admin/(dashboard)/drivers/page.tsx` owns the drivers state; without an `onDriverChanged` hand-off the Cabinet chip would not update after an invite or disable. The page is not in the plan's `files_modified`.
- **Fix:** added `handleDriverChanged` (merge the patch into the driver) and passed it to `DriversTable`.
- **Files modified:** `app/(internal)/admin/(dashboard)/drivers/page.tsx`
- **Commit:** aa1582b8

**2. [Rule 2 - Missing critical functionality] label association in DriverForm**
- **Found during:** Task 2
- **Issue:** the form labels had no `htmlFor`/`id`, so the new Plate field (and the tests) could not be reached through its label, and screen readers got unlabeled inputs.
- **Fix:** added `htmlFor` and `id` to Name, Email, Phone, Vehicle Info and Plate.
- **Files modified:** `components/admin/DriverForm.tsx`
- **Commit:** aa1582b8

**3. [Rule 1 - Bug avoidance] unparseable body is a 400**
- The sibling routes call `request.json()` unguarded (a bad body would throw a 500). The new route wraps it and answers 400, per the project's 400-vs-422 rule. Sibling routes were left as they are (out of scope).

No other deviations. No package installed. No real driver was invited and no email was sent (tests mock the sender).

## Known Stubs

None.

## Threat Flags

None. The only new surface is the admin-only route covered by T-94-19 to T-94-22 in the plan.

## Self-Check: PASSED

- FOUND: app/api/admin/drivers/[id]/cabinet/route.ts
- FOUND: components/admin/DriverCabinetCell.tsx
- FOUND: tests/admin-driver-cabinet.test.ts
- FOUND: tests/admin-driver-cabinet-ui.test.tsx
- FOUND: commit b09fe938
- FOUND: commit aa1582b8
