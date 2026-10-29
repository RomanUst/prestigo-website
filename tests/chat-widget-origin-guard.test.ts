/**
 * Phase 84, Plan 03 (D-13, T-84-11/T-84-13) — CVE-2025-12245 compensating control.
 *
 * The Chatwoot website widget SDK's window message handler has no origin check.
 * installWidgetOriginGuard() registers one capture-phase listener that drops
 * `chatwoot-widget:` messages from any origin other than the widget origin
 * before the SDK handler sees them.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'

const WIDGET_ORIGIN = 'https://chat.example.test'
const EVIL_ORIGIN = 'https://evil.example'
const WIDGET_DATA = 'chatwoot-widget:{"event":"popoutChatWindow"}'

type GuardModule = typeof import('@/components/chat/load-chat-widget')

async function freshModule(): Promise<GuardModule> {
  vi.resetModules()
  return import('@/components/chat/load-chat-widget')
}

function send(data: unknown, origin: string): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin }))
}

// Each test loads a fresh module (fresh guard state) — remove the capture
// listeners earlier module instances left on the shared jsdom window.
const guardListeners: EventListener[] = []
const sdkListeners: EventListener[] = []
const realAdd = window.addEventListener.bind(window)

beforeEach(() => {
  guardListeners.length = 0
  window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, opts?: unknown) => {
    if (type === 'message' && opts === true) guardListeners.push(listener as EventListener)
    return realAdd(type, listener, opts as boolean)
  }) as typeof window.addEventListener
})

afterEach(() => {
  window.addEventListener = realAdd as typeof window.addEventListener
  guardListeners.forEach((l) => window.removeEventListener('message', l, true))
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sdkListeners.forEach((l) => window.removeEventListener('message', l))
  sdkListeners.length = 0
  const w = window as unknown as Record<string, unknown>
  delete w.$chatwoot
  delete w.chatwootSDK
  delete w.chatwootSettings
})

describe('installWidgetOriginGuard', () => {
  it('exports the widget message prefix', async () => {
    const mod = await freshModule()
    expect(mod.WIDGET_MESSAGE_PREFIX).toBe('chatwoot-widget:')
  })

  it('drops a chatwoot-widget: message from a foreign origin before the SDK handler', async () => {
    const mod = await freshModule()
    mod.installWidgetOriginGuard(WIDGET_ORIGIN)
    const sdkHandler = vi.fn()
    // Stand-in for the SDK handler (it uses window.onmessage in browsers): a
    // non-capture listener registered AFTER the guard is installed.
    window.addEventListener('message', sdkHandler)
    sdkListeners.push(sdkHandler)
    send(WIDGET_DATA, EVIL_ORIGIN)
    expect(sdkHandler).not.toHaveBeenCalled()
  })

  it('lets a chatwoot-widget: message from the widget origin through', async () => {
    const mod = await freshModule()
    mod.installWidgetOriginGuard(WIDGET_ORIGIN)
    const sdkHandler = vi.fn()
    window.addEventListener('message', sdkHandler)
    sdkListeners.push(sdkHandler)
    send(WIDGET_DATA, WIDGET_ORIGIN)
    expect(sdkHandler).toHaveBeenCalledTimes(1)
  })

  it('lets non-prefixed and non-string messages through from any origin', async () => {
    const mod = await freshModule()
    mod.installWidgetOriginGuard(WIDGET_ORIGIN)
    const sdkHandler = vi.fn()
    window.addEventListener('message', sdkHandler)
    sdkListeners.push(sdkHandler)
    send('hello', EVIL_ORIGIN)
    send({ event: 'chatwoot-widget:x' }, EVIL_ORIGIN)
    send(42, EVIL_ORIGIN)
    expect(sdkHandler).toHaveBeenCalledTimes(3)
  })

  it('registers exactly one capture-phase listener however often it is called', async () => {
    const mod = await freshModule()
    const spy = vi.spyOn(window, 'addEventListener')
    mod.installWidgetOriginGuard(WIDGET_ORIGIN)
    mod.installWidgetOriginGuard(WIDGET_ORIGIN)
    mod.installWidgetOriginGuard(WIDGET_ORIGIN)
    const captureCalls = spy.mock.calls.filter(([type, , opts]) => type === 'message' && opts === true)
    expect(captureCalls).toHaveLength(1)
  })

  it('a later call with a different origin updates the trusted origin of the same listener', async () => {
    const mod = await freshModule()
    mod.installWidgetOriginGuard(WIDGET_ORIGIN)
    mod.installWidgetOriginGuard('https://chat2.example.test')
    const sdkHandler = vi.fn()
    window.addEventListener('message', sdkHandler)
    sdkListeners.push(sdkHandler)
    send(WIDGET_DATA, WIDGET_ORIGIN)
    expect(sdkHandler).not.toHaveBeenCalled()
    send(WIDGET_DATA, 'https://chat2.example.test')
    expect(sdkHandler).toHaveBeenCalledTimes(1)
  })
})

describe('openChatWidget wiring', () => {
  const OPTIONS = {
    locale: 'en',
    isRtl: false,
    texts: { welcomeTitle: 't', welcomeDescription: 'd', replyTimeHint: 'r' },
  }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          enabled: true,
          baseUrl: WIDGET_ORIGIN,
          websiteToken: 'tok',
          user: null,
        }),
      })),
    )
  })

  function fakeCw() {
    return {
      setUser: vi.fn(),
      setLocale: vi.fn(),
      setCustomAttributes: vi.fn(),
      setConversationCustomAttributes: vi.fn(),
      toggle: vi.fn(),
      reset: vi.fn(),
    }
  }

  function guardCallOrder(addSpy: MockInstance<typeof window.addEventListener>): number[] {
    const orders: number[] = []
    addSpy.mock.calls.forEach((call, idx) => {
      if (call[0] === 'message' && call[2] === true) orders.push(addSpy.mock.invocationCallOrder[idx])
    })
    return orders
  }

  it('installs the guard before the sdk.js script element is appended', async () => {
    const mod = await freshModule()
    const addSpy = vi.spyOn(window, 'addEventListener')
    const original = document.body.appendChild.bind(document.body)
    const scriptOrder: number[] = []
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
      if (node instanceof HTMLScriptElement && node.src.endsWith('/packs/js/sdk.js')) {
        scriptOrder.push(appendSpy.mock.invocationCallOrder[appendSpy.mock.calls.length - 1])
        const cw = fakeCw()
        window.chatwootSDK = {
          run: () => {
            ;(window as unknown as { $chatwoot: unknown }).$chatwoot = cw
            setTimeout(() => window.dispatchEvent(new Event('chatwoot:ready')), 0)
          },
        }
        setTimeout(() => node.onload?.(new Event('load')), 0)
        return node
      }
      return original(node)
    })

    await mod.openChatWidget(OPTIONS)
    const guardOrder = guardCallOrder(addSpy)
    expect(guardOrder).toHaveLength(1)
    expect(scriptOrder).toHaveLength(1)
    expect(guardOrder[0]).toBeLessThan(scriptOrder[0])
  })

  it('installs the guard before run() on the SDK re-run path', async () => {
    const mod = await freshModule()
    const addSpy = vi.spyOn(window, 'addEventListener')
    const cw = fakeCw()
    const run = vi.fn(() => {
      ;(window as unknown as { $chatwoot: unknown }).$chatwoot = cw
      setTimeout(() => window.dispatchEvent(new Event('chatwoot:ready')), 0)
    })
    window.chatwootSDK = { run }

    await mod.openChatWidget(OPTIONS)
    const guardOrder = guardCallOrder(addSpy)
    expect(guardOrder).toHaveLength(1)
    expect(run).toHaveBeenCalledTimes(1)
    expect(guardOrder[0]).toBeLessThan(run.mock.invocationCallOrder[0])
  })
})
