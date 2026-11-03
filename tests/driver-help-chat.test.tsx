/**
 * Phase 87 plan 19 (87-UAT gap 3) - the tokenless driver Help chat page.
 *
 * DriverHelpChat reads the config the trip screen stored in sessionStorage, loads the widget loader
 * with a dynamic import and opens the Chatwoot widget identified as the driver. The third-party SDK
 * is replaced by a fake (same technique as tests/chat-launcher.test.tsx); the real loader runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, act, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import DriverHelpChat from '@/app/(internal)/driver/trip/help/DriverHelpChat'
import { metadata } from '@/app/(internal)/driver/trip/help/page'
import { saveDriverHelpConfig } from '@/lib/driver-help-contract'
import { BUSINESS_TEL_URL } from '@/lib/contact-channels'

const WAIT_MS = 5000
const BASE_URL = 'https://chat.example.test'
const DRIVER_ID = 'a0000002-0000-4000-8000-000000000002'
const HASH = 'b'.repeat(64)

const CONFIG = {
  enabled: true,
  baseUrl: BASE_URL,
  websiteToken: 'site-token',
  user: {
    identifier: `driver:${DRIVER_ID}`,
    identifierHash: HASH,
    name: 'Ivan Petrov (driver)',
    email: null,
    phone: null,
  },
  conversation: { chat_role: 'driver', driver_trip_ref: 'PRG-20261104-ABC123' },
}

type FakeCw = {
  setUser: ReturnType<typeof vi.fn>
  setLocale: ReturnType<typeof vi.fn>
  setCustomAttributes: ReturnType<typeof vi.fn>
  setConversationCustomAttributes: ReturnType<typeof vi.fn>
  toggle: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
}

/** Intercepts the sdk.js script append; a fake SDK stands in for the third-party bundle. */
function installFakeSdk(opts: { neverReady?: boolean; failScript?: boolean } = {}) {
  const cw: FakeCw = {
    setUser: vi.fn(),
    setLocale: vi.fn(),
    setCustomAttributes: vi.fn(),
    setConversationCustomAttributes: vi.fn(),
    toggle: vi.fn(),
    reset: vi.fn(() => {
      setTimeout(() => window.dispatchEvent(new Event('chatwoot:ready')), 0)
    }),
  }
  const run = vi.fn(() => {
    ;(window as unknown as { $chatwoot: FakeCw }).$chatwoot = cw
    if (!opts.neverReady) setTimeout(() => window.dispatchEvent(new Event('chatwoot:ready')), 0)
  })
  const scripts: HTMLScriptElement[] = []
  const settingsAtAppend: Array<Record<string, unknown>> = []
  const original = document.body.appendChild.bind(document.body)

  vi.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement && node.src.endsWith('/packs/js/sdk.js')) {
      scripts.push(node)
      settingsAtAppend.push({ ...(window.chatwootSettings ?? {}) } as Record<string, unknown>)
      window.chatwootSDK = { run }
      setTimeout(() => {
        if (opts.failScript) node.onerror?.(new Event('error'))
        else node.onload?.(new Event('load'))
      }, 0)
      return node
    }
    return original(node)
  })

  return { cw, run, scripts, settingsAtAppend }
}

function resetWidgetGlobals() {
  const w = window as unknown as Record<string, unknown>
  delete w.$chatwoot
  delete w.chatwootSDK
  delete w.chatwootSettings
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  resetWidgetGlobals()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetWidgetGlobals()
  document.querySelectorAll('script').forEach((s) => s.remove())
})

describe('page metadata', () => {
  it('is never indexed', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})

describe('DriverHelpChat: identified widget (tracer)', () => {
  it('injects one sdk.js, configures the light English widget and opens it as the driver', async () => {
    const { cw, run, scripts, settingsAtAppend } = installFakeSdk()
    expect(saveDriverHelpConfig(CONFIG)).toBe(true)

    render(<DriverHelpChat />)

    await waitFor(() => expect(cw.toggle).toHaveBeenCalledWith('open'), { timeout: WAIT_MS })

    expect(scripts).toHaveLength(1)
    expect(scripts[0].src).toBe(`${BASE_URL}/packs/js/sdk.js`)
    expect(settingsAtAppend[0]).toMatchObject({
      hideMessageBubble: true,
      position: 'right',
      locale: 'en',
      useBrowserLanguage: false,
      darkMode: 'light',
      showPopoutButton: false,
      welcomeTitle: 'Prestigo office',
      welcomeDescription: 'Write to us about this trip.',
      availableMessage: 'We usually reply in a few minutes.',
    })
    expect(run).toHaveBeenCalledWith({ websiteToken: 'site-token', baseUrl: BASE_URL })

    expect(cw.setUser).toHaveBeenCalledTimes(1)
    const [identifier, attrs] = cw.setUser.mock.calls[0]
    expect(identifier).toBe(`driver:${DRIVER_ID}`)
    expect(attrs).toEqual({ identifier_hash: HASH, name: 'Ivan Petrov (driver)' })
    expect(attrs).not.toHaveProperty('email')
    expect(attrs).not.toHaveProperty('phone_number')
    expect(cw.setLocale).toHaveBeenCalledWith('en')
    expect(cw.setCustomAttributes).not.toHaveBeenCalled()
    expect(cw.setConversationCustomAttributes).toHaveBeenCalledWith({
      chat_role: 'driver',
      driver_trip_ref: 'PRG-20261104-ABC123',
    })
    expect(cw.setUser.mock.invocationCallOrder[0]).toBeLessThan(cw.toggle.mock.invocationCallOrder[0])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sets the same conversation attributes again on the first message only', async () => {
    const { cw } = installFakeSdk()
    saveDriverHelpConfig(CONFIG)
    render(<DriverHelpChat />)
    await waitFor(() => expect(cw.toggle).toHaveBeenCalledWith('open'), { timeout: WAIT_MS })
    expect(cw.setConversationCustomAttributes).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new Event('chatwoot:on-message'))
      window.dispatchEvent(new Event('chatwoot:on-message'))
    })
    expect(cw.setConversationCustomAttributes).toHaveBeenCalledTimes(2)
    expect(cw.setConversationCustomAttributes).toHaveBeenLastCalledWith({
      chat_role: 'driver',
      driver_trip_ref: 'PRG-20261104-ABC123',
    })
  })

  it('shows the heading, the body and the call link and ends in the open state', async () => {
    const { cw } = installFakeSdk()
    saveDriverHelpConfig(CONFIG)
    render(<DriverHelpChat />)

    expect(screen.getByRole('heading', { name: 'Chat with the office' })).toBeInTheDocument()
    expect(
      screen.getByText('Your messages go straight to the Prestigo office. Keep this page open to see the reply.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Call the office/ })).toHaveAttribute('href', BUSINESS_TEL_URL)

    await waitFor(() => expect(cw.toggle).toHaveBeenCalled(), { timeout: WAIT_MS })
    expect(await screen.findByRole('button', { name: 'Open chat' })).toBeInTheDocument()
  })
})

describe('DriverHelpChat: states', () => {
  it('without a stored config shows the open-from-trip-link hint and loads nothing', async () => {
    const { scripts } = installFakeSdk()
    render(<DriverHelpChat />)

    expect(await screen.findByText('Open Help from your trip link to chat with the office.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Call the office/ })).toHaveAttribute('href', BUSINESS_TEL_URL)
    expect(scripts).toHaveLength(0)
    expect(document.querySelector('script[src$="/packs/js/sdk.js"]')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a script load failure shows the error line and Try again runs one new attempt', async () => {
    const first = installFakeSdk({ failScript: true })
    saveDriverHelpConfig(CONFIG)
    render(<DriverHelpChat />)

    const alert = await screen.findByRole('alert', undefined, { timeout: WAIT_MS })
    expect(alert).toHaveTextContent('Chat is not available right now. Call the office instead.')
    expect(first.scripts).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Call the office/ })).toBeInTheDocument()

    // The retry injects a fresh script (the failed one never defined the SDK bundle for real).
    first.cw.toggle.mockClear()
    vi.restoreAllMocks()
    resetWidgetGlobals()
    const second = installFakeSdk()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(second.cw.toggle).toHaveBeenCalledWith('open'), { timeout: WAIT_MS })
    expect(second.scripts).toHaveLength(1)
    expect(await screen.findByRole('button', { name: 'Open chat' })).toBeInTheDocument()
  })

  it('no ready event within 10 s shows the error line', async () => {
    vi.useFakeTimers()
    installFakeSdk({ neverReady: true })
    saveDriverHelpConfig(CONFIG)
    render(<DriverHelpChat />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500)
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Chat is not available right now. Call the office instead.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('Open chat toggles the widget again and does not inject a second script', async () => {
    const { cw, scripts } = installFakeSdk()
    saveDriverHelpConfig(CONFIG)
    render(<DriverHelpChat />)
    const openButton = await screen.findByRole('button', { name: 'Open chat' }, { timeout: WAIT_MS })
    expect(cw.toggle).toHaveBeenCalledTimes(1)

    fireEvent.click(openButton)
    await waitFor(() => expect(cw.toggle).toHaveBeenCalledTimes(2), { timeout: WAIT_MS })
    expect(cw.toggle).toHaveBeenLastCalledWith('open')
    expect(scripts).toHaveLength(1)
    expect(cw.setUser).toHaveBeenCalledTimes(1)
  })

  describe('Back to trip', () => {
    function setHistoryLength(n: number) {
      vi.spyOn(window.history, 'length', 'get').mockReturnValue(n)
    }

    it('is shown when there is history and goes back', async () => {
      installFakeSdk()
      setHistoryLength(3)
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
      saveDriverHelpConfig(CONFIG)
      render(<DriverHelpChat />)

      fireEvent.click(await screen.findByRole('button', { name: 'Back to trip' }))
      expect(back).toHaveBeenCalledTimes(1)
      // Let the open finish so no run stays in flight for the next test.
      await screen.findByRole('button', { name: 'Open chat' }, { timeout: WAIT_MS })
    })

    it('is absent without history', async () => {
      installFakeSdk()
      setHistoryLength(1)
      saveDriverHelpConfig(CONFIG)
      render(<DriverHelpChat />)

      await screen.findByRole('button', { name: 'Open chat' }, { timeout: WAIT_MS })
      expect(screen.queryByRole('button', { name: 'Back to trip' })).not.toBeInTheDocument()
    })
  })
})

describe('source gates (87-UAT gap 3, T-87-61)', () => {
  const root = process.cwd()
  const chatSource = readFileSync(join(root, 'app/(internal)/driver/trip/help/DriverHelpChat.tsx'), 'utf8')
  const contractSource = readFileSync(join(root, 'lib/driver-help-contract.ts'), 'utf8')
  const tripScreenSource = readFileSync(join(root, 'app/(internal)/driver/trip/[token]/TripScreen.tsx'), 'utf8')

  it('DriverHelpChat reaches the loader only through the dynamic import', () => {
    expect(chatSource.match(/import\('@\/components\/chat\/load-chat-widget'\)/g)).toHaveLength(1)
    expect(chatSource).not.toMatch(/^import .*load-chat-widget/m)
  })

  it('DriverHelpChat never reads the referrer, the visit context or the page address', () => {
    expect(chatSource).not.toContain('document.referrer')
    expect(chatSource).not.toContain('buildVisitContext')
    expect(chatSource).not.toContain('window.location.href')
    expect(chatSource).not.toContain('location.href')
  })

  it('DriverHelpChat and the contract name no chat host and no uppercase CHATWOOT_ variable', () => {
    for (const source of [chatSource, contractSource]) {
      expect(source).not.toMatch(/rideprestigo\.com/)
      expect(source).not.toMatch(/CHATWOOT_/)
    }
  })

  it('TripScreen leaves for the help page with a hard navigation, never the router', () => {
    expect(tripScreenSource).toContain('openDriverHelpPage')
    expect(tripScreenSource).not.toMatch(/router\.(push|replace)\(/)
  })
})
