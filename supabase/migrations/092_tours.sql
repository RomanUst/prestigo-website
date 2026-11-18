-- Migration 092: tours
-- Phase 93 (plan 93-01; TRIP-03, TRIP-04, TRIP-05; D-01, D-02, D-07, D-08, D-12, D-15, D-20, D-22) - day trips and custom
-- tours: the tour structure, its per-locale content, its photos with credits, the single tour settings row, the booking
-- columns that make a tour booking, and the public photo bucket.
--
-- Schema FILE only - applied LIVE by the orchestrator through the Supabase MCP (plan 93-01 Task 3) BEFORE any code that
-- reads the new tables ships. Additive: every new table is deny-all, every new bookings column is nullable.
--
-- Owner decision of 2026-11-18 (Task 1, Option A): four tour tables + bookings tour columns + trip_type 'tour'.
-- Live read of public.bookings (orchestrator, 2026-11-18): there is NO CHECK constraint on trip_type (the live values are
-- transfer, round_trip, hourly, daily), so the value 'tour' is accepted as it stands and this file widens no CHECK.
--
-- What this file adds:
--   1. public.tours               the tour (slug, status, hours, start window, price per car class)
--   2. public.tour_translations   one row per (tour, locale) for the 8 site locales
--   3. public.tour_photos         photos with source and credit; one cover per tour
--   4. public.tour_settings       the single row (id = 1): extra-hour prices, free-cancel window, pickup radius
--   5. bookings.tour_id / tour_title / tour_extra_hours
--   6. storage bucket tour-photos (public, 8 MB, jpeg / png / webp / avif)
--   7. deny-all access on the four tables: public pages read them with the service client only
--
-- No price value and no tour row is inserted here (D-01, D-21): prices and content come from the seed and the admin.

-- == 1. tours (D-01, D-07) ===========================================================
CREATE TABLE IF NOT EXISTS public.tours (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   text          NOT NULL UNIQUE
    CONSTRAINT tours_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*-day-trip$' AND char_length(slug) <= 80),
  status                 text          NOT NULL DEFAULT 'draft'
    CONSTRAINT tours_status_check CHECK (status IN ('draft', 'published')),
  sort_order             integer       NOT NULL DEFAULT 0,
  hours_included         smallint      NOT NULL DEFAULT 4 CHECK (hours_included BETWEEN 1 AND 12),
  drive_minutes_each_way integer       CHECK (drive_minutes_each_way IS NULL OR drive_minutes_each_way BETWEEN 10 AND 600),
  start_time_min         text          NOT NULL DEFAULT '08:00' CHECK (start_time_min ~ '^([01][0-9]|2[0-3]):(00|30)$'),
  start_time_max         text          NOT NULL DEFAULT '11:00' CHECK (start_time_max ~ '^([01][0-9]|2[0-3]):(00|30)$'),
  price_e_eur            numeric(10,2) CHECK (price_e_eur IS NULL OR price_e_eur > 0),
  price_s_eur            numeric(10,2) CHECK (price_s_eur IS NULL OR price_s_eur > 0),
  price_v_eur            numeric(10,2) CHECK (price_v_eur IS NULL OR price_v_eur > 0),
  destination_label      text          NOT NULL DEFAULT '' CHECK (char_length(destination_label) <= 120),
  first_published_at     timestamptz,
  created_at             timestamptz   NOT NULL DEFAULT now(),
  updated_at             timestamptz   NOT NULL DEFAULT now(),
  CHECK (start_time_max > start_time_min)
);

CREATE INDEX IF NOT EXISTS tours_status_sort_idx ON public.tours (status, sort_order);

-- == 2. tour_translations (D-08, D-23) ===============================================
-- One row per (tour, locale). is_complete is set by the server when the locale has all the required content.
CREATE TABLE IF NOT EXISTS public.tour_translations (
  tour_id           uuid        NOT NULL REFERENCES public.tours (id) ON DELETE CASCADE,
  locale            text        NOT NULL
    CONSTRAINT tour_translations_locale_check CHECK (locale IN ('en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh', 'zh-hant')),
  title             text        NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  short_description text        NOT NULL DEFAULT '' CHECK (char_length(short_description) <= 400),
  description       text        NOT NULL DEFAULT '' CHECK (char_length(description) <= 8000),
  pickup_info       text        NOT NULL DEFAULT '' CHECK (char_length(pickup_info) <= 2000),
  important_info    text        NOT NULL DEFAULT '' CHECK (char_length(important_info) <= 4000),
  seo_title         text        NOT NULL DEFAULT '' CHECK (char_length(seo_title) <= 120),
  seo_description   text        NOT NULL DEFAULT '' CHECK (char_length(seo_description) <= 300),
  highlights        jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(highlights) = 'array'),
  itinerary         jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(itinerary) = 'array'),
  includes          jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(includes) = 'array'),
  excludes          jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(excludes) = 'array'),
  faq               jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(faq) = 'array'),
  is_complete       boolean     NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tour_id, locale)
);

-- == 3. tour_photos (D-15) ===========================================================
-- storage_path is always server-generated: tours/<tour uuid>/<photo uuid>.<ext> inside the tour-photos bucket.
CREATE TABLE IF NOT EXISTS public.tour_photos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id      uuid        NOT NULL REFERENCES public.tours (id) ON DELETE CASCADE,
  storage_path text        NOT NULL UNIQUE CHECK (storage_path ~ '^tours/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|avif)$'),
  position     smallint    NOT NULL CHECK (position BETWEEN 1 AND 50),
  is_cover     boolean     NOT NULL DEFAULT false,
  source       text        NOT NULL DEFAULT 'own'
    CONSTRAINT tour_photos_source_check CHECK (source IN ('own', 'commons', 'unsplash', 'other')),
  credit_text  text        CHECK (credit_text IS NULL OR char_length(credit_text) <= 200),
  license      text        CHECK (license IS NULL OR char_length(license) <= 80),
  credit_url   text        CHECK (credit_url IS NULL OR credit_url ~ '^https://'),
  width        integer,
  height       integer,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tour_photos_one_cover ON public.tour_photos (tour_id) WHERE is_cover;
CREATE INDEX IF NOT EXISTS tour_photos_tour_position_idx ON public.tour_photos (tour_id, position);

-- == 4. tour_settings (D-02, D-12, D-22) =============================================
-- A single row (id = 1). The extra-hour prices stay null until the admin sets them.
CREATE TABLE IF NOT EXISTS public.tour_settings (
  id                smallint      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  extra_hour_e_eur  numeric(10,2) CHECK (extra_hour_e_eur IS NULL OR extra_hour_e_eur > 0),
  extra_hour_s_eur  numeric(10,2) CHECK (extra_hour_s_eur IS NULL OR extra_hour_s_eur > 0),
  extra_hour_v_eur  numeric(10,2) CHECK (extra_hour_v_eur IS NULL OR extra_hour_v_eur > 0),
  free_cancel_hours smallint      NOT NULL DEFAULT 24 CHECK (free_cancel_hours BETWEEN 0 AND 72),
  pickup_radius_km  numeric(4,1)  NOT NULL DEFAULT 15 CHECK (pickup_radius_km BETWEEN 1 AND 50),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

INSERT INTO public.tour_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- == 5. bookings tour columns (TRIP-04, D-20) ========================================
-- trip_type 'tour' needs no change here: the live bookings table has no CHECK on trip_type.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tour_id uuid REFERENCES public.tours (id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tour_title text CHECK (tour_title IS NULL OR char_length(tour_title) <= 200);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tour_extra_hours smallint CHECK (tour_extra_hours IS NULL OR tour_extra_hours BETWEEN 0 AND 12);

CREATE INDEX IF NOT EXISTS bookings_tour_id_idx ON public.bookings (tour_id) WHERE tour_id IS NOT NULL;

-- == 6. tour-photos bucket (D-15) ====================================================
-- Public, 8 MB, raster images only (no vector or document types). Uploaded server-side with the service role.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tour-photos',
  'tour-photos',
  true,
  8388608, -- 8 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- == 7. deny-all (D-08, T-93-01) =====================================================
-- RLS on, privileges revoked from anon / authenticated, deny policies. Public pages read these tables with the
-- service client only.
REVOKE ALL ON public.tours FROM anon, authenticated;
ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tours_no_public_read ON public.tours;
CREATE POLICY tours_no_public_read ON public.tours FOR SELECT USING (false);
DROP POLICY IF EXISTS tours_no_public_insert ON public.tours;
CREATE POLICY tours_no_public_insert ON public.tours FOR INSERT WITH CHECK (false);

REVOKE ALL ON public.tour_translations FROM anon, authenticated;
ALTER TABLE public.tour_translations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tour_translations_no_public_read ON public.tour_translations;
CREATE POLICY tour_translations_no_public_read ON public.tour_translations FOR SELECT USING (false);
DROP POLICY IF EXISTS tour_translations_no_public_insert ON public.tour_translations;
CREATE POLICY tour_translations_no_public_insert ON public.tour_translations FOR INSERT WITH CHECK (false);

REVOKE ALL ON public.tour_photos FROM anon, authenticated;
ALTER TABLE public.tour_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tour_photos_no_public_read ON public.tour_photos;
CREATE POLICY tour_photos_no_public_read ON public.tour_photos FOR SELECT USING (false);
DROP POLICY IF EXISTS tour_photos_no_public_insert ON public.tour_photos;
CREATE POLICY tour_photos_no_public_insert ON public.tour_photos FOR INSERT WITH CHECK (false);

REVOKE ALL ON public.tour_settings FROM anon, authenticated;
ALTER TABLE public.tour_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tour_settings_no_public_read ON public.tour_settings;
CREATE POLICY tour_settings_no_public_read ON public.tour_settings FOR SELECT USING (false);
DROP POLICY IF EXISTS tour_settings_no_public_insert ON public.tour_settings;
CREATE POLICY tour_settings_no_public_insert ON public.tour_settings FOR INSERT WITH CHECK (false);
