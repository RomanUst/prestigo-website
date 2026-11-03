/**
 * Shared client/server contract for the driver Help chat (Phase 87 UAT gap 3).
 *
 * Pure TypeScript, no node: imports, no next/server, no lib/supabase: safe to import from client
 * components. Identifiers are namespaced (`driver:<uuid>`) so a driver chat contact can never equal a
 * customer identity (customers use the bare Supabase user uuid). The CRM bridge (hook.chat_intake,
 * hook.chat_contact) trusts the prefix only because the widget inbox enforces HMAC identity
 * validation; a forged identifier can at most suppress a CRM Lead for that visitor.
 */

import { isSafeWidgetBaseUrl } from '@/lib/chat-widget-contract'

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

// ── Help page, config route and config handoff ──────────────────────────────

/** The tokenless help page. The trip token never appears in this document's address. */
export const DRIVER_HELP_PAGE_PATH = '/driver/trip/help'

/** Config route of the trip-scoped help endpoint: `/api/driver/trip/<token>/help`. */
export function driverHelpConfigPath(tripToken: string): string {
  return `/api/driver/trip/${encodeURIComponent(tripToken)}/help`
}

/** sessionStorage key for the config handed from the trip page to the help page (same tab only). */
export const DRIVER_HELP_STORAGE_KEY = 'prestigo_driver_help'

/** Conversation custom attribute keys set on every driver help conversation. */
export const DRIVER_HELP_CONTEXT_KEYS = ['chat_role', 'driver_trip_ref'] as const

export interface DriverHelpIdentity {
  identifier: string
  identifierHash: string
  name: string
  email: null
  phone: null
}

export type DriverHelpContext = { chat_role: 'driver'; driver_trip_ref: string }

export type DriverHelpEnabledConfig = {
  enabled: true
  baseUrl: string
  websiteToken: string
  user: DriverHelpIdentity
  conversation: DriverHelpContext
}

export type DriverHelpConfigResponse = { enabled: false } | DriverHelpEnabledConfig

const HASH_SHAPE = /^[0-9a-f]{64}$/
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validates an untrusted help config and rebuilds it from the checked fields only (unknown keys are
 * dropped). Returns null on anything unexpected.
 */
export function parseDriverHelpConfig(value: unknown): DriverHelpEnabledConfig | null {
  if (!isRecord(value) || value.enabled !== true) return null
  const { baseUrl, websiteToken, user, conversation } = value
  if (typeof baseUrl !== 'string' || !isSafeWidgetBaseUrl(baseUrl)) return null
  if (typeof websiteToken !== 'string' || websiteToken.length < 1 || websiteToken.length > 200) return null
  if (!isRecord(user) || !isRecord(conversation)) return null

  const { identifier, identifierHash, name } = user
  if (typeof identifier !== 'string' || !isDriverChatIdentifier(identifier)) return null
  if (typeof identifierHash !== 'string' || !HASH_SHAPE.test(identifierHash)) return null
  if (typeof name !== 'string' || name.length < 1 || name.length > 120) return null
  if (user.email !== null || user.phone !== null) return null

  const { chat_role: chatRole, driver_trip_ref: tripRef } = conversation
  if (chatRole !== 'driver') return null
  if (typeof tripRef !== 'string' || tripRef.length < 1 || tripRef.length > 60 || CONTROL_CHARS.test(tripRef)) return null

  return {
    enabled: true,
    baseUrl,
    websiteToken,
    user: { identifier, identifierHash, name, email: null, phone: null },
    conversation: { chat_role: 'driver', driver_trip_ref: tripRef },
  }
}

/** Validates, then stores the config in sessionStorage. False on invalid input or a storage error. */
export function saveDriverHelpConfig(value: unknown): boolean {
  const config = parseDriverHelpConfig(value)
  if (!config) return false
  try {
    window.sessionStorage.setItem(DRIVER_HELP_STORAGE_KEY, JSON.stringify(config))
    return true
  } catch {
    return false
  }
}

/** The stored help config, re-validated. Null when missing, malformed, invalid or storage is blocked. */
export function loadDriverHelpConfig(): DriverHelpEnabledConfig | null {
  try {
    const raw = window.sessionStorage.getItem(DRIVER_HELP_STORAGE_KEY)
    if (!raw) return null
    return parseDriverHelpConfig(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Hard navigation (full page load, never the Next router) to the tokenless help page, so the chat
 * widget never runs in a document whose address carries the trip token.
 */
export function openDriverHelpPage(): void {
  window.location.assign(DRIVER_HELP_PAGE_PATH)
}
