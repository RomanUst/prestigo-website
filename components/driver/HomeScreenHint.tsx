import { Share, Smartphone, SquarePlus } from 'lucide-react'

// Phase 94 plan 94-13 (DCAB-10; D-09, UI-SPEC You "HomeScreenHint"): shown instead of the notification switch on iPhone
// and iPad Safari outside the Home Screen, where the browser offers no push at all. Colours only through
// var(--status-info-*). Long text wraps (overflow-wrap) and the card scrolls sideways rather than clipping at large
// text zoom.

const step = { display: 'flex', alignItems: 'flex-start', gap: 8 } as const
const icon = { flexShrink: 0, marginTop: 2 } as const

export default function HomeScreenHint() {
  return (
    <div
      style={{
        boxSizing: 'border-box',
        padding: 16,
        overflowX: 'auto',
        overflowWrap: 'anywhere',
        background: 'var(--status-info-bg)',
        color: 'var(--status-info-fg)',
        borderRadius: 'var(--admin-radius-md)',
        fontSize: 'var(--driver-fs-body)',
        lineHeight: 1.5,
      }}
    >
      <p style={{ margin: 0, display: 'flex', alignItems: 'flex-start', gap: 8, fontWeight: 500 }}>
        <Smartphone size={20} aria-hidden="true" style={icon} />
        <span>Add Prestigo to your Home Screen</span>
      </p>
      <p style={{ margin: '8px 0 0', fontWeight: 400 }}>
        On iPhone, notifications only work after you add this page to your Home Screen.
      </p>
      <ol style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <li style={step}>
          <span aria-hidden="true">1.</span>
          <span>
            Tap the Share button <Share size={20} aria-hidden="true" style={{ verticalAlign: 'text-bottom' }} /> in
            Safari.
          </span>
        </li>
        <li style={step}>
          <span aria-hidden="true">2.</span>
          <span>
            Choose Add to Home Screen{' '}
            <SquarePlus size={20} aria-hidden="true" style={{ verticalAlign: 'text-bottom' }} />.
          </span>
        </li>
        <li style={step}>
          <span aria-hidden="true">3.</span>
          <span>Open Prestigo from your Home Screen and turn on notifications here.</span>
        </li>
      </ol>
    </div>
  )
}
