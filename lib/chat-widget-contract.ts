/**
 * Shared client/server contract for the Chatwoot chat widget config endpoint.
 *
 * Pure TypeScript, no node: imports, no next/server, no lib/supabase — safe to
 * import from client components (plan 77-10's launcher).
 */

export const WIDGET_CONFIG_PATH = '/api/chatwoot/identity'

export interface WidgetIdentity {
  identifier: string
  identifierHash: string
  email: string | null
  name: string | null
  phone: string | null
}

export type WidgetConfigResponse =
  | { enabled: false }
  | { enabled: true; baseUrl: string; websiteToken: string; user: WidgetIdentity | null }

/**
 * True only for an absolute https: URL whose pathname is '/' or empty, with
 * no search, hash, username or password. Rejects http:, javascript:, any
 * path/query/userinfo — the widget base URL must be an exact origin.
 */
export function isSafeWidgetBaseUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') return false
  if (parsed.pathname !== '/' && parsed.pathname !== '') return false
  if (parsed.search) return false
  if (parsed.hash) return false
  if (parsed.username || parsed.password) return false

  return true
}
