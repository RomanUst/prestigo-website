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
      email: user.email ?? null,
      name: profile?.full_name ?? null,
      phone: profile?.phone ?? null,
    }
  }

  return {
    enabled: true,
    baseUrl,
    websiteToken,
    user: widgetUser,
  }
}
