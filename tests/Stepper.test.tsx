import { describe, it } from 'vitest'
import { renderWithIntl as render } from './helpers/renderWithIntl'

// Pattern F: this suite is still it.todo scaffolding — when these cases are
// implemented they must mount Stepper (a next-intl consumer) via
// renderWithIntl, not the bare render, or useTranslations will throw.
void render

describe('Stepper', () => {
  describe('STEP1-05: passengers stepper', () => {
    it.todo('renders label, minus button, count, plus button')
    it.todo('clicking plus increments value')
    it.todo('clicking minus decrements value')
    it.todo('minus disabled at min value')
    it.todo('plus disabled at max value')
  })

  describe('STEP1-06: luggage stepper', () => {
    it.todo('luggage starts at 0')
    it.todo('luggage cannot go below 0')
    it.todo('luggage cannot exceed 8')
  })
})
