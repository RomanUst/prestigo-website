// Phase 94 plan 94-13 (DCAB-10, DCAB-12; D-09): browser-side web push for the driver cabinet.
//
// Client-safe: imports nothing from the server push module (the private key never reaches the bundle). The page hands
// down only the public VAPID key. The permission prompt is requested only from enablePush(), which the switch calls
// inside a tap; nothing here runs on load except the read-only readPushState().

export type PushUiState = 'unsupported' | 'ios-install' | 'off' | 'busy' | 'on' | 'denied' | 'error'

export const PUSH_HINT_DISMISSED_KEY = 'driver-push-hint-dismissed'

const WORKER_URL = '/driver/sw.js'
const WORKER_SCOPE = '/driver/'
const PUSH_API = '/api/driver/cabinet/push'
export const PUSH_SIGN_IN_URL ='/driver/login?next=%2Fdriver%2Fyou&ended=1'

export function pushSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function isIosDevice(): boolean {
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/.test(ua)) return true
  // iPadOS 13+ reports itself as a Mac with a touch screen.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

function isStandalone(): boolean {
  try {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) return true
  } catch {
    // matchMedia unavailable: fall through to the iOS flag.
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** iPhone / iPad Safari in a normal tab: push only works after the page is added to the Home Screen. */
export function isIosSafariOutsideHomeScreen(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  return isIosDevice() && !isStandalone()
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(WORKER_SCOPE)
  if (!registration) return null
  return registration.pushManager.getSubscription()
}

/** Read-only: never registers a worker and never asks for permission. */
export async function readPushState(): Promise<PushUiState> {
  if (typeof window === 'undefined') return 'unsupported'
  // On iOS the Push API only exists inside the installed web app, so this check has to come first.
  if (isIosSafariOutsideHomeScreen()) return 'ios-install'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return (await currentSubscription()) ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function subscribeBrowser(registration: ServiceWorkerRegistration, key: Uint8Array<ArrayBuffer>) {
  const options = { userVisibleOnly: true, applicationServerKey: key }
  try {
    return await registration.pushManager.subscribe(options)
  } catch (error) {
    // A subscription made with an older server key blocks a new one: drop it and subscribe once more.
    const existing = await registration.pushManager.getSubscription()
    if (!existing) throw error
    await existing.unsubscribe()
    return registration.pushManager.subscribe(options)
  }
}

/**
 * Turn notifications on for this browser. Call it only from a tap. Resolves 'on' once the server has stored the
 * subscription; the caller must not show the switch as on before that.
 */
export async function enablePush(publicKey: string): Promise<'on' | 'denied' | 'error' | 'unauthorized'> {
  try {
    // Both start inside the tap so the permission prompt keeps its user gesture.
    const registering = navigator.serviceWorker.register(WORKER_URL, { scope: WORKER_SCOPE, updateViaCache: 'none' })
    registering.catch(() => undefined)
    const permission = await Notification.requestPermission()
    await registering
    if (permission === 'denied') return 'denied'
    if (permission !== 'granted') return 'error'

    const registration = await navigator.serviceWorker.ready
    const subscription = await subscribeBrowser(registration, base64UrlToBytes(publicKey))

    let status = 0
    try {
      const res = await fetch(PUSH_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      status = res.status
    } catch {
      status = 0
    }
    if (status === 200) return 'on'
    // Not stored: leave the browser as it was, so the switch and the browser agree.
    await subscription.unsubscribe().catch(() => undefined)
    return status === 401 ? 'unauthorized' : 'error'
  } catch {
    return 'error'
  }
}

/** Turn notifications off: delete the stored row first, then drop the browser subscription. */
export async function disablePush(): Promise<'off' | 'error' | 'unauthorized'> {
  try {
    const subscription = await currentSubscription()
    if (!subscription) return 'off'

    let status = 0
    try {
      const res = await fetch(PUSH_API, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
      status = res.status
    } catch {
      status = 0
    }
    if (status === 401) return 'unauthorized'
    if (status !== 200) return 'error'

    await subscription.unsubscribe().catch(() => undefined)
    return 'off'
  } catch {
    return 'error'
  }
}
