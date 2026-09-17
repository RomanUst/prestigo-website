# Phase 73 — API Coverage Decision

**Detector:** `api-coverage.cjs` fired (`detected: true`) on the strings "Anthropic API" and "No external API integration" that appear in this phase's PLAN bodies (threat model + `api_coverage` declarations).

**Decision: OPT-OUT — no external API integration surface added this phase.**

No external API integration: re-runs the existing Phase 72 translation pipeline (`scripts/i18n-translate.mjs`, `@anthropic-ai/sdk@0.125.0`) for `ar`/`hi`/`zh`; no new API surface added.

Rationale:
- The only API touched is the Anthropic translator, and it is invoked through the **already-built, already-verified** Phase 72 pipeline. This phase adds three locales to the `--locales` set and three `i18n/glossary.json` `locales.*` entries — it writes zero new API client code, endpoints, request/response handling, retries, or error surfaces.
- The font layer (`next/font/google` Noto loaders) is a build-time asset fetch that self-hosts, not a runtime external-API integration.
- The RTL layer is pure CSS/Tailwind class conversion — no network surface.

The seal-time `api-coverage.verify-pre` gate accepts this reasoned declaration in place of a capability matrix.
