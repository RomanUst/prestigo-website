// Pure helper for the admin login "return to where you were going" parameter.
//
// Lives outside the `'use server'` login actions module (that file may only
// export async functions) and is shared by the middleware, the login action
// and tests.

const MAX_NEXT_LENGTH = 512

/**
 * Validates the `next` destination carried through /admin/login and returns it
 * unchanged, or null when it must not be followed (the caller then falls back
 * to /admin). Only same-origin admin paths are trusted:
 *  - a string that starts with "/admin" and then ends or continues with "/",
 *    "?" or "#" ("/administrator" is not an admin path);
 *  - no "//" anywhere (protocol-relative / double-slash tricks), no backslash
 *    (Chromium turns "/\evil.com" into "//evil.com"), no scheme;
 *  - no control characters or whitespace, no ".." segment;
 *  - never /admin/login itself (would loop).
 */
export function safeAdminNext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return null
  if (!/^\/admin(?:[/?#]|$)/.test(raw)) return null
  if (raw.includes('//') || raw.includes('\\')) return null
  for (const ch of raw) {
    const c = ch.charCodeAt(0)
    // control characters, space, DEL/C1 controls, line/paragraph separators
    if (c <= 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029) return null
  }
  if (/(^|[/?#])\.\.($|[/?#])/.test(raw)) return null
  // The path part must stay on this origin and inside /admin once parsed.
  let parsed: URL
  try {
    parsed = new URL(raw, 'http://admin.invalid')
  } catch {
    return null
  }
  if (parsed.origin !== 'http://admin.invalid') return null
  if (parsed.pathname !== '/admin' && !parsed.pathname.startsWith('/admin/')) return null
  if (parsed.pathname === '/admin/login' || parsed.pathname.startsWith('/admin/login/')) return null
  return raw
}
