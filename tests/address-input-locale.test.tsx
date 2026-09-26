import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AbstractIntlMessages } from 'next-intl'
import { renderWithIntl } from './helpers/renderWithIntl'
import AddressInputNew from '@/components/booking/AddressInputNew'
import enMessages from '@/messages/en.json'
import zhMessages from '@/messages/zh.json'
import arMessages from '@/messages/ar.json'

const { usePlacesAutocompleteMock } = vi.hoisted(() => ({
  usePlacesAutocompleteMock: vi.fn(),
}))

vi.mock('places-autocomplete-hook', () => ({
  usePlacesAutocomplete: usePlacesAutocompleteMock,
}))

function defaultHookReturn() {
  return {
    value: '',
    suggestions: { status: 'ZERO_RESULTS', data: [] },
    setValue: vi.fn(),
    clearSuggestions: vi.fn(),
    getPlaceDetails: vi.fn(),
    error: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  usePlacesAutocompleteMock.mockReturnValue(defaultHookReturn())
})

describe('D-07: AddressInputNew Places `language` follows the site locale', () => {
  const baseProps = {
    label: 'Origin',
    placeholder: 'Enter address',
    value: null,
    onSelect: vi.fn(),
    onClear: vi.fn(),
    ariaLabel: 'Origin address',
  }

  it('locale "zh" -> usePlacesAutocomplete called with language "zh-CN"', () => {
    renderWithIntl(<AddressInputNew {...baseProps} />, {
      locale: 'zh',
      messages: zhMessages as unknown as AbstractIntlMessages,
    })
    expect(usePlacesAutocompleteMock).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'zh-CN' })
    )
  })

  it('locale "ar" -> usePlacesAutocomplete called with language "ar"', () => {
    renderWithIntl(<AddressInputNew {...baseProps} />, {
      locale: 'ar',
      messages: arMessages as unknown as AbstractIntlMessages,
    })
    expect(usePlacesAutocompleteMock).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'ar' })
    )
  })

  it('locale "en" -> usePlacesAutocomplete called with language "en"', () => {
    renderWithIntl(<AddressInputNew {...baseProps} />, {
      locale: 'en',
      messages: enMessages as unknown as AbstractIntlMessages,
    })
    expect(usePlacesAutocompleteMock).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en' })
    )
  })
})
