import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'

// Phase 93 (plan 93-10; TRIP-05; D-08, D-24; UI-SPEC 7.3 C): content by language. The component is rendered on its own with
// a fetch mock for the translations and fill-zh-hant routes (93-07). Completeness shown by the tabs comes from the server
// answer; the stored row decides until a save happens.

import TourContentTabs from '@/components/admin/tours/TourContentTabs'
import type { AppLocale } from '@/i18n/locales'
import type { TourTranslationRow } from '@/lib/tours/types'

const ID = '11111111-1111-4111-8111-111111111111'

function row(locale: AppLocale, over: Partial<TourTranslationRow> = {}): TourTranslationRow {
  return {
    tour_id: ID,
    locale,
    title: 'Karlstejn Castle day trip',
    short_description: 'Castle and forest.',
    description: 'About.',
    pickup_info: 'Hotel lobby.',
    important_info: '',
    seo_title: 'Karlstejn',
    seo_description: 'Karlstejn from Prague.',
    highlights: ['Castle'],
    itinerary: [{ title: 'Pickup', body: 'At the hotel.' }],
    includes: ['Water'],
    excludes: ['Lunch'],
    faq: [{ q: 'Q', a: 'A' }],
    is_complete: true,
    updated_at: '2026-11-01T10:00:00.000Z',
    ...over,
  }
}

function slots(over: Partial<Record<AppLocale, TourTranslationRow | null>> = {}): Record<AppLocale, TourTranslationRow | null> {
  return { en: row('en'), ru: null, es: null, fr: null, ar: null, hi: null, zh: null, 'zh-hant': null, ...over }
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

let fetchMock: ReturnType<typeof vi.fn>
let putAnswer: (locale: string, body: Record<string, unknown>) => Promise<Response>
let fillAnswer: () => Promise<Response>
const onSaved = vi.fn()
const onDirty = vi.fn()

function puts() {
  return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
}

beforeEach(() => {
  onSaved.mockClear()
  onDirty.mockClear()
  putAnswer = (locale, body) =>
    json({ translation: { ...row(locale as AppLocale), ...body, is_complete: true }, complete: true, missing: [], leak: null })
  fillAnswer = () => json({ translation: row('zh-hant', { title: '繁體標題' }) })
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const m = /^\/api\/admin\/tours\/[^/]+\/translations\/([a-z-]+)$/.exec(url)
    if (m && init?.method === 'PUT') return putAnswer(m[1], JSON.parse(String(init.body)))
    if (url === `/api/admin/tours/${ID}/fill-zh-hant` && init?.method === 'POST') return fillAnswer()
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderTabs(translations = slots()) {
  return render(<TourContentTabs tourId={ID} translations={translations} onTranslationSaved={onSaved} onDirtyChange={onDirty} />)
}

function tab(name: string | RegExp) {
  return screen.getByRole('tab', { name })
}

function openTab(name: string | RegExp) {
  fireEvent.click(tab(name))
}

describe('TourContentTabs: tabs', () => {
  it('renders eight tabs with a completeness label from the data', () => {
    renderTabs(slots({ ru: row('ru', { title: 'Замок Карлштейн', short_description: 'Замок.', faq: [] }) }))
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['EN', 'RU', 'ES', 'FR', 'AR', 'HI', 'ZH', 'ZH-HANT'])
    expect(tab('English, complete')).toBeDefined()
    expect(tab('Russian, 1 field missing')).toBeDefined()
    expect(tab('Arabic, 11 fields missing')).toBeDefined()
    expect(tab('Traditional Chinese, 11 fields missing')).toBeDefined()
  })

  it('uses roving tabindex and arrow keys, Home and End', () => {
    renderTabs()
    const en = tab('English, complete')
    expect(en.getAttribute('tabindex')).toBe('0')
    expect(en.getAttribute('aria-selected')).toBe('true')
    expect(tab(/^Russian/).getAttribute('tabindex')).toBe('-1')

    fireEvent.keyDown(en, { key: 'ArrowRight' })
    expect(tab(/^Russian/).getAttribute('aria-selected')).toBe('true')
    expect(tab(/^Russian/).getAttribute('tabindex')).toBe('0')
    expect(en.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(tab(/^Russian/))

    fireEvent.keyDown(tab(/^Russian/), { key: 'ArrowLeft' })
    expect(tab('English, complete').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tab('English, complete'), { key: 'End' })
    expect(tab(/^Traditional Chinese/).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tab(/^Traditional Chinese/), { key: 'Home' })
    expect(tab('English, complete').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tab('English, complete'), { key: 'ArrowLeft' })
    expect(tab(/^Traditional Chinese/).getAttribute('aria-selected')).toBe('true')
  })

  it('links the selected tab to the tab panel', () => {
    renderTabs()
    const panel = screen.getByRole('tabpanel')
    expect(panel.id).toBe(tab('English, complete').getAttribute('aria-controls'))
    expect(panel.getAttribute('aria-labelledby')).toBe(tab('English, complete').id)
  })

  it('the AR panel inputs carry dir=rtl and lang=ar, the HI panel lang=hi, EN stays ltr', () => {
    renderTabs()
    expect(screen.getByLabelText('Title').getAttribute('dir')).toBe('ltr')
    expect(screen.getByLabelText('Title').getAttribute('lang')).toBe('en')

    openTab(/^Arabic/)
    for (const label of ['Title', 'Short description', 'About this trip', 'Pickup', 'SEO title']) {
      const el = screen.getByLabelText(label)
      expect(el.getAttribute('dir')).toBe('rtl')
      expect(el.getAttribute('lang')).toBe('ar')
    }
    openTab(/^Hindi/)
    expect(screen.getByLabelText('Title').getAttribute('lang')).toBe('hi')
    expect(screen.getByLabelText('Title').getAttribute('dir')).toBe('ltr')
    openTab(/^Simplified Chinese/)
    expect(screen.getByLabelText('Title').getAttribute('lang')).toBe('zh-Hans')
    openTab(/^Traditional Chinese/)
    expect(screen.getByLabelText('Title').getAttribute('lang')).toBe('zh-Hant')
  })

  it('shows the twelve fields with their counters and helpers', () => {
    renderTabs()
    for (const label of ['Title', 'Short description', 'About this trip', 'Pickup', 'Important information', 'SEO title', 'SEO description']) {
      expect(screen.getByLabelText(label)).toBeDefined()
    }
    for (const group of ['Highlights', 'Itinerary', "What's included", 'Not included', 'Questions and answers']) {
      expect(screen.getByRole('group', { name: group })).toBeDefined()
    }
    expect(screen.getByText('25 characters, aim for 60.')).toBeDefined()
    expect(screen.getAllByText(/aim for 160\./).length).toBe(1)
    expect(screen.getAllByText(/aim for 200\./).length).toBe(1)
    expect(screen.getAllByText('A blank line starts a new paragraph.').length).toBe(1)
  })

  it('shows the warn banner for a language that is not complete', () => {
    renderTabs()
    openTab(/^Russian/)
    expect(screen.getByText('Russian is not on the site yet. Fill every required field to publish it.')).toBeDefined()
  })
})

describe('TourContentTabs: list editors', () => {
  it('adds, moves and deletes rows with row-specific aria-labels', () => {
    renderTabs(slots({ en: row('en', { highlights: ['One', 'Two'] }) }))
    const group = screen.getByRole('group', { name: 'Highlights' })
    const one = within(group).getByLabelText('Highlight 1') as HTMLInputElement
    expect(one.value).toBe('One')
    expect((within(group).getByRole('button', { name: 'Move highlight 1 up' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(group).getByRole('button', { name: 'Move highlight 2 down' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(within(group).getByRole('button', { name: 'Add highlight' }))
    expect(within(group).getByLabelText('Highlight 3')).toBeDefined()
    fireEvent.change(within(group).getByLabelText('Highlight 3'), { target: { value: 'Three' } })

    fireEvent.click(within(group).getByRole('button', { name: 'Move highlight 3 up' }))
    expect((within(group).getByLabelText('Highlight 2') as HTMLInputElement).value).toBe('Three')
    expect((within(group).getByLabelText('Highlight 3') as HTMLInputElement).value).toBe('Two')

    fireEvent.click(within(group).getByRole('button', { name: 'Move highlight 1 down' }))
    expect((within(group).getByLabelText('Highlight 1') as HTMLInputElement).value).toBe('Three')

    fireEvent.click(within(group).getByRole('button', { name: 'Delete highlight 1' }))
    expect(within(group).queryByLabelText('Highlight 3')).toBeNull()
    expect((within(group).getByLabelText('Highlight 1') as HTMLInputElement).value).toBe('One')
  })

  it('itinerary rows have a title and a text, FAQ rows a question and an answer', () => {
    renderTabs()
    const itinerary = screen.getByRole('group', { name: 'Itinerary' })
    expect((within(itinerary).getByLabelText('Step 1 title') as HTMLInputElement).value).toBe('Pickup')
    expect((within(itinerary).getByLabelText('Step 1 text') as HTMLTextAreaElement).value).toBe('At the hotel.')
    expect(within(itinerary).getByRole('button', { name: 'Add step' })).toBeDefined()

    const faq = screen.getByRole('group', { name: 'Questions and answers' })
    expect((within(faq).getByLabelText('Question 1') as HTMLInputElement).value).toBe('Q')
    expect((within(faq).getByLabelText('Question 1 answer') as HTMLTextAreaElement).value).toBe('A')
    expect(within(faq).getByRole('button', { name: 'Add question' })).toBeDefined()
    expect(within(faq).getByRole('button', { name: 'Delete question 1' })).toBeDefined()
  })

  it('what is included and not included have their own add item buttons', () => {
    renderTabs()
    const included = screen.getByRole('group', { name: "What's included" })
    const excluded = screen.getByRole('group', { name: 'Not included' })
    expect(within(included).getByRole('button', { name: 'Add item' })).toBeDefined()
    expect(within(excluded).getByLabelText('Not included item 1')).toBeDefined()
  })
})

describe('TourContentTabs: save', () => {
  it('Save RU PUTs the RU fields and shows the complete state from the answer', async () => {
    renderTabs()
    openTab(/^Russian/)
    const save = screen.getByRole('button', { name: 'Save RU' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Замок Карлштейн' } })
    expect(screen.getByText('Unsaved changes')).toBeDefined()
    expect(onDirty).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save RU' }))

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0][0]).toBe(`/api/admin/tours/${ID}/translations/ru`)
    const body = JSON.parse(String((puts()[0][1] as RequestInit).body))
    expect(body.title).toBe('Замок Карлштейн')
    expect(Object.keys(body).sort()).toEqual(
      [
        'description',
        'excludes',
        'faq',
        'highlights',
        'important_info',
        'includes',
        'itinerary',
        'pickup_info',
        'seo_description',
        'seo_title',
        'short_description',
        'title',
      ].sort(),
    )
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved.mock.calls[0][0]).toBe('ru')
    await waitFor(() => expect(tab('Russian, complete')).toBeDefined())
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    expect(onDirty).toHaveBeenLastCalledWith(false)
  })

  it('an incomplete answer shows the helper under FAQ and the warn banner', async () => {
    putAnswer = (locale, body) =>
      json({ translation: { ...row(locale as AppLocale), ...body, faq: [], is_complete: false }, complete: false, missing: ['faq'], leak: null })
    renderTabs()
    openTab(/^Russian/)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Замок' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save RU' }))

    const faq = await screen.findByRole('group', { name: 'Questions and answers' })
    await waitFor(() => expect(within(faq).getByText('Required to publish this language.')).toBeDefined())
    expect(screen.getByText('Russian is not on the site yet. Fill every required field to publish it.')).toBeDefined()
    expect(tab('Russian, 1 field missing')).toBeDefined()
  })

  it('a script leak shows the script message', async () => {
    putAnswer = (locale, body) =>
      json({ translation: { ...row(locale as AppLocale), ...body, is_complete: false }, complete: false, missing: [], leak: 'script' })
    renderTabs()
    openTab(/^Russian/)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Castle' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save RU' }))
    expect(
      await screen.findByText('This text is not in Cyrillic script. Translate it before this language can go live.'),
    ).toBeDefined()
  })

  it('an english leak shows the English message', async () => {
    putAnswer = (locale, body) =>
      json({ translation: { ...row(locale as AppLocale), ...body, is_complete: false }, complete: false, missing: [], leak: 'english' })
    renderTabs()
    openTab(/^Spanish/)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Karlstejn Castle day trip' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save ES' }))
    expect(await screen.findByText('This text looks like English. Translate it before this language can go live.')).toBeDefined()
  })

  it('a failed save keeps the text and shows the error', async () => {
    putAnswer = () => json({ error: 'x' }, 500)
    renderTabs()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Changed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save EN' }))
    expect(await screen.findByText('Could not save. Nothing was changed. Try again.')).toBeDefined()
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Changed')
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('TourContentTabs: switching with unsaved changes', () => {
  it('asks to save or discard; Discard changes switches and drops the edit', () => {
    renderTabs()
    openTab(/^Russian/)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Замок' } })
    openTab('English, complete')

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('You have unsaved changes in Russian.')).toBeDefined()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(tab('English, complete').getAttribute('aria-selected')).toBe('true')
    openTab(/^Russian/)
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('')
    expect(puts()).toHaveLength(0)
  })

  it('Save and switch saves the current language, then switches', async () => {
    renderTabs()
    openTab(/^Russian/)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Замок' } })
    openTab('English, complete')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save and switch' }))

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0][0]).toBe(`/api/admin/tours/${ID}/translations/ru`)
    await waitFor(() => expect(tab('English, complete').getAttribute('aria-selected')).toBe('true'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Save and switch stays on the tab when the save fails', async () => {
    putAnswer = () => json({ error: 'x' }, 500)
    renderTabs()
    openTab(/^Russian/)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Замок' } })
    openTab('English, complete')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save and switch' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(tab(/^Russian/).getAttribute('aria-selected')).toBe('true')
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Замок')
  })

  it('Escape closes the dialog and stays on the tab with the text kept', () => {
    renderTabs()
    openTab(/^Russian/)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Замок' } })
    openTab('English, complete')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(tab(/^Russian/).getAttribute('aria-selected')).toBe('true')
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Замок')
  })
})

describe('TourContentTabs: fill zh-Hant from zh', () => {
  const zhComplete = row('zh', { title: '卡尔施泰因城堡一日游', short_description: '城堡和森林。' })

  it('is disabled with the note while ZH is incomplete', () => {
    renderTabs()
    openTab(/^Traditional Chinese/)
    const button = screen.getByRole('button', { name: /Fill from Simplified Chinese/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText('Save the ZH tab first.')).toBeDefined()
  })

  it('is not offered on other tabs', () => {
    renderTabs(slots({ zh: zhComplete }))
    expect(screen.queryByRole('button', { name: /Fill from Simplified Chinese/ })).toBeNull()
  })

  it('confirms, POSTs fill-zh-hant and shows the converted text', async () => {
    const view = renderTabs(slots({ zh: zhComplete }))
    openTab(/^Traditional Chinese/)
    const button = screen.getByRole('button', { name: /Fill from Simplified Chinese/ }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    expect(screen.queryByText('Save the ZH tab first.')).toBeNull()
    fireEvent.click(button)

    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByText(
        'Replace the Traditional Chinese text with a conversion of the Simplified Chinese text? Your edits in this tab will be lost.',
      ),
    ).toBeDefined()
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Keep my text' })))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace text' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved.mock.calls[0][0]).toBe('zh-hant')
    // the parent hands the saved row back; the panel shows the converted text
    view.rerender(
      <TourContentTabs
        tourId={ID}
        translations={slots({ zh: zhComplete, 'zh-hant': onSaved.mock.calls[0][1] })}
        onTranslationSaved={onSaved}
        onDirtyChange={onDirty}
      />,
    )
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('繁體標題')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Keep my text closes the dialog without a request', () => {
    renderTabs(slots({ zh: zhComplete }))
    openTab(/^Traditional Chinese/)
    fireEvent.click(screen.getByRole('button', { name: /Fill from Simplified Chinese/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep my text' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the ZH tab note when the server answers ZH_INCOMPLETE', async () => {
    fillAnswer = () => json({ error: 'x', code: 'ZH_INCOMPLETE' }, 409)
    renderTabs(slots({ zh: zhComplete }))
    openTab(/^Traditional Chinese/)
    fireEvent.click(screen.getByRole('button', { name: /Fill from Simplified Chinese/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Replace text' }))
    expect(await within(screen.getByRole('dialog')).findByText('Save the ZH tab first.')).toBeDefined()
    expect(onSaved).not.toHaveBeenCalled()
  })
})
