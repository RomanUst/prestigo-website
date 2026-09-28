/**
 * Server-only HMAC identity helper and response builder for the Chatwoot
 * chat widget. Imported ONLY by app/api/chatwoot/identity/route.ts — never
 * by client code (imports node:crypto).
 */

import { createHmac } from 'node:crypto'
import type { WidgetConfigResponse, WidgetIdentity } from './chat-widget-contract'
import { isSafeWidgetBaseUrl } from './chat-widget-contract'

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
