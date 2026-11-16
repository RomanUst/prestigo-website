'use client'

// "Download PDF" on the quote page (Phase 92, plan 92-27; QUOTE-07; D-14; T-92-83, T-92-84).
//
// - The press posts the token in the body to POST /api/quote/pdf (never a URL, never a link with the token in it) and
//   saves the answer under the name the page computed, through a short-lived object URL.
// - When the server cannot produce the PDF (503 pdf_unavailable, or any other failure) the island says so and offers
//   Print: the page has print styles, so the browser's "Save as PDF" gives the same quote (D-14 fallback).
// - The island translates nothing: the page passes every string (Quote.pdf.*). One request at a time.

import { useRef, useState } from 'react'

export interface QuotePdfButtonCopy {
  download: string
  preparing: string
  unavailable: string
  print: string
}

export interface QuotePdfButtonProps {
  token: string
  /** Prestigo-quote-<reference>-v<n>.pdf, built on the server. */
  fileName: string
  copy: QuotePdfButtonCopy
}

const PDF_ENDPOINT = '/api/quote/pdf'

const buttonStyle = {
  minHeight: 44,
  padding: '0 20px',
} as const

const textStyle = {
  margin: 0,
  fontSize: 14,
  fontWeight: 300,
  lineHeight: 1.5,
  color: 'var(--warmgrey)',
  fontFamily: 'var(--font-montserrat)',
} as const

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  try {
    a.click()
  } finally {
    a.remove()
    // Give the browser a moment to start the download before the URL is released.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}

export function QuotePdfButton({ token, fileName, copy }: QuotePdfButtonProps) {
  const [busy, setBusy] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const busyRef = useRef(false)

  const download = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      const res = await fetch(PDF_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const type = res.headers.get('Content-Type') ?? ''
      if (!res.ok || !type.startsWith('application/pdf')) {
        setUnavailable(true)
        return
      }
      const blob = await res.blob()
      if (blob.size === 0) {
        setUnavailable(true)
        return
      }
      saveBlob(blob, fileName)
      setUnavailable(false)
    } catch {
      setUnavailable(true)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <section data-testid="quote-pdf" style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <button
          type="button"
          className="btn-ghost"
          onClick={download}
          disabled={busy}
          aria-busy={busy}
          style={buttonStyle}
        >
          {busy ? copy.preparing : copy.download}
        </button>
        {unavailable ? (
          <button type="button" className="btn-ghost" onClick={() => window.print()} style={buttonStyle}>
            {copy.print}
          </button>
        ) : null}
      </div>
      {unavailable ? (
        <p role="status" style={textStyle}>
          {copy.unavailable}
        </p>
      ) : null}
    </section>
  )
}

export default QuotePdfButton
