# Phase 65 — External API Coverage

No external API integration: extends internal `admin_search_bookings` RPC and `/api/admin/settings` only.

This phase adds no new external API/SDK dependency. All work is an internal Postgres RPC
signature extension (`p_sort`), an internal admin settings endpoint extension
(`dispatch_default_horizon` / `dispatch_horizon_days`), a built-in `Intl` date helper, and
React state in existing admin components. No `npm install` occurs; the api-coverage detector
fires as a false positive here.
