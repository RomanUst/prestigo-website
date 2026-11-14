'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Plus } from 'lucide-react'
import { QuoteLineEditor } from '@/components/admin/quotes/QuoteLineEditor'
import { QuoteSettingsFields } from '@/components/admin/quotes/QuoteSettingsFields'
import { QuoteActionsBar } from '@/components/admin/quotes/QuoteActionsBar'
import {
  depositProblem,
  draftFromDetail,
  draftProblems,
  draftToPayload,
  emptyLine,
  type QuoteDraft,
  type QuoteLineDraft,
} from '@/components/admin/quotes/quoteDraft'
import { errorStyle, labelStyle } from '@/components/admin/adminFieldStyles'
import { outlineButtonStyle } from '@/components/admin/paymentShared'
import type { QuoteDetail } from '@/lib/quotes/store'
import { QUOTE_MAX_LINES } from '@/lib/quotes/vocabulary'

// The quote draft editor (Phase 92, plan 92-19; QUOTE-01, QUOTE-06). Mounted by
// app/(internal)/admin/(dashboard)/quotes/[id]/page.tsx. It loads the detail, holds the whole draft in state, mounts one
// QuoteLineEditor per line and saves the WHOLE draft with one PATCH. The server prices, validates and freezes nothing
// the operator typed over; every refusal code is turned into a plain sentence here.
//
// A frozen version is shown read-only (editing goes through Edit = revise). The state, the version and the send / copy link /
// edit / cancel actions are QuoteActionsBar (plan 92-25), the history and the linked bookings are QuoteEventsList; both read
// this component's detail and ask it to read the quote again after every action.

type Status = { kind: 'ok' | 'error'; text: string }

const COPY_SESSION = 'Your session has ended. Sign in again.'
const COPY_SAVE_FAILED = 'Could not save the quote. Nothing was changed. Try again.'
const COPY_FROZEN =
  'This version was already sent, so it can no longer be edited. The page now shows it as it was sent.'

/** One plain sentence per refusal code of the draft save (92-08) and the statuses around it. */
const REFUSAL_TEXT: Record<string, string> = {
  deposit_zero: 'The deposit cannot be 0. Enter a percent or an amount.',
  deposit_above_total: 'The deposit is more than the total of the trips.',
  no_lines: 'Add at least one trip before saving.',
  currency_needs_lines: 'The currency changed, so every trip must be saved again with its amount in the new currency.',
  expiry_in_past: 'The expiry date has passed. Choose today or a later day.',
  quote_voided: 'This quote was cancelled. It can no longer be edited.',
  quote_cancelled: 'This quote was cancelled. It can no longer be edited.',
  quote_paid: 'This quote is already paid. It can no longer be edited.',
  version_frozen: COPY_FROZEN,
  pricing_unavailable: 'Route or prices unavailable, try again',
}

/** The plain sentence of a refused save, from the HTTP status and the route's { error, reason } body. */
export function saveErrorText(
  status: number,
  body: { error?: string; reason?: string; details?: { fieldErrors?: Record<string, unknown> } } | null,
): string {
  if (status === 401 || status === 403) return COPY_SESSION
  if (status === 404) return 'This quote no longer exists.'
  if (status === 409) return COPY_FROZEN
  if (status === 413) return 'The quote is too large to save. Remove some text or trips.'
  if (status === 503) return REFUSAL_TEXT.pricing_unavailable
  if (status === 400) {
    const fields = Object.keys(body?.details?.fieldErrors ?? {})
    return fields.length > 0
      ? `Check these fields and try again: ${fields.join(', ')}.`
      : 'Some fields are not valid. Check the quote and try again.'
  }
  if (status === 422) {
    const known = (body?.reason && REFUSAL_TEXT[body.reason]) || (body?.error && REFUSAL_TEXT[body.error])
    return known || 'The quote cannot be saved in its current state.'
  }
  return COPY_SAVE_FAILED
}

const cardStyle: CSSProperties = {
  backgroundColor: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  borderRadius: 'var(--admin-radius-lg)',
  padding: '16px',
}

const mutedStyle: CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  color: 'var(--admin-text-muted)',
}

const primaryButtonStyle: CSSProperties = {
  ...outlineButtonStyle,
  background: 'var(--admin-accent)',
  color: 'var(--admin-on-accent)',
  border: 'none',
}

export function QuoteBuilder({ quoteId }: { quoteId: string }) {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading')
  const [detail, setDetail] = useState<QuoteDetail | null>(null)
  const [draft, setDraft] = useState<QuoteDraft | null>(null)
  const [savedExpiry, setSavedExpiry] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  // Set by the first Save press; from then on the list of problems follows the draft live, so a fixed one disappears.
  const [attempted, setAttempted] = useState(false)
  // A second click before React re-renders must send nothing.
  const busy = useRef(false)

  const load = useCallback(
    async (silent: boolean): Promise<boolean> => {
      if (!silent) setLoadState('loading')
      try {
        const res = await fetch(`/api/admin/quotes/${quoteId}`, { cache: 'no-store' })
        if (res.status === 404) {
          setLoadState('notfound')
          return false
        }
        if (!res.ok) {
          if (!silent) setLoadState('error')
          return false
        }
        const json = (await res.json()) as QuoteDetail
        const next = draftFromDetail(json)
        setDetail(json)
        setDraft(next)
        setSavedExpiry(next.expires_at)
        setLoadState('ready')
        return true
      } catch {
        if (!silent) setLoadState('error')
        return false
      }
    },
    [quoteId],
  )

  useEffect(() => {
    // The detail is read from the server once per quote id.
    void load(false)
  }, [load])

  if (loadState === 'loading') return <p style={mutedStyle}>Loading…</p>
  if (loadState === 'notfound') return <p role="alert" style={errorStyle}>This quote does not exist.</p>
  if (loadState === 'error' || !detail || !draft) {
    return <p role="alert" style={errorStyle}>Could not load the quote. Try again.</p>
  }

  const frozen = detail.version.frozen_at !== null
  const closed = ['voided', 'cancelled', 'paid'].includes(detail.effective_status)
  const readOnly = frozen || closed
  const earlierVersions = detail.versions.filter((v) => v.version_no < detail.version.version_no)

  // Send uses the saved version: edits that are not saved yet must be saved first.
  let unsaved = false
  if (!readOnly) {
    try {
      unsaved = JSON.stringify(draftToPayload(draft, savedExpiry)) !== JSON.stringify(draftToPayload(draftFromDetail(detail), savedExpiry))
    } catch {
      unsaved = true
    }
  }

  const patch = (next: Partial<QuoteDraft>) => setDraft({ ...draft, ...next })
  // The suggestions were made in the old currency: they are dropped, the amounts the operator typed stay for them to correct.
  const patchSettings = (next: Partial<QuoteDraft>) => {
    if (next.currency !== undefined && next.currency !== draft.currency) {
      patch({ ...next, lines: draft.lines.map((l) => ({ ...l, suggestedMinor: null })) })
      return
    }
    patch(next)
  }
  // D-07: Save waits for a deposit that is chosen, not 0 and not above the total.
  const depositBlocked = depositProblem(draft) !== null
  const problems = attempted && !readOnly ? draftProblems(draft) : []
  const setLine = (index: number, line: QuoteLineDraft) =>
    patch({ lines: draft.lines.map((l, i) => (i === index ? line : l)) })
  const removeLine = (index: number) => patch({ lines: draft.lines.filter((_, i) => i !== index) })
  const moveLine = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= draft.lines.length) return
    const lines = [...draft.lines]
    ;[lines[index], lines[target]] = [lines[target], lines[index]]
    patch({ lines })
  }
  const addLine = () => {
    if (draft.lines.length >= QUOTE_MAX_LINES) return
    patch({ lines: [...draft.lines, emptyLine()] })
  }

  async function save() {
    if (!draft || busy.current) return
    const found = draftProblems(draft)
    setAttempted(true)
    if (found.length > 0) {
      setStatus(null)
      return
    }
    busy.current = true
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftToPayload(draft, savedExpiry)),
      })
      if (res.ok) {
        setStatus({ kind: 'ok', text: 'Saved' })
        // The server priced the changed lines and recomputed the deposit shares: show what it stored.
        await load(true)
        return
      }
      const body = await res.json().catch(() => null)
      if (res.status === 409) {
        // A sent version cannot be edited: read it again, it comes back read-only.
        setStatus({ kind: 'error', text: saveErrorText(res.status, body) })
        await load(true)
        return
      }
      setStatus({ kind: 'error', text: saveErrorText(res.status, body) })
    } catch {
      setStatus({ kind: 'error', text: COPY_SAVE_FAILED })
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  const clientName = `${draft.client.first_name} ${draft.client.last_name}`.trim()

  return (
    <div data-testid="quote-builder" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h1
            style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: '26px',
              fontWeight: 300,
              lineHeight: 1.2,
              color: 'var(--admin-text)',
              letterSpacing: 0,
            }}
          >
            {detail.quote.reference}
          </h1>
        </div>
        <p style={{ ...mutedStyle, marginTop: '8px' }}>
          {clientName} · {draft.client.email}
          {draft.client.phone ? ` · ${draft.client.phone}` : ''}
        </p>
        {earlierVersions.length > 0 && (
          <p data-testid="quote-earlier-versions" style={{ ...mutedStyle, marginTop: '4px' }}>
            {`Earlier versions: ${earlierVersions.map((v) => v.version_no).join(', ')}`}
          </p>
        )}
        {readOnly && (
          <p style={{ ...mutedStyle, marginTop: '4px' }}>
            {frozen
              ? 'This version was sent to the client and cannot be edited. To change it, make a new version.'
              : 'This quote is closed and can no longer be edited.'}
          </p>
        )}
      </div>

      <QuoteActionsBar detail={detail} unsavedChanges={unsaved} onChanged={() => load(true)} />

      <section aria-label="Trips" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {draft.lines.length === 0 && <p style={mutedStyle}>No trips yet.</p>}
        {draft.lines.map((line, index) => (
          <QuoteLineEditor
            key={line.key}
            line={line}
            index={index}
            total={draft.lines.length}
            currency={draft.currency}
            readOnly={readOnly}
            onChange={(next) => setLine(index, next)}
            onRemove={() => removeLine(index)}
            onMove={(direction) => moveLine(index, direction)}
          />
        ))}
        {!readOnly && draft.lines.length < QUOTE_MAX_LINES && (
          <div>
            <button type="button" onClick={addLine} style={{ ...outlineButtonStyle, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={14} aria-hidden="true" /> Add trip
            </button>
          </div>
        )}
      </section>

      <QuoteSettingsFields draft={draft} onChange={patchSettings} readOnly={readOnly} />

      {!readOnly && (
        <div style={cardStyle}>
          {problems.length > 0 && (
            <div role="alert" style={{ marginBottom: '12px' }}>
              <div style={{ ...labelStyle, color: 'var(--status-danger-fg)' }}>Fix these before saving</div>
              <ul style={{ margin: 0, paddingLeft: '18px' }}>
                {problems.map((p) => (
                  <li key={p} style={errorStyle}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {status && (
            <p
              role={status.kind === 'error' ? 'alert' : 'status'}
              style={status.kind === 'error' ? { ...errorStyle, marginTop: 0, marginBottom: '12px' } : { ...mutedStyle, color: 'var(--status-ok-fg)', marginBottom: '12px' }}
            >
              {status.text}
            </p>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || depositBlocked}
            style={{ ...primaryButtonStyle, opacity: saving || depositBlocked ? 0.5 : 1, cursor: saving || depositBlocked ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {depositBlocked && <p style={{ ...mutedStyle, marginTop: '8px' }}>Save is available once the deposit is set.</p>}
        </div>
      )}
      {readOnly && status && (
        <p role={status.kind === 'error' ? 'alert' : 'status'} style={status.kind === 'error' ? errorStyle : mutedStyle}>
          {status.text}
        </p>
      )}
    </div>
  )
}
