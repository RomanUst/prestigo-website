---
phase: 81-lead-capture-site-forms-supabase-espocrm
source: 81-REVIEW.md
recorded: 2026-10-18
critical: 0
warning: 4
info: 7
open: 11
---

# Phase 81 — Code Review Disposition

Advisory review (0 critical). Every finding is open until triaged; none blocks phase completion.

| ID | Finding | Disposition |
|----|---------|-------------|
| WR-01 | Deferral re-publish reuses one dedup id, so the second deferral is silently dropped by QStash | open |
| WR-02 | A CRM 400 permanently fails the delivery and drops the Lead with no alert; only the phone number has a fallback | open |
| WR-03 | Booking Lead value is understated for round trips and never refreshed after a price edit | open |
| WR-04 | Public form endpoints now feed a permanent store and the CRM with no spam control and no retention | open |
| IN-01 | Failed email leaves an orphan inquiry with no dispatch, and a retry creates a duplicate Lead | open |
| IN-02 | `retryLater` and `breaker` ignore the result of `reschedule` and `publish` | open |
| IN-03 | A skipped purge is never re-evaluated | open |
| IN-04 | Dead code and duplicated QStash client | open |
| IN-05 | CRM role scope is wider than needed, and `cSupabaseRef` is editable in the UI | open |
| IN-06 | A missing or invalid CRM config or assignee fails silently | open |
| IN-07 | `outbox_complete` and `outbox_reschedule` do not check the lease holder | open |
