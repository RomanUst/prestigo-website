'use client'

interface StepStubProps {
  step: number
}

export default function StepStub({ step }: StepStubProps) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ minHeight: 200 }}
    >
      <p className="label mb-6">STEP {step} OF 6</p>
      <span className="copper-line mb-6" style={{ margin: '0 auto 24px' }} />
      <p className="body-text">Complete your journey details — coming next.</p>
    </div>
  )
}
