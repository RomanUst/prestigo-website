import { NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Guard against oversized JSON bodies BEFORE parsing.
 *
 * Next.js App Router does not enforce a body size limit on `req.json()`.
 * On Vercel the platform caps request bodies at 4.5 MB by default, but on
 * self-hosted Node that ceiling is gone. An attacker could POST a 50 MB
 * blob and force the server to buffer + parse it, wasting memory and CPU.
 *
 * This helper inspects the `content-length` header and returns a 413 if
 * the declared size exceeds `maxBytes`. Chunked requests without a
 * content-length header fall through (rare for JSON clients, and those
 * hit platform limits anyway).
 *
 * Usage:
 *   const tooBig = enforceMaxBody(req, 50_000)
 *   if (tooBig) return tooBig
 *   const body = await req.json()
 */
export function enforceMaxBody(req: Request, maxBytes: number): NextResponse | null {
  const raw = req.headers.get('content-length')
  if (!raw) return null
  const len = Number(raw)
  if (!Number.isFinite(len) || len < 0) return null
  if (len > maxBytes) {
    return NextResponse.json(
      { error: 'Payload too large' },
      { status: 413, headers: { 'X-Max-Body-Bytes': String(maxBytes) } }
    )
  }
  return null
}

/**
 * Reusable Zod refinement: reject CR/LF characters inside a string field.
 *
 * Prevents SMTP / HTTP header injection when user-supplied strings end up
 * in mail subjects, reply-to headers, or other header-like contexts. Zod's
 * `.string().email()` and `.max(n)` do not block embedded \r\n, so an
 * address like "victim@example.com\r\nBcc: attacker@evil.com" passes
 * their regex even though it's a header-injection payload.
 *
 * Apply via `.and(noLineBreaks())` OR inline:
 *   z.string().email().max(200).regex(NO_LINE_BREAKS, 'Invalid format')
 */
export const NO_LINE_BREAKS = /^[^\r\n]*$/

/** Helper: safe single-line string with max length. */
export function safeString(maxLen: number): z.ZodString {
  return z.string().max(maxLen).regex(NO_LINE_BREAKS, 'Invalid format')
}

/** Helper: safe email with max length + no CRLF. */
export function safeEmail(maxLen = 200): z.ZodString {
  return z.string().email().max(maxLen).regex(NO_LINE_BREAKS, 'Invalid format')
}
