---
phase: 75-e2e-verification-launch
reviewed: 2026-09-27T18:05:00Z
depth: standard
scope: gap-closure round 2 diff 72b27260..HEAD (plans 75-31..75-36 source + 75-32 QA scripts, PR #39, already deployed to production)
files_reviewed: 18
files_reviewed_list:
  - lib/site-metadata.ts
  - components/SiteChrome.tsx
  - app/[locale]/layout.tsx
  - app/[locale]/login/layout.tsx
  - app/[locale]/blog/[slug]/page.tsx
  - app/[locale]/[...rest]/page.tsx
  - app/[locale]/not-found.tsx
  - lib/locale-date.ts
  - components/ArticleByline.tsx
  - components/BlogCard.tsx
  - scripts/qa/en_leak_rendered.py
  - scripts/qa/share_meta_audit.py
  - scripts/qa/notfound_audit.py
  - tests/helpers/resolveNextMetadata.ts
  - tests/site-metadata-i18n.test.ts
  - tests/login-metadata-i18n.test.ts
  - tests/not-found-metadata-i18n.test.ts
  - tests/locale-date.test.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 75: Code Review Report (gap round 2)

**Reviewed:** 2026-09-27T18:05:00Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

This review covers gap-closure round 2 of Phase 75 (plans 75-31 through 75-36, plus the
75-32 QA-script additions), diffed against `72b272605c6b750257b956a87c93ee4e4a3c7301`. The
work is already merged to `main` and deployed to production (PR #39), so this is a
retrospective check, not a pre-merge gate.

The changeset centralizes site/share/404 metadata into `lib/site-metadata.ts`, fixes the
long-standing `twitter:*` EN-leak (by shipping a title/description-less default `twitter`
block so Next.js's own `postProcessMetadata` mirrors each page's resolved `openGraph` into
`twitter:*`), gives `/login`, the catch-all 404, the `blog/[slug]` unknown-slug branch, and
`app/[locale]/not-found.tsx` a single shared, localized, noindex 404 metadata helper, and adds
a locale-aware date formatter (`formatLocaleDate`) used by `BlogCard` and `ArticleByline`. Two
new/extended QA scripts (`share_meta_audit.py`, `en_leak_rendered.py`) attempt to catch
regressions of these fixes at the raw-HTML and rendered-DOM layers respectively.

I read every file end to end, traced the metadata merge contract through
`tests/helpers/resolveNextMetadata.ts` (which drives Next's real `accumulateMetadata`), ran
the four new/changed test files plus the pre-existing `BlogCard`/`author-surfaces` suites (all
94 + 54 tests pass), and ran a project-wide `tsc --noEmit` (no new type errors attributable to
this diff — the pre-existing failures are all in unrelated files). I did not find any
correctness or security defects in the shipped application code. The two findings below are
both in the round's own verification tooling: an asymmetric completeness check in
`share_meta_audit.py` that can silently miss a real `twitter:description` regression, and a
narrower coverage gap in `en_leak_rendered.py`'s new joined-text/date-leak detectors. Neither
blocks the already-shipped production code, but both reduce the round's own safety net for the
next regression of the exact bug class this round fixed.

## Warnings

### WR-01: `share_meta_audit.py` description-mirror check is not symmetric with the title check

**File:** `scripts/qa/share_meta_audit.py:1032-1045`
**Issue:** `check_page()` explicitly checks for *presence* of `og:title`/`twitter:title`
(`if not og_t: ... 'og:title missing'`, `if not tw_t: ... 'twitter:title missing'`) before
comparing values. The description branch has no equivalent presence check:

```python
for v in tw_d:
    if v not in og_d:
        findings.append({'kind': 'twitter-mirror', 'key': 'twitter:description', 'value': v[:200],
                         'og': og_d[0][:200] if og_d else None})
```

If a page emits `og:description` but has **no** `twitter:description` meta tag at all (the
exact WR-02 regression class this round exists to catch — e.g. a future Next.js version, or a
future page, that stops mirroring), `tw_d` is `[]`, the `for v in tw_d` loop never executes,
and **zero findings are produced** for that page/locale. The title branch would catch the
equivalent regression (`twitter:title missing`); the description branch silently passes. The
same asymmetry means a page missing `og:description` entirely (no override and, hypothetically,
no locale-layout default either) is also never flagged, whereas the equivalent title gap is
always flagged.
**Fix:** Mirror the title branch's presence checks for description:
```python
if not og_d:
    findings.append({'kind': 'twitter-mirror', 'value': 'og:description missing'})
if not tw_d:
    findings.append({'kind': 'twitter-mirror', 'value': 'twitter:description missing'})
for v in tw_d:
    if og_d and v not in og_d:
        findings.append({'kind': 'twitter-mirror', 'key': 'twitter:description', 'value': v[:200],
                         'og': og_d[0][:200]})
```

### WR-02: `en_leak_rendered.py`'s new joined-text detector silently skips elements with a non-text inline child (e.g. an icon)

**File:** `scripts/qa/en_leak_rendered.py:210-228` (`joinedTexts()` in `EXTRACT_JS`)
**Issue:** `joinedTexts()` requires every element child of a candidate node to have a tagName
in `INLINE_TAGS` (`A, SPAN, B, STRONG, EM, I, BDI, TIME, SMALL, SUP, SUB, BR, ABBR, CODE, MARK,
U, S`); if even one element child is anything else (e.g. `<svg>`, `<img>`, a nested `<div>`
icon wrapper commonly used for buttons with a leading/trailing icon), the whole element is
skipped (`return` inside the `forEach` callback) and its collapsed text is never evaluated for
a joined leak — even though the same phrase-split-across-text-nodes bug (the one WR-03 exists
to catch) can occur inside a `<button>`/`<a>` that also contains an icon `<svg>`. This narrows
the detector's real-world coverage on exactly the interactive elements (CTA buttons with
icons) most likely to contain a hand-authored, JSX-interpolation-split label.
**Fix:** Either add `svg`/`img`/`picture` to a second "ignorable, non-text" tag set that is
skipped when computing the joined text (rather than aborting the whole element), or compute
`innerText` after excluding those subtrees, e.g.:
```js
for (const child of el.children) {
  if (IGNORE_TAGS.has(child.tagName)) continue;       // icons contribute no text
  if (!INLINE_TAGS.has(child.tagName)) return;
}
```

## Info

### IN-01: `share_meta_audit.py`'s "og:title missing" / "twitter:title missing" findings omit the `key` field the other findings carry

**File:** `scripts/qa/share_meta_audit.py:1034-1037`
**Issue:** Every other finding kind in this file (`twitter-mirror` mismatches, `en-site-default`,
`notfound-title`) includes a `'key'` field naming the specific meta property. The two presence
findings (`'og:title missing'` / `'twitter:title missing'`) only set `'value'`, so downstream
consumers that group/filter findings by `key` will silently drop these two finding kinds.
**Fix:** Add `'key': 'og:title'` / `'key': 'twitter:title'` to those two `findings.append(...)` calls.

### IN-02: `resolveNextMetadata.ts` monkey-patches Node's global module resolver for the whole test worker

**File:** `tests/helpers/resolveNextMetadata.ts:1194-1203`
**Issue:** The helper permanently replaces `Module._resolveFilename` for the lifetime of the
test worker process (guarded only by a `__gsdServerOnlyShim` flag so it isn't re-wrapped), so
that any subsequent `require('server-only')` from *any* other test file sharing that worker
also silently resolves to the empty stub. This is a deliberate, narrow workaround (documented
in the file's own comment) for `resolve-metadata.js`'s `require('server-only')`, and is
low-risk given Vitest's usual per-file isolation, but it is a global process-wide side effect
from a single test helper that could mask a genuine "server-only code leaked into a
client-evaluated module" mistake in an unrelated test running in the same worker.
**Fix:** No action required unless a future `server-only` regression test starts failing to
detect the leak — worth a one-line comment cross-reference from any such test back to this file.

### IN-03: `formatLocaleDate` has no guard against a malformed/invalid ISO date string

**File:** `lib/locale-date.ts:424-427`
**Issue:** `formatLocaleDate` does `new Date(`${iso}T00:00:00Z`)` and passes the result straight
to `Intl.DateTimeFormat(...).format(d)` with no validation. An invalid `iso` (e.g. malformed
blog frontmatter `date`/`dateModified`) produces an `Invalid Date`, and `Intl.DateTimeFormat`
throws a `RangeError` when formatting one, which would crash the blog page's render. This
mirrors the pre-existing behavior of `lib/authors.ts`'s `formatBylineDate` (not a regression
introduced by this round), so it is not a new defect, but the new call sites
(`ArticleByline`, `BlogCard`) are both on production content-rendering paths.
**Fix:** Not required for this round, but worth a shared follow-up: validate `iso` (e.g.
`Number.isNaN(d.getTime())`) and fall back to the raw string or throw a clearer content-authoring
error before it reaches `Intl.DateTimeFormat`.

---

_Reviewed: 2026-09-27T18:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
