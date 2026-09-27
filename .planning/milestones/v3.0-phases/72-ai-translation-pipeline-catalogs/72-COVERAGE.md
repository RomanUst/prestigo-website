# API Coverage — Anthropic Claude (Messages API)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Surface = a build-time / CI batch translation script (`scripts/i18n-translate.mjs`) calling `@anthropic-ai/sdk` against `claude-opus-5` (D-01). Never runtime, never client-side.
> Authority for model ID + SDK usage: bundled `claude-api` skill (self-loaded at plan time, 2026-09-12).

| capability | decision | reason |
|---|---|---|
| `messages.create` (single call) | INTEGRATE | core per-unit / per-file translation call; the primary API surface (D-01) |
| system prompt (glossary / DNT / tone) | INTEGRATE | D-06/D-07 rules carried in a per-locale system block; the model's only signal that ICU/tags are syntax not vocabulary |
| prompt caching (`cache_control: {type:"ephemeral"}` on the system block) | INTEGRATE | the glossary+DNT+tone system block is identical across ~600 calls per locale in a run → cache reads ~0.1x cost; verified via `usage.cache_read_input_tokens > 0` |
| structured outputs (`output_config: {format: {...}}`) | INTEGRATE | short-string batch (Pattern 3.1) returns a validated JSON array in-order; replaces assistant prefill (prefill returns 400 on Opus 5) |
| streaming (`.stream()` / `.getFinalMessage()`) | INTEGRATE | long-form route/page prose and whole-document MDX blog bodies (Pattern 3.2/4) can exceed safe non-streaming `max_tokens`; streaming avoids HTTP timeouts on high `max_tokens` |
| model selection (`claude-opus-5`) | INTEGRATE | D-01 locks Opus; exact ID string from the `claude-api` skill (no date suffix) |
| thinking / effort (`thinking:{type:"adaptive"}`, `output_config.effort`) | INTEGRATE | translation is not a hard-reasoning task → run at `low`/`medium` effort for cost; adaptive is Opus 5 default; never `budget_tokens` (400 on Opus 5) |
| retries / backoff | INTEGRATE | SDK default `max_retries` on 408/409/429/5xx + a per-unit try/catch so one failed unit is flagged in the QA report and does not abort the whole run |
| typed errors | INTEGRATE | SDK typed exception classes (`RateLimitError`, `APIConnectionError`, `BadRequestError`) for fail-loud, most-specific-first handling |
| token counting (`messages.countTokens`) | INTEGRATE | pre-run first-run cost estimate (Pitfall 4 — the first run is a full-catalog translation) recorded in the QA report |
| message batches API (`messages.batches.*`) | OPT-OUT | async 50%-cost path but adds polling/lifecycle and a second CI job to poll for completion, complicating the D-08 open-a-PR step; deferred cost optimization (RESEARCH Assumption A3) — revisit Phase 73+ once real per-run cost is measured |
| fast mode (`speed:"fast"`) | OPT-OUT | premium pricing; an async CI batch has no user-facing latency requirement |
| vision / image input | OPT-OUT | text-only translation; no image sources |
| Files API (`client.files.*`) | OPT-OUT | EN sources are read from the local filesystem; no upload/reuse across requests needed |
| tool use / Tool Runner / agents / MCP | OPT-OUT | a deterministic read→translate→write transform; no model-driven tool loop |
| compaction / context editing | OPT-OUT | per-unit / per-file calls are short-lived and stateless; no long multi-turn conversation to compact |
| refusal fallbacks (`fallbacks`) | OPT-OUT | owner-authored source content carries no policy-refusal risk; model is Opus 5 (not the Fable tier that defaults fallbacks on) |
| mid-conversation system messages | OPT-OUT | single-turn calls; no mid-conversation operator channel |

**Opt-out review:** all opt-outs are cost/complexity or not-applicable-to-text-translation. The single revisit trigger is Message Batches — flagged for Phase 73+ once the first-run cost (measured in the QA report token-count step) is known.
