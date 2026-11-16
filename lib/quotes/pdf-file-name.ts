// The download name of a quote PDF (Phase 92, plan 92-27; QUOTE-07): Prestigo-quote-<reference>-v<n>.pdf.
// Shared by POST /api/quote/pdf (Content-Disposition) and the quote page (the name the browser saves the blob under).
// Only safe characters of the reference are kept, so the name can never break out of the header. Pure, client-safe.

export function quotePdfFileName(reference: string, versionNo: number): string {
  const safeReference = reference.replace(/[^A-Za-z0-9-]/g, '')
  return `Prestigo-quote-${safeReference}-v${Math.trunc(versionNo)}.pdf`
}
