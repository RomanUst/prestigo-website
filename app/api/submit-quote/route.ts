import { NextResponse } from 'next/server'

function generateQuoteReference(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = String(Math.floor(Math.random() * 9000) + 1000)
  return `QR-${datePart}-${suffix}`
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const quoteReference = generateQuoteReference()

    // Phase 5 will add: Notion save + manager alert email
    // Phase 4 stub: log the quote data
    console.log('Quote submitted:', { quoteReference, ...body })

    return NextResponse.json({ quoteReference })
  } catch (error) {
    console.error('submit-quote error:', error)
    return NextResponse.json(
      { error: 'Failed to submit quote' },
      { status: 500 }
    )
  }
}
