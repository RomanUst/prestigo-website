-- Migration 043: per-channel media variants for content_items
-- Adds a JSONB map of branded media URLs keyed by channel/format so a single
-- content item can carry platform-specific images:
--   { "instagram": "<1080x1080 url>", "facebook": "<1200x630 url>", "story": "<1080x1920 url>" }
-- publish.ts resolves media_variants[channel] first, then falls back to
-- media_branded_url, then media_raw_url. Backward compatible: existing rows
-- have media_variants = '{}' and keep using media_branded_url.

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS media_variants JSONB NOT NULL DEFAULT '{}'::jsonb;
