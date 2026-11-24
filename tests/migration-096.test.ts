// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { latestCheckValues, latestFunctionBody, loadMigration } from './helpers/latest-migration'
import { QUOTE_LINE_DESCRIPTION_MAX, QUOTE_LINE_TITLE_MAX, QUOTE_TRIP_TYPES } from '@/lib/quotes/vocabulary'

// Text-level contract of migration 096 (quick task quote-tour-line): tour lines and client descriptions on quotes.
// Comments are stripped by loadMigration, so a rule mentioned only in a comment does not count. Nothing here touches a
// database: the orchestrator applies 096 live (smoke: .planning/quick/quote-tour-line-096-smoke.sql).

const m096 = loadMigration('096_quote_tour_lines.sql')
const flat = m096.replace(/\s+/g, ' ')
const m091 = loadMigration('091_quotes.sql')

/** The text of the one definition of `name` inside a single migration file. */
function bodyIn(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start).toBeGreaterThanOrEqual(0)
  const close = sql.indexOf('\n$$;', sql.indexOf('AS $$', start))
  return sql.slice(start, close + 4)
}

describe('096 quote_version_lines: the tour trip type', () => {
  it('re-creates the trip_type CHECK under the auto-generated 091 name, dropped first', () => {
    expect(flat).toContain('ALTER TABLE public.quote_version_lines DROP CONSTRAINT IF EXISTS quote_version_lines_trip_type_check;')
    expect(flat.indexOf('DROP CONSTRAINT IF EXISTS quote_version_lines_trip_type_check')).toBeLessThan(
      flat.indexOf('ADD CONSTRAINT quote_version_lines_trip_type_check'),
    )
  })

  it('allows exactly the TypeScript trip types (transfer, hourly, daily, tour)', () => {
    expect(latestCheckValues('quote_version_lines_trip_type_check', 'trip_type')).toEqual([...QUOTE_TRIP_TYPES])
    expect(QUOTE_TRIP_TYPES).toContain('tour')
  })

  it('adds title 1..200 and description up to 4000, matching the app limits', () => {
    expect(flat).toContain(
      'ADD COLUMN IF NOT EXISTS title text CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 200);',
    )
    expect(flat).toContain(
      'ADD COLUMN IF NOT EXISTS description text CHECK (description IS NULL OR char_length(description) <= 4000);',
    )
    expect(QUOTE_LINE_TITLE_MAX).toBe(200)
    expect(QUOTE_LINE_DESCRIPTION_MAX).toBe(4000)
  })

  it('requires a title and hours on a tour line', () => {
    expect(flat).toContain('ADD CONSTRAINT quote_version_lines_tour_complete_check')
    expect(flat).toContain("CHECK (trip_type <> 'tour' OR (title IS NOT NULL AND hours IS NOT NULL));")
  })
})

describe('096 bookings.tour_description', () => {
  it('adds the column with the same 4000-character cap', () => {
    expect(flat).toContain(
      'ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tour_description text CHECK (tour_description IS NULL OR char_length(tour_description) <= 4000);',
    )
  })
})

describe('096 quote_convert_to_bookings', () => {
  const latest = latestFunctionBody('quote_convert_to_bookings')
  const latestFlat = latest.replace(/\s+/g, ' ')

  it('the live definition is the 096 one', () => {
    expect(latest).toBe(bodyIn(m096, 'quote_convert_to_bookings'))
  })

  it('is the 091 definition verbatim plus the tour mapping only', () => {
    const added = [
      '      tour_id, tour_title, tour_description,\n',
      '      NULL,\n',
      "      CASE WHEN v_line.trip_type = 'tour' THEN v_line.title ELSE NULL END,\n",
      "      CASE WHEN v_line.trip_type = 'tour' THEN v_line.description ELSE NULL END,\n",
    ]
    let stripped = latest
    for (const line of added) {
      expect(stripped).toContain(line)
      stripped = stripped.replace(line, '')
    }
    expect(stripped).toBe(bodyIn(m091, 'quote_convert_to_bookings'))
  })

  it('maps a tour line to tour_id NULL, tour_title = title, tour_description = description; hours as for every line', () => {
    expect(latestFlat).toContain(
      'special_requests, tour_id, tour_title, tour_description, extra_child_seat, extra_meet_greet, extra_luggage',
    )
    expect(latestFlat).toContain(
      "v_line.special_requests, NULL, CASE WHEN v_line.trip_type = 'tour' THEN v_line.title ELSE NULL END, CASE WHEN v_line.trip_type = 'tour' THEN v_line.description ELSE NULL END, v_line.extra_child_seat",
    )
    expect(latestFlat).toContain('vehicle_class, passengers, luggage, hours,')
    expect(latestFlat).toContain('v_line.trip_type, v_line.pickup_date')
  })

  it('stays SECURITY DEFINER with an empty search_path, service_role only after re-creation', () => {
    expect(latest).toContain('SECURITY DEFINER')
    expect(latest).toContain("SET search_path = ''")
    const sig = 'public.quote_convert_to_bookings(uuid, uuid, text, text, text, jsonb, text, text)'
    const revoke = `REVOKE EXECUTE ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated;`
    const grant = `GRANT EXECUTE ON FUNCTION ${sig} TO service_role;`
    expect(flat).toContain(revoke)
    expect(flat).toContain(grant)
    expect(flat.indexOf(revoke)).toBeGreaterThan(flat.indexOf('CREATE OR REPLACE FUNCTION public.quote_convert_to_bookings('))
  })
})

describe('096 erasure_anonymise_person', () => {
  const latest = latestFunctionBody('erasure_anonymise_person')
  const latestFlat = latest.replace(/\s+/g, ' ')

  it('the live definition is the 096 one', () => {
    expect(latest).toBe(bodyIn(m096, 'erasure_anonymise_person'))
  })

  it('clears the quote line description and the booking tour_description, keeps the title', () => {
    expect(latestFlat).toContain(
      'UPDATE public.bookings b SET tour_description = NULL WHERE b.id = ANY (v_ids) AND b.tour_description IS NOT NULL;',
    )
    expect(latestFlat).toContain(
      'UPDATE public.quote_version_lines ql SET description = NULL WHERE ql.version_id IN (SELECT qv.id FROM public.quote_versions qv WHERE qv.quote_id = ANY (v_quote_ids)) AND ql.description IS NOT NULL;',
    )
    expect(latestFlat).not.toMatch(/title\s*=\s*NULL/)
  })

  it('is the 091 definition verbatim plus those two statements (every 091 statement kept whole)', () => {
    // Comment lines are stripped by loadMigration, so each added statement is followed by one blank line.
    const reverted = latest
      .replace(
        '  UPDATE public.bookings b\n     SET tour_description = NULL\n   WHERE b.id = ANY (v_ids)\n     AND b.tour_description IS NOT NULL;\n\n',
        '',
      )
      .replace(
        '  UPDATE public.quote_version_lines ql\n     SET description = NULL\n   WHERE ql.version_id IN (SELECT qv.id FROM public.quote_versions qv WHERE qv.quote_id = ANY (v_quote_ids))\n     AND ql.description IS NOT NULL;\n\n',
        '',
      )
    expect(reverted).toBe(bodyIn(m091, 'erasure_anonymise_person'))
  })

  it('stays SECURITY DEFINER and service_role only after re-creation', () => {
    expect(latest).toContain('SECURITY DEFINER')
    expect(latest).toContain("SET search_path = ''")
    expect(flat).toContain('REVOKE EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) FROM PUBLIC, anon, authenticated;')
    expect(flat).toContain('GRANT EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) TO service_role;')
  })
})

describe('096 grants nothing to the public roles', () => {
  it('has no GRANT to PUBLIC, anon or authenticated', () => {
    expect(flat).not.toMatch(/GRANT [^;]* TO (PUBLIC|anon|authenticated)/)
  })
})
