/**
 * Normalize a Meta Pixel ID read from an env var (WINDOWS #15 / GAP-2).
 *
 * A trailing newline in the production NEXT_PUBLIC_META_PIXEL_ID landed
 * inside the single-quoted fbq('init','…') argument of the inline Meta Pixel
 * script — a JS SyntaxError that silently disabled the pixel.
 *
 * Trims all surrounding whitespace (incl. CR/LF) and returns the value only
 * when it is digits-only (real Meta pixel IDs are numeric). Anything else —
 * empty, whitespace-only, non-numeric, embedded spaces/quotes — returns
 * undefined, so callers treat the pixel as not configured and never
 * interpolate an untrusted string into an inline script or outbound URL
 * (T-75-G06 / T-75-G07).
 */
export function normalizeMetaPixelId(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return /^\d+$/.test(trimmed) ? trimmed : undefined
}
