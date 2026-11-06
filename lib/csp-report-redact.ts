// Redaction of CSP violation reports before they are logged (Phase 89 review WR-02).
//
// /manage/<token> and /driver/trip/<token> are bearer links: whoever holds the path can cancel the booking or drive the
// trip. A browser puts the full page URL into a violation report (document-uri, referrer, blocked-uri, source-file, and
// the Reporting API's documentURL / blockedURL), so the report must never reach the logs as it came in. Every string in
// the report is cleaned, at any depth, so a field this code does not know about is covered too.

const SECRET_PATH_RE = /\/(manage|driver\/trip)\/[^/?#\s"'<>]+/gi

/** The string with the secret segment of a manage or driver-trip path replaced by a marker. */
export function redactSecretPaths(value: string): string {
  return value.replace(SECRET_PATH_RE, '/$1/[redacted]')
}

/** A deep copy of the report with every string cleaned of secret path segments. */
export function redactCspReport(report: unknown, depth = 0): unknown {
  if (typeof report === 'string') return redactSecretPaths(report)
  if (depth > 6 || report === null || typeof report !== 'object') return report
  if (Array.isArray(report)) return report.map((v) => redactCspReport(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(report as Record<string, unknown>)) out[key] = redactCspReport(v, depth + 1)
  return out
}
