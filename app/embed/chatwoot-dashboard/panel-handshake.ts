// Pure helpers for the Chatwoot Dashboard App handshake (Phase 84, PANEL-02, D-02, D-03).
// No React, no server imports: bundled into the iframe client and unit-tested directly.

/** Chatwoot's DashboardApp/Frame.vue answers this string with an `appContext` message. */
export const FETCH_INFO_MESSAGE = 'chatwoot-dashboard-app:fetch-info'

/** The operator token lives in the tab-scoped session store only, under this key (D-02). */
export const TOKEN_STORAGE_KEY = 'prestigo.chatwootPanel.token'

/** The only URL the iframe ever requests. */
export const PANEL_API_PATH = '/api/chatwoot/dashboard-app'

export interface AppContext {
  conversationId: number
  theme: 'light' | 'dark'
}

/**
 * Parse Chatwoot's reply, a JSON string `{ event: 'appContext', data: { conversation, contact,
 * currentAgent, customAttributes, theme } }`. Only the conversation id (a positive safe integer)
 * and the theme are read; contact, agent and attribute data are ignored on purpose (D-03).
 * Anything else returns null.
 */
export function parseAppContext(raw: unknown): AppContext | null {
  if (typeof raw !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const message = parsed as { event?: unknown; data?: unknown }
  if (message.event !== 'appContext') return null
  const data = message.data
  if (typeof data !== 'object' || data === null) return null
  const { conversation, theme } = data as { conversation?: unknown; theme?: unknown }
  if (typeof conversation !== 'object' || conversation === null) return null
  const id = (conversation as { id?: unknown }).id
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null
  return { conversationId: id, theme: theme === 'dark' ? 'dark' : 'light' }
}

/**
 * A context message is trusted only when it comes from the exact Chatwoot origin (string equality,
 * no suffix, port or scheme tolerance) AND from the window that embeds this page.
 */
export function isTrustedContextEvent(event: MessageEvent, chatwootOrigin: string, parent: Window): boolean {
  return event.origin === chatwootOrigin && event.source === parent
}
