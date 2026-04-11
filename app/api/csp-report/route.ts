import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const report = body?.['csp-report'] ?? body
    console.warn('[CSP violation]', JSON.stringify(report))
  } catch {
    // Malformed report — ignore
  }
  return new NextResponse(null, { status: 204 })
}
