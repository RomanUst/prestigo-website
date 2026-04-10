import { describe, it } from 'vitest'

describe('Step6Payment', () => {
  describe('STEP6-01: Full booking summary shown before card input', () => {
    it.todo('renders route origin and destination from store')
    it.todo('renders pickup date and time from store')
    it.todo('renders vehicle class and passenger count from store')
    it.todo('renders extras list with prices when extras are selected')
    it.todo('renders total in CZK with EUR equivalent')
  })

  describe('STEP6-02: Stripe Payment Element rendered', () => {
    it.todo('renders PaymentElement component')
    it.todo('renders SECURE PAYMENT label above payment element')
  })

  describe('STEP6-03: Pay button creates PaymentIntent and confirms payment', () => {
    it.todo('calls /api/create-payment-intent on mount')
    it.todo('calls stripe.confirmPayment on Pay button click')
  })

  describe('STEP6-04: Pay button disabled immediately on click', () => {
    it.todo('Pay button is disabled while processing')
    it.todo('Pay button has aria-disabled=true while processing')
    it.todo('Pay button has opacity 0.4 while processing')
  })

  describe('STEP6-05: Payment error displayed inline with retry', () => {
    it.todo('shows error message below Payment Element on confirmPayment error')
    it.todo('re-enables Pay button after error')
    it.todo('booking data in store is not cleared on error')
  })

  describe('STEP6-06: Redirect to /book/confirmation on success', () => {
    it.todo('confirmPayment is called with return_url containing /book/confirmation')
  })

  describe('STEP6-RT: Round-trip Step 6 support', () => {
    it.todo('STEP6-RT-COMBINED-TOTAL: totalEur equals outbound + return when tripType=round_trip')
    it.todo('STEP6-RT-RETURNTIME-IN-BODY: fetch body contains returnTime for round_trip')
    it.todo('STEP6-RT-DISCOUNT-COMBINED: discountedTotalEur applies promo to combined total, not just outbound')
    it.todo('STEP6-RT-PROMO-PERSIST: promoCode survives a store rehydrate (partialize)')
  })
})
