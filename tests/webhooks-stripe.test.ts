import { describe, it } from 'vitest'

describe('/api/webhooks/stripe', () => {
  describe('PAY-03: Webhook handles payment_intent.succeeded', () => {
    it.todo('POST verifies stripe-signature header via constructEvent')
    it.todo('POST returns 400 on invalid signature')
    it.todo('POST processes payment_intent.succeeded event')
    it.todo('POST returns { received: true } on valid event')
  })

  describe('PAY-04: Booking saved only after webhook confirmation', () => {
    it.todo('handler includes hook point for Phase 5 Notion save')
    it.todo('handler logs paymentIntent metadata including bookingReference')
  })
})
