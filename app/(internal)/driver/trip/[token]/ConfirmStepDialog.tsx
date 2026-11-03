'use client'

import { useEffect, useId, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import { BUSINESS_PHONE_DISPLAY, BUSINESS_TEL_URL } from '@/lib/contact-channels'

export interface ConfirmStepDialogProps {
  /** 'no-show' mode is added by plan 87-11. */
  mode: 'step' | 'help'
  stepLabel?: string
  isFinal?: boolean
  submitting: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

// 87-UI-SPEC "Step table": the confirm button for each step label.
const CONFIRM_BUTTON: Record<string, string> = {
  'On my way': "Yes, I'm on my way",
  'I have arrived': 'Yes, I have arrived',
  'Passenger on board': 'Yes, passenger on board',
  'Complete trip': 'Yes, complete trip',
}

const buttonBase: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 48,
  borderRadius: 'var(--admin-radius-md)',
  fontFamily: 'inherit',
  fontSize: 'var(--driver-fs-body)',
  lineHeight: 1.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  cursor: 'pointer',
}

const FOCUSABLE = 'button:not([disabled]), a[href]'

/**
 * Confirm dialog for a driver step (D-13). Custom dialog, not the admin Modal (whose 32px padding
 * and 480px floor suit desktop admin). Initial focus is "Not yet" (safe default for an irreversible
 * action), focus is trapped, Escape / scrim / "Not yet" cancel, nothing is sent until the primary
 * button is pressed, and focus returns to the invoking control on close.
 */
export default function ConfirmStepDialog(props: ConfirmStepDialogProps) {
  const { mode, stepLabel = '', isFinal = false, submitting, error, onConfirm, onCancel } = props
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => {
      opener?.focus?.()
    }
  }, [])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (!submitting) onCancel()
      return
    }
    if (e.key !== 'Tab') return
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
      e.preventDefault()
      first.focus()
    }
  }

  const isHelp = mode === 'help'
  const primaryLabel = error ? 'Try again' : (CONFIRM_BUTTON[stepLabel] ?? 'Confirm')

  return (
    <div
      className="driver-dialog-scrim"
      onClick={() => {
        if (!submitting) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'var(--admin-scrim)',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="driver-dialog-sheet"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: 480,
          background: 'var(--admin-surface)',
          border: '1px solid var(--admin-border)',
          boxShadow: 'var(--admin-shadow-sheet)',
          padding: '24px 24px calc(24px + env(safe-area-inset-bottom))',
          color: 'var(--admin-text)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <h2
          id={titleId}
          style={{
            margin: 0,
            fontFamily: 'var(--admin-font-heading)',
            fontSize: 'var(--driver-fs-heading)',
            fontWeight: 500,
            lineHeight: 1.2,
          }}
        >
          {isHelp ? 'Need help?' : `Confirm: ${stepLabel}`}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isHelp ? (
            <p style={{ margin: 0, fontSize: 'var(--driver-fs-body)', fontWeight: 400, lineHeight: 1.5 }}>
              Call the office if you cannot find the passenger, the trip details look wrong, or a step was tapped
              by mistake.
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 'var(--driver-fs-body)', fontWeight: 400, lineHeight: 1.5 }}>
              {'Are you sure you want to move to '}
              <span style={{ fontWeight: 500 }}>{stepLabel}</span>
              {'?'}
            </p>
          )}
          {!isHelp && isFinal ? (
            <p
              style={{
                margin: 0,
                fontSize: 'var(--driver-fs-body)',
                fontWeight: 400,
                lineHeight: 1.5,
                color: 'var(--admin-text-muted)',
              }}
            >
              You cannot undo this. If a step is wrong, the office can fix it.
            </p>
          ) : null}
        </div>

        {error ? (
          <p
            role="alert"
            style={{
              margin: 0,
              fontSize: 'var(--driver-fs-body)',
              fontWeight: 400,
              lineHeight: 1.5,
              color: 'var(--status-danger-fg)',
            }}
          >
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isHelp ? (
            <a
              href={BUSINESS_TEL_URL}
              data-driver-focus=""
              style={{
                ...buttonBase,
                flexDirection: 'column',
                gap: 0,
                fontWeight: 500,
                textDecoration: 'none',
                border: '1px solid var(--admin-accent)',
                background: 'var(--admin-accent)',
                color: 'var(--admin-on-accent)',
              }}
            >
              <span>Call the office</span>
              <span
                style={{
                  fontSize: 'var(--driver-fs-label)',
                  fontWeight: 400,
                  lineHeight: 1.4,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {BUSINESS_PHONE_DISPLAY}
              </span>
            </a>
          ) : (
            <button
              type="button"
              data-driver-focus=""
              disabled={submitting}
              onClick={onConfirm}
              style={{
                ...buttonBase,
                fontWeight: 500,
                border: '1px solid var(--admin-accent)',
                background: 'var(--admin-accent)',
                color: 'var(--admin-on-accent)',
                opacity: submitting ? 0.85 : 1,
                cursor: submitting ? 'default' : 'pointer',
              }}
            >
              {submitting ? (
                <>
                  <LoaderCircle size={20} className="driver-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                primaryLabel
              )}
            </button>
          )}
          <button
            ref={cancelRef}
            type="button"
            data-driver-focus=""
            disabled={submitting}
            onClick={onCancel}
            style={{
              ...buttonBase,
              fontWeight: 400,
              border: '1px solid var(--admin-border-strong)',
              background: 'transparent',
              color: 'var(--admin-text)',
              cursor: submitting ? 'default' : 'pointer',
            }}
          >
            {isHelp ? 'Close' : 'Not yet'}
          </button>
        </div>
      </div>
    </div>
  )
}
