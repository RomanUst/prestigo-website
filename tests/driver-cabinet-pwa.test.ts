// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

/**
 * Phase 94 (D-09, DCAB-12): the cabinet is an installable Home Screen web app and the static
 * service worker shows a notification for every push. The worker is run in a node vm with a stub
 * `self` and `clients` so the push / notificationclick handlers are exercised without a browser.
 */

const ROOT = path.resolve(__dirname, '..')
const MANIFEST_PATH = path.join(ROOT, 'public/driver/manifest.webmanifest')
const SW_PATH = path.join(ROOT, 'public/driver/sw.js')

type Handler = (event: unknown) => unknown

function loadWorker() {
  const handlers: Record<string, Handler> = {}
  const showNotification = vi.fn(() => Promise.resolve())
  const matchAll = vi.fn(() => Promise.resolve([] as unknown[]))
  const openWindow = vi.fn(() => Promise.resolve(undefined))
  const self = {
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn
    },
    registration: { showNotification },
    clients: { matchAll, openWindow },
  }
  const context = vm.createContext({ self, clients: self.clients, URL, console })
  vm.runInContext(fs.readFileSync(SW_PATH, 'utf8'), context)
  return { handlers, showNotification, matchAll, openWindow }
}

function pushEvent(payload: unknown, opts: { unreadable?: boolean; noData?: boolean } = {}) {
  const waited: Promise<unknown>[] = []
  const event: Record<string, unknown> = {
    waitUntil: (p: Promise<unknown>) => {
      waited.push(p)
    },
  }
  if (!opts.noData) {
    event.data = {
      json: () => {
        if (opts.unreadable) throw new SyntaxError('bad json')
        return payload
      },
    }
  }
  return { event, waited }
}

describe('driver cabinet manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))

  it('names the app and scopes it to /driver/', () => {
    expect(manifest.name).toBe('Prestigo Driver')
    expect(manifest.short_name).toBe('Prestigo')
    expect(manifest.start_url).toBe('/driver/rides')
    expect(manifest.scope).toBe('/driver/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.background_color).toBe('#EFE8DA')
    expect(manifest.theme_color).toBe('#EFE8DA')
  })

  it('declares 192, 512 and maskable 512 icons under /driver/icons/', () => {
    const icons = manifest.icons as Array<{ src: string; sizes: string; type: string; purpose?: string }>
    const find = (src: string) => icons.find((i) => i.src === src)
    expect(find('/driver/icons/icon-192.png')).toMatchObject({ sizes: '192x192', type: 'image/png', purpose: 'any' })
    expect(find('/driver/icons/icon-512.png')).toMatchObject({ sizes: '512x512', type: 'image/png', purpose: 'any' })
    expect(find('/driver/icons/icon-maskable-512.png')).toMatchObject({
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    })
  })

  it('points only at icon files that exist', () => {
    for (const icon of manifest.icons as Array<{ src: string }>) {
      expect(fs.existsSync(path.join(ROOT, 'public', icon.src)), icon.src).toBe(true)
    }
  })
})

describe('driver cabinet service worker', () => {
  it('shows the offer notification with the payload fields', async () => {
    const { handlers, showNotification } = loadWorker()
    const { event, waited } = pushEvent({
      title: 'New ride offer',
      body: 'Today 14:30. Airport to Hotel Aria. Business.',
      url: '/driver/offers',
      tag: 'offer-abc',
    })
    handlers.push(event)
    await Promise.all(waited)
    expect(showNotification).toHaveBeenCalledTimes(1)
    const calls = showNotification.mock.calls as unknown as Array<[string, Record<string, unknown>]>
    const [title, options] = calls[0]
    expect(title).toBe('New ride offer')
    expect(options).toMatchObject({
      body: 'Today 14:30. Airport to Hotel Aria. Business.',
      tag: 'offer-abc',
      icon: '/driver/icons/icon-192.png',
      badge: '/driver/icons/badge-72.png',
      data: { url: '/driver/offers' },
    })
    expect(waited.length).toBe(1)
  })

  it('still shows a notification when the push has no data', async () => {
    const { handlers, showNotification } = loadWorker()
    const { event, waited } = pushEvent(null, { noData: true })
    handlers.push(event)
    await Promise.all(waited)
    const calls = showNotification.mock.calls as unknown as Array<[string, Record<string, unknown>]>
    expect(calls[0][0]).toBe('New ride offer')
    expect(calls[0][1]).toMatchObject({ body: 'You have a new ride offer.', data: { url: '/driver/offers' } })
  })

  it('still shows a notification when the payload JSON is unreadable', async () => {
    const { handlers, showNotification } = loadWorker()
    const { event, waited } = pushEvent(null, { unreadable: true })
    handlers.push(event)
    await Promise.all(waited)
    const calls = showNotification.mock.calls as unknown as Array<[string, Record<string, unknown>]>
    expect(calls[0][0]).toBe('New ride offer')
    expect(calls[0][1]).toMatchObject({ body: 'You have a new ride offer.' })
  })

  it.each([['https://evil.example/x'], ['/admin'], ['//evil.example/driver/x'], ['/driver'], [42], [null]])(
    'replaces the untrusted payload url %j with /driver/offers',
    async (url) => {
      const { handlers, showNotification } = loadWorker()
      const { event, waited } = pushEvent({ title: 'x', body: 'y', url, tag: 't' })
      handlers.push(event)
      await Promise.all(waited)
      const calls = showNotification.mock.calls as unknown as Array<[string, { data: { url: string } }]>
      expect(calls[0][1].data.url).toBe('/driver/offers')
    },
  )

  it('keeps a /driver/ payload url', async () => {
    const { handlers, showNotification } = loadWorker()
    const { event, waited } = pushEvent({ title: 'x', body: 'y', url: '/driver/rides/123', tag: 't' })
    handlers.push(event)
    await Promise.all(waited)
    const calls = showNotification.mock.calls as unknown as Array<[string, { data: { url: string } }]>
    expect(calls[0][1].data.url).toBe('/driver/rides/123')
  })

  it('focuses and navigates an open /driver/ window on notificationclick', async () => {
    const { handlers, matchAll, openWindow } = loadWorker()
    const focus = vi.fn(() => Promise.resolve())
    const navigate = vi.fn(() => Promise.resolve())
    matchAll.mockResolvedValueOnce([
      { url: 'https://rideprestigo.com/book', focus: vi.fn(), navigate: vi.fn() },
      { url: 'https://rideprestigo.com/driver/rides', focus, navigate },
    ])
    const close = vi.fn()
    const waited: Promise<unknown>[] = []
    handlers.notificationclick({
      notification: { close, data: { url: '/driver/offers' } },
      waitUntil: (p: Promise<unknown>) => waited.push(p),
    })
    await Promise.all(waited)
    expect(close).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/driver/offers')
    expect(focus).toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('opens a window on notificationclick when no /driver/ window is open', async () => {
    const { handlers, openWindow } = loadWorker()
    const close = vi.fn()
    const waited: Promise<unknown>[] = []
    handlers.notificationclick({
      notification: { close, data: { url: '/driver/rides/9' } },
      waitUntil: (p: Promise<unknown>) => waited.push(p),
    })
    await Promise.all(waited)
    expect(close).toHaveBeenCalled()
    expect(openWindow).toHaveBeenCalledWith('/driver/rides/9')
  })

  it('never opens a non-/driver/ url from the notification data', async () => {
    const { handlers, openWindow } = loadWorker()
    const waited: Promise<unknown>[] = []
    handlers.notificationclick({
      notification: { close: vi.fn(), data: { url: 'https://evil.example/x' } },
      waitUntil: (p: Promise<unknown>) => waited.push(p),
    })
    await Promise.all(waited)
    expect(openWindow).toHaveBeenCalledWith('/driver/offers')
  })

  it('loads no other script, uses no eval and has no fetch handler', () => {
    const src = fs.readFileSync(SW_PATH, 'utf8')
    expect(src).not.toMatch(/importScripts/)
    expect(src).not.toMatch(/\beval\s*\(/)
    expect(src).not.toMatch(/new\s+Function\s*\(/)
    expect(src).not.toMatch(/addEventListener\(\s*['"]fetch['"]/)
  })
})

describe('driver cabinet layout metadata', () => {
  it('links the manifest, the Apple web-app tags and the apple-touch-icon; keeps noindex', async () => {
    const mod = await import('@/app/(internal)/driver/(cabinet)/layout')
    const md = mod.metadata as {
      manifest: string
      appleWebApp: Record<string, unknown>
      icons: { apple: string }
      robots: Record<string, unknown>
    }
    expect(md.manifest).toBe('/driver/manifest.webmanifest')
    expect(md.appleWebApp).toMatchObject({ capable: true, title: 'Prestigo', statusBarStyle: 'default' })
    expect(md.icons.apple).toBe('/driver/icons/apple-touch-icon.png')
    expect(md.robots).toMatchObject({ index: false, follow: false })
  })
})
