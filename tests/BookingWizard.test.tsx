import { describe, it } from 'vitest'

describe('BookingWizard', () => {
  describe('WIZD-01: wizard renders on /book', () => {
    it.todo('renders BookingWizard with ProgressBar')
    it.todo('renders step content for currentStep')
  })

  describe('WIZD-04: Back navigation', () => {
    it.todo('Back button hidden on step 1')
    it.todo('Back button visible on step 2+')
    it.todo('clicking Back decrements currentStep')
  })

  describe('WIZD-05: step transitions', () => {
    it.todo('step container has animate-step-enter class')
    it.todo('step container uses key={currentStep} for remount')
  })
})
