---
schema_version: 1
open_count: 0
waived_count: 0
fixed_count: 5
total_count: 5
last_updated: 2026-09-03T19:23:18.078Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 68 | deviation | middleware.ts |  | Rule 1 fix: useNonceCsp was decided from locale-stripped pathname, letting /ru/admin acquire a nonce CSP (T-68-04); fixed to use raw pathname | fixed |  | 2026-09-03T19:22:48.763Z | 2026-09-03T19:23:16.955Z |
| 2 | 68 | deviation | app/sitemap.ts |  | Rule 1 fix: lastModFor() sourceFile paths pointed at pre-move app/ locations, silently degrading every sitemap lastModified to build-time fallback | fixed |  | 2026-09-03T19:22:49.040Z | 2026-09-03T19:23:17.234Z |
| 3 | 68 | deviation | app/[locale]/blog/[slug]/page.tsx |  | Rule 1 fix: dynamic MDX import relative path depth broken by the route move (3 levels -> 4 levels) | fixed |  | 2026-09-03T19:22:49.320Z | 2026-09-03T19:23:17.518Z |
| 4 | 68 | deviation | .husky/pre-commit |  | Rule 1 fix: stale app/blog/ exclusion in EUR-price-check hook broken by the move to app/[locale]/blog/, would have false-positive-blocked future blog commits | fixed |  | 2026-09-03T19:22:49.602Z | 2026-09-03T19:23:17.796Z |
| 5 | 68 | deviation | tests/confirmation-page.test.tsx |  | Rule 1 fix: stale @/app/book/confirmation/page import missed by the plan's declared stale-prefix sweep (book was omitted) | fixed |  | 2026-09-03T19:22:49.877Z | 2026-09-03T19:23:18.078Z |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "68",
    "file": "middleware.ts",
    "line": null,
    "description": "Rule 1 fix: useNonceCsp was decided from locale-stripped pathname, letting /ru/admin acquire a nonce CSP (T-68-04); fixed to use raw pathname",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-03T19:22:48.763Z",
    "resolved_at": "2026-09-03T19:23:16.955Z"
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "68",
    "file": "app/sitemap.ts",
    "line": null,
    "description": "Rule 1 fix: lastModFor() sourceFile paths pointed at pre-move app/ locations, silently degrading every sitemap lastModified to build-time fallback",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-03T19:22:49.040Z",
    "resolved_at": "2026-09-03T19:23:17.234Z"
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "68",
    "file": "app/[locale]/blog/[slug]/page.tsx",
    "line": null,
    "description": "Rule 1 fix: dynamic MDX import relative path depth broken by the route move (3 levels -> 4 levels)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-03T19:22:49.320Z",
    "resolved_at": "2026-09-03T19:23:17.518Z"
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "68",
    "file": ".husky/pre-commit",
    "line": null,
    "description": "Rule 1 fix: stale app/blog/ exclusion in EUR-price-check hook broken by the move to app/[locale]/blog/, would have false-positive-blocked future blog commits",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-03T19:22:49.602Z",
    "resolved_at": "2026-09-03T19:23:17.796Z"
  },
  {
    "id": 5,
    "kind": "deviation",
    "phase": "68",
    "file": "tests/confirmation-page.test.tsx",
    "line": null,
    "description": "Rule 1 fix: stale @/app/book/confirmation/page import missed by the plan's declared stale-prefix sweep (book was omitted)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-03T19:22:49.877Z",
    "resolved_at": "2026-09-03T19:23:18.078Z"
  }
]
````
