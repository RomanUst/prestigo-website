'use client'

// Phase 93 (plan 93-12; TRIP-03, TRIP-04; D-01, D-02, D-10, D-20): the booking box of a tour page (UI-SPEC Surface 3).
// Every amount is a prop from the server render, run through the shared pure tourFare and formatted by formatEUR;
// nothing here invents a price and the server re-computes at checkout (409 PRICE_CHANGED). No amount is typed in this file.

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { DayPicker } from 'react-day-picker'
import { CalendarDays, Minus, Plus, Users } from 'lucide-react'
import { useRouter } from '@/i18n/routing'
import { rtlLocales, type AppLocale } from '@/i18n/locales'
import { VEHICLE_CLASS_KEY, VEHICLE_CONFIG, type VehicleConfig } from '@/types/booking'
import { formatEUR } from '@/lib/currency'
import { formatLocaleDate } from '@/lib/locale-date'
import { getPragueTodayISO } from '@/lib/prague-date'
import { classesForPassengers, tourFare } from '@/lib/tours/pricing'
import type { TourCarKey } from '@/lib/tours/types'
import { buildTourCheckoutHref, MAX_TOUR_PASSENGERS, tourBoxStorageKey } from '@/lib/tours/checkout-query'
import { isDateBookable, isStartBookable, startTimeOptions } from '@/lib/tours/start-times'

export interface TourBoxState {
  complete: boolean
  totalEur: number | null
  fromEur: number | null
}

export interface TourBookingBoxHandle {
  /** Moves focus to the first missing field (date, then start time, then car). */
  focusFirstMissing(): void
  /** The 'Book this trip' action: goes to the checkout when complete, else shows the errors and focuses the first missing field. */
  book(): void
}

export interface TourBookingBoxProps {
  slug: string
  title: string
  hoursIncluded: number
  prices: Record<TourCarKey, number | null>
  extraHourPrices: Record<TourCarKey, number | null>
  startMin: string
  startMax: string
  freeCancelHours: number
  onStateChange?: (s: TourBoxState) => void
  boxRef?: Ref<HTMLElement>
}

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper'

const CONFIG_BY_KEY = Object.fromEntries(VEHICLE_CONFIG.map((v) => [v.key, v])) as Record<TourCarKey, VehicleConfig>

// Dark theme overrides for the inline DayPicker (same set the booking wizard uses).
const calendarStyles = {
  root: { fontFamily: 'var(--font-montserrat)', color: 'var(--offwhite)', background: 'transparent' },
  caption_label: { color: 'var(--offwhite)', fontSize: 12, fontWeight: 400, fontFamily: 'var(--font-montserrat)', letterSpacing: '0.18em', textTransform: 'uppercase' as const },
  weekday: { color: 'var(--warmgrey)', fontSize: 12, fontWeight: 400 },
  day: { color: 'var(--offwhite)', fontSize: 13, width: 36, height: 36 },
  day_button: { color: 'var(--offwhite)', fontSize: 13, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', border: 'none' },
  nav: { color: 'var(--copper)' },
  button_previous: { color: 'var(--copper)', border: '1px solid var(--copper)', background: 'transparent', cursor: 'pointer', width: 32, height: 32 },
  button_next: { color: 'var(--copper)', border: '1px solid var(--copper)', background: 'transparent', cursor: 'pointer', width: 32, height: 32 },
  chevron: { fill: 'var(--copper)', width: 16, height: 16 },
}

const calendarModifiers = {
  selected: { background: 'var(--copper)', color: 'var(--anthracite)', borderRadius: 0 },
  disabled: { color: 'var(--warmgrey)', opacity: 0.4, cursor: 'not-allowed' },
  today: { outline: '1px solid var(--anthracite-light)', outlineOffset: '-2px' },
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Index of the next enabled item for an arrow key, or null for any other key. */
function arrowStep(key: string, rtl: boolean): 1 | -1 | null {
  if (key === 'ArrowDown') return 1
  if (key === 'ArrowUp') return -1
  if (key === 'ArrowRight') return rtl ? -1 : 1
  if (key === 'ArrowLeft') return rtl ? 1 : -1
  return null
}

const TourBookingBox = forwardRef<TourBookingBoxHandle, TourBookingBoxProps>(function TourBookingBox(
  { slug, prices, extraHourPrices, startMin, startMax, onStateChange, boxRef },
  handleRef
) {
  const t = useTranslations('Tours.box')
  const tv = useTranslations('Booking')
  const locale = useLocale()
  const router = useRouter()
  const rtl = rtlLocales.includes(locale as AppLocale)
  const uid = useId()

  const tourPrices = useMemo(
    () => ({ price_e_eur: prices.business, price_s_eur: prices.first_class, price_v_eur: prices.business_van }),
    [prices]
  )
  const extraPrices = useMemo(
    () => ({
      extra_hour_e_eur: extraHourPrices.business,
      extra_hour_s_eur: extraHourPrices.first_class,
      extra_hour_v_eur: extraHourPrices.business_van,
    }),
    [extraHourPrices]
  )

  /** Price of a class for the extra hours; null when the class has no price (or no extra-hour price while extra > 0). */
  function fareFor(car: TourCarKey, extra: number): number | null {
    try {
      return tourFare(tourPrices, extraPrices, car, extra)
    } catch {
      return null
    }
  }

  /** The classes shown for a party size: they fit the cabin and have a price for the extra hours. */
  function visibleFor(n: number, extra: number): TourCarKey[] {
    return classesForPassengers(n).filter((k) => fareFor(k, extra) !== null)
  }

  /** Keeps a still-fitting choice, clears one that no longer fits, and picks the only class when just one is shown. */
  function settleCar(current: TourCarKey | null, n: number, extra: number): TourCarKey | null {
    const visible = visibleFor(n, extra)
    if (visible.length === 1) return visible[0]
    return current && visible.includes(current) ? current : null
  }

  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [pax, setPax] = useState(2)
  const [car, setCar] = useState<TourCarKey | null>(() => settleCar(null, 2, 0))
  const [xh] = useState(0)
  const [dateOpen, setDateOpen] = useState(false)

  const dateBtnRef = useRef<HTMLButtonElement>(null)
  const timeGroupRef = useRef<HTMLDivElement>(null)
  const carGroupRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const pendingChipFocus = useRef(false)

  const options = useMemo(() => startTimeOptions(startMin, startMax), [startMin, startMax])
  const visible = visibleFor(pax, xh)
  const enabledTimes = date ? options.filter((o) => isStartBookable(date, o, Date.now())) : []
  const tabbableTime = time && enabledTimes.includes(time) ? time : (enabledTimes[0] ?? null)
  const tabbableCar = car && visible.includes(car) ? car : (visible[0] ?? null)

  const carFare = car ? fareFor(car, xh) : null
  const fromEur = useMemo(() => {
    const fares = visible.map((k) => fareFor(k, xh)).filter((v): v is number => v !== null)
    return fares.length ? Math.min(...fares) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.join(','), xh, tourPrices, extraPrices])
  const complete = Boolean(date && time && car)

  useEffect(() => {
    onStateChange?.({ complete, totalEur: carFare, fromEur })
  }, [complete, carFare, fromEur, onStateChange])

  // After a day is chosen the panel closes and focus moves to the first enabled time chip (UI-SPEC 3.3).
  useEffect(() => {
    if (!pendingChipFocus.current || dateOpen) return
    pendingChipFocus.current = false
    timeGroupRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus()
  }, [date, dateOpen])

  function selectDate(d: Date | undefined) {
    if (!d) return
    const iso = isoOf(d)
    setDate(iso)
    if (time && !isStartBookable(iso, time, Date.now())) setTime(null)
    setDateOpen(false)
    pendingChipFocus.current = true
  }

  function closeDatePanel() {
    setDateOpen(false)
    dateBtnRef.current?.focus()
  }

  function onChipKeyDown(e: KeyboardEvent<HTMLButtonElement>, current: string) {
    const step = arrowStep(e.key, rtl)
    if (step === null || enabledTimes.length === 0) return
    e.preventDefault()
    const idx = enabledTimes.indexOf(current)
    const next = enabledTimes[(idx + step + enabledTimes.length) % enabledTimes.length]
    setTime(next)
    chipRefs.current[next]?.focus()
  }

  function onRowKeyDown(e: KeyboardEvent<HTMLButtonElement>, current: TourCarKey) {
    const step = arrowStep(e.key, rtl)
    if (step === null || visible.length === 0) return
    e.preventDefault()
    const idx = visible.indexOf(current)
    const next = visible[(idx + step + visible.length) % visible.length]
    setCar(next)
    rowRefs.current[next]?.focus()
  }

  function changePax(delta: number) {
    const n = Math.min(MAX_TOUR_PASSENGERS, Math.max(1, pax + delta))
    if (n === pax) return
    setPax(n)
    setCar(settleCar(car, n, xh))
  }

  function focusFirstMissing() {
    if (!date) {
      dateBtnRef.current?.focus()
    } else if (!time) {
      timeGroupRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus()
    } else if (!car) {
      carGroupRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus()
    }
  }

  function book() {
    if (!date || !time || !car) {
      focusFirstMissing()
      return
    }
    const q = { tour: slug, date, time, pax, car, xh }
    try {
      sessionStorage.setItem(tourBoxStorageKey(slug), JSON.stringify({ date, time, pax, car, xh }))
    } catch {
      /* storage blocked: the checkout link still carries everything */
    }
    router.push(buildTourCheckoutHref(q))
  }

  useImperativeHandle(handleRef, () => ({ focusFirstMissing, book }))

  const labelClass = 'label'
  const mutedSmall = 'text-[11px] font-light leading-[1.5] text-warmgrey'
  const stepperBtn = `flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] border border-anthracite-light text-offwhite transition-colors duration-200 hover:border-copper disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-anthracite-light ${FOCUS_RING}`

  return (
    <section
      ref={boxRef}
      aria-labelledby={`${uid}-heading`}
      className="rounded-[4px] border border-anthracite-light bg-anthracite-mid p-4 sm:p-6"
    >
      <h2 id={`${uid}-heading`} className="m-0">
        <span className="sr-only">{t('heading')} </span>
        {!car && fromEur !== null && (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[11px] font-normal uppercase text-warmgrey">{t('from')}</span>
            <bdi className="font-display text-[24px] font-normal leading-none text-offwhite">{formatEUR(fromEur)}</bdi>
            <span className="text-[11px] font-normal text-warmgrey">{t('perCar')}</span>
          </span>
        )}
      </h2>

      <div className="mt-6 flex flex-col gap-6">
        {/* Date */}
        <div>
          <span id={`${uid}-date-label`} className={labelClass}>{t('date')}</span>
          <button
            ref={dateBtnRef}
            type="button"
            aria-labelledby={`${uid}-date-label ${uid}-date-value`}
            aria-expanded={dateOpen}
            aria-controls={`${uid}-date-panel`}
            onClick={() => setDateOpen((v) => !v)}
            className={`mt-2 flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[4px] border border-anthracite-light bg-anthracite px-4 py-3 text-start text-[14px] ${FOCUS_RING}`}
          >
            <span id={`${uid}-date-value`} className={date ? 'text-offwhite' : 'text-warmgrey'}>
              {date ? formatLocaleDate(date, locale) : t('chooseDate')}
            </span>
            <CalendarDays className="h-4 w-4 shrink-0 text-copper-light" aria-hidden="true" />
          </button>
          {dateOpen && (
            <div
              id={`${uid}-date-panel`}
              className="mt-2 flex justify-center rounded-[4px] border border-anthracite-light bg-anthracite p-2"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  closeDatePanel()
                }
              }}
            >
              <DayPicker
                mode="single"
                dir={rtl ? 'rtl' : 'ltr'}
                selected={date ? dateOf(date) : undefined}
                defaultMonth={dateOf(date ?? getPragueTodayISO())}
                onSelect={selectDate}
                disabled={(d: Date) => !isDateBookable(isoOf(d), startMin, startMax, Date.now())}
                styles={calendarStyles as Parameters<typeof DayPicker>[0]['styles']}
                modifiersStyles={calendarModifiers}
              />
            </div>
          )}
        </div>

        {/* Start time */}
        <div>
          <div className="flex items-baseline gap-2">
            <span id={`${uid}-time-label`} className={labelClass}>{t('time')}</span>
            <span className={mutedSmall}>{t('pragueTime')}</span>
          </div>
          <div
            ref={timeGroupRef}
            role="radiogroup"
            aria-labelledby={`${uid}-time-label`}
            className="mt-2 grid grid-cols-3 gap-2"
          >
            {options.map((o) => {
              const enabled = enabledTimes.includes(o)
              const selected = time === o
              return (
                <button
                  key={o}
                  ref={(el) => {
                    chipRefs.current[o] = el
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={!enabled}
                  tabIndex={enabled && tabbableTime === o ? 0 : -1}
                  onClick={() => {
                    if (enabled) setTime(o)
                  }}
                  onKeyDown={(e) => {
                    if (enabled) onChipKeyDown(e, o)
                  }}
                  className={`min-h-[44px] rounded-[4px] border px-2 text-[14px] font-normal transition-colors duration-200 ${FOCUS_RING} ${
                    selected ? 'border-2 border-copper text-copper' : 'border-anthracite-light text-offwhite'
                  } ${enabled ? 'cursor-pointer hover:border-copper' : 'cursor-not-allowed opacity-40'}`}
                >
                  <bdi dir="ltr">{o}</bdi>
                </button>
              )
            })}
          </div>
          {!date && <p className={`mt-2 ${mutedSmall}`}>{t('dateFirst')}</p>}
        </div>

        {/* Passengers */}
        <div>
          <span id={`${uid}-pax-label`} className={labelClass}>{t('passengers')}</span>
          <div className="mt-2 flex items-center gap-3">
            <button type="button" aria-label={t('fewer')} disabled={pax <= 1} onClick={() => changePax(-1)} className={stepperBtn}>
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <output aria-labelledby={`${uid}-pax-label`} aria-live="polite" className="min-w-8 text-center text-[14px] font-normal text-offwhite">
              {pax}
            </output>
            <button type="button" aria-label={t('more')} disabled={pax >= MAX_TOUR_PASSENGERS} onClick={() => changePax(1)} className={stepperBtn}>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className={`mt-2 ${mutedSmall}`}>{t('paxHelper')}</p>
        </div>

        {/* Car */}
        <div>
          <span id={`${uid}-car-label`} className={labelClass}>{t('car')}</span>
          <div ref={carGroupRef} role="radiogroup" aria-labelledby={`${uid}-car-label`} className="mt-2 flex flex-col gap-2">
            {visible.map((key) => {
              const config = CONFIG_BY_KEY[key]
              const fare = fareFor(key, xh)
              const selected = car === key
              return (
                <button
                  key={key}
                  ref={(el) => {
                    rowRefs.current[key] = el
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={tabbableCar === key ? 0 : -1}
                  onClick={() => setCar(key)}
                  onKeyDown={(e) => onRowKeyDown(e, key)}
                  className={`relative flex min-h-[72px] w-full items-center gap-3 overflow-hidden rounded-[4px] bg-anthracite px-4 py-3 text-start transition-colors duration-200 ${FOCUS_RING} ${
                    selected ? 'border-2 border-copper' : 'border border-anthracite-light hover:border-copper'
                  }`}
                >
                  {selected && <span aria-hidden="true" className="absolute inset-y-0 start-0 w-[3px] bg-copper" />}
                  <Image src={config.image} alt="" width={72} height={44} className="h-11 w-[72px] shrink-0 object-contain" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[14px] font-normal text-offwhite">
                      {tv(`vehicleClasses.${VEHICLE_CLASS_KEY[key]}.label`)}
                    </span>
                    <span className="text-[11px] font-light text-warmgrey">{config.model}</span>
                    <span className="flex items-center gap-1 text-[11px] font-normal text-warmgrey" title={t('carUpTo', { count: config.maxPassengers })}>
                      <Users className="h-4 w-4" aria-hidden="true" />
                      <span aria-label={t('carUpTo', { count: config.maxPassengers })}>{config.maxPassengers}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    {fare !== null && (
                      <bdi className={`font-display text-[24px] font-normal leading-none ${selected ? 'text-copper-light' : 'text-offwhite'}`}>
                        {formatEUR(fare)}
                      </bdi>
                    )}
                    <span className="mt-1 text-[11px] font-normal text-warmgrey">{t('perCar')}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <button type="button" className="btn-primary w-full" onClick={book}>
          {t('cta')}
        </button>
      </div>
    </section>
  )
})

export default TourBookingBox
