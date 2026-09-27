# Phase 73: Non-Latin & RTL Infra (AR, HI, ZH) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-17
**Phase:** 73-non-latin-rtl-infra-ar-hi-zh
**Areas discussed:** RTL audit scope, Font strategy, Per-locale tone/register, QA acceptance bar

---

## RTL audit scope & method

### Scope
| Option | Description | Selected |
|--------|-------------|----------|
| Public `[locale]` only | Convert only files visible on localized pages; admin/driver (EN-LTR) untouched | ✓ |
| Whole repo | Convert all ~45 files incl. admin/driver for uniform logical-properties everywhere | |

**User's choice:** "даже не знаю" — deferred to recommendation; locked as **Public `[locale]` only** (admin/driver hard EN-LTR, no RTL benefit, less risk).

### Conversion method
| Option | Description | Selected |
|--------|-------------|----------|
| Native logical classes | Manual/scripted swap pl-→ps-, mr-→me-, text-left→text-start; no new deps | ✓ |
| RTL plugin | tailwindcss-rtl or similar auto-mirror; external dep, less edge control | |
| You decide | Leave to researcher/planner | |

**User's choice:** Native logical classes.

### Directional icons
| Option | Description | Selected |
|--------|-------------|----------|
| Mirror directional | Flip direction-encoding arrows/chevrons in RTL; leave non-directional as-is | ✓ |
| Don't mirror | Leave all icons as-is | |

**User's choice:** Mirror directional.

---

## Font strategy

### Loading
| Option | Description | Selected |
|--------|-------------|----------|
| Per-locale | /ar→Noto Arabic, /hi→Devanagari, /zh→SC; heavy CJK not shipped elsewhere | ✓ |
| Global | All three Noto fonts declared globally; simpler, extra weight | |

**User's choice:** Per-locale.

### Latin insertions in non-Latin text
| Option | Description | Selected |
|--------|-------------|----------|
| Latin brand font | PRESTIGO / prices / E-S-V-Class / phone / domain render in Inter/Fraunces via fallback stack | ✓ |
| Locale font | Let Noto render Latin fragments too | |

**User's choice:** Latin brand font.

---

## Per-locale tone/register

### Arabic (ar)
| Option | Description | Selected |
|--------|-------------|----------|
| MSA, formal | Modern Standard Arabic (fusḥā), premium register, pan-Arab | ✓ |
| Gulf dialect | Gulf-oriented tone for UAE/Saudi clients | |

**User's choice:** MSA, formal.

### Hindi (hi)
| Option | Description | Selected |
|--------|-------------|----------|
| Formal (aap) | Respectful आप, moderately Sanskritized; English tech terms kept | ✓ |
| Pure Sanskritized | Max native-word replacement of English loanwords | |

**User's choice:** Formal (aap).

### Chinese (zh)
| Option | Description | Selected |
|--------|-------------|----------|
| Simplified, mainland | Simplified (Noto SC), PRC, polite business register (您) | ✓ |
| Traditional | Traditional (Taiwan/HK), needs Noto TC | |

**User's choice:** Simplified, mainland.

---

## QA acceptance bar

### RTL visual QA coverage
| Option | Description | Selected |
|--------|-------------|----------|
| Key 5 types | Home, booking flow, one route page, one blog post, account/login | ✓ |
| Home + booking only | Minimum: home + booking funnel | |
| All templates + mobile | Key 5 × desktop and mobile viewport | |

**User's choice:** Key 5 types.

### LTR-in-RTL insertions
| Option | Description | Selected |
|--------|-------------|----------|
| Explicit QA item | Prices/phone/flights/dates stay LTR via bidi isolation; EntryBar + map don't break | ✓ |
| Regular check | Caught in general visual pass | |

**User's choice:** Explicit QA item.

### ru/es/fr + EN non-regression
| Option | Description | Selected |
|--------|-------------|----------|
| Auto byte-parity | Automated byte-for-byte check (normalize priceValidUntil) | ✓ |
| Visual spot-check | Manual sampling | |

**User's choice:** Auto byte-parity.

---

## Claude's Discretion

- next/font loader shape, subsets/weights, per-locale className mechanism in SiteChrome.
- Font-family fallback-stack ordering for Latin brand tokens over Noto.
- Exact ~42-file audit output and per-file physical→logical class mapping; script vs manual.
- `i18n/glossary.json` schema additions for ar/hi/zh; extending `PHASE_72_LOCALES`.
- QA report format/tooling; stale EN-placeholder catalog reconcile on first real run.

## Deferred Ideas

- hreflang / metadata / sitemap / locale switcher + Accept-Language auto-detect — Phase 74.
- Repo-wide logical-property refactor (admin/driver) for consistency — future task.
- Per-locale OG/social imagery for non-Latin — revisit in Phase 74 if needed.
- 3 legacy JSX blog posts stay EN-only (locked Phase 72).
