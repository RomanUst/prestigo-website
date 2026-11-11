'use client'
import React from 'react'

export function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontFamily: 'var(--font-montserrat)',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.3em',
        color: 'var(--warmgrey)',
        marginBottom: '4px',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-montserrat)',
        fontSize: '13px',
        color: 'var(--offwhite)',
      }}>
        {value}
      </div>
    </div>
  )
}
