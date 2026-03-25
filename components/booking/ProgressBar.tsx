'use client'

import { Check } from 'lucide-react'

interface ProgressBarProps {
  currentStep: number
  completedSteps: Set<number>
  totalSteps: number
}

export default function ProgressBar({ currentStep, completedSteps, totalSteps }: ProgressBarProps) {
  return (
    <div
      className="flex items-center"
      style={{ padding: '24px 0' }}
      aria-label={`Booking progress: Step ${currentStep} of 6`}
      role="navigation"
    >
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1
        const isActive = step === currentStep
        const isCompleted = completedSteps.has(step)
        const isPending = !isActive && !isCompleted

        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            {/* Circle */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                backgroundColor: isActive || isCompleted ? 'var(--copper)' : 'var(--anthracite-mid)',
                border: isPending ? '1px solid var(--anthracite-light)' : 'none',
              }}
              aria-current={isActive ? 'step' : undefined}
            >
              {isCompleted ? (
                <Check
                  size={16}
                  style={{ color: 'var(--anthracite)' }}
                  aria-hidden="true"
                />
              ) : (
                <span
                  style={{
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '9px',
                    fontWeight: 400,
                    letterSpacing: '0.1em',
                    color: isActive ? 'var(--anthracite)' : 'var(--warmgrey)',
                  }}
                >
                  {step}
                </span>
              )}
            </div>

            {/* Connector line (not rendered after last step) */}
            {step < totalSteps && (
              <div
                style={{
                  flex: 1,
                  height: 1,
                  backgroundColor:
                    isCompleted || (isActive && completedSteps.has(step - 1))
                      ? 'var(--copper)'
                      : 'var(--anthracite-light)',
                }}
                aria-hidden="true"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
