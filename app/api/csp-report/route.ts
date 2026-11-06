import { NextResponse } from 'next/server'
import { redactCspReport } from '@/lib/csp-report-redact'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const report = body?.['csp-report'] ?? body
    // The report carries the full page URL; /manage/ and /driver/trip/ links are secrets (Phase 89 WR-02).
    console.warn('[CSP violation]', JSON.stringify(redactCspReport(report)))
  } catch {
    // Malformed report — ignore
  }
  return new NextResponse(null, { status: 204 })
}
