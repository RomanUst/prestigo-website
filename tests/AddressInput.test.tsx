import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, waitFor } from '@testing-library/react'
import type { AbstractIntlMessages } from 'next-intl'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import zhMessagesRaw from '@/messages/zh.json'
import arMessagesRaw from '@/messages/ar.json'

const zhMessages = zhMessagesRaw as unknown as AbstractIntlMessages
const arMessages = arMessagesRaw as unknown as AbstractIntlMessages

// Pattern F: this suite is still it.todo scaffolding — when these cases are
// implemented they must mount AddressInput (a next-intl consumer) via
// renderWithIntl, not the bare render, or useTranslations will throw.
void render

vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn().mockResolvedValue(undefined),
}))

import AddressInput from '@/components/booking/AddressInput'

const fetchAutocompleteSuggestionsMock = vi.fn().mockResolvedValue({ suggestions: [] })

function stubGoogleMapsPlacesLoaded() {
  ;(globalThis as { google?: unknown }).google = {
    maps: {
      places: {
        AutocompleteSessionToken: class {},
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: fetchAutocompleteSuggestionsMock,
        },
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchAutocompleteSuggestionsMock.mockResolvedValue({ suggestions: [] })
  stubGoogleMapsPlacesLoaded()
})

afterEach(() => {
  delete (globalThis as { google?: unknown }).google
})

const baseProps = {
  label: 'Origin',
  placeholder: 'Enter address',
  value: null,
  onSelect: vi.fn(),
  onClear: vi.fn(),
  ariaLabel: 'Origin address',
}

describe('D-07: legacy AddressInput Places `language` follows the site locale', () => {
  it('locale "zh" -> fetchAutocompleteSuggestions called with language "zh-CN"', async () => {
    const { getByRole } = render(<AddressInput {...baseProps} />, { locale: 'zh', messages: zhMessages })

    // Let the mount-effect's ensureMapsLoaded().then(...) microtask (setMapsLoaded(true)) flush.
    await act(async () => { await Promise.resolve() })

    const input = getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Prague' } })

    await waitFor(() => expect(fetchAutocompleteSuggestionsMock).toHaveBeenCalled())
    expect(fetchAutocompleteSuggestionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'zh-CN' })
    )
  })

  it('locale "ar" -> fetchAutocompleteSuggestions called with language "ar"', async () => {
    const { getByRole } = render(<AddressInput {...baseProps} />, { locale: 'ar', messages: arMessages })

    await act(async () => { await Promise.resolve() })

    const input = getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Prague' } })

    await waitFor(() => expect(fetchAutocompleteSuggestionsMock).toHaveBeenCalled())
    expect(fetchAutocompleteSuggestionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'ar' })
    )
  })

  it('locale "en" -> fetchAutocompleteSuggestions called with language "en"', async () => {
    const { getByRole } = render(<AddressInput {...baseProps} />, { locale: 'en' })

    await act(async () => { await Promise.resolve() })

    const input = getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Prague' } })

    await waitFor(() => expect(fetchAutocompleteSuggestionsMock).toHaveBeenCalled())
    expect(fetchAutocompleteSuggestionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en' })
    )
  })
})

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
