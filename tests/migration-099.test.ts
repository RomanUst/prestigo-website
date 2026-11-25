import { describe, it, expect } from 'vitest'
import { latestFunctionBody, loadMigration } from './helpers/latest-migration'

// Migration 099 (send a quote with TBC fields; bookings once the operator fills them). Comments are stripped by
// loadMigration, so only real statements count.

const m099 = loadMigration('099_quote_send_tbc.sql')
const m098 = loadMigration('098_quote_no_deposit.sql')
const flat = m099.replace(/\s+/g, ' ')

function bodyIn(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start).toBeGreaterThanOrEqual(0)
  const close = sql.indexOf('\n$$;', sql.indexOf('AS $$', start))
  return sql.slice(start, close + 4)
}

const INCOMPLETE =
  "( l.pickup_date IS NULL OR l.pickup_time IS NULL OR l.origin_address IS NULL OR (l.trip_type = 'transfer' AND l.destination_address IS NULL) OR (l.trip_type = 'hourly' AND l.hours IS NULL) OR (l.trip_type = 'daily' AND l.return_date IS NULL) OR (l.trip_type = 'tour' AND (l.title IS NULL OR l.hours IS NULL)))"

describe('099 freezing and the line guard', () => {
  it('a version is frozen with a price on every line; nothing else is required', () => {
    expect(flat).toContain('WHERE l.version_id = NEW.id AND l.amount_minor IS NULL;')
    expect(flat).not.toContain('WHERE l.version_id = NEW.id AND ( l.pickup_date IS NULL')
  })

  it('the line guard lets only the fill switch through, for UPDATE of quote_version_lines', () => {
    expect(flat).toContain(
      "IF current_setting('prestigo.quote_fill', true) = 'on' AND TG_TABLE_NAME = 'quote_version_lines' AND TG_OP = 'UPDATE' THEN RETURN NEW; END IF;",
    )
  })

  it('adds quotes.bookings_pending', () => {
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS bookings_pending boolean NOT NULL DEFAULT false')
  })
})

describe('099 quote_convert_to_bookings', () => {
  const body = bodyIn(m099, 'quote_convert_to_bookings')
  const bodyFlat = body.replace(/\s+/g, ' ')

  it('is the live definition', () => {
    expect(latestFunctionBody('quote_convert_to_bookings')).toBe(body)
  })

  it('records a payment on a quote with a TBC line as paid with bookings_pending and makes no booking', () => {
    expect(bodyFlat).toContain(`AND ${INCOMPLETE} ) INTO v_pending;`)
    expect(bodyFlat).toContain('IF v_pending THEN UPDATE public.quotes q SET status = \'paid\', paid_at = now(), bookings_pending = true,')
    expect(bodyFlat).toContain("RETURN jsonb_build_object('converted', true, 'first_time', true, 'booking_ids', '[]'::jsonb, 'pending', true);")
    expect(bodyFlat.indexOf('IF v_pending THEN')).toBeLessThan(bodyFlat.indexOf('INSERT INTO public.bookings'))
  })

  it('keeps the booking insert of 098 unchanged', () => {
    const insert = (b: string) => b.slice(b.indexOf('INSERT INTO public.bookings'), b.indexOf('RETURNING id INTO v_booking_id'))
    expect(insert(body)).toBe(insert(bodyIn(m098, 'quote_convert_to_bookings')))
  })
})

describe('099 quote_fill_line_details', () => {
  const body = bodyIn(m099, 'quote_fill_line_details').replace(/\s+/g, ' ')

  it('writes only fields that are still NULL, on the version the client has', () => {
    for (const col of ['pickup_date', 'pickup_time', 'origin_address', 'destination_address', 'return_date', 'title', 'flight_number', 'terminal']) {
      expect(body).toContain(`${col} = COALESCE(l.${col}, p_patch ->> '${col}')`)
    }
    expect(body).toContain('IF v_version.frozen_at IS NULL OR v_version.id IS DISTINCT FROM COALESCE(v_quote.accepted_version_id, v_quote.current_version_id) THEN')
    expect(body).toContain("v_quote.status NOT IN ('sent', 'viewed', 'accepted', 'paid')")
  })

  it('switches the guard on only around its own UPDATE and drops the stored PDF', () => {
    expect(body.indexOf("set_config('prestigo.quote_fill', 'on', true)")).toBeLessThan(body.indexOf('UPDATE public.quote_version_lines'))
    expect(body.indexOf("set_config('prestigo.quote_fill', 'off', true)")).toBeGreaterThan(body.indexOf('UPDATE public.quote_version_lines'))
    expect(body).toContain('DELETE FROM public.quote_documents d WHERE d.version_id = v_version.id;')
  })
})

describe('099 quote_create_pending_bookings', () => {
  const body = bodyIn(m099, 'quote_create_pending_bookings')
  const bodyFlat = body.replace(/\s+/g, ' ')

  it('makes bookings only for a paid, pending, complete quote, and answers the existing ones on a second call', () => {
    expect(bodyFlat).toContain("IF v_quote.status <> 'paid' OR v_quote.paid_at IS NULL OR NOT v_quote.bookings_pending THEN")
    expect(bodyFlat).toContain(`AND ${INCOMPLETE} ) THEN RETURN jsonb_build_object('created', false, 'reason', 'incomplete');`)
    expect(bodyFlat).toContain("RETURN jsonb_build_object('created', true, 'first_time', false, 'booking_ids', to_jsonb(v_ids));")
    expect(bodyFlat).toContain('SET bookings_pending = false,')
  })

  it('inserts the same booking columns as the conversion', () => {
    const insert = (b: string) => b.slice(b.indexOf('INSERT INTO public.bookings'), b.indexOf('RETURNING id INTO v_booking_id'))
    expect(insert(body)).toBe(insert(bodyIn(m099, 'quote_convert_to_bookings')))
  })
})

describe('099 grants', () => {
  it('every re-created or new SECURITY DEFINER function is service_role only', () => {
    for (const sig of [
      'quote_convert_to_bookings(uuid, uuid, text, text, text, jsonb, text, text)',
      'quote_fill_line_details(uuid, jsonb, text)',
      'quote_create_pending_bookings(uuid, jsonb, text, text)',
    ]) {
      expect(flat).toContain(`REVOKE EXECUTE ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`)
      expect(flat).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`)
    }
  })
})
