---
phase: 92-quotes
plan: 32
subsystem: quotes-pdf
tags: [pdf, production-proof, d-14]
status: complete
completed: 2026-11-16
---

# 92-32 Summary: PDF renderer proven on production

## Task 1: proof PR

- PR: https://github.com/RomanUst/prestigo-website/pull/114 (branch `feat/92-pdf-proof`), merged by the owner's word on 2026-11-16 22:02 UTC.
- Merge commit on main: `38ec24031174e0532e832f35a9acd5d408351893`. Vercel production status: success. `https://rideprestigo.com/` answers 200; `/api/admin/quotes/pdf-check` answers 401 without an admin session (guard first).
- Files changed against main (limited to the must-have list; no public route, no copy, no migration):

```
app/api/admin/quotes/pdf-check/route.ts
lib/quotes/pdf-fonts.ts
lib/quotes/pdf-fonts/**
lib/quotes/pdf-sample.ts
lib/quotes/pdf.ts
next.config.ts
package-lock.json
package.json
tests/quote-pdf-deps.test.ts
tests/quote-pdf-spike.test.ts
tests/quote-pdf.test.ts
```

- Merged together with PR #115 (test-only date pin, merge `3990d1f3`).

## Task 2: pdf-check on rideprestigo.com

JSON pasted by the owner (logged in to the admin):

```json
{"engine":"chromium-min","results":[{"locale":"en","ok":true,"ms":5679,"bytes":172292,"fallback":[]},{"locale":"ru","ok":true,"ms":826,"bytes":207414,"fallback":[]},{"locale":"es","ok":true,"ms":822,"bytes":175962,"fallback":[]},{"locale":"fr","ok":true,"ms":799,"bytes":174163,"fallback":[]},{"locale":"ar","ok":true,"ms":1001,"bytes":203212,"fallback":[]},{"locale":"hi","ok":true,"ms":1047,"bytes":194419,"fallback":[]},{"locale":"zh","ok":true,"ms":5256,"bytes":394181,"fallback":[]},{"locale":"zh-hant","ok":true,"ms":3563,"bytes":407433,"fallback":[]}]}
```

All 8 locales `ok: true`, every fallback list empty. Engine `chromium-min`. Slowest: en 5.7 s (cold start, first render), zh 5.3 s, zh-hant 3.6 s (CJK font load); warm Latin/Cyrillic/Arabic/Devanagari renders 0.8-1.0 s. Largest PDF 407 KB (zh-hant), well under email attachment limits.

D-14 production decision: attachment

Same as the local decision of 92-07. 92-20 wires the PDF as an email attachment for every locale.
