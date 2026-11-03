// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { latestFunctionBody, latestStatusCheckValues, loadMigration } from './helpers/latest-migration'

// Text-level contract tests for migration 084 (Phase 87, plan 87-02): the two driver-flow statuses,
// the booking_status_log + trigger, the compare-and-set RPC, the no-show request RPC and the no-show
// wait settings. The live behaviour is proven by the rolled-back smoke 87-02-smoke.sql; these tests
// pin the guards that must never be edited out. Comment lines are stripped, so a rule mentioned only
// in a comment does not count.

const m084 = loadMigration('084_booking_statuses_status_log.sql')

/** Every function created or replaced in 084: name -> full text from CREATE to closing $$;. */
function functionsIn084(): Map<string, string> {
  const out = new Map<string, string>()
  const re = /CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(m084)) !== null) {
    const open = m084.indexOf('AS $$', m.index)
    const close = m084.indexOf('$$;', open + 5)
    out.set(m[1], m084.slice(m.index, close + 3))
  }
  return out
}

const fns = functionsIn084()

const CALLABLE = ['advance_booking_status', 'set_no_show_request', 'booking_lead_status', 'panel_bookings', 'stats_trips']
const ALL_FUNCTIONS = [...CALLABLE, 'log_booking_status_change', 'notify_booking_gcal_sync']

describe('084 status vocabulary', () => {
  it('bookings_status_check lists the ten statuses', () => {
    const values = latestStatusCheckValues()
    expect(values).toHaveLength(10)
    expect(values).toContain('on_board')
    expect(values).toContain('no_show')
  })

  it('adds completed_at and no_show_requested_at to bookings', () => {
    expect(m084).toMatch(/ADD COLUMN IF NOT EXISTS completed_at\s+timestamptz/)
    expect(m084).toMatch(/ADD COLUMN IF NOT EXISTS no_show_requested_at\s+timestamptz/)
  })
})

describe('084 booking_status_log', () => {
  it('creates the table with the agreed columns and checks', () => {
    const start = m084.indexOf('CREATE TABLE IF NOT EXISTS public.booking_status_log')
    expect(start).toBeGreaterThan(-1)
    const table = m084.slice(start, m084.indexOf(');', start))
    expect(table).toMatch(/id\s+bigint\s+GENERATED ALWAYS AS IDENTITY PRIMARY KEY/)
    expect(table).toMatch(/booking_id\s+uuid\s+NOT NULL REFERENCES public\.bookings\(id\) ON DELETE CASCADE/)
    expect(table).toMatch(/event\s+text\s+NOT NULL DEFAULT 'status_change'/)
    expect(table).toContain("'status_change'")
    expect(table).toContain("'no_show_requested'")
    expect(table).toContain("'no_show_cleared'")
    expect(table).toMatch(/actor_type\s+text\s+NOT NULL/)
    expect(table).toContain("'admin'")
    expect(table).toContain("'driver'")
    expect(table).toContain("'system'")
    expect(table).toMatch(/length\(actor_id\) <= 64/)
    expect(table).toContain("'^[a-z_]{1,40}$'")
    expect(table).toMatch(/created_at\s+timestamptz\s+NOT NULL DEFAULT now\(\)/)
  })

  it('has the (booking_id, created_at) index and the partial unique completed index', () => {
    expect(m084).toMatch(/ON public\.booking_status_log \(booking_id, created_at\)/)
    expect(m084).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS booking_status_log_one_completed\s+ON public\.booking_status_log \(booking_id\)\s+WHERE event = 'status_change' AND to_status = 'completed'/,
    )
  })

  it('is locked down: RLS on, REVOKE ALL, deny-all select and insert policies', () => {
    expect(m084).toContain('REVOKE ALL ON public.booking_status_log FROM anon, authenticated;')
    expect(m084).toContain('ALTER TABLE public.booking_status_log ENABLE ROW LEVEL SECURITY;')
    expect(m084).toMatch(/ON public\.booking_status_log FOR SELECT\s+USING \(false\)/)
    expect(m084).toMatch(/ON public\.booking_status_log FOR INSERT\s+WITH CHECK \(false\)/)
  })
})

describe('084 status log trigger (PAYF-02)', () => {
  it('fires AFTER UPDATE OF status per row when the status changed', () => {
    expect(m084).toMatch(/DROP TRIGGER IF EXISTS bookings_status_log ON public\.bookings;/)
    expect(m084).toMatch(
      /CREATE TRIGGER bookings_status_log\s+AFTER UPDATE OF status ON public\.bookings\s+FOR EACH ROW\s+WHEN \(OLD\.status IS DISTINCT FROM NEW\.status\)\s+EXECUTE FUNCTION public\.log_booking_status_change\(\)/,
    )
  })

  it('inserts ON CONFLICT DO NOTHING and falls back to system for an unknown actor type', () => {
    const body = fns.get('log_booking_status_change')!
    expect(body).toContain("current_setting('prestigo.actor_type', true)")
    expect(body).toContain("current_setting('prestigo.actor_id', true)")
    expect(body).toContain("current_setting('prestigo.source', true)")
    expect(body).toMatch(/NOT IN \('admin', 'driver', 'system'\)/)
    expect(body).toMatch(/v_actor_type := 'system'/)
    expect(body).toContain('ON CONFLICT DO NOTHING')
  })
})

describe('084 advance_booking_status (compare-and-set)', () => {
  const body = fns.get('advance_booking_status')!

  it('has the agreed signature and returns jsonb', () => {
    expect(body).toMatch(
      /advance_booking_status\(\s*p_booking_id\s+uuid,\s*p_from\s+text,\s*p_to\s+text,\s*p_actor_type\s+text,\s*p_actor_id\s+text,\s*p_source\s+text,\s*p_patch\s+jsonb DEFAULT '\{\}'::jsonb\s*\)\s*RETURNS jsonb/,
    )
  })

  it('sets the actor settings transaction-locally', () => {
    expect(body).toContain("set_config('prestigo.actor_type'")
    expect(body).toContain("set_config('prestigo.actor_id'")
    expect(body).toContain("set_config('prestigo.source'")
    expect(body).not.toMatch(/set_config\([^)]*,\s*false\)/)
  })

  it('rejects an actor type outside admin|driver|system', () => {
    expect(body).toMatch(/p_actor_type IS NULL OR p_actor_type NOT IN \('admin', 'driver', 'system'\)/)
    expect(body).toContain('RAISE EXCEPTION')
  })

  it('updates only WHERE id = p_booking_id AND status = p_from', () => {
    expect(body).toMatch(/WHERE b\.id = p_booking_id\s+AND b\.status = p_from/)
  })

  it('sets completed_at only on the move to completed', () => {
    expect(body).toMatch(/completed_at\s*=\s*CASE WHEN p_to = 'completed' AND b\.status IS DISTINCT FROM 'completed'/)
  })

  it('reads only the allowlisted patch keys, through the ? operator', () => {
    for (const key of ['operator_notes', 'driver_price_czk', 'driver_id', 'clear_payment_link']) {
      expect(body).toContain(`p_patch ? '${key}'`)
    }
    const used = [...new Set([...body.matchAll(/p_patch\s*\?\s*'([a-z_]+)'/g)].map((x) => x[1]))].sort()
    expect(used).toEqual(['clear_payment_link', 'driver_id', 'driver_price_czk', 'operator_notes'])
  })

  it('returns applied true with the row, or applied false with the current status', () => {
    expect(body).toMatch(/'applied', true/)
    expect(body).toMatch(/'previous_status', p_from/)
    expect(body).toMatch(/'booking', to_jsonb\(v_row\)/)
    expect(body).toMatch(/'applied', false/)
    expect(body).toMatch(/'current_status'/)
  })

  it('never touches money columns and takes no arbitrary column list', () => {
    expect(m084).not.toContain('jsonb_populate_record')
    expect(m084).not.toContain('jsonb_populate_recordset')
    for (const name of ['advance_booking_status', 'set_no_show_request']) {
      const fnBody = fns.get(name)!
      expect(fnBody).not.toContain('amount_')
      expect(fnBody).not.toContain('payment_intent_id')
      expect(fnBody).not.toContain('paid_at')
    }
  })
})

describe('084 set_no_show_request', () => {
  const body = fns.get('set_no_show_request')!

  it('has the agreed signature', () => {
    expect(body).toMatch(
      /set_no_show_request\(\s*p_booking_id\s+uuid,\s*p_action\s+text,\s*p_actor_type\s+text,\s*p_actor_id\s+text\s*\)\s*RETURNS jsonb/,
    )
  })

  it('only requests from on_location once, and only clears a set flag', () => {
    expect(body).toMatch(/b\.status = 'on_location'\s+AND b\.no_show_requested_at IS NULL/)
    expect(body).toMatch(/SET no_show_requested_at = NULL/)
    expect(body).toMatch(/b\.no_show_requested_at IS NOT NULL/)
  })

  it('rejects an unknown action and logs both events', () => {
    expect(body).toMatch(/p_action IS NULL OR p_action NOT IN \('request', 'clear'\)/)
    expect(body).toContain('RAISE EXCEPTION')
    expect(body).toContain("'no_show_requested'")
    expect(body).toContain("'no_show_cleared'")
    expect(body).toContain("'driver_trip'")
    expect(body).toContain("'admin_no_show'")
  })
})

describe('084 grants (T-87-04)', () => {
  it('re-creates exactly the seven expected functions', () => {
    expect([...fns.keys()].sort()).toEqual([...ALL_FUNCTIONS].sort())
  })

  it('every function is revoked from PUBLIC, anon and authenticated', () => {
    for (const name of ALL_FUNCTIONS) {
      expect(m084, name).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`),
      )
    }
  })

  it('the five callable RPCs are granted to service_role only', () => {
    for (const name of CALLABLE) {
      expect(m084, name).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO service_role;`))
    }
    for (const name of ['log_booking_status_change', 'notify_booking_gcal_sync']) {
      expect(m084, name).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\(`))
    }
    expect(m084).not.toMatch(/GRANT EXECUTE[^;]*\bTO (anon|authenticated|PUBLIC)\b/)
  })

  it('every function pins search_path and every SECURITY DEFINER function says so', () => {
    for (const [name, text] of fns) {
      const header = text.slice(0, text.indexOf('AS $$'))
      expect(header, name).toContain("SET search_path = ''")
      if (name !== 'booking_lead_status') expect(header, name).toContain('SECURITY DEFINER')
    }
  })
})

describe('084 redefined lead / calendar / panel / stats functions', () => {
  it('booking_lead_status maps on_board and no_show to converted (D-10)', () => {
    const body = latestFunctionBody('booking_lead_status')
    expect(body).toMatch(/WHEN 'on_board'\s+THEN 'converted'/)
    expect(body).toMatch(/WHEN 'no_show'\s+THEN 'converted'/)
    expect(body).toMatch(/WHEN 'cancelled'\s+THEN 'dead'/)
  })

  it('notify_booking_gcal_sync treats on_board and no_show as calendar-active', () => {
    const body = latestFunctionBody('notify_booking_gcal_sync')
    const arr = body.match(/ARRAY\[([^\]]*)\]/)
    expect(arr).not.toBeNull()
    const values = [...arr![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
    expect(values).toContain('on_board')
    expect(values).toContain('no_show')
    expect(values).toContain('completed')
    expect(values).not.toContain('cancelled')
  })

  it('panel_bookings counts on_board as value, excludes no_show, keeps the cancelled filter (D-11)', () => {
    const body = latestFunctionBody('panel_bookings')
    expect(body).toContain("b.status IN ('confirmed', 'assigned', 'en_route', 'on_location', 'on_board', 'completed')")
    expect(body).not.toContain("'no_show'")
    expect(body).toContain("b.status <> 'cancelled'")
  })

  it('stats_trips counts on_board as value and excludes no_show (D-11)', () => {
    const body = latestFunctionBody('stats_trips')
    expect(body).toContain("b.status IN ('confirmed', 'assigned', 'en_route', 'on_location', 'on_board', 'completed')")
    expect(body).not.toContain("'no_show'")
  })
})

describe('084 no-show wait settings (D-15)', () => {
  it('adds the two thresholds with defaults 30 and 60 and bounds 1..240', () => {
    expect(m084).toMatch(/ADD COLUMN IF NOT EXISTS noshow_wait_city_min integer NOT NULL DEFAULT 30/)
    expect(m084).toMatch(/ADD COLUMN IF NOT EXISTS noshow_wait_airport_min integer NOT NULL DEFAULT 60/)
    expect(m084).toMatch(/CHECK \(noshow_wait_city_min > 0 AND noshow_wait_city_min <= 240\)/)
    expect(m084).toMatch(/CHECK \(noshow_wait_airport_min > 0 AND noshow_wait_airport_min <= 240\)/)
  })
})

describe('87-02 smoke script', () => {
  const smoke = readFileSync(
    join(process.cwd(), '.planning', 'phases', '87-status-service-driver-step-flow', '87-02-smoke.sql'),
    'utf8',
  )

  it('is one DO block that ends in a rolling-back SMOKE_OK exception', () => {
    expect(smoke.match(/\bDO\s+\$/g)).toHaveLength(1)
    expect(smoke).toContain("RAISE EXCEPTION 'SMOKE_OK all checks passed'")
    expect(smoke.split('SMOKE_OK').length - 1).toBe(1)
    expect(smoke).toContain('SMOKE_FAIL')
  })
})
