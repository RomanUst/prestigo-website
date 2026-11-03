/**
 * Shared client/server contract for the driver Help chat (Phase 87 UAT gap 3).
 *
 * Pure TypeScript, no node: imports, no next/server, no lib/supabase: safe to import from client
 * components. Identifiers are namespaced (`driver:<uuid>`) so a driver chat contact can never equal a
 * customer identity (customers use the bare Supabase user uuid). The CRM bridge (hook.chat_intake,
 * hook.chat_contact) trusts the prefix only because the widget inbox enforces HMAC identity
 * validation; a forged identifier can at most suppress a CRM Lead for that visitor.
 */

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const DRIVER_CHAT_IDENTIFIER_PREFIX = 'driver:'

/** 'driver:' + lower-case uuid. Throws on a non-uuid. */
export function driverChatIdentifier(driverId: string): string {
  if (typeof driverId !== 'string' || !UUID_SHAPE.test(driverId)) {
    throw new Error('driverChatIdentifier: driver id must be a uuid')
  }
  return `${DRIVER_CHAT_IDENTIFIER_PREFIX}${driverId.toLowerCase()}`
}

/** Exact 'driver:' + uuid shape, case-sensitive prefix. */
export function isDriverChatIdentifier(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (!value.startsWith(DRIVER_CHAT_IDENTIFIER_PREFIX)) return false
  return UUID_SHAPE.test(value.slice(DRIVER_CHAT_IDENTIFIER_PREFIX.length))
}
