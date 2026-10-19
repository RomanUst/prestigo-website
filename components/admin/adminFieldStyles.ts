import type { CSSProperties, FocusEvent } from 'react'

// Copied verbatim from the module-private objects in AccountForm.tsx (82-UI-SPEC "Forms").
// AccountForm itself stays unchanged. New code overrides fontWeight with 400 when it spreads
// inputBaseStyle (weight 300 is not used on any Phase 82 page).

export const inputBaseStyle: CSSProperties = {
  backgroundColor: '#36363B',
  border: '1px solid #4E4E56',
  color: '#F5F2EE',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  fontWeight: 300,
  letterSpacing: '0.03em',
  padding: '8px 12px',
  minHeight: '44px',
  borderRadius: '4px',
  outline: 'none',
  width: '100%',
}

export const labelStyle: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  letterSpacing: '0.3em',
  textTransform: 'uppercase',
  color: '#CFC9C2',
  marginBottom: '4px',
}

export const errorStyle: CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  color: '#f87171',
  marginTop: '4px',
}

/**
 * inputBaseStyle sets `outline: none` inline, which would hide the global :focus-visible ring.
 * These handlers draw the Phase 82 focus ring (2px solid copper, 2px offset) on the input itself.
 */
export const focusRingHandlers = {
  onFocus: (e: FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.outline = '2px solid var(--copper)'
    e.currentTarget.style.outlineOffset = '2px'
  },
  onBlur: (e: FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.outline = 'none'
  },
}
