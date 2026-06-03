-- Migration 042: content_automation
-- Phase: Social & Blog Content Automation (replacing n8n)
-- Creates content_items — the generation/approval/publishing queue for
-- auto-produced Instagram/Facebook/blog content.
--
-- The pipeline writes rows here at status='pending_approval'; a human approves
-- via Telegram; on approval the app pushes to Buffer (social) and/or commits
-- MDX to GitHub (blog). Service-role only — never readable/writable by anon.

-- 1. Create content_items table
CREATE TABLE IF NOT EXISTS public.content_items (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             TEXT,
  -- post | story | reel | blog
  type               TEXT         NOT NULL,
  -- draft | pending_approval | approved | scheduled | published | failed | rejected
  status             TEXT         NOT NULL DEFAULT 'draft',
  -- e.g. {"instagram": true, "facebook": true, "blog": false}
  channels           JSONB        NOT NULL DEFAULT '{}'::jsonb,

  -- copy
  topic              TEXT,
  gen_prompt         TEXT,
  headline           TEXT,
  headline_em        TEXT,
  subline            TEXT,
  caption            TEXT,
  hashtags           TEXT,
  blog_mdx           TEXT,
  blog_slug          TEXT,

  -- media
  media_raw_url      TEXT,
  media_branded_url  TEXT,
  -- image | video
  media_kind         TEXT,

  -- publishing
  buffer_update_ids  JSONB,
  github_commit_sha  TEXT,
  scheduled_at       TIMESTAMPTZ,
  published_at       TIMESTAMPTZ,
  error              TEXT,

  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT content_items_type_check
    CHECK (type IN ('post', 'story', 'reel', 'blog')),
  CONSTRAINT content_items_status_check
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'scheduled',
                      'published', 'failed', 'rejected')),
  CONSTRAINT content_items_media_kind_check
    CHECK (media_kind IS NULL OR media_kind IN ('image', 'video'))
);

-- Queue lookups: "show me what needs approval / what is scheduled", newest first.
CREATE INDEX IF NOT EXISTS content_items_status_created_idx
  ON public.content_items (status, created_at DESC);

-- blog_slug must be unique when present (one MDX file per slug).
CREATE UNIQUE INDEX IF NOT EXISTS content_items_blog_slug_key
  ON public.content_items (blog_slug)
  WHERE blog_slug IS NOT NULL;

-- 2. Keep updated_at fresh on every UPDATE
CREATE OR REPLACE FUNCTION public.content_items_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_items_set_updated_at ON public.content_items;
CREATE TRIGGER content_items_set_updated_at
  BEFORE UPDATE ON public.content_items
  FOR EACH ROW
  EXECUTE FUNCTION public.content_items_set_updated_at();

-- 3. RLS lockdown — service_role only; anon/public cannot read or write
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_items_no_public_read ON public.content_items;
CREATE POLICY content_items_no_public_read
  ON public.content_items FOR SELECT
  USING (false);

DROP POLICY IF EXISTS content_items_no_public_insert ON public.content_items;
CREATE POLICY content_items_no_public_insert
  ON public.content_items FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS content_items_no_public_update ON public.content_items;
CREATE POLICY content_items_no_public_update
  ON public.content_items FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS content_items_no_public_delete ON public.content_items;
CREATE POLICY content_items_no_public_delete
  ON public.content_items FOR DELETE
  USING (false);
