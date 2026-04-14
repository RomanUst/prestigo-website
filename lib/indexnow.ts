/**
 * IndexNow — real-time indexing notifications to Bing and Yandex.
 *
 * Protocol: host the key file at /{key}.txt, then POST the list of
 * updated URLs after each deployment. Bing forwards to other IndexNow
 * participants (Yandex, Naver, Seznam.cz, etc.) automatically.
 *
 * Key file: /public/a3f8e2d1c9b765432fedcba987654321.txt
 * Key file URL: https://rideprestigo.com/a3f8e2d1c9b765432fedcba987654321.txt
 */

const INDEXNOW_KEY = 'a3f8e2d1c9b765432fedcba987654321'
const HOST = 'rideprestigo.com'
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow'

export interface IndexNowResult {
  ok: boolean
  status?: number
  error?: string
}

/**
 * Submit a batch of URLs to IndexNow.
 * Call this after any content update or new deployment.
 *
 * @param urls - Absolute URLs to notify. Max 10,000 per call.
 */
export async function submitToIndexNow(urls: string[]): Promise<IndexNowResult> {
  if (urls.length === 0) return { ok: true }

  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: INDEXNOW_KEY,
        keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    })

    // 200 = accepted, 202 = queued — both mean success
    const ok = res.status === 200 || res.status === 202
    return { ok, status: res.status }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
