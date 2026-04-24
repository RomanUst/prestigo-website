'use client'

import { useState } from 'react'
import QuoteProgressBar from './QuoteProgressBar'
import QuoteStep1Route from './QuoteStep1Route'
import QuoteStep2Date from './QuoteStep2Date'
import QuoteStep3Pax from './QuoteStep3Pax'
import QuoteStep4Class from './QuoteStep4Class'

interface QuoteWizardProps {
  onCalculate?: () => void
  'data-testid'?: string
}

export default function QuoteWizard({ onCalculate = () => {}, 'data-testid': testId }: QuoteWizardProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1)

  function handleNext() {
    if (currentStep === 4) {
      onCalculate()
    } else {
      setCurrentStep((s) => Math.min(4, s + 1) as 1 | 2 | 3 | 4)
    }
  }

  function handleBack() {
    setCurrentStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4)
  }

  return (
    <div
      data-testid={testId}
      style={{
        maxWidth: '520px',
        padding: '24px 16px',
        margin: '0 auto',
      }}
    >
      <QuoteProgressBar currentStep={currentStep} />

      <div className="animate-step-enter" key={currentStep}>
        {currentStep === 1 && (
          <QuoteStep1Route
            onNext={handleNext}
            showBack={false}
          />
        )}
        {currentStep === 2 && (
          <QuoteStep2Date
            onNext={handleNext}
            onBack={handleBack}
          />
        )}
        {currentStep === 3 && (
          <QuoteStep3Pax
            onNext={handleNext}
            onBack={handleBack}
          />
        )}
        {currentStep === 4 && (
          <QuoteStep4Class
            onNext={onCalculate}
            onBack={handleBack}
          />
        )}
      </div>
    </div>
  )
}
