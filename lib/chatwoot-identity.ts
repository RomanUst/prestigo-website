/**
 * Server-only HMAC identity helpers and response builders for the Chatwoot
 * chat widget. Imported ONLY by app/api/chatwoot/identity/route.ts (visitor
 * widget) and app/api/driver/trip/[token]/help/route.ts (driver Help chat,
 * Phase 87) — never by client code (imports node:crypto).
 */

import { createHmac } from 'node:crypto'
import type { WidgetConfigResponse, WidgetIdentity } from './chat-widget-contract'
import { isSafeWidgetBaseUrl } from './chat-widget-contract'
import { driverChatIdentifier } from './driver-help-contract'
import type { DriverHelpConfigResponse } from './driver-help-contract'

export function computeIdentifierHash(secret: string, identifier: string): string {
  return createHmac('sha256', secret).update(identifier).digest('hex')
}

interface BuildWidgetConfigInput {
  baseUrl?: string
  websiteToken?: string
  hmacSecret?: string
  user: { id: string; email?: string | null } | null
  profile: { full_name: string | null; phone: string | null } | null
}

const MAX_EMAIL_LEN = 254
const MAX_NAME_LEN = 120
const MAX_PHONE_LEN = 40

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

/** Trims whitespace, maps an empty result to null, and caps length. */
function trimOrNull(value: string | null | undefined, maxLen: number): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/g

function stripControlChars(value: string): string {
  return value.replace(CONTROL_CHARS_RE, '')
}

export function buildWidgetConfig(input: BuildWidgetConfigInput): WidgetConfigResponse {
  const { baseUrl, websiteToken, hmacSecret, user, profile } = input

  if (!baseUrl || !websiteToken || !isSafeWidgetBaseUrl(baseUrl)) {
    return { enabled: false }
  }

  let widgetUser: WidgetIdentity | null = null
  if (user && hmacSecret) {
    widgetUser = {
      identifier: user.id,
      identifierHash: computeIdentifierHash(hmacSecret, user.id),
      email: trimOrNull(user.email, MAX_EMAIL_LEN),
      name: trimOrNull(profile?.full_name, MAX_NAME_LEN),
      phone: trimOrNull(profile?.phone, MAX_PHONE_LEN),
    }
  }

  return {
    enabled: true,
    baseUrl: normalizeBaseUrl(baseUrl),
    websiteToken,
    user: widgetUser,
  }
}

interface BuildDriverWidgetConfigInput {
  baseUrl?: string
  websiteToken?: string
  hmacSecret?: string
  driverId: string
  driverName: string | null
  bookingReference: string
}

const MAX_TRIP_REF_LEN = 60

/**
 * Widget config for a driver's Help chat (Phase 87 UAT gap 3). The identity is the namespaced driver
 * id with a name only: no email or phone, so Chatwoot has nothing to merge a driver contact into a
 * customer contact on. Fails closed ({ enabled: false }) when the base URL, website token or HMAC
 * secret is unusable: an unidentified driver chat would skip the CRM guard and become a Lead.
 */
export function buildDriverWidgetConfig(input: BuildDriverWidgetConfigInput): DriverHelpConfigResponse {
  const { baseUrl, websiteToken, hmacSecret, driverId, driverName, bookingReference } = input

  if (!baseUrl || !websiteToken || !hmacSecret || !isSafeWidgetBaseUrl(baseUrl)) {
    return { enabled: false }
  }

  let identifier: string
  try {
    identifier = driverChatIdentifier(driverId)
  } catch {
    return { enabled: false }
  }
  const trimmedName = trimOrNull(driverName, MAX_NAME_LEN)
  const name = trimmedName ? trimOrNull(`${trimmedName} (driver)`, MAX_NAME_LEN) ?? 'Driver' : 'Driver'
  const tripRef = trimOrNull(stripControlChars(bookingReference), MAX_TRIP_REF_LEN)
  if (!tripRef) return { enabled: false }

  return {
    enabled: true,
    baseUrl: normalizeBaseUrl(baseUrl),
    websiteToken,
    user: {
      identifier,
      identifierHash: computeIdentifierHash(hmacSecret, identifier),
      name,
      email: null,
      phone: null,
    },
    conversation: { chat_role: 'driver', driver_trip_ref: tripRef },
  }
}
