'use client'
import { useEffect, useRef, type CSSProperties, type FocusEvent, type ReactNode } from 'react'
import { Modal } from '@/components/admin/Modal'
import { errorStyle } from '@/components/admin/adminFieldStyles'
import { outlineButtonStyle } from '@/components/admin/paymentShared'
import type { AppLocale } from '@/i18n/locales'

// Phase 93 (plan 93-10; TRIP-05): styles, copy and the confirm dialog shared by the tour editor cards. Tokens only
// (--admin-* / --status-*): tests/admin-no-hardcoded-colors.test.ts scans this directory.

export const COPY_SESSION = 'Your session has ended. Sign in again.'
export const COPY_SAVE_FAILED = 'Could not save. Nothing was changed. Try again.'

export const FONT = 'var(--font-montserrat)'

export const cardStyle: CSSProperties = {
  background: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  borderRadius: 'var(--admin-radius-lg)',
  padding: 24,
  marginBottom: 24,
}

export const cardTitleStyle: CSSProperties = {
  margin: '0 0 16px',
  fontFamily: 'var(--admin-font-heading)',
  fontSize: 'var(--admin-fs-heading)',
  fontWeight: 'var(--admin-fw-heading)',
  color: 'var(--admin-text)',
}

export const accentButtonStyle: CSSProperties = {
  ...outlineButtonStyle,
  background: 'var(--admin-accent)',
  color: 'var(--admin-on-accent)',
  border: 'none',
}

export const dangerButtonStyle: CSSProperties = {
  ...outlineButtonStyle,
  background: 'var(--admin-danger-solid)',
  color: 'var(--admin-on-danger)',
  border: '1px solid var(--admin-danger-solid)',
}

export const mutedTextStyle: CSSProperties = {
  margin: 0,
  fontFamily: FONT,
  fontSize: 'var(--admin-fs-label)',
  lineHeight: 1.5,
  color: 'var(--admin-text-muted)',
}

export const bodyTextStyle: CSSProperties = {
  margin: 0,
  fontFamily: FONT,
  fontSize: 'var(--admin-fs-body)',
  lineHeight: 1.5,
  color: 'var(--admin-text)',
}

export const iconButtonStyle: CSSProperties = {
  ...outlineButtonStyle,
  minWidth: '44px',
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

export const warnTextStyle: CSSProperties = {
  margin: '4px 0 0',
  fontFamily: FONT,
  fontSize: 'var(--admin-fs-label)',
  color: 'var(--status-warn-fg)',
}

export const warnBannerStyle: CSSProperties = {
  margin: '0 0 16px',
  padding: '12px 16px',
  borderRadius: 'var(--admin-radius-md)',
  background: 'var(--status-warn-bg)',
  border: '1px solid var(--status-warn-border)',
  color: 'var(--status-warn-fg)',
  fontFamily: FONT,
  fontSize: 'var(--admin-fs-body)',
}

/** English names of the eight tour languages (the admin UI is English). */
export const LANGUAGE_NAMES: Record<AppLocale, string> = {
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
  fr: 'French',
  ar: 'Arabic',
  hi: 'Hindi',
  zh: 'Simplified Chinese',
  'zh-hant': 'Traditional Chinese',
}

/** "ZH-HANT" on the tab, "Save ZH-HANT" on the button. */
export function localeCode(locale: AppLocale): string {
  return locale.toUpperCase()
}

/** "English, Russian and Spanish" style list, comma separated. */
export function languageList(locales: AppLocale[]): string {
  return locales.map((l) => LANGUAGE_NAMES[l]).join(', ')
}

export function languageCount(count: number): string {
  return `${count} ${count === 1 ? 'language' : 'languages'}`
}

/** Focuses the element it is attached to once the dialog is on screen (after the Modal remembered its trigger). */
function useFocusAfterMount<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!enabled) return
    const timer = setTimeout(() => ref.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [enabled])
  return ref
}

type ConfirmDialogProps = {
  isOpen: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  cancelLabel: string
  /** danger: the confirm button is the red one and the safe (cancel) button starts focused. */
  tone?: 'accent' | 'danger'
  busy?: boolean
  error?: string | null
  /** Which button starts focused; defaults to the safe one for danger and the confirm button otherwise. */
  initialFocus?: 'confirm' | 'cancel'
  onConfirm: () => void
  onCancel: () => void
  /** Escape, the X and the backdrop; defaults to onCancel. Set it when cancelling and dismissing differ. */
  onDismiss?: () => void
}

/** Modal with a confirm and a cancel button; Escape, the X and the backdrop are ignored while busy. */
export function ConfirmDialog({
  isOpen,
  title,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'accent',
  busy = false,
  error,
  initialFocus,
  onConfirm,
  onCancel,
  onDismiss,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={busy ? noop : (onDismiss ?? onCancel)} title={title}>
      <ConfirmBody
        tone={tone}
        busy={busy}
        error={error}
        initialFocus={initialFocus ?? (tone === 'danger' ? 'cancel' : 'confirm')}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        {children}
      </ConfirmBody>
    </Modal>
  )
}

function noop() {}

function ConfirmBody({
  children,
  confirmLabel,
  cancelLabel,
  tone,
  busy,
  error,
  initialFocus,
  onConfirm,
  onCancel,
}: Omit<ConfirmDialogProps, 'isOpen' | 'title' | 'initialFocus' | 'onDismiss'> & { initialFocus: 'confirm' | 'cancel' }) {
  const confirmRef = useFocusAfterMount<HTMLButtonElement>(initialFocus === 'confirm')
  const cancelRef = useFocusAfterMount<HTMLButtonElement>(initialFocus === 'cancel')
  return (
    <div>
      {children !== undefined && <div style={{ ...bodyTextStyle, marginBottom: '16px' }}>{children}</div>}
      {error && (
        <p role="alert" style={{ ...errorStyle, marginBottom: '16px' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
        <button
          ref={confirmRef}
          type="button"
          onClick={onConfirm}
          disabled={busy}
          style={{
            ...(tone === 'danger' ? dangerButtonStyle : accentButtonStyle),
            opacity: busy ? 0.7 : 1,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
        <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} style={outlineButtonStyle}>
          {cancelLabel}
        </button>
      </div>
    </div>
  )
}

/** Focus ring for inputs, selects and textareas (their inline `outline: none` would hide the global ring). */
export const ringHandlers = {
  onFocus: (e: FocusEvent<HTMLElement>) => {
    e.currentTarget.style.outline = '2px solid var(--admin-focus)'
    e.currentTarget.style.outlineOffset = '2px'
  },
  onBlur: (e: FocusEvent<HTMLElement>) => {
    e.currentTarget.style.outline = 'none'
  },
}
