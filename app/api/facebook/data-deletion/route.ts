import { NextRequest, NextResponse } from 'next/server'
import { createHmac, createHash } from 'crypto'

const APP_SECRET = process.env.META_APP_SECRET

/**
 * POST /api/facebook/data-deletion
 *
 * Meta GDPR data deletion callback.
 * Meta sends a signed_request when a user requests deletion of their data
 * linked to the Facebook app (pixel / Login).
 *
 * Spec: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 *
 * Public endpoint — no admin auth. Returns 200 on all errors to avoid
 * Meta retrying indefinitely.
 */
export async function POST(request: NextRequest) {
  // Parse application/x-www-form-urlencoded body
  let signedRequest: string | null = null
  try {
    const text = await request.text()
    const params = new URLSearchParams(text)
    signedRequest = params.get('signed_request')
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!signedRequest) {
    return NextResponse.json({ error: 'signed_request missing' }, { status: 400 })
  }

  // Decode: "<signature>.<payload>" — both base64url-encoded
  const parts = signedRequest.split('.')
  if (parts.length !== 2) {
    return NextResponse.json({ error: 'Malformed signed_request' }, { status: 400 })
  }
  const [encodedSig, encodedPayload] = parts

  // Verify HMAC-SHA256 signature if APP_SECRET is configured
  if (APP_SECRET) {
    const expectedSig = createHmac('sha256', APP_SECRET)
      .update(encodedPayload)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    if (encodedSig !== expectedSig) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    }
  }

  // Decode payload
  let payload: { user_id?: string; algorithm?: string; issued_at?: number }
  try {
    const json = Buffer.from(encodedPayload, 'base64url').toString('utf8')
    payload = JSON.parse(json)
  } catch {
    return NextResponse.json({ error: 'Cannot decode payload' }, { status: 400 })
  }

  const userId = payload.user_id ?? 'unknown'

  // Generate a deterministic confirmation code from userId + date
  const confirmationCode = createHash('sha256')
    .update(`${userId}:${new Date().toISOString().slice(0, 10)}`)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase()

  const statusUrl = `https://rideprestigo.com/data-deletion?code=${confirmationCode}`

  // We do not store Facebook user_ids — pixel data is ephemeral.
  // The confirmation URL confirms to the user that the request was received.
  return NextResponse.json({ url: statusUrl, confirmation_code: confirmationCode })
}
