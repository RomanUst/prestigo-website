'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent, KeyboardEvent } from 'react'
import { Info } from 'lucide-react'
import { errorStyle, focusRingHandlers, inputBaseStyle } from './adminFieldStyles'
import { Modal } from './Modal'
import { outlineButtonStyle } from './paymentShared'

// Phase 88 plan 06 (D-01, D-04, PAYF-05, UI-SPEC Surface 3): the owner's rollout switch for the card
// flow. Same optimistic-save pattern as NoShowWaitSettings. The server (zod in /api/admin/settings and
// the 085/087 CHECKs) stays authoritative; the checks here only save a round trip. Phase 89 (D-17, UI-SPEC
// Surface 7.2) adds the third tile "All clients" (value 'on'): it never saves at once, it opens a confirm dialog
// whose initial focus is the safe choice. Off and Owner test only save immediately (switching off is safe).

type Mode = 'off' | 'canary' | 'on'

interface Props {
  initialMode?: Mode | null
  initialLeadHours?: number | null
  initialEmails?: string[] | null
}

const DEFAULT_LEAD_HOURS = 72
const MIN_LEAD = 6
const MAX_LEAD = 96
const MAX_EMAILS = 20
const LEAD_ERROR = 'Enter a whole number from 6 to 96.'
const COUNT_ERROR = 'Add no more than 20 addresses.'

const MODES: ReadonlyArray<{ key: Mode; label: string }> = [
  { key: 'off', label: 'Off' },
  { key: 'canary', label: 'Owner test only' },
  { key: 'on', label: 'All clients' },
]

type Feedback = { type: 'success' | 'error'; message: string } | null

/** Whole number 6..96 written as plain digits (no sign, decimals or exponent). */
function parseLead(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return n >= MIN_LEAD && n <= MAX_LEAD ? n : null
}

function initialLead(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= MIN_LEAD && v <= MAX_LEAD ? v : DEFAULT_LEAD_HOURS
}

function initialModeValue(v: Mode | null | undefined): Mode {
  return v === 'canary' ? 'canary' : v === 'on' ? 'on' : 'off'
}

function initialEmailList(v: string[] | null | undefined): string[] {
  return Array.isArray(v) ? v.filter((e): e is string => typeof e === 'string') : []
}

// Pragmatic shape check; the server runs the authoritative zod email validation.
const EMAIL_SHAPE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

function shorten(value: string): string {
  return value.length > 40 ? `${value.slice(0, 40)}…` : value
}

/** Trimmed, lower-cased, de-duplicated (first occurrence wins); lines, commas, semicolons and spaces all split. */
function parseEmails(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

const fieldLabelStyle: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-label)',
  fontWeight: 'var(--admin-fw-strong)',
  color: 'var(--admin-text-muted)',
  marginBottom: '4px',
}

const helperStyle: CSSProperties = {
  margin: '4px 0 0',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-label)',
  lineHeight: 1.5,
  color: 'var(--admin-text-muted)',
}

export default function CardFlowSettings({ initialMode, initialLeadHours, initialEmails }: Props) {
  const [mode, setMode] = useState<Mode>(initialModeValue(initialMode))
  const [savedLead, setSavedLead] = useState<number>(initialLead(initialLeadHours))
  const [leadInput, setLeadInput] = useState<string>(String(initialLead(initialLeadHours)))
  const [leadInvalid, setLeadInvalid] = useState(false)
  const [savedEmails, setSavedEmails] = useState<string[]>(initialEmailList(initialEmails))
  const [emailsInput, setEmailsInput] = useState<string>(initialEmailList(initialEmails).join('\n'))
  const [emailsError, setEmailsError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const tileRefs = useRef<Record<Mode, HTMLButtonElement | null>>({ off: null, canary: null, on: null })
  const keepRef = useRef<HTMLButtonElement | null>(null)

  // Initial focus of the go-live dialog is the safe button (UI-SPEC 7.2); the Modal itself has no focus handling
  useEffect(() => {
    if (!confirmOpen) return
    const t = setTimeout(() => keepRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [confirmOpen])

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    }
  }, [])

  function showFeedback(fb: NonNullable<Feedback>) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback(fb)
    feedbackTimer.current = setTimeout(() => setFeedback(null), fb.type === 'error' ? 4000 : 2000)
  }

  async function persist(body: Record<string, unknown>) {
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('Save failed')
  }

  async function selectMode(next: Mode) {
    if (next === mode) return
    if (next === 'on') {
      // Opening the flow to every client never saves at once (D-17, T-89-65)
      setConfirmOpen(true)
      return
    }
    const previous = mode
    setMode(next) // optimistic
    try {
      await persist({ card_flow_mode: next })
      showFeedback({ type: 'success', message: 'Saved' })
    } catch {
      setMode(previous)
      showFeedback({ type: 'error', message: 'Failed to save — try again' })
    }
  }

  async function confirmOpenToAll() {
    if (confirmBusy) return
    const previous = mode
    setConfirmBusy(true)
    try {
      await persist({ card_flow_mode: 'on' })
      setMode('on')
      showFeedback({ type: 'success', message: 'Saved' })
    } catch {
      setMode(previous) // the previous tile stays selected
      showFeedback({ type: 'error', message: 'Failed to save — try again' })
    } finally {
      setConfirmBusy(false)
      setConfirmOpen(false)
    }
  }

  function handleTileKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = (index + 1) % MODES.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = (index - 1 + MODES.length) % MODES.length
    if (target === null) return
    e.preventDefault()
    const next = MODES[target].key
    if (next === 'on') {
      // Arrowing onto All clients only opens the confirm dialog; nothing is selected or saved until confirmed
      void selectMode(next)
      return
    }
    tileRefs.current[next]?.focus()
    void selectMode(next)
  }

  async function handleLeadBlur(raw: string) {
    const parsed = parseLead(raw)
    if (parsed === null) {
      // Not saved; the text stays so the operator can correct it
      setLeadInvalid(true)
      return
    }
    setLeadInvalid(false)
    setLeadInput(String(parsed))
    if (parsed === savedLead) return

    const previous = savedLead
    setSavedLead(parsed)
    try {
      await persist({ payment_hold_lead_hours: parsed })
      showFeedback({ type: 'success', message: 'Saved' })
    } catch {
      setSavedLead(previous)
      setLeadInput(String(previous))
      showFeedback({ type: 'error', message: 'Failed to save — try again' })
    }
  }

  async function handleEmailsBlur(raw: string) {
    const list = parseEmails(raw)
    const bad = list.find((e) => !EMAIL_SHAPE.test(e))
    if (bad !== undefined) {
      setEmailsError(`"${shorten(bad)}" is not a valid email address.`)
      return
    }
    if (list.length > MAX_EMAILS) {
      setEmailsError(COUNT_ERROR)
      return
    }
    setEmailsError(null)
    setEmailsInput(list.join('\n'))
    if (sameList(list, savedEmails)) return

    const previous = savedEmails
    setSavedEmails(list)
    try {
      await persist({ card_flow_canary_emails: list })
      showFeedback({ type: 'success', message: 'Saved' })
    } catch {
      setSavedEmails(previous)
      setEmailsInput(previous.join('\n'))
      showFeedback({ type: 'error', message: 'Failed to save — try again' })
    }
  }

  const emptyCanary = mode === 'canary' && savedEmails.length === 0

  return (
    <div style={{ maxWidth: 560, marginTop: 24 }}>
      <div
        style={{
          background: 'var(--admin-surface)',
          border: '1px solid var(--admin-border)',
          borderRadius: 'var(--admin-radius-md)',
          padding: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 4,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--admin-font-heading)',
              fontSize: 'var(--admin-fs-heading)',
              fontWeight: 'var(--admin-fw-heading)',
              color: 'var(--admin-text)',
            }}
          >
            Card on file
          </h2>
          {feedback && (
            <span
              role="status"
              style={{
                fontSize: 'var(--admin-fs-label)',
                color: feedback.type === 'success' ? 'var(--status-ok-fg)' : 'var(--status-danger-fg)',
                fontFamily: 'var(--font-montserrat)',
              }}
            >
              {feedback.message}
            </span>
          )}
        </div>
        <p style={{ ...helperStyle, margin: '0 0 24px' }}>
          Clients save a card at checkout and pay after the trip. Turning this off only affects new bookings. Card
          bookings already made are still held and charged.
        </p>

        {/* Card payment: radiogroup */}
        <div style={{ marginBottom: 24 }}>
          <span id="card-flow-mode-label" style={fieldLabelStyle}>
            Card payment
          </span>
          <div
            role="radiogroup"
            aria-labelledby="card-flow-mode-label"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
          >
            {MODES.map((m, index) => {
              const selected = mode === m.key
              return (
                <button
                  key={m.key}
                  ref={(el) => {
                    tileRefs.current[m.key] = el
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => void selectMode(m.key)}
                  onKeyDown={(e) => handleTileKeyDown(e, index)}
                  style={{
                    flex: '1 1 200px',
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: 'var(--admin-fs-body)',
                    color: 'var(--admin-text)',
                    background: selected ? 'var(--admin-accent-tint)' : 'transparent',
                    border: `1px solid ${selected ? 'var(--admin-accent-border)' : 'var(--admin-border-strong)'}`,
                    borderRadius: 'var(--admin-radius-md)',
                  }}
                >
                  {selected && (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--admin-accent)',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {m.label}
                </button>
              )
            })}
          </div>
          <p style={helperStyle}>
            Owner test only shows card payment and cash guarantee at checkout to the emails listed below. All clients
            opens it to everyone booking a one-way transfer or an hourly ride.
          </p>
          {emptyCanary && (
            <div
              role="status"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
                fontFamily: 'var(--font-montserrat)',
                fontSize: 'var(--admin-fs-label)',
                color: 'var(--status-info-fg)',
              }}
            >
              <Info size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>The list is empty, so nobody will see card payment.</span>
            </div>
          )}
        </div>

        {/* Hold lead time */}
        <div style={{ marginBottom: 24 }}>
          <label htmlFor="card-flow-lead-hours" style={fieldLabelStyle}>
            Hold lead time (hours)
          </label>
          <input
            id="card-flow-lead-hours"
            type="number"
            inputMode="numeric"
            min={MIN_LEAD}
            max={MAX_LEAD}
            step={1}
            value={leadInput}
            aria-invalid={leadInvalid}
            aria-describedby={leadInvalid ? 'card-flow-lead-hours-error' : 'card-flow-lead-hours-help'}
            onChange={(e) => {
              setLeadInput(e.target.value)
              if (leadInvalid) setLeadInvalid(false)
            }}
            onFocus={focusRingHandlers.onFocus}
            onBlur={(e: FocusEvent<HTMLInputElement>) => {
              focusRingHandlers.onBlur(e)
              void handleLeadBlur(e.currentTarget.value)
            }}
            style={{ ...inputBaseStyle, fontWeight: 400, letterSpacing: 'normal', maxWidth: '160px' }}
          />
          {leadInvalid && (
            <div id="card-flow-lead-hours-error" role="alert" style={errorStyle}>
              {LEAD_ERROR}
            </div>
          )}
          <p id="card-flow-lead-hours-help" style={helperStyle}>
            How long before pickup the card is held. Pickups closer than this are held at checkout.
          </p>
        </div>

        {/* Test emails */}
        <div>
          <label htmlFor="card-flow-emails" style={fieldLabelStyle}>
            Test emails
          </label>
          <textarea
            id="card-flow-emails"
            rows={4}
            spellCheck={false}
            autoComplete="off"
            value={emailsInput}
            aria-invalid={emailsError !== null}
            aria-describedby={emailsError ? 'card-flow-emails-error' : 'card-flow-emails-help'}
            onChange={(e) => {
              setEmailsInput(e.target.value)
              if (emailsError) setEmailsError(null)
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = '2px solid var(--admin-focus)'
              e.currentTarget.style.outlineOffset = '2px'
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = 'none'
              void handleEmailsBlur(e.currentTarget.value)
            }}
            style={{
              ...inputBaseStyle,
              fontWeight: 400,
              letterSpacing: 'normal',
              minHeight: '96px',
              resize: 'vertical',
            }}
          />
          {emailsError && (
            <div id="card-flow-emails-error" role="alert" style={errorStyle}>
              {emailsError}
            </div>
          )}
          <p id="card-flow-emails-help" style={helperStyle}>
            Only these emails see card payment while the mode is Owner test only. Capitals and spaces are ignored.
          </p>
          {mode === 'on' && (
            <p style={helperStyle}>Test emails are ignored while card payment is open to all clients.</p>
          )}
        </div>
      </div>

      <Modal
        isOpen={confirmOpen}
        onClose={confirmBusy ? () => {} : () => setConfirmOpen(false)}
        title="Open card payment to all clients"
      >
        <p style={{ ...helperStyle, margin: 0, fontSize: 'var(--admin-fs-body)', color: 'var(--admin-text)' }}>
          Every client who books a one-way transfer or an hourly ride will see card payment and Pay cash to driver at
          checkout. The new cancellation terms apply to every new booking. Bookings made earlier keep their terms. You
          can switch back at any time; card bookings already made are still held and charged.
        </p>
        <div className="flex flex-col sm:flex-row" style={{ gap: 8, marginTop: 24 }}>
          <button
            type="button"
            disabled={confirmBusy}
            onClick={() => void confirmOpenToAll()}
            style={{
              ...outlineButtonStyle,
              background: 'var(--admin-accent)',
              color: 'var(--admin-on-accent)',
              border: 'none',
              opacity: confirmBusy ? 0.7 : 1,
              cursor: confirmBusy ? 'not-allowed' : 'pointer',
            }}
          >
            {confirmBusy ? 'Working…' : 'Open to all clients'}
          </button>
          <button
            ref={keepRef}
            type="button"
            disabled={confirmBusy}
            onClick={() => setConfirmOpen(false)}
            style={{ ...outlineButtonStyle, opacity: confirmBusy ? 0.7 : 1, cursor: confirmBusy ? 'not-allowed' : 'pointer' }}
          >
            {/* Names the mode that stays: the dialog also opens from Off (click or arrow wrap) (89-REVIEW-wording WR-08) */}
            {mode === 'off' ? 'Keep card payment off' : 'Keep owner test only'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
