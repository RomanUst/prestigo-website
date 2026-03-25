import { describe, it } from 'vitest'

describe('/api/calculate-price route', () => {
  describe('PRICE-01: API route proxies Google Routes API', () => {
    it.todo('POST returns prices for transfer with valid origin/destination')
    it.todo('POST returns quoteMode: true when origin is missing')
    it.todo('POST returns quoteMode: true when Google API key is missing')
    it.todo('POST returns quoteMode: true when Google API returns error')
  })

  describe('PRICE-03: Hourly pricing via API', () => {
    it.todo('POST returns prices for hourly trip type without calling Google Routes')
    it.todo('POST uses hours from request body')
  })

  describe('PRICE-04: Daily pricing via API', () => {
    it.todo('POST returns prices for daily trip type with pickupDate and returnDate')
    it.todo('POST returns quoteMode: true when dates are missing for daily')
  })

  describe('PRICE-06: API key not exposed', () => {
    it.todo('response body does not contain API key')
    it.todo('API key is sent via X-Goog-Api-Key header to Google (server-side)')
  })
})
