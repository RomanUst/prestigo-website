'use client'

import { useEffect, useId, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { LoaderCircle, MessageCircle, TriangleAlert } from 'lucide-react'
import { BUSINESS_PHONE_DISPLAY, BUSINESS_TEL_URL } from '@/lib/contact-channels'

export interface ConfirmStepDialogProps {
  /** 'no-show' asks the office to try the passenger (D-15); it changes no status and charges nothing. */
  mode: 'step' | 'help' | 'no-show' | 'cash-received'
  stepLabel?: string
  isFinal?: boolean
  submitting: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
  /**
   * Phase 89 (D-11): the formatted cash label (a string built on the server). With mode 'step' on the final step it adds
   * the cash warning block; with mode 'cash-received' it fills the confirm texts. Completion is never blocked by it.
   */
  cash?: { amountLabel: string }
  /** Help mode only (87-UAT gap 3): the primary "Chat with the office" button. */
  chat?: { state: 'idle' | 'opening' | 'error'; onOpen: () => void }
}

const CHAT_ERROR = 'Chat is not available right now. Call the office instead.'

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
  const { mode, stepLabel = '', isFinal = false, submitting, error, onConfirm, onCancel, chat, cash } = props
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
  const isNoShow = mode === 'no-show'
  const isCashReceived = mode === 'cash-received'
  const cashAmount = cash?.amountLabel ?? ''
  const primaryLabel = error
    ? 'Try again'
    : isNoShow
      ? 'Send request'
      : isCashReceived
        ? `Yes, I received ${cashAmount}`
        : (CONFIRM_BUTTON[stepLabel] ?? 'Confirm')

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
          {isHelp ? 'Need help?' : isNoShow ? 'Request a no-show' : isCashReceived ? 'Confirm cash received' : `Confirm: ${stepLabel}`}
        </h2>

        {mode === 'step' && isFinal && cash ? <CashWarning amountLabel={cash.amountLabel} /> : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isHelp ? (
            <p style={{ margin: 0, fontSize: 'var(--driver-fs-body)', fontWeight: 400, lineHeight: 1.5 }}>
              Chat with the office or call if you cannot find the passenger, the trip details look wrong, or a
              step was tapped by mistake.
            </p>
          ) : isCashReceived ? (
            <p style={{ margin: 0, fontSize: 'var(--driver-fs-body)', fontWeight: 400, lineHeight: 1.5 }}>
              {`You received ${cashAmount} in cash from the passenger?`}
            </p>
          ) : isNoShow ? (
            <p style={{ margin: 0, fontSize: 'var(--driver-fs-body)', fontWeight: 400, lineHeight: 1.5 }}>
              The office will try to reach the passenger. Nothing is charged and the trip stays open.
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 'var(--driver-fs-body)', fontWeight: 400, lineHeight: 1.5 }}>
              {'Are you sure you want to move to '}
              <span style={{ fontWeight: 500 }}>{stepLabel}</span>
              {'?'}
            </p>
          )}
          {!isHelp && !isNoShow && !isCashReceived && isFinal ? (
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

        {error || (isHelp && chat?.state === 'error') ? (
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
            {error ?? CHAT_ERROR}
          </p>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isHelp ? (
            <>
              {chat ? (
                <button
                  type="button"
                  data-driver-focus=""
                  disabled={chat.state === 'opening'}
                  aria-busy={chat.state === 'opening'}
                  onClick={chat.onOpen}
                  style={{
                    ...buttonBase,
                    fontWeight: 500,
                    border: '1px solid var(--admin-accent)',
                    background: 'var(--admin-accent)',
                    color: 'var(--admin-on-accent)',
                    opacity: chat.state === 'opening' ? 0.85 : 1,
                    cursor: chat.state === 'opening' ? 'default' : 'pointer',
                  }}
                >
                  {chat.state === 'opening' ? (
                    <>
                      <LoaderCircle size={20} className="driver-spin" aria-hidden="true" />
                      Opening chat…
                    </>
                  ) : (
                    <>
                      <MessageCircle size={20} aria-hidden="true" />
                      {chat.state === 'error' ? 'Try chat again' : 'Chat with the office'}
                    </>
                  )}
                </button>
              ) : null}
              <a
                href={BUSINESS_TEL_URL}
                data-driver-focus=""
                style={{
                  ...buttonBase,
                  flexDirection: 'column',
                  gap: 0,
                  fontWeight: 500,
                  textDecoration: 'none',
                  border: '1px solid var(--admin-border-strong)',
                  background: 'transparent',
                  color: 'var(--admin-text)',
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
            </>
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

/**
 * UI-SPEC 6.1: the warning above the standard text of the final step. The amount is the server's label; the second
 * sentence tells the driver the office can still charge the saved card while the client is there (D-21).
 */
function CashWarning({ amountLabel }: { amountLabel: string }) {
  return (
    <div
      role="status"
      style={{
        boxSizing: 'border-box',
        padding: 16,
        borderRadius: 'var(--admin-radius-md)',
        background: 'var(--status-warn-bg)',
        color: 'var(--status-warn-fg)',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <TriangleAlert size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 'var(--driver-fs-label)', fontWeight: 500, lineHeight: 1.4, letterSpacing: '0.08em' }}>
          CASH TO COLLECT
        </span>
        <span
          style={{
            fontSize: 'var(--driver-fs-display)',
            fontWeight: 500,
            lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
            overflowWrap: 'anywhere',
          }}
        >
          {amountLabel}
        </span>
        <p style={{ margin: 0, fontSize: 'var(--driver-fs-body)', fontWeight: 400, lineHeight: 1.5 }}>
          Collect this amount in cash from the passenger before you finish.
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--driver-fs-label)',
            fontWeight: 400,
            lineHeight: 1.4,
            color: 'var(--admin-text-muted)',
          }}
        >
          If the passenger wants to pay by card instead, call the office before you complete the trip.
        </p>
      </div>
    </div>
  )
}
