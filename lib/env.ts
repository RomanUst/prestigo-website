/**
 * Read and sanitize an environment variable.
 *
 * Strips trailing literal "\n" (backslash + n), real newlines, and surrounding
 * whitespace. Defends against Vercel env values that were saved with an
 * escape-style "\n" suffix at the end (a recurring data-entry mistake).
 */
export function readEnv(name: string): string | undefined {
  const raw = process.env[name]
  if (raw === undefined) return undefined
  const cleaned = raw.replace(/\\n$/, '').trim()
  return cleaned.length > 0 ? cleaned : undefined
}
