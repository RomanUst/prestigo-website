import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isHiddenCancelled } from '@/components/admin/dispatch/boardModel'

// Cancelled bookings leave the working views of the admin and stay in the history.
// Two layers: the migration text (SQL contract) and the board rule.

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/089_admin_search_bookings_hide_cancelled.sql'),
  'utf8',
)
const CODE = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const NINE = '(text, text, text, text, text, text, integer, integer, boolean)'

describe('migration 089: admin_search_bookings p_hide_cancelled', () => {
  it('adds the argument with a false default, so old eight-argument calls behave as before', () => {
    expect(CODE).toMatch(/p_hide_cancelled\s+boolean\s+DEFAULT\s+false/)
  })

  it('leaves cancelled out only when asked and keeps a pending fee case', () => {
    expect(CODE).toMatch(
      /NOT COALESCE\(p_hide_cancelled, false\)\s+OR b\.status <> 'cancelled'\s+OR b\.fee_case_status = 'pending'/,
    )
  })

  it('drops the eight-argument overload so a call is never ambiguous', () => {
    expect(CODE).toContain(
      'DROP FUNCTION IF EXISTS public.admin_search_bookings(text, text, text, text, text, text, integer, integer);',
    )
  })

  it('keeps the email clause, SECURITY DEFINER and the pinned search_path', () => {
    expect(CODE.match(/OR b\.client_email ILIKE v_like/g)).toHaveLength(1)
    expect(CODE).toContain('SECURITY DEFINER')
    expect(CODE).toContain("SET search_path TO 'public', 'pg_temp'")
  })

  it('revokes the default PUBLIC EXECUTE and grants only service_role', () => {
    expect(CODE).toContain(`REVOKE EXECUTE ON FUNCTION public.admin_search_bookings${NINE} FROM PUBLIC, anon, authenticated;`)
    expect(CODE).toContain(`GRANT EXECUTE ON FUNCTION public.admin_search_bookings${NINE} TO service_role;`)
  })
})

describe('boardModel.isHiddenCancelled', () => {
  it('hides a cancelled booking and nothing else', () => {
    expect(isHiddenCancelled({ status: 'cancelled' })).toBe(true)
    expect(isHiddenCancelled({ status: 'cancelled', fee_case_status: 'waived' })).toBe(true)
    for (const status of ['unpaid', 'pending', 'confirmed', 'completed', 'no_show']) {
      expect(isHiddenCancelled({ status })).toBe(false)
    }
  })

  it('keeps a cancelled booking whose fee case still waits for a decision', () => {
    expect(isHiddenCancelled({ status: 'cancelled', fee_case_status: 'pending' })).toBe(false)
    expect(isHiddenCancelled({ status: 'cancelled', fee_case_status: 'pending', booking_source: 'gnet' })).toBe(true)
  })
})
