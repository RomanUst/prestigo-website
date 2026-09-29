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
import { buildVisitContext, type BookingVisitData, type VisitContext } from '@/lib/chat-visit-context'
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
  /** Clears the widget's cookies and reloads its iframe; fires 'chatwoot:ready' again. */
  reset: () => void
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

/**
 * Identity the loaded widget was configured with (T-77-20): the user id, or
 * null for an anonymous visitor. undefined = no widget configured yet.
 */
let configuredIdentifier: string | null | undefined

/**
 * True once 'chatwoot:ready' has fired for the current iframe. The SDK assigns
 * window.$chatwoot synchronously inside run(), BEFORE ready, so the global's
 * truthiness says nothing about whether identity/context were applied — a
 * failed or late first attempt would otherwise be "reused" without them.
 */
let sdkReady = false
let readyTracked = false

function trackReadyEvents(): void {
  if (readyTracked) return
  readyTracked = true
  window.addEventListener('chatwoot:ready', () => {
    sdkReady = true
  })
}

function identifierOf(config: { user: WidgetIdentity | null }): string | null {
  return config.user?.identifier && config.user.identifierHash ? config.user.identifier : null
}

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

/** Booking-wizard selections, read only while the visitor is inside /book. */
async function readBookingData(pathname: string | undefined): Promise<BookingVisitData | null> {
  if (!pathname || !pathname.startsWith('/book')) return null
  try {
    const { useBookingStore } = await import('@/lib/booking-store')
    const state = useBookingStore.getState()
    return {
      tripType: state.tripType,
      origin: state.origin?.address ?? null,
      destination: state.destination?.address ?? null,
      vehicle: state.vehicleClass,
    }
  } catch {
    // Booking context is a nicety — never let it block the chat.
    return null
  }
}

async function collectVisitContext(options: OpenChatWidgetOptions): Promise<VisitContext> {
  const openedAt = new Date().toISOString()
  const booking = await readBookingData(options.pathname)
  return buildVisitContext({
    pageHref: window.location.href,
    landingHref: options.landingHref,
    referrer: document.referrer,
    siteLocale: options.locale,
    openedAt,
    booking,
  })
}

function identityAttributes(user: WidgetIdentity): Record<string, string> {
  const attrs: Record<string, string> = { identifier_hash: user.identifierHash }
  if (user.email) attrs.email = user.email
  if (user.name) attrs.name = user.name
  if (user.phone) attrs.phone_number = user.phone
  return attrs
}

/**
 * Resolves on 'chatwoot:ready'; rejects on 'chatwoot:error', on `fail`, or
 * after STEP_TIMEOUT_MS.
 */
function awaitReady(): { promise: Promise<void>; fail: (err: Error) => void } {
  let fail: (err: Error) => void = () => {}
  const promise = new Promise<void>((resolve, reject) => {
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

    fail = (err) => settle(() => reject(err))
  })
  return { promise, fail }
}

function loadAndRun(config: { baseUrl: string; websiteToken: string }): Promise<void> {
  const { promise, fail } = awaitReady()

  // WR-02: the page CSP allow-lists one fixed widget origin. If the configured
  // base URL ever differs, the browser blocks the iframe/socket and no ready
  // event arrives — surface that at once (and in the console) instead of after
  // the generic 10 s timeout.
  const onViolation = (event: Event) => {
    const blocked = (event as SecurityPolicyViolationEvent).blockedURI
    if (typeof blocked === 'string' && blocked.startsWith(config.baseUrl)) {
      console.error(
        `[chat] ${config.baseUrl} was blocked by the page CSP (${(event as SecurityPolicyViolationEvent).effectiveDirective}); the widget base URL and the middleware CSP origin must match.`,
      )
      fail(new Error('chat-csp-blocked'))
    }
  }
  document.addEventListener('securitypolicyviolation', onViolation)
  void promise
    .catch(() => {})
    .finally(() => document.removeEventListener('securitypolicyviolation', onViolation))

  const run = () => {
    try {
      window.chatwootSDK?.run({ websiteToken: config.websiteToken, baseUrl: config.baseUrl })
    } catch (err) {
      fail(err instanceof Error ? err : new Error('chat-run-failed'))
    }
  }

  if (window.chatwootSDK) {
    // A previous attempt already loaded the SDK bundle (e.g. it timed out
    // before ready) — never inject it twice, just run again.
    run()
    return promise
  }

  const script = document.createElement('script')
  script.src = `${config.baseUrl}/packs/js/sdk.js`
  script.async = true
  script.onload = run
  script.onerror = () => {
    script.remove()
    fail(new Error('chat-script-failed'))
  }
  document.body.appendChild(script)
  return promise
}

async function performOpen(options: OpenChatWidgetOptions): Promise<void> {
  trackReadyEvents()
  const existing = window.$chatwoot
  if (!existing) {
    // No live widget (first open, or the page was reloaded): forget any state.
    configuredIdentifier = undefined
    sdkReady = false
  }

  // Click-time snapshot: the page, UTM, referrer and booking state as they are
  // now, not as they will be when the widget finishes loading.
  const visitContext = await collectVisitContext(options)
  // Identity is re-read on EVERY open (T-77-20): a sign-out is a soft
  // navigation that leaves the loaded widget — and the previous customer's
  // conversation — alive in this tab.
  const config = await fetchWidgetConfig()
  const identifier = identifierOf(config)
  if (existing && configuredIdentifier === identifier) {
    existing.toggle('open')
    return
  }
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

  if (!existing) {
    await loadAndRun(config)
  } else if (configuredIdentifier !== undefined) {
    // Identity changed (signed out, signed in, or another account): drop the
    // previous customer's contact and conversation before anything is shown.
    // Marked unconfigured first so a failed reload can never be re-toggled as-is.
    configuredIdentifier = undefined
    sdkReady = false
    const reloaded = awaitReady()
    existing.reset()
    await reloaded.promise
  } else if (!sdkReady) {
    // An earlier attempt failed or timed out after run(); the widget exists
    // but was never configured. Wait for it, then apply identity below.
    await awaitReady().promise
  }

  // Re-read: the SDK assigns window.$chatwoot during run().
  const cw = readWidgetApi()
  if (!cw) throw new Error('chat-widget-missing')

  if (identifier && config.user) {
    cw.setUser(config.user.identifier, identityAttributes(config.user))
  }
  cw.setLocale(widgetLocale)
  cw.setCustomAttributes({ site_locale: options.locale })
  cw.setConversationCustomAttributes(visitContext)
  // The conversation only exists once the visitor sends a message — set the
  // attributes again then so they land on the created conversation.
  window.addEventListener(
    'chatwoot:on-message',
    () => cw.setConversationCustomAttributes(visitContext),
    { once: true },
  )
  configuredIdentifier = identifier
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
