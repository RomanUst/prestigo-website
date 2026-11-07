// Phase 88 plan 06 (D-01, D-04, PAYF-05, UI-SPEC Surface 3): the "Card on file" card on the Settings page.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import fs from 'fs'
import path from 'path'
import CardFlowSettings from '@/components/admin/CardFlowSettings'

function stubFetch(ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: () => Promise.resolve({}) })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, call = 0) =>
  JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string)

const leadInput = () => screen.getByLabelText('Hold lead time (hours)') as HTMLInputElement
const emailsInput = () => screen.getByLabelText('Test emails') as HTMLTextAreaElement
const radios = () => screen.getAllByRole('radio') as HTMLButtonElement[]

async function blurWith(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    fireEvent.change(el, { target: { value } })
    fireEvent.blur(el)
    await vi.advanceTimersByTimeAsync(0)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('CardFlowSettings: copy and structure', () => {
  it('renders the heading, helper line and the three controls from the props', () => {
    stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={48} initialEmails={['a@x.com', 'b@y.org']} />)
    expect(screen.getByText('Card on file')).toBeDefined()
    expect(
      screen.getByText(
        'Clients save a card at checkout and pay after the trip. Turning this off only affects new bookings. Card bookings already made are still held and charged.',
      ),
    ).toBeDefined()
    expect(leadInput().value).toBe('48')
    expect(leadInput().type).toBe('number')
    expect(emailsInput().value).toBe('a@x.com\nb@y.org')
    expect(emailsInput().getAttribute('spellcheck')).toBe('false')
    expect(emailsInput().getAttribute('autocomplete')).toBe('off')
    expect(emailsInput().rows).toBe(4)
  })

  it('shows the field helpers verbatim', () => {
    stubFetch()
    render(<CardFlowSettings initialMode="off" initialLeadHours={72} initialEmails={[]} />)
    expect(
      screen.getByText(
        'Owner test only shows card payment and cash guarantee at checkout to the emails listed below. All clients opens it to everyone booking a one-way transfer or an hourly ride.',
      ),
    ).toBeDefined()
    expect(
      screen.getByText('How long before pickup the card is held. Pickups closer than this are held at checkout.'),
    ).toBeDefined()
    expect(
      screen.getByText('Only these emails see card payment while the mode is Owner test only. Capitals and spaces are ignored.'),
    ).toBeDefined()
  })

  it('falls back to off, 72 and an empty list when the props are missing', () => {
    stubFetch()
    render(<CardFlowSettings />)
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    expect(leadInput().value).toBe('72')
    expect(emailsInput().value).toBe('')
    expect(screen.queryByText('The list is empty, so nobody will see card payment.')).toBeNull()
  })

  it('falls back for out-of-range or malformed initial values', () => {
    stubFetch()
    render(<CardFlowSettings initialMode={'bogus' as unknown as 'off'} initialLeadHours={500} initialEmails={null} />)
    expect(radios()[0].getAttribute('aria-checked')).toBe('true')
    expect(leadInput().value).toBe('72')
  })
})

describe('CardFlowSettings: mode radiogroup', () => {
  it("renders a radiogroup with three radios in order: 'Off', 'Owner test only', 'All clients'", () => {
    stubFetch()
    render(<CardFlowSettings initialMode="off" initialLeadHours={72} initialEmails={[]} />)
    const group = screen.getByRole('radiogroup')
    expect(group.getAttribute('aria-labelledby')).toBe('card-flow-mode-label')
    expect(document.getElementById('card-flow-mode-label')?.textContent).toBe('Card payment')
    expect(radios().map((r) => r.textContent)).toEqual(['Off', 'Owner test only', 'All clients'])
  })

  it('uses a roving tabindex: only the selected tile is in the tab order', () => {
    stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['a@x.com']} />)
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, 0, -1])
  })

  it('clicking Owner test only PATCHes { card_flow_mode: canary } once', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="off" initialLeadHours={72} initialEmails={[]} />)
    await act(async () => {
      fireEvent.click(radios()[1])
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/settings')
    expect((init as RequestInit).method).toBe('PATCH')
    expect(bodyOf(fetchMock)).toEqual({ card_flow_mode: 'canary' })
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(screen.getByText('Saved')).toBeDefined()
  })

  it('arrow keys move the selection (with wrap) and save once per change', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="off" initialLeadHours={72} initialEmails={['a@x.com']} />)
    await act(async () => {
      fireEvent.keyDown(radios()[0], { key: 'ArrowRight' })
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(bodyOf(fetchMock, 0)).toEqual({ card_flow_mode: 'canary' })
    expect(radios()[1].getAttribute('aria-checked')).toBe('true')

    await act(async () => {
      fireEvent.keyDown(radios()[1], { key: 'ArrowLeft' }) // back to Off
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(bodyOf(fetchMock, 1)).toEqual({ card_flow_mode: 'off' })
    expect(radios()[0].getAttribute('aria-checked')).toBe('true')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('selecting the current mode sends nothing', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="off" initialLeadHours={72} initialEmails={[]} />)
    await act(async () => {
      fireEvent.click(radios()[0])
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("a failed save reverts the selection and shows 'Failed to save — try again'", async () => {
    stubFetch(false)
    render(<CardFlowSettings initialMode="off" initialLeadHours={72} initialEmails={[]} />)
    await act(async () => {
      fireEvent.click(radios()[1])
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(radios()[0].getAttribute('aria-checked')).toBe('true')
    const msg = screen.getByText('Failed to save — try again')
    expect(msg.getAttribute('style') ?? '').toContain('var(--status-danger-fg)')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })
    expect(screen.queryByText('Failed to save — try again')).toBeNull()
  })

  it('the selected tile is marked by a dot as well as by colour', () => {
    stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['a@x.com']} />)
    expect(radios()[1].querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(radios()[0].querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('mode canary with an empty list shows the info line (role status); a non-empty list or Off hides it', async () => {
    stubFetch()
    const { unmount } = render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={[]} />)
    const info = screen.getByText('The list is empty, so nobody will see card payment.')
    expect(info.closest('[role="status"]')).not.toBeNull()
    unmount()

    const second = render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['a@x.com']} />)
    expect(screen.queryByText('The list is empty, so nobody will see card payment.')).toBeNull()
    second.unmount()

    render(<CardFlowSettings initialMode="off" initialLeadHours={72} initialEmails={[]} />)
    expect(screen.queryByText('The list is empty, so nobody will see card payment.')).toBeNull()
  })

  it('the info line is a warning, not a block: saving the mode still works', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="off" initialLeadHours={72} initialEmails={[]} />)
    await act(async () => {
      fireEvent.click(radios()[1])
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('The list is empty, so nobody will see card payment.')).toBeDefined()
  })
})

describe('CardFlowSettings: hold lead time', () => {
  it("'72' -> unchanged baseline sends nothing; '48' blur PATCHes only payment_hold_lead_hours", async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="off" initialLeadHours={72} initialEmails={[]} />)
    await blurWith(leadInput(), '72')
    expect(fetchMock).not.toHaveBeenCalled()
    await blurWith(leadInput(), '48')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodyOf(fetchMock)).toEqual({ payment_hold_lead_hours: 48 })
  })

  it('accepts the bounds 6 and 96', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="off" initialLeadHours={72} initialEmails={[]} />)
    await blurWith(leadInput(), '6')
    await blurWith(leadInput(), '96')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Enter a whole number from 6 to 96.')).toBeNull()
  })

  it.each(['5', '97', '7.5', '', '-6', '1e2', 'abc'])('rejects %j: inline error and no request', async (value) => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="off" initialLeadHours={72} initialEmails={[]} />)
    await blurWith(leadInput(), value)
    const msg = screen.getByText('Enter a whole number from 6 to 96.')
    expect(msg.getAttribute('role')).toBe('alert')
    expect(msg.getAttribute('style') ?? '').toContain('var(--status-danger-fg)')
    expect(leadInput().getAttribute('aria-invalid')).toBe('true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('the inline error clears when the operator edits the field again', async () => {
    stubFetch()
    render(<CardFlowSettings initialMode="off" initialLeadHours={72} initialEmails={[]} />)
    await blurWith(leadInput(), '5')
    expect(screen.getByText('Enter a whole number from 6 to 96.')).toBeDefined()
    await act(async () => {
      fireEvent.change(leadInput(), { target: { value: '50' } })
    })
    expect(screen.queryByText('Enter a whole number from 6 to 96.')).toBeNull()
  })

  it('a failed save reverts the input to the last saved value', async () => {
    stubFetch(false)
    render(<CardFlowSettings initialMode="off" initialLeadHours={72} initialEmails={[]} />)
    await blurWith(leadInput(), '48')
    expect(leadInput().value).toBe('72')
    expect(screen.getByText('Failed to save — try again')).toBeDefined()
  })
})

describe('CardFlowSettings: test emails', () => {
  it("'A@x.com, b@y.org\\na@x.com' blur PATCHes the normalised list and rewrites the field one per line", async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['old@x.com']} />)
    await blurWith(emailsInput(), 'A@x.com, b@y.org\na@x.com')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodyOf(fetchMock)).toEqual({ card_flow_canary_emails: ['a@x.com', 'b@y.org'] })
    expect(emailsInput().value).toBe('a@x.com\nb@y.org')
  })

  it('an unchanged list sends nothing but is still written back normalised', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['a@x.com']} />)
    await blurWith(emailsInput(), '  A@X.com  ')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(emailsInput().value).toBe('a@x.com')
  })

  it('clearing the field saves an empty list and shows the info line in canary mode', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['a@x.com']} />)
    await blurWith(emailsInput(), '')
    expect(bodyOf(fetchMock)).toEqual({ card_flow_canary_emails: [] })
    expect(screen.getByText('The list is empty, so nobody will see card payment.')).toBeDefined()
  })

  it('an invalid line shows its message (first invalid line only) and sends nothing', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={[]} />)
    await blurWith(emailsInput(), 'ok@x.com\nnot-an-email\nalso bad')
    const msg = screen.getByText('"not-an-email" is not a valid email address.')
    expect(msg.getAttribute('role')).toBe('alert')
    expect(fetchMock).not.toHaveBeenCalled()
    // the text stays so the operator can correct it
    expect(emailsInput().value).toBe('ok@x.com\nnot-an-email\nalso bad')
  })

  it('a long invalid value is shown as 40 characters then an ellipsis', async () => {
    stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={[]} />)
    const long = 'x'.repeat(60)
    await blurWith(emailsInput(), long)
    expect(screen.getByText(`"${'x'.repeat(40)}…" is not a valid email address.`)).toBeDefined()
  })

  it('21 addresses -> "Add no more than 20 addresses." and no request; 20 are saved', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={[]} />)
    const make = (n: number) => Array.from({ length: n }, (_, i) => `u${i}@x.com`).join('\n')
    await blurWith(emailsInput(), make(21))
    expect(screen.getByText('Add no more than 20 addresses.')).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
    await blurWith(emailsInput(), make(20))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodyOf(fetchMock).card_flow_canary_emails).toHaveLength(20)
  })

  it('the error clears when the operator edits the field again', async () => {
    stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={[]} />)
    await blurWith(emailsInput(), 'nope')
    expect(screen.getByText('"nope" is not a valid email address.')).toBeDefined()
    await act(async () => {
      fireEvent.change(emailsInput(), { target: { value: 'nope@' } })
    })
    expect(screen.queryByText('"nope" is not a valid email address.')).toBeNull()
  })

  it('a failed save reverts the field to the last saved list', async () => {
    stubFetch(false)
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['a@x.com']} />)
    await blurWith(emailsInput(), 'a@x.com\nb@y.org')
    expect(emailsInput().value).toBe('a@x.com')
    expect(screen.getByText('Failed to save — try again')).toBeDefined()
  })
})

describe('CardFlowSettings: All clients go-live tile (Phase 89 D-17, E20)', () => {
  const dialog = () => screen.queryByRole('dialog')
  const allClients = () => screen.getByRole('radio', { name: 'All clients' })

  async function openDialog() {
    await act(async () => {
      fireEvent.click(allClients())
      await vi.advanceTimersByTimeAsync(0)
    })
  }

  it('clicking All clients opens the confirm dialog and sends no PATCH before the confirm', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['a@x.com']} />)
    await openDialog()
    expect(dialog()).not.toBeNull()
    expect(screen.getByText('Open card payment to all clients')).toBeDefined()
    expect(
      screen.getByText(
        'Every client who books a one-way transfer or an hourly ride will see card payment and Pay cash to driver at checkout. The new cancellation terms apply to every new booking. Bookings made earlier keep their terms. You can switch back at any time; card bookings already made are still held and charged.',
      ),
    ).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
  })

  it('arrowing onto All clients only opens the dialog, it does not save', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['a@x.com']} />)
    await act(async () => {
      fireEvent.keyDown(radios()[1], { key: 'ArrowRight' })
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(dialog()).not.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('initial focus is on "Keep owner test only"', async () => {
    stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['a@x.com']} />)
    await openDialog()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep owner test only' }))
  })

  it('"Keep owner test only" closes the dialog, saves nothing and keeps the tile', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['a@x.com']} />)
    await openDialog()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep owner test only' }))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(dialog()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(radios()[1].getAttribute('aria-checked')).toBe('true')
  })

  it('Escape closes the dialog without saving', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="off" initialLeadHours={72} initialEmails={[]} />)
    await openDialog()
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(dialog()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('"Open to all clients" PATCHes { card_flow_mode: on } once, selects the tile and shows Saved', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['a@x.com']} />)
    await openDialog()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open to all clients' }))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodyOf(fetchMock)).toEqual({ card_flow_mode: 'on' })
    expect(dialog()).toBeNull()
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
    expect(screen.getByText('Saved')).toBeDefined()
  })

  it('a failed confirm keeps the previous tile and shows the failure line', async () => {
    stubFetch(false)
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['a@x.com']} />)
    await openDialog()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open to all clients' }))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(screen.getByText('Failed to save — try again')).toBeDefined()
  })

  it('Off and Owner test only still save at once, with no dialog, from All clients', async () => {
    const fetchMock = stubFetch()
    render(<CardFlowSettings initialMode="on" initialLeadHours={72} initialEmails={[]} />)
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
    await act(async () => {
      fireEvent.click(radios()[0])
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(dialog()).toBeNull()
    expect(bodyOf(fetchMock)).toEqual({ card_flow_mode: 'off' })
  })

  it('with on: test emails stay editable, the muted line shows and the empty-list warning does not', () => {
    stubFetch()
    render(<CardFlowSettings initialMode="on" initialLeadHours={72} initialEmails={[]} />)
    expect(emailsInput().disabled).toBe(false)
    expect(screen.getByText('Test emails are ignored while card payment is open to all clients.')).toBeDefined()
    expect(screen.queryByText('The list is empty, so nobody will see card payment.')).toBeNull()
  })

  it('the muted line is hidden in canary and off', () => {
    stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['a@x.com']} />)
    expect(screen.queryByText('Test emails are ignored while card payment is open to all clients.')).toBeNull()
  })
})

describe('CardFlowSettings: styling and wiring', () => {
  it('uses 44px controls and design tokens only', () => {
    stubFetch()
    render(<CardFlowSettings initialMode="canary" initialLeadHours={72} initialEmails={['a@x.com']} />)
    expect(leadInput().style.minHeight).toBe('44px')
    expect(leadInput().getAttribute('style') ?? '').toContain('var(--admin-input-bg)')
    expect(emailsInput().style.minHeight).toBe('96px')
    expect(radios()[1].getAttribute('style') ?? '').toContain('var(--admin-accent-border)')
    expect(radios()[1].getAttribute('style') ?? '').toContain('var(--admin-accent-tint)')
  })

  const page = fs.readFileSync(
    path.resolve(__dirname, '..', 'app/(internal)/admin/(dashboard)/settings/page.tsx'),
    'utf8',
  )

  it('the Settings page renders CardFlowSettings directly under NoShowWaitSettings with the three values', () => {
    expect(page).toContain("import CardFlowSettings from '@/components/admin/CardFlowSettings'")
    expect(page).toContain('initialMode={data.card_flow_mode}')
    expect(page).toContain('initialLeadHours={data.payment_hold_lead_hours}')
    expect(page).toContain('initialEmails={data.card_flow_canary_emails}')
    expect(page.indexOf('<NoShowWaitSettings')).toBeLessThan(page.indexOf('<CardFlowSettings'))
  })
})
