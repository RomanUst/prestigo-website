import ZoneMap from '@/components/admin/ZoneMap'

export default function ZonesPage() {
  return (
    <div>
      <h1
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontSize: '28px',
          fontWeight: 400,
          color: 'var(--offwhite)',
          letterSpacing: '0.08em',
          marginBottom: '24px',
        }}
      >
        Coverage Zones
      </h1>
      <ZoneMap />
    </div>
  )
}
