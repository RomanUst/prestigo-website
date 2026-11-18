// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { latestCheckValues, loadMigration } from './helpers/latest-migration'
import { locales } from '@/i18n/locales'
import {
  MAX_EXTRA_HOURS,
  TOUR_PHOTO_SOURCES,
  TOUR_SLUG_PATTERN,
  TOUR_STATUSES,
} from '@/lib/tours/types'

// Text-level contract of migration 092 (Phase 93 plan 93-01: tours). Comments are stripped by loadMigration, so a rule
// mentioned only in a comment does not count. Nothing here touches a database: the orchestrator applies 092 live.

const m092 = loadMigration('092_tours.sql')
const flat = m092.replace(/\s+/g, ' ')

/** The statement (up to its closing semicolon) that starts at the first occurrence of `needle`. */
function statementFrom(needle: string): string {
  const start = flat.indexOf(needle)
  expect(start, `"${needle}" is in 092`).toBeGreaterThanOrEqual(0)
  const end = flat.indexOf(';', start)
  return flat.slice(start, end + 1)
}

const table = (name: string) => statementFrom(`CREATE TABLE IF NOT EXISTS public.${name} (`)

const TOUR_TABLES = ['tours', 'tour_translations', 'tour_photos', 'tour_settings'] as const

describe('092 tours (D-01, D-07, D-02)', () => {
  const tours = table('tours')

  it('pins the slug to the -day-trip URL shape (D-07)', () => {
    expect(tours).toContain('slug text NOT NULL UNIQUE CONSTRAINT tours_slug_check CHECK (slug ~ ')
    expect(tours).toContain(`'${TOUR_SLUG_PATTERN.source}'`)
    expect(tours).toContain('char_length(slug) <= 80')
  })

  it('has the draft/published status list', () => {
    const values = latestCheckValues('tours_status_check', 'status')
    expect(values).toEqual([...TOUR_STATUSES])
    expect(tours).toContain("status text NOT NULL DEFAULT 'draft'")
  })

  it('has hours included 1..12, drive minutes 10..600 and the start window', () => {
    expect(tours).toContain('hours_included smallint NOT NULL DEFAULT 4 CHECK (hours_included BETWEEN 1 AND 12)')
    expect(tours).toContain(
      'drive_minutes_each_way integer CHECK (drive_minutes_each_way IS NULL OR drive_minutes_each_way BETWEEN 10 AND 600)',
    )
    expect(tours).toContain("start_time_min text NOT NULL DEFAULT '08:00'")
    expect(tours).toContain("start_time_max text NOT NULL DEFAULT '11:00'")
    expect(tours).toContain("start_time_min ~ '^([01][0-9]|2[0-3]):(00|30)$'")
    expect(tours).toContain("start_time_max ~ '^([01][0-9]|2[0-3]):(00|30)$'")
    expect(tours).toContain('CHECK (start_time_max > start_time_min)')
  })

  it('has one nullable positive price per car class (D-01), never a seeded value', () => {
    for (const col of ['price_e_eur', 'price_s_eur', 'price_v_eur']) {
      expect(tours, col).toContain(`${col} numeric(10,2) CHECK (${col} IS NULL OR ${col} > 0)`)
    }
    expect(tours).toContain("destination_label text NOT NULL DEFAULT '' CHECK (char_length(destination_label) <= 120)")
    expect(tours).toContain('first_published_at timestamptz')
    expect(flat).toContain('CREATE INDEX IF NOT EXISTS tours_status_sort_idx ON public.tours (status, sort_order)')
    // no tour row and no price is inserted by the migration (D-01, D-21)
    expect(flat).not.toMatch(/INSERT INTO public\.tours\b/)
  })
})

describe('092 tour_translations (D-08, D-23)', () => {
  const tr = table('tour_translations')

  it('has the locale CHECK equal to the site locales', () => {
    expect(latestCheckValues('tour_translations_locale_check', 'locale')).toEqual([...locales])
  })

  it('is keyed by (tour, locale) and cascades with the tour', () => {
    expect(tr).toContain('tour_id uuid NOT NULL REFERENCES public.tours (id) ON DELETE CASCADE')
    expect(tr).toContain('PRIMARY KEY (tour_id, locale)')
    expect(tr).toContain('is_complete boolean NOT NULL DEFAULT false')
  })

  it('bounds every text column and types every list column as a json array', () => {
    for (const [col, max] of [
      ['title', 120],
      ['short_description', 400],
      ['description', 8000],
      ['pickup_info', 2000],
      ['important_info', 4000],
      ['seo_title', 120],
      ['seo_description', 300],
    ] as const) {
      expect(tr, col).toContain(`${col} text NOT NULL DEFAULT '' CHECK (char_length(${col}) <= ${max})`)
    }
    for (const col of ['highlights', 'itinerary', 'includes', 'excludes', 'faq']) {
      expect(tr, col).toContain(
        `${col} jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(${col}) = 'array')`,
      )
    }
  })
})

describe('092 tour_photos (D-15)', () => {
  const photos = table('tour_photos')

  it('records the source, the credit and an https-only credit link', () => {
    expect(latestCheckValues('tour_photos_source_check', 'source')).toEqual([...TOUR_PHOTO_SOURCES])
    expect(photos).toContain("source text NOT NULL DEFAULT 'own'")
    expect(photos).toContain('credit_text text CHECK (credit_text IS NULL OR char_length(credit_text) <= 200)')
    expect(photos).toContain('license text CHECK (license IS NULL OR char_length(license) <= 80)')
    expect(photos).toContain("credit_url text CHECK (credit_url IS NULL OR credit_url ~ '^https://')")
  })

  it('forces a server-generated storage path and a bounded position', () => {
    expect(photos).toContain('storage_path text NOT NULL UNIQUE CHECK (storage_path ~ ')
    expect(photos).toContain('tours/[0-9a-f-]{36}/[0-9a-f-]{36}')
    expect(photos).toContain('(jpg|png|webp|avif)$')
    expect(photos).toContain('position smallint NOT NULL CHECK (position BETWEEN 1 AND 50)')
    expect(photos).toContain('tour_id uuid NOT NULL REFERENCES public.tours (id) ON DELETE CASCADE')
  })

  it('allows one cover per tour', () => {
    expect(flat).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS tour_photos_one_cover ON public.tour_photos (tour_id) WHERE is_cover',
    )
    expect(flat).toContain('CREATE INDEX IF NOT EXISTS tour_photos_tour_position_idx ON public.tour_photos (tour_id, position)')
  })
})

describe('092 tour_settings (D-02, D-12, D-22)', () => {
  const settings = table('tour_settings')

  it('is a single row with the extra-hour prices and the rules', () => {
    expect(settings).toContain('id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1)')
    for (const col of ['extra_hour_e_eur', 'extra_hour_s_eur', 'extra_hour_v_eur']) {
      expect(settings, col).toContain(`${col} numeric(10,2) CHECK (${col} IS NULL OR ${col} > 0)`)
    }
    expect(settings).toContain('free_cancel_hours smallint NOT NULL DEFAULT 24 CHECK (free_cancel_hours BETWEEN 0 AND 72)')
    expect(settings).toContain('pickup_radius_km numeric(4,1) NOT NULL DEFAULT 15 CHECK (pickup_radius_km BETWEEN 1 AND 50)')
  })

  it('inserts its single row without overwriting an edited one', () => {
    expect(flat).toContain('INSERT INTO public.tour_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING')
  })
})

describe('092 deny-all (D-08, T-93-01)', () => {
  for (const name of TOUR_TABLES) {
    it(`${name}: revoked from anon and authenticated, RLS on, deny policies, no grant`, () => {
      expect(flat).toContain(`REVOKE ALL ON public.${name} FROM anon, authenticated;`)
      expect(flat).toContain(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;`)
      expect(flat).toContain(`CREATE POLICY ${name}_no_public_read ON public.${name} FOR SELECT USING (false);`)
      expect(flat).toContain(`CREATE POLICY ${name}_no_public_insert ON public.${name} FOR INSERT WITH CHECK (false);`)
      expect(flat).toContain(`DROP POLICY IF EXISTS ${name}_no_public_read ON public.${name};`)
      expect(flat).toContain(`DROP POLICY IF EXISTS ${name}_no_public_insert ON public.${name};`)
    })
  }

  it('grants nothing to anon or authenticated and creates no function', () => {
    expect(flat).not.toMatch(/GRANT [^;]* TO [^;]*\b(anon|authenticated)\b/)
    expect(flat).not.toContain('CREATE OR REPLACE FUNCTION')
    expect(flat).not.toContain('SECURITY DEFINER')
  })
})

describe('092 bookings tour columns (TRIP-04, D-20)', () => {
  it('adds tour_id, tour_title and tour_extra_hours', () => {
    expect(flat).toContain('ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tour_id uuid REFERENCES public.tours (id) ON DELETE SET NULL')
    expect(flat).toContain(
      'ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tour_title text CHECK (tour_title IS NULL OR char_length(tour_title) <= 200)',
    )
    expect(flat).toContain(
      `ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tour_extra_hours smallint CHECK (tour_extra_hours IS NULL OR tour_extra_hours BETWEEN 0 AND ${MAX_EXTRA_HOURS})`,
    )
    expect(flat).toContain(
      'CREATE INDEX IF NOT EXISTS bookings_tour_id_idx ON public.bookings (tour_id) WHERE tour_id IS NOT NULL',
    )
  })

  it("leaves trip_type alone: the live bookings table has no CHECK on it, so 'tour' needs no widening", () => {
    expect(flat).not.toContain('bookings_trip_type')
    expect(flat).not.toMatch(/ALTER TABLE public\.bookings (DROP|ADD) CONSTRAINT/)
  })
})

describe('092 tour-photos bucket (D-15, T-93-02)', () => {
  const bucket = statementFrom("INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)")

  it('is public, 8 MB and image types only', () => {
    expect(bucket).toContain("'tour-photos', 'tour-photos', true, 8388608")
    expect(bucket).toContain("ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']")
    expect(flat).toContain('ON CONFLICT (id) DO UPDATE')
  })

  it('never allows SVG', () => {
    expect(m092.toLowerCase()).not.toContain('image/svg')
    expect(m092.toLowerCase()).not.toContain('svg')
  })
})
