'use client'

// Phase 93 (plan 93-18; TRIP-04; UI-SPEC Surface 4.2): the trip summary of the tour checkout. Below 1024px it is a
// collapsible card ("Your trip" with the total, collapsed by default, aria-expanded); from 1024px it is always open and
// sticky. Every value is a prop: the total is the server's init amount once it is known (the client fare before), and
// nothing here prices anything. Addresses and the total sit in <bdi>, the time in <bdi dir="ltr"> (RTL pages).

import { useId, useState } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import { VEHICLE_CLASS_KEY, VEHICLE_CONFIG } from '@/types/booking'
import { formatLocaleDate } from '@/lib/locale-date'
import type { TourCarKey } from '@/lib/tours/types'

export interface TourTripSummaryProps {
  title: string
  /** Public URL of the cover photo; '' or null renders no photo. */
  coverUrl?: string | null
  date: string
  time: string
  pax: number
  car: TourCarKey
  hoursIncluded: number
  extraHours: number
  /** The chosen pickup address; the row is not rendered until there is one. */
  pickupAddress: string | null
  /** The total as displayed (server amount after init, client fare before). */
  totalLabel: string
  /** The tour page with '#book' (the box restores its choices from sessionStorage). */
  changeHref: string
  /** Runs on click of 'Change trip details', before the browser follows the link (keeps tour-box:<slug> current). */
  onChangeTrip?: () => void
}

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper'

export default function TourTripSummary({
  title,
  coverUrl,
  date,
  time,
  pax,
  car,
  hoursIncluded,
  extraHours,
  pickupAddress,
  totalLabel,
  changeHref,
  onChangeTrip,
}: TourTripSummaryProps) {
  const t = useTranslations('Tours.checkout')
  const tb = useTranslations('Booking')
  const locale = useLocale()
  const uid = useId()
  const panelId = `${uid}-panel`
  const [open, setOpen] = useState(false)

  const config = VEHICLE_CONFIG.find((v) => v.key === car)
  const carLabel = tb(`vehicleClasses.${VEHICLE_CLASS_KEY[car]}.label`)

  const labelClass = 'label'
  const valueClass = 'mt-1 text-[14px] font-light leading-[1.5] text-offwhite'

  return (
    <aside aria-label={t('yourTrip')} className="lg:sticky lg:top-[88px]">
      <div className="rounded-[4px] border border-anthracite-light bg-anthracite-mid">
        {/* Below 1024px: the collapsible header with the total. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className={`flex min-h-[44px] w-full items-center justify-between gap-4 p-4 text-start lg:hidden ${FOCUS_RING}`}
        >
          <span className={labelClass}>{t('yourTrip')}</span>
          <span className="flex items-center gap-3">
            <bdi className="font-display text-[24px] font-normal leading-none text-copper-light">{totalLabel}</bdi>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`text-copper-light transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
            />
          </span>
        </button>

        <div id={panelId} className={`${open ? 'block' : 'hidden'} p-6 pt-2 lg:block lg:pt-6`}>
          {coverUrl ? (
            <div className="relative mb-6 hidden aspect-[4/3] overflow-hidden rounded-[4px] lg:block">
              <Image src={coverUrl} alt="" fill sizes="(min-width: 1024px) 40vw, 0px" className="object-cover" />
            </div>
          ) : null}

          <h2 className="m-0 font-display text-[24px] font-normal leading-[1.2] text-offwhite">{title}</h2>

          <dl className="mt-6 flex flex-col gap-4">
            <div>
              <dt className={labelClass}>{t('date')}</dt>
              <dd className={`${valueClass} font-normal`}>{formatLocaleDate(date, locale)}</dd>
            </div>
            <div>
              <dt className={labelClass}>{t('start')}</dt>
              <dd className={valueClass}>
                {t('startValue', { time })}
              </dd>
            </div>
            <div>
              <dt className={labelClass}>{t('passengers')}</dt>
              <dd className={valueClass}>{pax}</dd>
            </div>
            <div>
              <dt className={labelClass}>{t('car')}</dt>
              <dd className={valueClass}>
                {carLabel}
                {config ? <span className="text-warmgrey"> {config.model}</span> : null}
              </dd>
            </div>
            <div>
              <dt className={labelClass}>{t('timeAtDest')}</dt>
              <dd className={valueClass}>
                {t('included', { hours: hoursIncluded })}
                {extraHours > 0 ? <span> {t('extra', { count: extraHours })}</span> : null}
              </dd>
            </div>
            {pickupAddress ? (
              <div>
                <dt className={labelClass}>{t('pickupReturn')}</dt>
                <dd className={valueClass}>
                  <bdi dir="auto">{pickupAddress}</bdi>
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-anthracite-light pt-4">
            <span className="text-[14px] font-normal text-offwhite">{t('totalPerCar')}</span>
            <bdi
              className="font-display text-[24px] font-normal leading-none text-copper-light"
              aria-live="polite"
              data-testid="summary-total"
            >
              {totalLabel}
            </bdi>
          </div>

          <a
            href={changeHref}
            onClick={onChangeTrip}
            className={`cta-text mt-6 inline-flex min-h-[44px] items-center ${FOCUS_RING}`}
          >
            {t('change')}
          </a>
        </div>
      </div>
    </aside>
  )
}
