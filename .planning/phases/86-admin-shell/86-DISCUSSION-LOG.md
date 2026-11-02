# Phase 86: Admin Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-02
**Phase:** 86-admin-shell
**Areas discussed:** Light theme look, Collapsed sidebar, Status colours & login

---

## Light theme look

| Option | Description | Selected |
|--------|-------------|----------|
| Site cream (.theme-light) | Existing cream/navy-ink/gold, AA-checked | ✓ |
| Neutral white | White/grey CRM-style, gold accent only | |
| You decide | | |

**User's choice:** Site cream — plus "restyle in Notion style".
**Notes:** Follow-up: Notion style = sidebar, calm typography, flat tables/cards, page-like modals/panels (all four). Scope: **light theme only** (options were: shell + tokens / all screens now / light theme only).

| Option | Description | Selected |
|--------|-------------|----------|
| Dark | As today, server-rendered from cookie | |
| Follow OS | prefers-color-scheme | |
| Light | Light by default | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Map old anthracite/copper to navy/gold | Dark admin becomes uniform navy+gold | ✓ |
| Keep exact current look | Separate tokens with old values | |

---

## Collapsed sidebar

| Question | Options | Selected |
|----------|---------|----------|
| Collapsed look | Icon rail ~72px + tooltips / Fully hidden (Notion) | Icon rail |
| Toggle placement | In sidebar (collapse top, theme bottom) / Theme in Settings | In sidebar |
| Shortcut | Cmd/Ctrl+\ / None | Cmd/Ctrl+\ |
| Mobile | As today / Bottom tab bar | As today |

---

## Status colours & login

| Question | Options | Selected |
|----------|---------|----------|
| Status colours in light | Pastel chips (Notion tags) / Same hues darker | Pastel chips |
| Login page | Follows chosen theme / Always dark | Follows theme |
| Zones map & stats charts | Both adapt / Charts only | Both adapt |

---

## Claude's Discretion

- Token names and CSS mechanism for light-only structural styling
- Exact pastel hues (AA), nav icons, tooltip implementation, cookie attributes, toggle mechanism

## Deferred Ideas

- Notion-like restyle of the dark theme
- Mobile bottom tab bar (rejected)
- Per-account theme preference in DB
