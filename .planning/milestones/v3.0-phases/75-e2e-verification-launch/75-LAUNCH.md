# Phase 75, Plan 21 — Launch Brief (D-14)

Run date (UTC): 2026-09-27. Target: `https://rideprestigo.com`.
Script: `scripts/qa/gsc_indexing_baseline.py` (new, this plan). Token: `~/.config/google-ads/gsc_token.json` (`webmasters.readonly` scope — read-only; see 75-RESEARCH.md Pitfall 7). Never printed token contents.

## Task 1 — GSC indexing baseline (automated, DONE)

`python3 scripts/qa/gsc_indexing_baseline.py` — **exit 0**, 42/42 URLs inspected via `urlInspection().index().inspect()`, 24/42 indexed. Full machine-readable output: `scripts/qa/out/gsc_indexing_baseline.json`.

### Baseline table (grouped by locale)

**en — 5/6 indexed**

| Page | Coverage state | Verdict | Last crawl (UTC) | Google canonical |
|---|---|---|---|---|
| `/` | Submitted and indexed | PASS | 2026-09-23T08:02:25Z | `https://rideprestigo.com/` |
| `/book` | Submitted and indexed | PASS | 2026-09-18T17:20:18Z | `https://rideprestigo.com/book` |
| `/fleet` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |
| `/routes` | Submitted and indexed | PASS | 2026-09-21T18:21:52Z | `https://rideprestigo.com/routes` |
| `/routes/prague-vienna` | Submitted and indexed | PASS | 2026-09-21T04:02:20Z | `https://rideprestigo.com/routes/prague-vienna` |
| `/services/airport-transfer` | Submitted and indexed | PASS | 2026-09-09T22:42:07Z | `https://rideprestigo.com/services/airport-transfer` |

**ru — 4/6 indexed**

| Page | Coverage state | Verdict | Last crawl (UTC) | Google canonical |
|---|---|---|---|---|
| `/` | Submitted and indexed | PASS | 2026-09-25T08:28:37Z | `https://rideprestigo.com/ru` |
| `/book` | Submitted and indexed | PASS | 2026-09-25T13:44:56Z | `https://rideprestigo.com/ru/book` |
| `/fleet` | Submitted and indexed | PASS | 2026-09-25T02:07:11Z | `https://rideprestigo.com/ru/fleet` |
| `/routes` | Submitted and indexed | PASS | 2026-09-24T23:23:46Z | `https://rideprestigo.com/ru/routes` |
| `/routes/prague-vienna` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |
| `/services/airport-transfer` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |

**es — 3/6 indexed**

| Page | Coverage state | Verdict | Last crawl (UTC) | Google canonical |
|---|---|---|---|---|
| `/` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |
| `/book` | Submitted and indexed | PASS | 2026-09-25T02:37:32Z | `https://rideprestigo.com/es/book` |
| `/fleet` | Submitted and indexed | PASS | 2026-09-25T03:19:38Z | `https://rideprestigo.com/es/fleet` |
| `/routes` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |
| `/routes/prague-vienna` | Submitted and indexed | PASS | 2026-09-25T19:09:29Z | `https://rideprestigo.com/es/routes/prague-vienna` |
| `/services/airport-transfer` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |

**fr — 5/6 indexed**

| Page | Coverage state | Verdict | Last crawl (UTC) | Google canonical |
|---|---|---|---|---|
| `/` | Submitted and indexed | PASS | 2026-09-18T18:41:49Z | `https://rideprestigo.com/fr` |
| `/book` | Submitted and indexed | PASS | 2026-09-25T09:10:55Z | `https://rideprestigo.com/fr/book` |
| `/fleet` | Submitted and indexed | PASS | 2026-09-25T01:51:49Z | `https://rideprestigo.com/fr/fleet` |
| `/routes` | Submitted and indexed | PASS | 2026-09-25T03:00:59Z | `https://rideprestigo.com/fr/routes` |
| `/routes/prague-vienna` | Crawled - currently not indexed | NEUTRAL | 2026-09-25T08:31:43Z | not yet known to Google |
| `/services/airport-transfer` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |

**ar — 2/6 indexed**

| Page | Coverage state | Verdict | Last crawl (UTC) | Google canonical |
|---|---|---|---|---|
| `/` | Submitted and indexed | PASS | 2026-09-25T08:56:02Z | `https://rideprestigo.com/ar` |
| `/book` | Submitted and indexed | PASS | 2026-09-25T02:29:45Z | `https://rideprestigo.com/ar/book` |
| `/fleet` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |
| `/routes` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |
| `/routes/prague-vienna` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |
| `/services/airport-transfer` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |

**hi — 4/6 indexed**

| Page | Coverage state | Verdict | Last crawl (UTC) | Google canonical |
|---|---|---|---|---|
| `/` | Crawled - currently not indexed | NEUTRAL | 2026-09-24T22:56:28Z | not yet known to Google |
| `/book` | Submitted and indexed | PASS | 2026-09-25T07:26:52Z | `https://rideprestigo.com/hi/book` |
| `/fleet` | Submitted and indexed | PASS | 2026-09-25T01:54:02Z | `https://rideprestigo.com/hi/fleet` |
| `/routes` | Submitted and indexed | PASS | 2026-09-25T15:15:34Z | `https://rideprestigo.com/hi/routes` |
| `/routes/prague-vienna` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |
| `/services/airport-transfer` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |

**zh — 1/6 indexed**

| Page | Coverage state | Verdict | Last crawl (UTC) | Google canonical |
|---|---|---|---|---|
| `/` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |
| `/book` | Submitted and indexed | PASS | 2026-09-24T23:16:59Z | `https://rideprestigo.com/zh/book` |
| `/fleet` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |
| `/routes` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |
| `/routes/prague-vienna` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |
| `/services/airport-transfer` | URL is unknown to Google | NEUTRAL | not yet known to Google | not yet known to Google |

**Total: 24/42 indexed.** Every non-EN locale is live and partially indexed (Google has already crawled and indexed each locale's `/book` page in every case, plus `/` and `/fleet` on most). The remaining "URL is unknown to Google" pages are new URLs Google has not yet crawled — expected shortly after the Phase 75 deploy (PR #37, merged 2026-09-26) and after Task 3's Request Indexing below. No page returned an error or a disallowed/blocked verdict.

## Task 1 — Request-Indexing list (10 URLs, for Task 3)

The 6 non-EN homepages plus `/ru/book`, `/ar/book`, `/es/fleet`, `/zh/routes` (per plan spec):

1. `https://rideprestigo.com/ru`
2. `https://rideprestigo.com/es`
3. `https://rideprestigo.com/fr`
4. `https://rideprestigo.com/ar`
5. `https://rideprestigo.com/hi`
6. `https://rideprestigo.com/zh`
7. `https://rideprestigo.com/ru/book`
8. `https://rideprestigo.com/ar/book`
9. `https://rideprestigo.com/es/fleet`
10. `https://rideprestigo.com/zh/routes`

(Cross-check against the baseline table above: `/ru/book`, `/ar/book`, and `/es/fleet` are already indexed — requesting indexing again is harmless and simply prompts a re-crawl; `/es`, `/zh`, `/zh/routes` are the ones most in need of a nudge.)

## Task 1 — Rich Results sample (5 URLs) + jsonld_audit.py result

Sample: `/ru/routes/prague-vienna`, `/ar/faq`, `/es/fleet`, `/zh/routes`, `/hi/services/airport-transfer`.

`python3 scripts/qa/jsonld_audit.py https://rideprestigo.com --locales ru,es,ar,hi,zh` — **exit 0**: `60 ld+json blocks checked across 5 locales x 7 pages, 0 findings`. This run's fixed `PAGES` list (`/`, `/routes/prague-vienna`, `/faq`, `/fleet`, `/routes`, `/services/airport-transfer`, `/book`) covers every one of the 5 sampled (locale, page) pairs above, plus the other 2 pages for the same 5 locales. Zero invalid-JSON, missing-`@context`, non-string-FAQ-answer, or `inLanguage`-mismatch findings across all of them — the JSON-LD structured data behind all 5 sampled URLs is clean going into the manual Rich Results Test (Task 3).

Rich Results Test results (filled in by Task 3, per sampled URL):

| URL | Rich Results outcome |
|---|---|
| https://rideprestigo.com/ru/routes/prague-vienna | valid (user-reported "все ок", 2026-09-27) |
| https://rideprestigo.com/ar/faq | valid (user-reported "все ок", 2026-09-27) |
| https://rideprestigo.com/es/fleet | valid (user-reported "все ок", 2026-09-27) |
| https://rideprestigo.com/zh/routes | valid (user-reported "все ок", 2026-09-27) |
| https://rideprestigo.com/hi/services/airport-transfer | valid (user-reported "все ок", 2026-09-27) |
| `https://rideprestigo.com/ru/routes/prague-vienna` | _pending — Task 3_ |
| `https://rideprestigo.com/ar/faq` | _pending — Task 3_ |
| `https://rideprestigo.com/es/fleet` | _pending — Task 3_ |
| `https://rideprestigo.com/zh/routes` | _pending — Task 3_ |
| `https://rideprestigo.com/hi/services/airport-transfer` | _pending — Task 3_ |

## Announcement copy

7 languages, by endonym: English, Русский, Español, Français, العربية, हिन्दी, 中文.

**Instagram (English, primary audience):**

Booking a private chauffeur in a country where you can't read the language is stressful. You're not sure the details are right. You can't ask a question. You just hope it works out.

rideprestigo.com now speaks your language: English, Русский, Español, Français, العربية, हिन्दी, 中文.

Book your ride, read every detail, and pay — all in the language you're comfortable in. Same door-to-door chauffeur, meeting you at arrivals and taking you straight to your hotel. One fixed quote at rideprestigo.com before you book.

Prague and beyond, now open in 7 languages.

**Facebook (English, primary audience):**

Traveling somewhere and don't want to book a private chauffeur in a language you don't read? We fixed that.

rideprestigo.com is now available in English, Русский, Español, Français, العربية, हिन्दी, and 中文.

Read the details, choose your car, and pay — all in your own language. No guesswork, no translation apps, no confusion at the payment step. Your chauffeur still meets you at arrivals, carries your bags, and drives you straight to your hotel or your next stop. One fixed quote, right on rideprestigo.com.

Book with confidence, in the language you speak.

## Chosen visual

**URL:** `https://rideprestigo.com/hero-fleet.webp` (served from `public/hero-fleet.webp`, used as the `/fleet` page hero and its OG image).

Verified by opening the file with the Read tool:
- Shows the current Mercedes fleet: V-Class (left), S-Class (center), E-Class (right) — all current-generation bodies (W447/W223/W213), matching the project's fleet rule.
- V-Class has its real production roofline — no raised roof, no Maybach-style vertical grille.
- All doors are closed and standard front-hinged (no coach/rear-hinged doors visible).
- No chauffeur or any person is in the frame at all, so there is no gloves/cap risk to check.

TikTok is excluded from this announcement — it requires a video asset, which is out of scope for this plan (Metricool drafts are Instagram + Facebook only, per Task 2).

---

## Task 2 — Metricool drafts (PENDING)

Not run by this executor. Executor subagents have no MCP access; the orchestrator creates the Instagram and Facebook drafts via the Metricool MCP using the copy and image URL above, per the plan's Task 2 instructions (`getBestTimeToPostByNetwork` + `getScheduledPosts` to pick free best-time slots, `createScheduledPost` with `info.draft = true`, then re-verify via `getScheduledPosts`). Results (post IDs, networks, slots, draft-flag confirmation) will be appended here by the orchestrator/continuation run.

## Task 3 — Sitemap resubmit, Request Indexing, Rich Results Test (PENDING — user, web UI only)

Not run by this executor (read-only GSC token cannot submit sitemaps or request indexing — see 75-RESEARCH.md Pitfall 7). The user completes this via the GSC web UI:
1. Search Console (`sc-domain:rideprestigo.com`) → Sitemaps → submit `https://rideprestigo.com/sitemap.xml`.
2. URL Inspection → Request indexing for each of the 10 URLs in the Request-Indexing list above.
3. https://search.google.com/test/rich-results → test each of the 5 sampled URLs above; note "valid items detected" or errors.
4. Results (sitemap status, indexing-request outcome per URL, Rich Results outcome per URL) will be recorded here and in `75-QA-RESULTS.md` (D-14 section) by the orchestrator/continuation run, followed by the milestone-close handoff below.

---

## Milestone-close handoff (D-14)

Once Tasks 2 and 3 above are complete and this file records their results:

1. Run `/gsd-verify-work 75` — must pass.
2. Run `/gsd-audit-milestone`.
3. Run `/gsd-complete-milestone v3.0` — creates tag `v3.0`.

These are workflow-level commands that cannot run inside this phase's plan execution — they are the explicit next step after this plan's remaining tasks (2, 3) are resolved.

## Task 2 result: Metricool announcement drafts. SKIPPED (user decision, 2026-09-27)

User answer: "Без анонса" (no announcement). No Metricool posts were created. The copy and visual above stay available if the announcement is wanted later. The draft-capable client from 75-18 is in place (`createMetricoolPost({ ..., draft: true })`).

## Task 3 result: GSC sitemap, Request Indexing, Rich Results. DONE (user, 2026-09-27)

The user reported "все ок" for all three steps:
- Sitemap `https://rideprestigo.com/sitemap.xml` resubmitted: OK.
- Request Indexing: all 10 URLs in the list above accepted.
- Rich Results Test: all 5 sampled URLs valid, consistent with jsonld_audit.py (0 findings).

## Milestone-close handoff

1. `/gsd-verify-work 75` (UAT for items the verifier marks human-needed)
2. `/gsd-audit-milestone`
3. `/gsd-complete-milestone v3.0` (tag v3.0)
