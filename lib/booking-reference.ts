import { randomBytes } from 'crypto'

export function generateBookingReference(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = randomBytes(3).toString('hex').toUpperCase() // 16^6 = 16.7M combinations
  return `PRG-${datePart}-${suffix}`
}
