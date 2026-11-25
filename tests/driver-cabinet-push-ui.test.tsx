import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'

// Phase 94 plan 94-13 (DCAB-10, DCAB-12; D-09, UI-SPEC You item 4 / E12): the Notifications section of the You tab.

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  requireDriver: vi.fn(),
  configured: true,
  key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' as string | null,
}))

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: () => h.db.client }))
vi.mock('@/lib/driver-cabinet/auth', () => ({
  requireDriver: h.requireDriver,
  getDriverSession: async () => ({ driverId: DRIVER, sessionId: 's1' }),
}))
vi.mock('@/lib/driver-cabinet/push', () => ({
  pushConfigured: () => h.configured,
  vapidPublicKey: () => h.key,
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
  usePathname: () => '/driver/you',
  useRouter: () => ({ refresh: vi.fn() }),
}))

import YouPage from '@/app/(internal)/driver/(cabinet)/(tabs)/you/page'
import PushToggle from '@/components/driver/PushToggle'
import { readPushState, enablePush, PUSH_HINT_DISMISSED_KEY } from '@/lib/driver-cabinet/push-client'

const DRIVER = 'd0000000-0000-4000-8000-000000000001'
const KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
const ENDPOINT = 'https://push.example.test/send/abc'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

const originalLocation = Object.getOwnPropertyDescriptor(window, 'location')

function makeSubscription(endpoint = ENDPOINT) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'p256-key', auth: 'auth-key' } }),
    unsubscribe: vi.fn(async () => true),
  }
}

type Sub = ReturnType<typeof makeSubscription>

interface Setup {
  permission?: 'default' | 'granted' | 'denied'
  /** Subscription that already exists for the /driver/ registration. */
  existing?: Sub | null
  /** What a new pushManager.subscribe() resolves with. */
  created?: Sub
  requestPermission?: () => Promise<string>
}

/** Stub the browser push surface; returns the spies. */
function installPush(setup: Setup = {}) {
  let stored: Sub | null = setup.existing ?? null
  const created = setup.created ?? makeSubscription()
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => stored),
      subscribe: vi.fn(async () => {
        stored = created
        return created
      }),
    },
  }
  const serviceWorker = {
    register: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
    getRegistration: vi.fn(async () => registration),
  }
  const requestPermission = vi.fn(setup.requestPermission ?? (async () => 'granted'))
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', { permission: setup.permission ?? 'default', requestPermission })
  return { registration, serviceWorker, requestPermission, created }
}

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua })
}

function setStandalone(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('standalone') ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function stubFetch(handler: (url: string, init: RequestInit) => number | Promise<number>) {
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    const status = await handler(url, init)
    return { status, ok: status >= 200 && status < 300, json: async () => ({}) } as Response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function stubLocationAssign() {
  const assign = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign },
  })
  return assign
}

beforeEach(() => {
  h.requireDriver.mockReset()
  h.requireDriver.mockResolvedValue({ driverId: DRIVER, sessionId: 's1' })
  h.configured = true
  h.key = KEY
  window.localStorage.clear()
  setStandalone(false)
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(navigator, 'userAgent')
  Reflect.deleteProperty(window, 'matchMedia')
  if (originalLocation) Object.defineProperty(window, 'location', originalLocation)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('readPushState', () => {
  it('is unsupported without the Push API, a service worker or Notification', async () => {
    expect(await readPushState()).toBe('unsupported')
  })

  it('is ios-install on an iPhone browser tab, even though Safari hides the Push API there', async () => {
    setUserAgent(IPHONE_UA)
    setStandalone(false)
    expect(await readPushState()).toBe('ios-install')
  })

  it('lets an iPhone Home Screen app through to the normal checks', async () => {
    setUserAgent(IPHONE_UA)
    setStandalone(true)
    installPush()
    expect(await readPushState()).toBe('off')
  })

  it('is denied when the permission is denied', async () => {
    installPush({ permission: 'denied' })
    expect(await readPushState()).toBe('denied')
  })

  it('is on when the /driver/ registration already has a subscription', async () => {
    const { serviceWorker } = installPush({ permission: 'granted', existing: makeSubscription() })
    expect(await readPushState()).toBe('on')
    expect(serviceWorker.getRegistration).toHaveBeenCalledWith('/driver/')
  })

  it('is off for a default permission, and for granted without a subscription', async () => {
    installPush({ permission: 'default' })
    expect(await readPushState()).toBe('off')
    cleanup()
    installPush({ permission: 'granted' })
    expect(await readPushState()).toBe('off')
  })

  it('never registers a worker or asks for permission', async () => {
    const { serviceWorker, requestPermission } = installPush()
    await readPushState()
    expect(serviceWorker.register).not.toHaveBeenCalled()
    expect(requestPermission).not.toHaveBeenCalled()
  })
})

describe('enablePush', () => {
  it('registers /driver/sw.js with scope /driver/, subscribes with the decoded key and stores the subscription', async () => {
    const { serviceWorker, registration, requestPermission } = installPush()
    const fetchSpy = stubFetch(() => 200)
    await expect(enablePush(KEY)).resolves.toBe('on')

    expect(serviceWorker.register).toHaveBeenCalledWith('/driver/sw.js', { scope: '/driver/', updateViaCache: 'none' })
    expect(requestPermission).toHaveBeenCalledTimes(1)
    const options = (registration.pushManager.subscribe.mock.calls[0] as unknown[])[0] as {
      userVisibleOnly: boolean
      applicationServerKey: Uint8Array
    }
    expect(options.userVisibleOnly).toBe(true)
    expect(options.applicationServerKey).toBeInstanceOf(Uint8Array)
    expect(options.applicationServerKey).toHaveLength(65)
    expect(options.applicationServerKey[0]).toBe(0x04)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/driver/cabinet/push')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toMatchObject({ endpoint: ENDPOINT, keys: { p256dh: 'p256-key', auth: 'auth-key' } })
  })

  it('resolves denied without subscribing when the driver blocks the prompt', async () => {
    const { registration } = installPush({ requestPermission: async () => 'denied' })
    const fetchSpy = stubFetch(() => 200)
    await expect(enablePush(KEY)).resolves.toBe('denied')
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('maps 401 to unauthorized and 500 to error, and drops the unsaved browser subscription', async () => {
    const created = makeSubscription()
    installPush({ created })
    stubFetch(() => 401)
    await expect(enablePush(KEY)).resolves.toBe('unauthorized')
    expect(created.unsubscribe).toHaveBeenCalled()

    const second = makeSubscription()
    installPush({ created: second })
    stubFetch(() => 500)
    await expect(enablePush(KEY)).resolves.toBe('error')
    expect(second.unsubscribe).toHaveBeenCalled()
  })

  it('resolves error when the browser subscribe call rejects', async () => {
    const { registration } = installPush()
    registration.pushManager.subscribe.mockRejectedValueOnce(new Error('boom'))
    stubFetch(() => 200)
    await expect(enablePush(KEY)).resolves.toBe('error')
  })
})

describe('PushToggle', () => {
  it('does not register a worker or ask for permission on mount', async () => {
    const { serviceWorker, requestPermission } = installPush()
    render(<PushToggle publicKey={KEY} />)
    expect(await screen.findByRole('switch', { name: 'New ride offers' })).toBeInTheDocument()
    expect(serviceWorker.register).not.toHaveBeenCalled()
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('renders the switch off with its helper text', async () => {
    installPush()
    render(<PushToggle publicKey={KEY} />)
    const toggle = await screen.findByRole('switch', { name: 'New ride offers' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).not.toBeDisabled()
    expect(screen.getByText('We notify you when the office sends you a ride.')).toBeInTheDocument()
  })

  it('shows the unsupported line in a browser without push', async () => {
    render(<PushToggle publicKey={KEY} />)
    expect(
      await screen.findByText('Notifications are not available in this browser. You still get an email for every new ride.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('shows the Home Screen steps and no switch on an iPhone browser tab', async () => {
    setUserAgent(IPHONE_UA)
    render(<PushToggle publicKey={KEY} />)
    expect(await screen.findByText('Add Prestigo to your Home Screen')).toBeInTheDocument()
    expect(
      screen.getByText('On iPhone, notifications only work after you add this page to your Home Screen.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Tap the Share button/)).toBeInTheDocument()
    expect(screen.getByText(/Choose Add to Home Screen/)).toBeInTheDocument()
    expect(screen.getByText('Open Prestigo from your Home Screen and turn on notifications here.')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(document.querySelectorAll('svg:not([aria-hidden="true"])')).toHaveLength(0)
  })

  it('turns on only after the server answered 200, with aria-busy while it works', async () => {
    installPush()
    let release: (status: number) => void = () => undefined
    stubFetch(() => new Promise<number>((resolve) => (release = resolve)))
    render(<PushToggle publicKey={KEY} />)
    const toggle = await screen.findByRole('switch', { name: 'New ride offers' })

    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-busy', 'true'))
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    release(200)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(toggle).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByText('You will get a notification for every new ride offer.')).toBeInTheDocument()
  })

  it('shows the blocked state when the driver denies the prompt', async () => {
    installPush({ requestPermission: async () => 'denied' })
    stubFetch(() => 200)
    render(<PushToggle publicKey={KEY} />)
    const toggle = await screen.findByRole('switch', { name: 'New ride offers' })
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toBeDisabled())
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(
      screen.getByText("Notifications are blocked. Turn them on for this site in your phone's browser settings."),
    ).toBeInTheDocument()
  })

  it('starts disabled and off when the permission is already denied', async () => {
    installPush({ permission: 'denied' })
    render(<PushToggle publicKey={KEY} />)
    const toggle = await screen.findByRole('switch', { name: 'New ride offers' })
    expect(toggle).toBeDisabled()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('goes back off with an alert when saving fails (500)', async () => {
    installPush()
    stubFetch(() => 500)
    render(<PushToggle publicKey={KEY} />)
    const toggle = await screen.findByRole('switch', { name: 'New ride offers' })
    fireEvent.click(toggle)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not turn on notifications. Try again.')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).not.toBeDisabled()
  })

  it('goes back off with an alert when the browser subscribe call rejects', async () => {
    const { registration } = installPush()
    registration.pushManager.subscribe.mockRejectedValue(new Error('no'))
    stubFetch(() => 200)
    render(<PushToggle publicKey={KEY} />)
    const toggle = await screen.findByRole('switch', { name: 'New ride offers' })
    fireEvent.click(toggle)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not turn on notifications. Try again.')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('sends the driver to sign-in on 401', async () => {
    installPush()
    stubFetch(() => 401)
    const assign = stubLocationAssign()
    render(<PushToggle publicKey={KEY} />)
    fireEvent.click(await screen.findByRole('switch', { name: 'New ride offers' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/driver/login?next=%2Fdriver%2Fyou&ended=1'))
  })

  it('turns off: deletes the stored endpoint, unsubscribes and returns to off', async () => {
    const existing = makeSubscription()
    installPush({ permission: 'granted', existing })
    const fetchSpy = stubFetch(() => 200)
    render(<PushToggle publicKey={KEY} />)
    const toggle = await screen.findByRole('switch', { name: 'New ride offers' })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))

    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/driver/cabinet/push')
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(init.body as string)).toEqual({ endpoint: ENDPOINT })
    expect(existing.unsubscribe).toHaveBeenCalled()
  })

  it('keeps the switch on and shows an alert when turning off fails', async () => {
    const existing = makeSubscription()
    installPush({ permission: 'granted', existing })
    stubFetch(() => 500)
    render(<PushToggle publicKey={KEY} />)
    const toggle = await screen.findByRole('switch', { name: 'New ride offers' })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    fireEvent.click(toggle)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not turn off notifications. Try again.')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(existing.unsubscribe).not.toHaveBeenCalled()
  })
})

describe('You page Notifications section', () => {
  function seedDriver() {
    h.db = createFakeDriverCabinetDb({
      drivers: [
        {
          id: DRIVER,
          name: 'Ana Novak',
          email: 'ana.novak@example.com',
          phone: '+420777111222',
          vehicle_info: 'Mercedes V-Class',
          vehicle_plate: '1AB 2345',
          cabinet_enabled: true,
        },
      ] as never,
    })
  }

  it('renders the section between Help and Sign out when push is configured', async () => {
    installPush()
    seedDriver()
    render(await YouPage())
    const heading = screen.getByRole('heading', { level: 2, name: 'Notifications' })
    const section = heading.closest('section') as HTMLElement
    expect(section.id).toBe('notifications')
    const help = screen.getByRole('heading', { level: 2, name: 'Help' })
    const signOut = screen.getByRole('button', { name: 'Sign out' })
    expect(help.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(heading.compareDocumentPosition(signOut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(await screen.findByRole('switch', { name: 'New ride offers' })).toBeInTheDocument()
  })

  it('has no Notifications heading when the VAPID keys are missing', async () => {
    h.configured = false
    h.key = null
    seedDriver()
    render(await YouPage())
    expect(screen.queryByRole('heading', { name: 'Notifications' })).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})

describe('client bundle gates', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

  it('keeps the server push module and the private key out of the client files', () => {
    for (const rel of ['lib/driver-cabinet/push-client.ts', 'components/driver/PushToggle.tsx', 'components/driver/HomeScreenHint.tsx']) {
      const text = read(rel)
      expect(text).not.toMatch(/VAPID_PRIVATE_KEY/)
      expect(text).not.toMatch(/from '@\/lib\/driver-cabinet\/push'/)
      expect(text).not.toMatch(/web-push/)
    }
  })

  it('asks for permission only through enablePush, never from the component', () => {
    expect(read('components/driver/PushToggle.tsx')).not.toMatch(/requestPermission|serviceWorker/)
    expect(read('lib/driver-cabinet/push-client.ts')).toContain("updateViaCache: 'none'")
  })

  it('exports the dismissal key used by the Offers hint', () => {
    expect(PUSH_HINT_DISMISSED_KEY).toBe('driver-push-hint-dismissed')
  })
})
