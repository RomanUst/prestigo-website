/**
 * Phase 77, Plan 10 — ChatLauncher end-to-end (INBOX-02/03/04; D-01..D-09, D-16).
 *
 * The site-side chat path is exercised for real: the launcher click runs the
 * REAL GET handler of app/api/chatwoot/identity/route.ts (Supabase mocked to a
 * signed-in user, env set), the loader injects the sdk.js script (intercepted —
 * a fake SDK stands in for the third-party bundle), and the fake SDK fires
 * 'chatwoot:ready'. The real widget is exercised on production in plan 77-12
 * (the Website inbox only accepts rideprestigo.com).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithIntl } from './helpers/renderWithIntl'
import type { AbstractIntlMessages } from 'next-intl'
import enMessages from '@/messages/en.json'
import arMessages from '@/messages/ar.json'
import zhMessages from '@/messages/zh.json'

// ── vi.hoisted stubs (declared before the vi.mock factories) ────────────────
const { mockGetUser, mockMaybeSingle, mockTrack, pathnameRef } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockTrack: vi.fn(),
  pathnameRef: { current: '/' },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: mockGetUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  })),
}))

vi.mock('@/components/MetaPixel', () => ({ trackMetaEvent: mockTrack }))

// next-intl's usePathname (via @/i18n/routing) reads next/navigation's usePathname.
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return {
    ...actual,
    usePathname: () => pathnameRef.current,
    useRouter: () => ({
      replace: vi.fn(),
      push: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
  }
})

import ChatLauncher from '@/components/ChatLauncher'
import { GET as identityGET } from '@/app/api/chatwoot/identity/route'
import { computeIdentifierHash } from '@/lib/chatwoot-identity'
import { WIDGET_CONFIG_PATH } from '@/lib/chat-widget-contract'
import { WHATSAPP_CHAT_URL, TELEGRAM_CHAT_URL } from '@/lib/contact-channels'

const BASE_URL = 'https://chat.rideprestigo.com'
const WEBSITE_TOKEN = 'test-website-token'
const HMAC_SECRET = 'test-hmac-secret'
const USER = { id: '11111111-2222-3333-4444-555555555555', email: 'customer@example.com' }

type FakeCw = {
  setUser: ReturnType<typeof vi.fn>
  setLocale: ReturnType<typeof vi.fn>
  setCustomAttributes: ReturnType<typeof vi.fn>
  setConversationCustomAttributes: ReturnType<typeof vi.fn>
  toggle: ReturnType<typeof vi.fn>
}

/**
 * Intercepts document.body.appendChild for the sdk.js script. window.chatwootSDK.run
 * creates the fake $chatwoot and (unless `neverReady`) dispatches 'chatwoot:ready';
 * the script's onload is then invoked. Every other node passes through untouched
 * (RTL mounts its container through document.body.appendChild).
 */
function installFakeSdk(opts: { neverReady?: boolean; failScript?: boolean } = {}) {
  const cw: FakeCw = {
    setUser: vi.fn(),
    setLocale: vi.fn(),
    setCustomAttributes: vi.fn(),
    setConversationCustomAttributes: vi.fn(),
    toggle: vi.fn(),
  }
  const run = vi.fn(() => {
    ;(window as unknown as { $chatwoot: FakeCw }).$chatwoot = cw
    if (!opts.neverReady) {
      setTimeout(() => window.dispatchEvent(new Event('chatwoot:ready')), 0)
    }
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

/** fetch wired to the REAL identity route handler; any other URL is a test failure. */
function wireFetchToIdentityRoute() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === WIDGET_CONFIG_PATH) return identityGET()
    throw new Error(`unexpected fetch: ${String(input)}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function resetWidgetGlobals() {
  const w = window as unknown as Record<string, unknown>
  delete w.$chatwoot
  delete w.chatwootSDK
  delete w.chatwootSettings
}

beforeEach(() => {
  vi.clearAllMocks()
  pathnameRef.current = '/'
  process.env.CHATWOOT_BASE_URL = BASE_URL
  process.env.CHATWOOT_WEBSITE_TOKEN = WEBSITE_TOKEN
  process.env.CHATWOOT_WIDGET_HMAC_SECRET = HMAC_SECRET
  mockGetUser.mockResolvedValue({ data: { user: USER }, error: null })
  mockMaybeSingle.mockResolvedValue({ data: null, error: null })
  resetWidgetGlobals()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.CHATWOOT_BASE_URL
  delete process.env.CHATWOOT_WEBSITE_TOKEN
  delete process.env.CHATWOOT_WIDGET_HMAC_SECRET
  resetWidgetGlobals()
  document.querySelectorAll('script').forEach((s) => s.remove())
})

function launcherButton() {
  return screen.getByRole('button', { name: /open chat/i })
}

function menuItems(): HTMLElement[] {
  const menu = document.getElementById('chat-launcher-menu')
  expect(menu).toBeTruthy()
  return Array.from(menu!.querySelectorAll<HTMLElement>('button, a'))
}

describe('ChatLauncher — consent gate (T-77-24, D-02)', () => {
  it('renders one launcher button (aria-expanded=false, aria-controls) with no script and no fetch', () => {
    const fetchMock = wireFetchToIdentityRoute()
    renderWithIntl(<ChatLauncher />)
    const btn = launcherButton()
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(btn).toHaveAttribute('aria-controls', 'chat-launcher-menu')
    expect(document.querySelector('script[src$="/packs/js/sdk.js"]')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opening the menu and following WhatsApp/Telegram loads nothing third-party', () => {
    const fetchMock = wireFetchToIdentityRoute()
    renderWithIntl(<ChatLauncher />)
    fireEvent.click(launcherButton())
    const items = menuItems()
    fireEvent.click(items[1])
    fireEvent.click(items[2])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.querySelector('script[src$="/packs/js/sdk.js"]')).toBeNull()
    expect(document.cookie).not.toMatch(/cw_/)
  })
})

describe('ChatLauncher — menu (D-01, D-16)', () => {
  it('shows exactly three items in order: chat on site, WhatsApp, Telegram', () => {
    renderWithIntl(<ChatLauncher />)
    fireEvent.click(launcherButton())
    const items = menuItems()
    expect(items).toHaveLength(3)
    expect(items[0].tagName).toBe('BUTTON')
    expect(items[0]).toHaveTextContent('Chat on site')
    expect(items[1]).toHaveTextContent('WhatsApp')
    expect(items[1]).toHaveAttribute('href', WHATSAPP_CHAT_URL)
    expect(items[1]).toHaveAttribute('target', '_blank')
    expect(items[1]).toHaveAttribute('rel', 'noopener noreferrer')
    expect(items[2]).toHaveTextContent('Telegram')
    expect(items[2]).toHaveAttribute('href', TELEGRAM_CHAT_URL)
    expect(items[2]).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('fires the Contact analytics event per channel', () => {
    wireFetchToIdentityRoute()
    installFakeSdk()
    renderWithIntl(<ChatLauncher />)
    fireEvent.click(launcherButton())
    const items = menuItems()
    fireEvent.click(items[1])
    fireEvent.click(items[2])
    expect(mockTrack).toHaveBeenCalledWith('Contact', { content_name: 'WhatsApp Launcher' })
    expect(mockTrack).toHaveBeenCalledWith('Contact', { content_name: 'Telegram Launcher' })
  })
})

describe('ChatLauncher — click -> real identity route -> identified widget (D-05, D-07, D-08)', () => {
  it('configures the widget, injects sdk.js, identifies the signed-in user and opens', async () => {
    const fetchMock = wireFetchToIdentityRoute()
    const sdk = installFakeSdk()
    renderWithIntl(<ChatLauncher />)
    fireEvent.click(launcherButton())
    fireEvent.click(menuItems()[0])

    await waitFor(() => expect(sdk.cw.toggle).toHaveBeenCalledWith('open'))

    expect(mockTrack).toHaveBeenCalledWith('Contact', { content_name: 'Chat on site' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      WIDGET_CONFIG_PATH,
      expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
    )

    // chatwootSettings exists BEFORE the script is appended
    expect(sdk.scripts).toHaveLength(1)
    expect(sdk.scripts[0].src).toBe(`${BASE_URL}/packs/js/sdk.js`)
    expect(sdk.settingsAtAppend[0]).toMatchObject({
      hideMessageBubble: true,
      position: 'right',
      locale: 'en',
      useBrowserLanguage: false,
      type: 'standard',
      darkMode: 'light',
      showPopoutButton: false,
      welcomeTitle: enMessages.ChatLauncher.widget.welcomeTitle,
      welcomeDescription: enMessages.ChatLauncher.widget.welcomeDescription,
      availableMessage: enMessages.ChatLauncher.replyTimeHint,
    })

    expect(sdk.run).toHaveBeenCalledWith({ websiteToken: WEBSITE_TOKEN, baseUrl: BASE_URL })

    // Identified before opening: no pre-chat form for a signed-in customer
    expect(sdk.cw.setUser).toHaveBeenCalledTimes(1)
    expect(sdk.cw.setUser).toHaveBeenCalledWith(USER.id, {
      email: USER.email,
      identifier_hash: computeIdentifierHash(HMAC_SECRET, USER.id),
    })
    expect(sdk.cw.setLocale).toHaveBeenCalledWith('en')
    expect(sdk.cw.setUser.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.cw.toggle.mock.invocationCallOrder[0],
    )
  })

  it('does not identify an anonymous visitor but still opens the widget', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    wireFetchToIdentityRoute()
    const sdk = installFakeSdk()
    renderWithIntl(<ChatLauncher />)
    fireEvent.click(launcherButton())
    fireEvent.click(menuItems()[0])
    await waitFor(() => expect(sdk.cw.toggle).toHaveBeenCalledWith('open'))
    expect(sdk.cw.setUser).not.toHaveBeenCalled()
  })

  it('a second click reuses the loaded widget: toggle open, no second script or fetch', async () => {
    const fetchMock = wireFetchToIdentityRoute()
    const sdk = installFakeSdk()
    renderWithIntl(<ChatLauncher />)
    fireEvent.click(launcherButton())
    fireEvent.click(menuItems()[0])
    await waitFor(() => expect(sdk.cw.toggle).toHaveBeenCalledTimes(1))

    fireEvent.click(launcherButton())
    fireEvent.click(menuItems()[0])
    await waitFor(() => expect(sdk.cw.toggle).toHaveBeenCalledTimes(2))
    expect(sdk.scripts).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps the site locale to the widget locale (zh -> zh_CN) and positions left for ar', async () => {
    wireFetchToIdentityRoute()
    const sdk = installFakeSdk()
    const { unmount } = renderWithIntl(<ChatLauncher />, {
      locale: 'zh',
      messages: zhMessages as unknown as AbstractIntlMessages,
    })
    fireEvent.click(screen.getByRole('button', { name: zhMessages.ChatLauncher.openAria }))
    fireEvent.click(menuItems()[0])
    await waitFor(() => expect(sdk.cw.toggle).toHaveBeenCalledWith('open'))
    expect(sdk.settingsAtAppend[0]).toMatchObject({
      locale: 'zh_CN',
      position: 'right',
      welcomeTitle: zhMessages.ChatLauncher.widget.welcomeTitle,
    })
    expect(sdk.cw.setLocale).toHaveBeenCalledWith('zh_CN')
    unmount()
    vi.restoreAllMocks() // drop the first appendChild spy before installing a second
    resetWidgetGlobals()

    const sdkAr = installFakeSdk()
    renderWithIntl(<ChatLauncher />, {
      locale: 'ar',
      messages: arMessages as unknown as AbstractIntlMessages,
    })
    fireEvent.click(screen.getByRole('button', { name: arMessages.ChatLauncher.openAria }))
    fireEvent.click(menuItems()[0])
    await waitFor(() => expect(sdkAr.cw.toggle).toHaveBeenCalledWith('open'))
    expect(sdkAr.settingsAtAppend[0]).toMatchObject({ locale: 'ar', position: 'left' })
  })
})

describe('ChatLauncher — source-level prohibitions', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

  it('the loader is reachable only through a dynamic import in the click handler', () => {
    const src = read('components/ChatLauncher.tsx')
    expect(src.match(/import\('@\/components\/chat\/load-chat-widget'\)/g)).toHaveLength(1)
    expect(src).not.toMatch(/from ['"]@\/components\/chat\/load-chat-widget['"]/)
    expect(src).not.toMatch(/next\/script/)
  })

  it('uses logical properties only — no physical left/right offset classes (RTL)', () => {
    const src = read('components/ChatLauncher.tsx')
    expect(src).not.toMatch(/\b(?:left|right)-[0-9\[]/)
    expect(src).not.toMatch(/\b(?:ml|mr|pl|pr)-[0-9\[]/)
  })

  it('no client chat file names the chat host or an uppercase CHATWOOT_ env var', () => {
    for (const rel of [
      'components/ChatLauncher.tsx',
      'components/chat/load-chat-widget.ts',
      'lib/chat-visit-context.ts',
    ]) {
      let src = ''
      try {
        src = read(rel)
      } catch {
        continue
      }
      expect(src, rel).not.toMatch(/\b(?:chat|crm)\.rideprestigo\.com\b/i)
      expect(src, rel).not.toMatch(/CHATWOOT_[A-Z0-9_]+/)
    }
  })

  it('mounts in the public locale layout only, never in the internal layout', () => {
    expect(read('app/[locale]/layout.tsx')).toMatch(/ChatLauncher/)
    expect(read('app/(internal)/layout.tsx')).not.toMatch(/ChatLauncher/)
    expect(read('components/SiteChrome.tsx')).not.toMatch(/ChatLauncher/)
  })
})
