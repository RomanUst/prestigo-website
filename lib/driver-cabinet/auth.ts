// Phase 94 plan 94-01 (DCAB-01, DCAB-02, DCAB-04; D-05, D-06, D-07, D-16): driver cabinet sign-in.
//
// An invited driver (drivers.cabinet_enabled = true) asks for a 6-digit code by email, signs in with it and holds
// a 30-day opaque session. Own tables (driver_login_codes, driver_sessions), no Supabase Auth user, no Supabase-Auth
// cookie helpers: a driver can never be mistaken for a customer or an admin (D-07).
//
// Server-only by convention: imports node:crypto and next/headers, never imported by a client component.
// Never log a code, a session token or an email address.

import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { createSupabaseServiceClient } from '@/lib/supabase'

export const DRIVER_SESSION_COOKIE = 'prestigo_driver_session'
export const DRIVER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const LOGIN_CODE_TTL_MS = 10 * 60 * 1000

// Minimal structural type of the service client: keeps this module free of the Supabase-Auth helper modules and
// lets the tests pass an in-memory stand-in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function normalizeDriverEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Uniform 6-digit code from the CSPRNG, left-padded with zeros. */
export function generateLoginCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** The row id salts the hash, so identical codes of different rows never share a hash. */
export function hashLoginCode(codeId: string, code: string): string {
  return sha256Hex(`${codeId}:${code}`)
}

export function isDriverSessionTokenShape(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{43}$/.test(raw)
}

interface CabinetDriver {
  id: string
  name: string
  email: string
}

/**
 * The invited driver for an email, or null. Matched in JS on the normalized address (no ilike: underscore and
 * percent are wildcards there). Only cabinet_enabled drivers are read, so a not-invited or disabled driver is
 * indistinguishable from an unknown address (D-06).
 */
export async function findCabinetDriverByEmail(supabase: ServiceClient, email: string): Promise<CabinetDriver | null> {
  const wanted = normalizeDriverEmail(email)
  const { data, error } = await supabase
    .from('drivers')
    .select('id, name, email')
    .eq('cabinet_enabled', true)
    .limit(500)
  if (error || !Array.isArray(data)) return null
  const match = (data as CabinetDriver[]).find(
    (d) => typeof d.email === 'string' && normalizeDriverEmail(d.email) === wanted,
  )
  return match ?? null
}

/**
 * Create a login code for an invited driver. Earlier unconsumed codes of that driver are removed first. Returns the
 * plain code once (to be emailed); the database keeps only sha256(codeId:code). Null when the email is not invited.
 */
export async function issueLoginCode(
  supabase: ServiceClient,
  email: string,
): Promise<{ driverId: string; to: string; code: string } | null> {
  const driver = await findCabinetDriverByEmail(supabase, email)
  if (!driver) return null

  const { error: clearError } = await supabase
    .from('driver_login_codes')
    .delete()
    .eq('driver_id', driver.id)
    .is('consumed_at', null)
  if (clearError) return null

  const code = generateLoginCode()
  const id = randomUUID()
  const { error } = await supabase.from('driver_login_codes').insert({
    id,
    driver_id: driver.id,
    code_hash: hashLoginCode(id, code),
    expires_at: new Date(Date.now() + LOGIN_CODE_TTL_MS).toISOString(),
  })
  if (error) return null
  return { driverId: driver.id, to: driver.email, code }
}

/**
 * Check a code. The attempt counter, expiry and single use are enforced inside consume_driver_login_code under a row
 * lock. 'wrong' means the code is still alive; anything else (dead code, unknown driver, rpc error) is 'dead'.
 */
export async function verifyLoginCode(
  supabase: ServiceClient,
  email: string,
  code: string,
): Promise<{ ok: true; driverId: string } | { ok: false; reason: 'wrong' | 'dead' }> {
  const driver = await findCabinetDriverByEmail(supabase, email)
  if (!driver) return { ok: false, reason: 'dead' }

  const { data: row, error } = await supabase
    .from('driver_login_codes')
    .select('id')
    .eq('driver_id', driver.id)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !row) return { ok: false, reason: 'dead' }

  const { data: outcome, error: rpcError } = await supabase.rpc('consume_driver_login_code', {
    p_driver_id: driver.id,
    p_code_id: (row as { id: string }).id,
    p_code_hash: hashLoginCode((row as { id: string }).id, code),
  })
  if (rpcError) return { ok: false, reason: 'dead' }
  if (outcome === 'ok') return { ok: true, driverId: driver.id }
  if (outcome === 'wrong') return { ok: false, reason: 'wrong' }
  return { ok: false, reason: 'dead' }
}

/** Always a fresh 256-bit token (no session fixation). The database keeps only its sha256. */
export async function createDriverSession(
  supabase: ServiceClient,
  driverId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + DRIVER_SESSION_TTL_MS)
  const { error } = await supabase.from('driver_sessions').insert({
    driver_id: driverId,
    token_hash: sha256Hex(token),
    expires_at: expiresAt.toISOString(),
  })
  if (error) throw new Error('driver session insert failed')
  return { token, expiresAt }
}

/**
 * SameSite=Lax, not Strict: Strict would drop the cookie when the driver opens the cabinet from an email link.
 */
export function driverSessionCookieOptions(): {
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: '/'
  maxAge: number
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DRIVER_SESSION_TTL_MS / 1000,
  }
}

interface SessionRow {
  id: string
  driver_id: string
  expires_at: string
  drivers: { cabinet_enabled: boolean } | null
}

/**
 * The signed-in driver for this request, or null. Checked on every call: the session must exist, be unexpired AND
 * drivers.cabinet_enabled must still be true, so disabling a driver cuts access on the very next request (D-06).
 */
export async function getDriverSession(): Promise<{ driverId: string; sessionId: string } | null> {
  const jar = await cookies()
  const raw = jar.get(DRIVER_SESSION_COOKIE)?.value
  if (!isDriverSessionTokenShape(raw)) return null

  const supabase = createSupabaseServiceClient() as unknown as ServiceClient
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('driver_sessions')
    .select('id, driver_id, expires_at, drivers!inner(cabinet_enabled)')
    .eq('token_hash', sha256Hex(raw))
    .gt('expires_at', nowIso)
    .maybeSingle()
  const row = data as SessionRow | null
  if (error || !row) return null
  if (new Date(row.expires_at).getTime() <= Date.now()) return null
  if (row.drivers?.cabinet_enabled !== true) return null
  return { driverId: row.driver_id, sessionId: row.id }
}
