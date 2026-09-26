'use client'

import { useTranslations } from 'next-intl'

interface StepStubProps {
  step: number
}

export default function StepStub({ step }: StepStubProps) {
  const t = useTranslations('StepStub')
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ minHeight: 200 }}
    >
      <p className="label mb-6">{t('stepOfSix', { step })}</p>
      <span className="copper-line mb-6" style={{ margin: '0 auto 24px' }} />
      <p className="body-text">{t('body')}</p>
    </div>
  )
}
