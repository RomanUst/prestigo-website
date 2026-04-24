// Server Component — no 'use client'
export default function PromoBadge() {
  return (
    <span
      className="tier-promo-badge"
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        fontSize: '11px',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--copper)',
        border: '1px solid var(--copper)',
        borderRadius: '2px',
      }}
    >
      LIMITED-TIME OFFER
    </span>
  )
}
