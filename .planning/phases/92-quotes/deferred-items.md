# Phase 92: deferred items (out of scope, found during execution)

## 92-28 (quality gate, 2026-11-16)

- **zh-hant blog sync lags the branch.** `npm run build` runs `prebuild` (`scripts/zh-hant-sync.mjs`), which generated three
  untracked files on feat/92-quotes: `content/blog/zh-hant/bohemian-crystal-day-trip.mdx`,
  `content/blog/zh-hant/prague-airport-to-karlovy-vary-spa-transfer.mdx`,
  `content/blog/zh-hant/prague-airport-transfer-christmas-new-year.mdx` (the zh-hant copies of three blog posts that came in
  from main). Not quote code: the generated files were removed from the worktree, not committed. Vercel runs the same
  prebuild, so production is not affected; commit them with the next blog/i18n change if the repo is meant to carry them.
- **Turbopack warning (pre-existing):** `lib/lastmod.ts:25` builds a file path from a dynamic value, so the build pattern
  matches the whole project tree ("Overly broad patterns can lead to build performance issues"). Not a phase 92 file.
