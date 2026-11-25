// Prestigo driver cabinet service worker (Phase 94, D-09, DCAB-12).
// Scope: /driver/ only (served from /driver/sw.js, no Service-Worker-Allowed header).
// Deliberately minimal: it shows a notification for every push and handles the tap.
// It loads no other script, runs no dynamic code and has no network interception (no offline caching).

var DEFAULT_URL = '/driver/offers'

// Accept only a same-origin /driver/ path. A scheme, a protocol-relative url or any other path is replaced.
function safeUrl(value) {
  if (typeof value !== 'string') return DEFAULT_URL
  if (value.indexOf('/driver/') !== 0) return DEFAULT_URL
  if (value.indexOf('//') !== -1 || value.indexOf('\\') !== -1) return DEFAULT_URL
  return value
}

self.addEventListener('push', function (event) {
  var data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = {}
  }
  if (!data || typeof data !== 'object') data = {}
  var title = typeof data.title === 'string' && data.title ? data.title : 'New ride offer'
  var body = typeof data.body === 'string' && data.body ? data.body : 'You have a new ride offer.'
  var tag = typeof data.tag === 'string' && data.tag ? data.tag : 'offer'
  // A push must always show a notification (user-visible requirement, iOS drops silent subscriptions).
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      tag: tag,
      icon: '/driver/icons/icon-192.png',
      badge: '/driver/icons/badge-72.png',
      data: { url: safeUrl(data.url) },
    }),
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var notificationData = event.notification.data
  var url = safeUrl(notificationData && notificationData.url)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var client = list[i]
        if (client.url && client.url.indexOf('/driver/') !== -1 && 'focus' in client) {
          if ('navigate' in client) client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
