/**
 * Click-time loader for the Chatwoot website widget (Phase 77, plan 10).
 *
 * Reached ONLY through the dynamic import in components/ChatLauncher.tsx's
 * "Chat on site" click handler — never from a mount effect or a next/script
 * tag — so a visitor who does not click makes zero third-party requests
 * (D-02, T-77-24). The base URL and website token are not known to the client:
 * they arrive from the identity route at click time. This file therefore holds
 * no chat host literal and no uppercase env-var name (the VPS isolation guard
 * would otherwise taint every importer).
 */
import {
  WIDGET_CONFIG_PATH,
  isSafeWidgetBaseUrl,
  type WidgetConfigResponse,
  type WidgetIdentity,
} from '@/lib/chat-widget-contract'

interface WidgetSettings {
  hideMessageBubble: boolean
  position: 'left' | 'right'
  locale: string
  useBrowserLanguage: boolean
  type: 'standard'
  darkMode: 'light'
  showPopoutButton: boolean
  welcomeTitle: string
  welcomeDescription: string
  availableMessage: string
}

interface WidgetApi {
  setUser: (identifier: string, attrs: Record<string, string>) => void
  setLocale: (locale: string) => void
  setCustomAttributes: (attrs: Record<string, string>) => void
  setConversationCustomAttributes: (attrs: Record<string, string>) => void
  toggle: (state?: 'open' | 'close') => void
}

declare global {
  interface Window {
    chatwootSettings?: WidgetSettings
    chatwootSDK?: { run: (config: { websiteToken: string; baseUrl: string }) => void }
    $chatwoot?: WidgetApi
  }
}

/** Site locale -> widget locale. Chatwoot ships Simplified Chinese as zh_CN. */
export const WIDGET_LOCALE_BY_SITE_LOCALE: Record<string, string> = {
  en: 'en',
  ru: 'ru',
  es: 'es',
  fr: 'fr',
  ar: 'ar',
  hi: 'hi',
  zh: 'zh_CN',
}

const STEP_TIMEOUT_MS = 10_000

export interface OpenChatWidgetOptions {
  /** Site locale (en, ru, es, fr, ar, hi, zh). */
  locale: string
  isRtl: boolean
  texts: {
    welcomeTitle: string
    welcomeDescription: string
    replyTimeHint: string
  }
  /** First page of this visit, captured in memory when the launcher mounted. */
  landingHref?: string | null
  /** Locale-stripped pathname of the current page (used for /book detection). */
  pathname?: string
}

function readWidgetApi(): WidgetApi | undefined {
  return window.$chatwoot
}

let inFlight: Promise<void> | null = null

async function fetchWidgetConfig(): Promise<Extract<WidgetConfigResponse, { enabled: true }>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS)
  try {
    const res = await fetch(WIDGET_CONFIG_PATH, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!res.ok) throw new Error('chat-config-http')
    const body = (await res.json()) as WidgetConfigResponse
    if (!body || body.enabled !== true) throw new Error('chat-disabled')
    if (!body.websiteToken || !isSafeWidgetBaseUrl(body.baseUrl)) {
      throw new Error('chat-config-invalid')
    }
    return body
  } finally {
    clearTimeout(timer)
  }
}

function identityAttributes(user: WidgetIdentity): Record<string, string> {
  const attrs: Record<string, string> = { identifier_hash: user.identifierHash }
  if (user.email) attrs.email = user.email
  if (user.name) attrs.name = user.name
  if (user.phone) attrs.phone_number = user.phone
  return attrs
}

function loadAndRun(config: { baseUrl: string; websiteToken: string }): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cleanups: Array<() => void> = []
    const settle = (fn: () => void) => {
      cleanups.forEach((c) => c())
      fn()
    }

    const timer = setTimeout(
      () => settle(() => reject(new Error('chat-timeout'))),
      STEP_TIMEOUT_MS,
    )
    cleanups.push(() => clearTimeout(timer))

    const onReady = () => settle(resolve)
    const onError = () => settle(() => reject(new Error('chat-widget-error')))
    window.addEventListener('chatwoot:ready', onReady)
    window.addEventListener('chatwoot:error', onError)
    cleanups.push(() => window.removeEventListener('chatwoot:ready', onReady))
    cleanups.push(() => window.removeEventListener('chatwoot:error', onError))

    const run = () => {
      try {
        window.chatwootSDK?.run({ websiteToken: config.websiteToken, baseUrl: config.baseUrl })
      } catch (err) {
        settle(() => reject(err instanceof Error ? err : new Error('chat-run-failed')))
      }
    }

    if (window.chatwootSDK) {
      // A previous attempt already loaded the SDK bundle (e.g. it timed out
      // before ready) — never inject it twice, just run again.
      run()
      return
    }

    const script = document.createElement('script')
    script.src = `${config.baseUrl}/packs/js/sdk.js`
    script.async = true
    script.onload = run
    script.onerror = () => {
      script.remove()
      settle(() => reject(new Error('chat-script-failed')))
    }
    document.body.appendChild(script)
  })
}

async function performOpen(options: OpenChatWidgetOptions): Promise<void> {
  const existing = window.$chatwoot
  if (existing) {
    existing.toggle('open')
    return
  }

  const config = await fetchWidgetConfig()
  const widgetLocale = WIDGET_LOCALE_BY_SITE_LOCALE[options.locale] ?? 'en'

  // chatwootSettings must exist before sdk.js runs.
  window.chatwootSettings = {
    hideMessageBubble: true,
    position: options.isRtl ? 'left' : 'right',
    locale: widgetLocale,
    useBrowserLanguage: false,
    type: 'standard',
    darkMode: 'light',
    showPopoutButton: false,
    welcomeTitle: options.texts.welcomeTitle,
    welcomeDescription: options.texts.welcomeDescription,
    availableMessage: options.texts.replyTimeHint,
  }

  await loadAndRun(config)

  // Re-read: the SDK assigns window.$chatwoot during run().
  const cw = readWidgetApi()
  if (!cw) throw new Error('chat-widget-missing')

  if (config.user?.identifier && config.user.identifierHash) {
    cw.setUser(config.user.identifier, identityAttributes(config.user))
  }
  cw.setLocale(widgetLocale)
  cw.toggle('open')
}

/**
 * Loads (once) and opens the widget. Resolves when the widget is open; rejects
 * when the config route reports the chat disabled, sdk.js fails, or
 * 'chatwoot:ready' does not arrive within 10 s. Concurrent calls share one run.
 */
export function openChatWidget(options: OpenChatWidgetOptions): Promise<void> {
  if (inFlight) return inFlight
  inFlight = performOpen(options).finally(() => {
    inFlight = null
  })
  return inFlight
}
