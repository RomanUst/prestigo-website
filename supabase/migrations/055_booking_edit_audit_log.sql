-- Migration 055: booking_edit_audit_log
-- Phase 63 — Admin Booking Editing + Change Notification (D-10, D-11, FOLLOW-02)
--
-- Per-field audit trail for admin trip-field edits. One row per changed field
-- per PATCH request (a single edit that changes 3 fields writes 3 rows,
-- sharing changed_at so the history UI can group them visually). This table
-- is the single source of truth for both the change-notification email
-- (D-07, sendBookingChangedEmail) and the change-history UI (D-11).
--
-- old_value / new_value are stored as `text` (not typed columns) since the
-- field set spans dates, strings, enums, and numeric amounts.
--
-- No RLS policy — service-role-only table, mirrors the untracked `email_log`
-- table's posture (see STATE.md "Migration 045 adds no RLS to bookings —
-- deferred"). Only the admin-guarded PATCH handler (service-role Supabase
-- client) reads/writes this table.
--
-- Task 1 (checkpoint:decision) of Plan 63-01 confirmed the researched shape
-- as-is (see 63-01-SUMMARY.md).
--
-- Schema FILE only — live application against the remote Supabase project is
-- the [BLOCKING] human-action task in this plan (Task 3, Schema Push Gate).

CREATE TABLE IF NOT EXISTS public.booking_edit_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  field        text NOT NULL,
  old_value    text,
  new_value    text,
  operator_id  uuid,               -- getAdminUser().user.id — nullable defensively
  changed_at   timestamptz NOT NULL DEFAULT now(),
  notified     boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS booking_edit_audit_log_booking_id_idx
  ON public.booking_edit_audit_log (booking_id, changed_at DESC);
