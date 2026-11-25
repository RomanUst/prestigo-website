// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadMigration, latestFunctionBody } from './helpers/latest-migration'

// Phase 94 plan 94-01 (DCAB-01/02/12/13, D-16): text pins for migration 100 and the cabinet rate-limit keys.
// The live behaviour is proven by the rolled-back smoke (94-01-smoke.sql), run by the orchestrator.

const SQL = loadMigration('100_driver_cabinet.sql')
const NEW_TABLES = ['driver_login_codes', 'driver_sessions', 'driver_push_subscriptions'] as const

function tableBlock(name: string): string {
  const start = SQL.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`)
  expect(start, `CREATE TABLE ${name}`).toBeGreaterThan(-1)
  return SQL.slice(start, SQL.indexOf(');', start) + 2)
}

describe('migration 100: drivers columns', () => {
  it('adds the three cabinet columns idempotently', () => {
    expect(SQL).toMatch(/ALTER TABLE public\.drivers ADD COLUMN IF NOT EXISTS cabinet_enabled boolean NOT NULL DEFAULT false/)
    expect(SQL).toMatch(/ALTER TABLE public\.drivers ADD COLUMN IF NOT EXISTS cabinet_invited_at timestamptz NULL/)
    expect(SQL).toMatch(/ALTER TABLE public\.drivers ADD COLUMN IF NOT EXISTS vehicle_plate text NULL/)
  })

  it('pins the plate length check, dropped first so a re-run is safe', () => {
    expect(SQL).toMatch(/DROP CONSTRAINT IF EXISTS drivers_vehicle_plate_check/)
    expect(SQL).toMatch(
      /ADD CONSTRAINT drivers_vehicle_plate_check\s+CHECK \(vehicle_plate IS NULL OR char_length\(vehicle_plate\) BETWEEN 1 AND 16\)/,
    )
  })
})

describe('migration 100: new tables', () => {
  it('driver_login_codes has every column and named check', () => {
    const t = tableBlock('driver_login_codes')
    expect(t).toMatch(/id\s+uuid\s+PRIMARY KEY DEFAULT gen_random_uuid\(\)/)
    expect(t).toMatch(/driver_id\s+uuid\s+NOT NULL REFERENCES public\.drivers\(id\) ON DELETE CASCADE/)
    expect(t).toMatch(/code_hash\s+text\s+NOT NULL\s+CONSTRAINT driver_login_codes_hash_check CHECK \(code_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/)
    expect(t).toMatch(/attempts\s+smallint\s+NOT NULL DEFAULT 0\s+CONSTRAINT driver_login_codes_attempts_check CHECK \(attempts BETWEEN 0 AND 5\)/)
    expect(t).toMatch(/expires_at\s+timestamptz NOT NULL/)
    expect(t).toMatch(/consumed_at\s+timestamptz NULL/)
    expect(t).toMatch(/created_at\s+timestamptz NOT NULL DEFAULT now\(\)/)
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS driver_login_codes_driver_idx\s+ON public\.driver_login_codes \(driver_id, created_at DESC\)/)
  })

  it('driver_sessions: token_hash is unique and hex-checked', () => {
    const t = tableBlock('driver_sessions')
    expect(t).toMatch(/driver_id\s+uuid\s+NOT NULL REFERENCES public\.drivers\(id\) ON DELETE CASCADE/)
    expect(t).toMatch(/token_hash\s+text\s+NOT NULL UNIQUE\s+CONSTRAINT driver_sessions_hash_check CHECK \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/)
    expect(t).toMatch(/expires_at\s+timestamptz NOT NULL/)
    expect(t).toMatch(/created_at\s+timestamptz NOT NULL DEFAULT now\(\)/)
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS driver_sessions_driver_idx\s+ON public\.driver_sessions \(driver_id\)/)
  })

  it('driver_push_subscriptions: endpoint is unique and https-only, key lengths bounded', () => {
    const t = tableBlock('driver_push_subscriptions')
    expect(t).toMatch(/driver_id\s+uuid\s+NOT NULL REFERENCES public\.drivers\(id\) ON DELETE CASCADE/)
    expect(t).toMatch(
      /endpoint\s+text\s+NOT NULL UNIQUE\s+CONSTRAINT driver_push_endpoint_check CHECK \(endpoint ~ '\^https:\/\/' AND char_length\(endpoint\) <= 1000\)/,
    )
    expect(t).toMatch(/p256dh\s+text\s+NOT NULL CHECK \(char_length\(p256dh\) BETWEEN 1 AND 200\)/)
    expect(t).toMatch(/auth\s+text\s+NOT NULL CHECK \(char_length\(auth\) BETWEEN 1 AND 100\)/)
    expect(t).toMatch(/created_at\s+timestamptz NOT NULL DEFAULT now\(\)/)
    expect(t).toMatch(/updated_at\s+timestamptz NOT NULL DEFAULT now\(\)/)
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS driver_push_subscriptions_driver_idx\s+ON public\.driver_push_subscriptions \(driver_id\)/)
  })

  it('the two driver_assignments indexes exist idempotently', () => {
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS driver_assignments_driver_created_idx\s+ON public\.driver_assignments \(driver_id, created_at DESC\)/)
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS driver_assignments_booking_created_idx\s+ON public\.driver_assignments \(booking_id, created_at DESC\)/)
  })
})

describe('migration 100: deny-all and untouched live RLS', () => {
  it.each(NEW_TABLES)('%s: REVOKE ALL, RLS on, USING (false) / WITH CHECK (false)', (name) => {
    expect(SQL).toContain(`REVOKE ALL ON public.${name} FROM anon, authenticated;`)
    expect(SQL).toContain(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;`)
    expect(SQL).toMatch(new RegExp(`CREATE POLICY ${name}_no_public_read\\s+ON public\\.${name} FOR SELECT\\s+USING \\(false\\)`))
    expect(SQL).toMatch(new RegExp(`CREATE POLICY ${name}_no_public_insert\\s+ON public\\.${name} FOR INSERT\\s+WITH CHECK \\(false\\)`))
    expect(SQL).toContain(`DROP POLICY IF EXISTS ${name}_no_public_read ON public.${name};`)
    expect(SQL).toContain(`DROP POLICY IF EXISTS ${name}_no_public_insert ON public.${name};`)
  })

  it('grants nothing to anon or authenticated anywhere', () => {
    expect(SQL).not.toMatch(/GRANT[^;]*\bTO\b[^;]*\b(anon|authenticated)\b/i)
  })

  it('touches no policy or RLS setting of drivers, driver_assignments or bookings', () => {
    const offending = SQL.split(/;\s*\n/).filter(
      (stmt) =>
        /POLICY|ROW LEVEL SECURITY/i.test(stmt) && /public\.(drivers|driver_assignments|bookings)(\s|;|$)/.test(stmt),
    )
    expect(offending).toEqual([])
  })

  it('inserts no data and changes no existing row', () => {
    expect(SQL).not.toMatch(/\bINSERT\s+INTO\b/i)
    expect(SQL).not.toMatch(/\bUPDATE\s+public\.drivers\b/i)
    expect(SQL).not.toMatch(/\bDELETE\s+FROM\b/i)
  })
})

describe('migration 100: consume_driver_login_code', () => {
  const body = latestFunctionBody('consume_driver_login_code')

  it('is SECURITY DEFINER with a pinned search_path and locks the row', () => {
    expect(body).toContain('SECURITY DEFINER')
    expect(body).toMatch(/SET search_path = public, pg_temp/)
    expect(body).toContain('FOR UPDATE')
    expect(body).toMatch(/WHERE id = p_code_id\s+AND driver_id = p_driver_id/)
  })

  it('returns dead / wrong / ok with the 5-attempt cap and expiry', () => {
    expect(body).toMatch(/attempts >= 5/)
    expect(body).toMatch(/expires_at <= now\(\)/)
    expect(body).toMatch(/consumed_at IS NOT NULL/)
    expect(body).toMatch(/attempts = attempts \+ 1/)
    expect(body).toMatch(/code_hash = p_code_hash/)
    expect(body).toContain("RETURN 'ok'")
    expect(body).toContain("RETURN 'wrong'")
    expect(body).toContain("RETURN 'dead'")
  })

  it('revokes EXECUTE from PUBLIC, anon, authenticated and grants service_role', () => {
    expect(SQL).toContain(
      'REVOKE EXECUTE ON FUNCTION public.consume_driver_login_code(uuid, uuid, text) FROM PUBLIC, anon, authenticated;',
    )
    expect(SQL).toContain(
      'GRANT EXECUTE ON FUNCTION public.consume_driver_login_code(uuid, uuid, text) TO service_role;',
    )
    // the revoke must come after the (re-)create
    expect(SQL.lastIndexOf('REVOKE EXECUTE ON FUNCTION public.consume_driver_login_code')).toBeGreaterThan(
      SQL.lastIndexOf('CREATE OR REPLACE FUNCTION public.consume_driver_login_code('),
    )
  })
})

describe('cabinet rate-limit keys (lib/rate-limit.ts source)', () => {
  const src = readFileSync(join(process.cwd(), 'lib', 'rate-limit.ts'), 'utf8')

  it.each([
    ['/api/driver/cabinet/request-code', 5],
    ['/api/driver/cabinet/request-code#email', 3],
    ['/api/driver/cabinet/verify', 10],
    ['/api/driver/cabinet/offers/respond', 20],
    ['/api/driver/cabinet/push', 10],
    ['/api/driver/cabinet/help', 10],
  ])('LIMITS has %s: %i', (key, limit) => {
    const escaped = key.replace(/[/#]/g, (c) => `\\${c}`)
    expect(src).toMatch(new RegExp(`'${escaped}':\\s+${limit},`))
  })

  it('the hashed-email key counts per 10 minutes', () => {
    expect(src).toMatch(/'\/api\/driver\/cabinet\/request-code#email':\s+10 \* 60 \* 1000,/)
  })
})
