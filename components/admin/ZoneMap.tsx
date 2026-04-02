'use client'
import dynamic from 'next/dynamic'

const ZoneMapInner = dynamic(() => import('./ZoneMapInner'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        background: 'var(--anthracite)',
        minHeight: '480px',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '13px',
          color: 'var(--warmgrey)',
        }}
      >
        Loading map...
      </span>
    </div>
  ),
})

export default function ZoneMap() {
  return <ZoneMapInner />
}
