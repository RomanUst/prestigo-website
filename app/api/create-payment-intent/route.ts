import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

function generateBookingReference(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = String(Math.floor(Math.random() * 9000) + 1000)
  return `PRG-${datePart}-${suffix}`
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { amountCZK, bookingData } = body as {
      amountCZK: number
      bookingData: Record<string, string>
    }

    if (!amountCZK || amountCZK <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const bookingReference = generateBookingReference()

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amountCZK * 100), // CZK to hellers
      currency: 'czk',
      automatic_payment_methods: { enabled: true },
      metadata: { bookingReference, ...bookingData },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      bookingReference,
    })
  } catch (error) {
    console.error('create-payment-intent error:', error)
    return NextResponse.json(
      { error: 'Failed to create payment intent' },
      { status: 500 }
    )
  }
}
