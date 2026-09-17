import { describe, it } from 'vitest'
import { renderWithIntl as render } from './helpers/renderWithIntl'

// Pattern F: this suite is still it.todo scaffolding — when these cases are
// implemented they must mount ProgressBar (a next-intl consumer) via
// renderWithIntl, not the bare render, or useTranslations will throw.
void render

describe('ProgressBar', () => {
  describe('WIZD-02: progress indicator', () => {
    it.todo('renders 6 circles')
    it.todo('active step circle has copper styling')
    it.todo('completed step shows check icon')
    it.todo('pending steps have anthracite styling')
    it.todo('has aria-label with current step')
    it.todo('active circle has aria-current="step"')
  })
})
