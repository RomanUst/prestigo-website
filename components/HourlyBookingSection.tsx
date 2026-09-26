'use client'

import { useTranslations } from 'next-intl'
import BookingWidget from '@/components/booking/BookingWidget'

export default function HourlyBookingSection() {
  const t = useTranslations('HourlyBookingSection')
  const trust = t.raw('trust') as string[]

  return (
    <section id="book" className="bg-anthracite-mid py-20 md:py-28 border-t border-anthracite-light">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16 items-start">
          <div className="lg:col-span-2">
            <p className="label mb-6">{t('label')}</p>
            <span className="copper-line mb-8 block" />

            <h2 className="display text-[36px] md:text-[44px] mb-4">
              {t('headlineLine1')}<br />
              <span className="display-italic">{t('headlineItalic')}</span>
            </h2>

            <p className="body-text mb-8 max-w-xs">
              {t('subhead')}
            </p>

            <ul className="flex flex-col gap-3">
              {trust.map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span
                    className="w-1 h-1 rounded-full flex-shrink-0"
                    style={{ background: 'var(--copper)' }}
                  />
                  <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-3">
            <div className="border border-anthracite-light bg-anthracite p-3 sm:p-6 md:p-8">
              <BookingWidget defaultTripType="hourly" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
