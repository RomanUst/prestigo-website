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

/** The bridge react-native-webview installs on the page it hosts. */
export interface NativeBridge {
  postMessage: (message: string) => void
}

/**
 * The Chatwoot mobile app opens a Dashboard App as a top-level page in a react-native-webview, not in
 * an iframe. It answers FETCH_INFO_MESSAGE sent through `window.ReactNativeWebView` by injecting
 * `window.postMessage(appContext)` into this page. Returns the bridge only for that case: top level
 * (no parent) and a bridge with a postMessage function.
 */
export function nativeBridgeOf(win: Window): NativeBridge | null {
  if (win.parent !== win) return null
  const bridge = (win as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView
  if (typeof bridge !== 'object' || bridge === null) return null
  if (typeof (bridge as { postMessage?: unknown }).postMessage !== 'function') return null
  return bridge as NativeBridge
}

/**
 * In the mobile WebView the context is posted by script injected into this very page, so it is trusted
 * only when it comes from this window itself on this page's own origin. Another window (an opener, a
 * child frame) or another origin never passes. The API still checks the operator token's access to the
 * conversation, so the id alone grants nothing.
 */
export function isTrustedWebViewEvent(event: MessageEvent, win: Window): boolean {
  return event.source === win && event.origin === win.location.origin
}
