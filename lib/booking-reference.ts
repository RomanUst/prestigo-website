export function generateBookingReference(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = String(Math.floor(Math.random() * 9000) + 1000)
  return `PRG-${datePart}-${suffix}`
}
