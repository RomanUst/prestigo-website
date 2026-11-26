// Phase 94 plan 94-02 (D-05, Pitfall 5, T-94-09, T-94-10): the "return to where you were going" parameter of the
// driver sign-in page. Client-safe on purpose (no imports): the sign-in form uses it too.

const MAX_NEXT_LENGTH = 512
const ALLOWED_PREFIXES = ['/driver/rides', '/driver/offers', '/driver/you'] as const

/**
 * Validates the `next` destination carried through /driver/login and returns it unchanged, or null when it must
 * not be followed (the caller then falls back to /driver/rides). Only the three cabinet tab areas are trusted:
 *  - pathname equals or continues with "/" after /driver/rides, /driver/offers or /driver/you;
 *  - no "//" anywhere, no backslash, no scheme, no control characters or whitespace, no ".." segment;
 *  - /driver/login, /driver/trip/* and /driver/response are never allowed (a trip token must not ride along in a
 *    sign-in URL or its Referer).
 */
export function safeDriverNext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return null
  if (!raw.startsWith('/driver/')) return null
  if (raw.includes('//') || raw.includes('\\')) return null
  for (const ch of raw) {
    const c = ch.charCodeAt(0)
    // control characters, space, DEL/C1 controls, line/paragraph separators
    if (c <= 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029) return null
  }
  if (/(^|[/?#])\.\.($|[/?#])/.test(raw)) return null
  let parsed: URL
  try {
    parsed = new URL(raw, 'http://driver.invalid')
  } catch {
    return null
  }
  if (parsed.origin !== 'http://driver.invalid') return null
  const path = parsed.pathname
  const allowed = ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
  if (!allowed) return null
  return raw
}
