'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isSafePaymentLinkUrl } from '@/lib/panel-links'

const COPIED_MS = 2000
const COPIED_ANNOUNCEMENT = 'Payment link copied'

/** Tier 2: execCommand on an off-screen textarea; the focus goes back where it was. */
function copyWithExecCommand(text: string): boolean {
  if (typeof document.execCommand !== 'function') return false
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.setAttribute('aria-hidden', 'true')
  area.className = 'copy-offscreen'
  document.body.appendChild(area)
  let copied = false
  try {
    area.focus()
    area.select()
    area.setSelectionRange(0, text.length)
    copied = document.execCommand('copy')
  } catch {
    copied = false
  } finally {
    area.remove()
    previous?.focus()
  }
  return copied
}

/** Tier 1 (async clipboard API), then tier 2; false means the operator must copy by hand (tier 3). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Blocked inside Chatwoot's cross-origin iframe; fall through to the next tier.
  }
  return copyWithExecCommand(text)
}

interface CopyLinkButtonProps {
  /** Re-checked here (defence in depth); anything but https on buy.stripe.com renders nothing. */
  url: string | null
  /** The panel's single live region; when absent the button renders its own polite region. */
  onAnnounce?: (message: string) => void
}

/** Copies an existing Stripe payment link for pasting into a reply. It never opens or follows the link. */
export default function CopyLinkButton({ url, onAnnounce }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)
  const [manual, setManual] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const timer = useRef<number | null>(null)
  const manualInput = useRef<HTMLInputElement>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  useEffect(() => {
    if (!manual) return
    manualInput.current?.focus()
    manualInput.current?.select()
  }, [manual])

  const announce = useCallback(
    (message: string) => {
      if (onAnnounce) onAnnounce(message)
      else setAnnouncement(message)
    },
    [onAnnounce],
  )

  const onClick = useCallback(async () => {
    if (!isSafePaymentLinkUrl(url)) return
    const ok = await copyText(url)
    if (!ok) {
      setManual(true)
      return
    }
    setManual(false)
    setCopied(true)
    announce(COPIED_ANNOUNCEMENT)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setCopied(false)
      announce('')
    }, COPIED_MS)
  }, [url, announce])

  if (!isSafePaymentLinkUrl(url)) return null

  return (
    <>
      <button type="button" className="primary-button" onClick={onClick}>
        {copied ? 'Copied' : 'Copy payment link'}
      </button>
      {onAnnounce ? null : (
        <span className="sr-only" aria-live="polite">
          {announcement}
        </span>
      )}
      {manual ? (
        <span className="copy-manual">
          <input
            ref={manualInput}
            className="field"
            type="text"
            readOnly
            aria-label="Payment link"
            value={url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <span className="meta">Press Ctrl/Cmd+C to copy</span>
        </span>
      ) : null}
    </>
  )
}
