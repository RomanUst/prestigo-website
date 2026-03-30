import { describe, it } from 'vitest'

describe('/api/create-payment-intent', () => {
  describe('PAY-01: PaymentIntent created server-side with calculated amount', () => {
    it.todo('POST creates PaymentIntent with amount in hellers (CZK * 100)')
    it.todo('POST returns clientSecret and bookingReference in response')
    it.todo('bookingReference follows PRG-YYYYMMDD-NNNN format')
    it.todo('POST returns 500 on Stripe error')
  })

  describe('PAY-02: Stripe secret key never sent to client', () => {
    it.todo('response body does not contain STRIPE_SECRET_KEY value')
  })
})
