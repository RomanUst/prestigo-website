import { describe, it } from 'vitest'

describe('AddressInput', () => {
  describe('STEP1-02: Google Places Autocomplete', () => {
    it.todo('renders input with aria-autocomplete="list"')
    it.todo('shows suggestions after 2+ characters typed')
    it.todo('selecting a suggestion calls onSelect with PlaceResult')
    it.todo('clear button calls onClear')
  })

  describe('STEP1-03: airport read-only mode', () => {
    it.todo('renders read-only div when readOnly=true')
    it.todo('shows plane icon when readOnlyIcon=true')
    it.todo('displays "Auto-set for airport transfers." helper text')
    it.todo('no clear button in read-only mode')
  })
})
