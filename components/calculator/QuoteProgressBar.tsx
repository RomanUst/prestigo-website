'use client'

interface QuoteProgressBarProps {
  currentStep: number // 1–4
}

const STEP_LABELS = [
  '1/4\u2002\u2002ROUTE',
  '2/4\u2002\u2002DATE & TIME',
  '3/4\u2002\u2002PASSENGERS',
  '4/4\u2002\u2002VEHICLE CLASS',
]

export default function QuoteProgressBar({ currentStep }: QuoteProgressBarProps) {
  return (
    <nav
      role="navigation"
      aria-label={`Quote progress: Step ${currentStep} of 4`}
      style={{ padding: '24px 0' }}
    >
      {/* Dots + connector row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
        }}
      >
        {[1, 2, 3, 4].map((step) => {
          const isActive = step <= currentStep
          return (
            <div
              key={step}
              style={{
                display: 'flex',
                alignItems: 'center',
                flex: step < 4 ? 1 : 'none',
              }}
            >
              {/* Dot */}
              <div
                aria-current={step === currentStep ? 'step' : undefined}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: isActive ? 'var(--copper)' : 'transparent',
                  border: isActive ? 'none' : '1px solid var(--anthracite-light)',
                }}
              />
              {/* Connector line (not after last step) */}
              {step < 4 && (
                <div
                  aria-hidden="true"
                  style={{
                    flex: 1,
                    height: 1,
                    background: isActive ? 'var(--copper)' : 'var(--anthracite-light)',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Labels row */}
      <div
        style={{
          display: 'flex',
          marginTop: 8,
        }}
      >
        {STEP_LABELS.map((label, index) => {
          const step = index + 1
          const isActive = step === currentStep
          return (
            <div
              key={step}
              style={{
                flex: step < 4 ? 1 : 'none',
                textAlign: step === 4 ? 'right' : step === 1 ? 'left' : 'center',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                fontWeight: 400,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: isActive ? 'var(--offwhite)' : 'var(--warmgrey)',
              }}
            >
              {label}
            </div>
          )
        })}
      </div>
    </nav>
  )
}
