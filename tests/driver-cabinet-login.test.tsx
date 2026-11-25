import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'

// Phase 94 plan 94-02 (DCAB-01 / DCAB-02, D-05, UI-SPEC "Screen Contract: Sign-in"): email -> 6-digit code -> cabinet.

const h = vi.hoisted(() => ({
  getDriverSession: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/driver-cabinet/auth', () => ({
  getDriverSession: h.getDriverSession,
}))

vi.mock('next/navigation', () => ({
  redirect: h.redirect,
}))

import LoginForm from '@/app/(internal)/driver/(cabinet)/login/LoginForm'
import LoginPage from '@/app/(internal)/driver/(cabinet)/login/page'
import { BUSINESS_TEL_URL, BUSINESS_PHONE_DISPLAY } from '@/lib/contact-channels'

const EMAIL = 'ana@example.com'

type FetchMock = ReturnType<typeof vi.fn>
let fetchMock: FetchMock
let assignMock: ReturnType<typeof vi.fn>
const realLocation = window.location

function respond(status: number, body: unknown = {}) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

beforeEach(() => {
  fetchMock = vi.fn(() => respond(200, { ok: true }))
  vi.stubGlobal('fetch', fetchMock)
  assignMock = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, assign: assignMock },
  })
  h.getDriverSession.mockReset()
  h.redirect.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
})

function renderForm(props: Partial<React.ComponentProps<typeof LoginForm>> = {}) {
  return render(<LoginForm next="/driver/rides" offersContext={false} ended={false} {...props} />)
}

function emailField() {
  return screen.getByLabelText('Email') as HTMLInputElement
}

function codeField() {
  return screen.getByLabelText('6-digit code') as HTMLInputElement
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function submitEmail(value = EMAIL) {
  fireEvent.change(emailField(), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
  await flush()
}

describe('LoginForm step 1 (email)', () => {
  it('disables Send code until the field contains an @', () => {
    renderForm()
    const button = screen.getByRole('button', { name: 'Send code' })
    expect(button).toBeDisabled()
    fireEvent.change(emailField(), { target: { value: 'ana' } })
    expect(button).toBeDisabled()
    fireEvent.change(emailField(), { target: { value: EMAIL } })
    expect(button).toBeEnabled()
  })

  it('has the right input attributes', () => {
    renderForm()
    const input = emailField()
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toHaveAttribute('autocomplete', 'email')
    expect(input).toHaveAttribute('maxlength', '254')
    expect(input).toHaveAttribute('inputmode', 'email')
  })

  it('posts the email and moves to step 2 with the uniform copy', async () => {
    renderForm()
    await submitEmail()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/driver/cabinet/request-code')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ email: EMAIL })
    expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeInTheDocument()
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          el.textContent === `If ${EMAIL} is set up for the cabinet, we sent a 6-digit code. It works for 10 minutes.`,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(EMAIL).style.fontWeight).toBe('500')
  })

  it('shows the same step-2 screen whatever the server body says', async () => {
    fetchMock.mockImplementation(() => respond(200, { ok: false, exists: false, anything: 'else' }))
    renderForm()
    await submitEmail('nobody@example.com')
    expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeInTheDocument()
  })

  it('maps 400 to the invalid email line (role=alert)', async () => {
    fetchMock.mockImplementation(() => respond(400, { error: 'invalid_email' }))
    renderForm()
    await submitEmail()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.')
    expect(screen.queryByRole('heading', { name: 'Enter your code' })).not.toBeInTheDocument()
  })

  it('maps 429 to the rate-limit line', async () => {
    fetchMock.mockImplementation(() => respond(429, {}))
    renderForm()
    await submitEmail()
    expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts. Wait a few minutes and try again.')
  })

  it('maps a network failure and 5xx to the connection line', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')))
    renderForm()
    await submitEmail()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not send the code. Check your connection and try again.')

    fetchMock.mockImplementationOnce(() => respond(503, {}))
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not send the code. Check your connection and try again.')
  })

  it('shows Sending… with aria-busy while the request is open and ignores a second tap', async () => {
    let resolve!: (r: Response) => void
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (resolve = r)))
    renderForm()
    fireEvent.change(emailField(), { target: { value: EMAIL } })
    const button = screen.getByRole('button', { name: 'Send code' })
    fireEvent.click(button)
    await flush()
    const busy = screen.getByRole('button', { name: /Sending/ })
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(emailField()).toBeDisabled()
    fireEvent.click(busy)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolve(new Response('{}', { status: 200 }))
    })
    await flush()
    expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeInTheDocument()
  })

  it('uses the offers body copy when the sign-in came from an offer link', () => {
    renderForm({ next: '/driver/offers', offersContext: true })
    expect(
      screen.getByText('Sign in to see your new ride offer. We will send a 6-digit code to your email.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Enter the email the office has on file/)).not.toBeInTheDocument()
  })

  it('uses the default body copy otherwise', () => {
    renderForm()
    expect(
      screen.getByText('Enter the email the office has on file for you. We will send you a 6-digit code.'),
    ).toBeInTheDocument()
  })

  it('shows the session-ended line when ended', () => {
    renderForm({ ended: true })
    expect(screen.getByText('Your session ended. Sign in again.')).toBeInTheDocument()
  })

  it('shows no session-ended line by default', () => {
    renderForm()
    expect(screen.queryByText('Your session ended. Sign in again.')).not.toBeInTheDocument()
  })

  it('has the office phone link in the footer', () => {
    renderForm()
    const link = screen.getByRole('link', { name: /Call the office/ })
    expect(link).toHaveAttribute('href', BUSINESS_TEL_URL)
    expect(BUSINESS_PHONE_DISPLAY).toBeTruthy()
  })
})

describe('LoginForm step 2 (code)', () => {
  async function toStep2(props: Partial<React.ComponentProps<typeof LoginForm>> = {}) {
    renderForm(props)
    await submitEmail()
    fetchMock.mockClear()
  }

  it('has the right input attributes', async () => {
    await toStep2()
    const input = codeField()
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input).toHaveAttribute('maxlength', '6')
  })

  it('strips non-digits typed or pasted', async () => {
    await toStep2()
    fireEvent.change(codeField(), { target: { value: '12a-3 4' } })
    expect(codeField().value).toBe('1234')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('submits once automatically at 6 digits and navigates with a full page load', async () => {
    await toStep2({ next: '/driver/offers' })
    fireEvent.change(codeField(), { target: { value: '123456' } })
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/driver/cabinet/verify')
    expect(JSON.parse(init.body)).toEqual({ email: EMAIL, code: '123456' })
    expect(assignMock).toHaveBeenCalledWith('/driver/offers')
  })

  it('shows Signing in… with aria-busy and ignores repeat taps', async () => {
    let resolve!: (r: Response) => void
    await toStep2()
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (resolve = r)))
    fireEvent.change(codeField(), { target: { value: '123456' } })
    await flush()
    const busy = screen.getByRole('button', { name: /Signing in/ })
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(codeField()).toBeDisabled()
    fireEvent.click(busy)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolve(new Response('{"ok":true}', { status: 200 }))
    })
    await flush()
    expect(assignMock).toHaveBeenCalledWith('/driver/rides')
  })

  it('Sign in button is the fallback submit', async () => {
    await toStep2()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
    fireEvent.change(codeField(), { target: { value: '12345' } })
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
  })

  it('wrong code: message, field cleared and focused', async () => {
    await toStep2()
    fetchMock.mockImplementation(() => respond(400, { error: 'wrong_code' }))
    fireEvent.change(codeField(), { target: { value: '111111' } })
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent('That code is not correct. Check it and try again.')
    expect(codeField().value).toBe('')
    expect(codeField()).toHaveFocus()
    expect(assignMock).not.toHaveBeenCalled()
  })

  it('dead code: expired message', async () => {
    await toStep2()
    fetchMock.mockImplementation(() => respond(400, { error: 'code_expired' }))
    fireEvent.change(codeField(), { target: { value: '111111' } })
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This code has expired or was used too many times. Send a new code.',
    )
  })

  it('429 and network errors', async () => {
    await toStep2()
    fetchMock.mockImplementationOnce(() => respond(429, {}))
    fireEvent.change(codeField(), { target: { value: '111111' } })
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts. Wait a few minutes and try again.')

    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')))
    fireEvent.change(codeField(), { target: { value: '222222' } })
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not sign in. Check your connection and try again.')
  })

  it('Use a different email returns to step 1', async () => {
    await toStep2()
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(emailField().value).toBe(EMAIL)
  })

  it('Send a new code is disabled for 30 s with a countdown, then re-sends', async () => {
    vi.useFakeTimers()
    renderForm()
    fireEvent.change(emailField(), { target: { value: EMAIL } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await flush()
    fetchMock.mockClear()

    const resend = () => screen.getByRole('button', { name: /Send a new code/ })
    expect(resend()).toBeDisabled()
    expect(resend()).toHaveTextContent('Send a new code in 0:30')
    await act(async () => {
      vi.advanceTimersByTime(6000)
    })
    expect(resend()).toHaveTextContent('Send a new code in 0:24')
    expect(resend()).toBeDisabled()
    await act(async () => {
      vi.advanceTimersByTime(24000)
    })
    expect(resend()).toHaveTextContent(/^Send a new code$/)
    expect(resend()).toBeEnabled()

    fireEvent.click(resend())
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/driver/cabinet/request-code')
    expect(screen.getByRole('status')).toHaveTextContent('A new code is on its way.')
    expect(resend()).toBeDisabled()
  })
})

describe('login page (server component)', () => {
  it('redirects to the safe next when a session exists', async () => {
    h.getDriverSession.mockResolvedValue({ driverId: 'd', sessionId: 's' })
    await expect(LoginPage({ searchParams: Promise.resolve({ next: '/driver/offers' }) })).rejects.toThrow(
      'REDIRECT:/driver/offers',
    )
  })

  it('redirects to /driver/rides when next is missing or unsafe', async () => {
    h.getDriverSession.mockResolvedValue({ driverId: 'd', sessionId: 's' })
    await expect(LoginPage({ searchParams: Promise.resolve({ next: '//evil.com' }) })).rejects.toThrow(
      'REDIRECT:/driver/rides',
    )
    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/driver/rides')
  })

  it('renders the form with the safe next when signed out', async () => {
    h.getDriverSession.mockResolvedValue(null)
    const element = await LoginPage({ searchParams: Promise.resolve({ next: '/driver/offers', ended: '1' }) })
    render(element)
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByText('Your session ended. Sign in again.')).toBeInTheDocument()
    expect(
      screen.getByText('Sign in to see your new ride offer. We will send a 6-digit code to your email.'),
    ).toBeInTheDocument()
  })

  it('falls back to the default body when next is unsafe', async () => {
    h.getDriverSession.mockResolvedValue(null)
    const element = await LoginPage({ searchParams: Promise.resolve({ next: '/driver/trip/abc' }) })
    render(element)
    expect(screen.queryByText(/new ride offer/)).not.toBeInTheDocument()
    expect(screen.queryByText('Your session ended. Sign in again.')).not.toBeInTheDocument()
  })
})
