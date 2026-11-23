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
import { CalendarDays, CreditCard, Minus, Plus, ShieldCheck, Users } from 'lucide-react'
import { Link, useRouter } from '@/i18n/routing'
import { rtlLocales, type AppLocale } from '@/i18n/locales'
import { VEHICLE_CLASS_KEY, VEHICLE_CONFIG, type VehicleConfig } from '@/types/booking'
import { formatEUR } from '@/lib/currency'
import { formatLocaleDate } from '@/lib/locale-date'
import { getPragueTodayISO } from '@/lib/prague-date'
import { classesForPassengers, tourFare } from '@/lib/tours/pricing'
import { MAX_EXTRA_HOURS, TOUR_CAR_KEYS, type TourCarKey } from '@/lib/tours/types'
import { customTourHref } from '@/lib/tours/custom-tour-link'
import { buildTourCheckoutHref, MAX_TOUR_PASSENGERS, tourBoxStorageKey } from '@/lib/tours/checkout-query'
import { ALL_START_TIMES, isDateBookable, isStartBookable, START_MINUTES, startHours } from '@/lib/tours/start-times'

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
  freeCancelHours: number
  onStateChange?: (s: TourBoxState) => void
  boxRef?: Ref<HTMLElement>
  /**
   * Starting values, e.g. restored from sessionStorage for 'Change trip details' (93-13). Every field is checked
   * again here (a date that is no longer bookable, a time outside the window, a car that does not fit are dropped),
   * so a stale or tampered value can only leave the box emptier, never invalid.
   */
  initial?: Partial<{ date: string; time: string; pax: number; car: TourCarKey; xh: number }>
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
  { slug, hoursIncluded, prices, extraHourPrices, freeCancelHours, onStateChange, boxRef, initial },
  handleRef
) {
  const t = useTranslations('Tours.box')
  const tf = useTranslations('Tours.facts')
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

  // The validated starting state (defaults when there is no `initial` or a value does not hold up).
  const [seed] = useState(() => {
    const now = Date.now()
    const pax =
      Number.isInteger(initial?.pax) && initial!.pax! >= 1 && initial!.pax! <= MAX_TOUR_PASSENGERS ? initial!.pax! : 2
    const xh =
      Number.isInteger(initial?.xh) && initial!.xh! >= 0 && initial!.xh! <= MAX_EXTRA_HOURS ? initial!.xh! : 0
    const date =
      typeof initial?.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(initial.date) &&
      isDateBookable(initial.date, now)
        ? initial.date
        : null
    const time =
      date &&
      typeof initial?.time === 'string' &&
      ALL_START_TIMES.includes(initial.time) &&
      isStartBookable(date, initial.time, now)
        ? initial.time
        : null
    const wanted = (TOUR_CAR_KEYS as readonly string[]).includes(initial?.car as string) ? (initial!.car as TourCarKey) : null
    return { date, time, pax, xh, car: settleCar(wanted, pax, xh) }
  })

  const [date, setDate] = useState<string | null>(seed.date)
  const [time, setTime] = useState<string | null>(seed.time)
  const [pax, setPax] = useState(seed.pax)
  const [car, setCar] = useState<TourCarKey | null>(seed.car)
  const [xh, setXh] = useState(seed.xh)
  const [attempted, setAttempted] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)

  const dateBtnRef = useRef<HTMLButtonElement>(null)
  const timeGroupRef = useRef<HTMLDivElement>(null)
  const carGroupRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const pendingChipFocus = useRef(false)

  const options = ALL_START_TIMES
  const visible = visibleFor(pax, xh)
  const enabledTimes = date ? options.filter((o) => isStartBookable(date, o, Date.now())) : []
  const hours = useMemo(() => startHours(options), [options])
  const selectedHour = time ? time.slice(0, 2) : null
  const selectedMinute = time ? time.slice(3, 5) : null
  const hourEnabled = (h: string) => enabledTimes.some((o) => o.startsWith(`${h}:`))
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
    timeGroupRef.current?.querySelector<HTMLElement>('button:not([aria-disabled="true"])')?.focus()
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

  // Hour first (like the main booking engine): keep the chosen minute when that start exists in the new hour,
  // otherwise take the first bookable minute of the hour.
  function selectHour(h: string) {
    if (!hourEnabled(h)) return
    const keep = selectedMinute ? `${h}:${selectedMinute}` : null
    setTime(keep && enabledTimes.includes(keep) ? keep : (enabledTimes.find((o) => o.startsWith(`${h}:`)) ?? null))
  }

  function selectMinute(m: string) {
    if (!selectedHour) return
    const next = `${selectedHour}:${m}`
    if (enabledTimes.includes(next)) setTime(next)
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

  function changeExtra(delta: number) {
    const n = Math.min(MAX_EXTRA_HOURS, Math.max(0, xh + delta))
    if (n === xh) return
    setXh(n)
    setCar(settleCar(car, pax, n))
  }

  function selectCar(key: TourCarKey) {
    setCar(key)
    // A class with no extra-hour price cannot carry extra time (the stepper is hidden for it).
    if (xh > 0 && fareFor(key, xh) === null) setXh(0)
  }

  function focusFirstMissing(force?: { time?: boolean }) {
    if (!date) {
      dateBtnRef.current?.focus()
    } else if (!time || force?.time) {
      timeGroupRef.current?.querySelector<HTMLElement>('button:not([aria-disabled="true"])')?.focus()
    } else if (!car) {
      carGroupRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus()
    }
  }

  function book() {
    // A start that slipped inside the lead time while the page was open counts as missing.
    const timeOk = Boolean(date && time && isStartBookable(date, time, Date.now()))
    if (date && time && !timeOk) setTime(null)
    if (!date || !time || !timeOk || !car) {
      setAttempted(true)
      focusFirstMissing(!timeOk ? { time: true } : undefined)
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

  useImperativeHandle(handleRef, () => ({ focusFirstMissing: () => focusFirstMissing(), book }))

  const errDate = attempted && !date
  const errTime = attempted && !time
  const errCar = attempted && !car
  const firstError = errDate ? 'date' : errTime ? 'time' : errCar ? 'car' : null
  const showStepper = !car || fareFor(car, 1) !== null
  const extraPrice = car ? extraHourPrices[car] : null
  const maxedPax = pax >= MAX_TOUR_PASSENGERS
  const maxedExtra = xh >= MAX_EXTRA_HOURS
  const customHref = customTourHref({ tour: slug, date: date ?? undefined, pax })
  const customLink = (chunks: React.ReactNode) => (
    <Link href={customHref} className={`text-copper-light underline underline-offset-2 hover:text-copper-pale ${FOCUS_RING}`}>
      {chunks}
    </Link>
  )
  const errorClass = 'mt-2 text-[14px] font-light text-[#f87171]'
  const errorProps = (field: 'date' | 'time' | 'car') => (firstError === field ? { role: 'alert' as const } : {})

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
            aria-invalid={errDate || undefined}
            aria-describedby={errDate ? `${uid}-date-err` : undefined}
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
                disabled={(d: Date) => !isDateBookable(isoOf(d), Date.now())}
                styles={calendarStyles as Parameters<typeof DayPicker>[0]['styles']}
                modifiersStyles={calendarModifiers}
              />
            </div>
          )}
        </div>

        {errDate && (
          <p id={`${uid}-date-err`} className={`-mt-4 ${errorClass}`} {...errorProps('date')}>
            {t('errDate')}
          </p>
        )}

        {/* Start time */}
        <div>
          <div className="flex items-baseline gap-2">
            <span id={`${uid}-time-label`} className={labelClass}>{t('time')}</span>
            <span className={mutedSmall}>{t('pragueTime')}</span>
          </div>
          <div
            ref={timeGroupRef}
            role="group"
            aria-labelledby={`${uid}-time-label`}
            aria-describedby={errTime ? `${uid}-time-err` : undefined}
            className="mt-2 grid grid-cols-2 gap-3"
          >
            <TimeColumn
              label={tv('step2.hourLabel')}
              aria={tv('step2.hourAria')}
              values={hours}
              selected={selectedHour}
              isEnabled={(h) => Boolean(date) && hourEnabled(h)}
              onSelect={selectHour}
            />
            <TimeColumn
              label={tv('step2.minuteLabel')}
              aria={tv('step2.minuteAria')}
              values={START_MINUTES}
              selected={selectedMinute}
              isEnabled={(m) => Boolean(selectedHour) && enabledTimes.includes(`${selectedHour}:${m}`)}
              onSelect={selectMinute}
            />
          </div>
          {!date && <p className={`mt-2 ${mutedSmall}`}>{t('dateFirst')}</p>}
          {errTime && (
            <p id={`${uid}-time-err`} className={errorClass} {...errorProps('time')}>
              {t('errTime')}
            </p>
          )}
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
          {maxedPax && (
            <p className={`mt-1 ${mutedSmall}`}>{t.rich('paxMore', { count: MAX_TOUR_PASSENGERS, link: customLink })}</p>
          )}
        </div>

        {/* Car */}
        <div>
          <span id={`${uid}-car-label`} className={labelClass}>{t('car')}</span>
          <div
            ref={carGroupRef}
            role="radiogroup"
            aria-labelledby={`${uid}-car-label`}
            aria-describedby={errCar ? `${uid}-car-err` : undefined}
            className="mt-2 flex flex-col gap-2"
          >
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
                  onClick={() => selectCar(key)}
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
                    </span>{' '}
                    <span className="text-[11px] font-light text-warmgrey">{config.model}</span>{' '}
                    <span className="flex items-center gap-1 text-[11px] font-normal text-warmgrey" title={t('carUpTo', { count: config.maxPassengers })}>
                      <Users className="h-4 w-4" aria-hidden="true" />
                      <span aria-label={t('carUpTo', { count: config.maxPassengers })}>{config.maxPassengers}</span>
                    </span>
                  </span>{' '}
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
          {classesForPassengers(pax).length < TOUR_CAR_KEYS.length && (
            <p className={`mt-2 ${mutedSmall}`}>{t('onlyFit', { count: pax })}</p>
          )}
          {errCar && (
            <p id={`${uid}-car-err`} className={errorClass} {...errorProps('car')}>
              {t('errCar')}
            </p>
          )}
        </div>

        {/* Extra time and total */}
        {showStepper && (
          <div>
            <span id={`${uid}-extra-label`} className={labelClass}>{t('extra')}</span>
            <div className="mt-2 flex items-center gap-3">
              <button type="button" aria-label={t('lessTime')} disabled={xh <= 0} onClick={() => changeExtra(-1)} className={stepperBtn}>
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <output aria-labelledby={`${uid}-extra-label`} aria-live="polite" className="min-w-28 text-center text-[14px] font-normal text-offwhite">
                {xh === 0 ? t('extraNone') : t('extraCount', { count: xh })}
              </output>
              <button type="button" aria-label={t('moreTime')} disabled={maxedExtra} onClick={() => changeExtra(1)} className={stepperBtn}>
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className={`mt-2 ${mutedSmall}`}>
              {car && extraPrice !== null
                ? t('extraHelperCar', { hours: hoursIncluded, amount: formatEUR(extraPrice) })
                : t('extraHelperNoCar', { hours: hoursIncluded })}
            </p>
            {maxedExtra && <p className={`mt-1 ${mutedSmall}`}>{t.rich('extraMax', { link: customLink })}</p>}
          </div>
        )}

        {car && carFare !== null && (
          <div className="border-t border-anthracite-light pt-4">
            <div aria-live="polite" className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-normal text-offwhite">{t('total')}</span>
              <bdi className="font-display text-[24px] font-normal leading-none text-copper-light">{formatEUR(carFare)}</bdi>
            </div>
            <p className={`mt-1 ${mutedSmall}`}>{t('totalHours', { hours: hoursIncluded + xh })}</p>
          </div>
        )}

        <button type="button" className="btn-primary w-full" onClick={book}>
          {t('cta')}
        </button>

        <ul className="flex list-none flex-col gap-2 p-0">
          <li className={`flex items-start gap-2 ${mutedSmall}`}>
            <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-copper-light" aria-hidden="true" />
            <span>{tf('freeCancel', { hours: freeCancelHours })}</span>
          </li>
          <li className={`flex items-start gap-2 ${mutedSmall}`}>
            <CreditCard className="mt-px h-4 w-4 shrink-0 text-copper-light" aria-hidden="true" />
            <span>{tf('payLater')}</span>
          </li>
        </ul>
      </div>
    </section>
  )
})

export default TourBookingBox

/** One column of the start-time picker (hour or minute), the same scrolling list as the main booking engine. */
function TimeColumn({
  label,
  aria,
  values,
  selected,
  isEnabled,
  onSelect,
}: {
  label: string
  aria: string
  values: readonly string[]
  selected: string | null
  isEnabled: (v: string) => boolean
  onSelect: (v: string) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!selected) return
    listRef.current?.querySelector<HTMLElement>(`[data-value="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  return (
    <div>
      <span className="mb-2 block font-body text-[11px] font-normal uppercase tracking-[0.12em] text-warmgrey">{label}</span>
      <div ref={listRef} role="group" aria-label={aria} className="max-h-[200px] overflow-y-auto border border-anthracite-light">
        {values.map((v) => {
          const enabled = isEnabled(v)
          const on = selected === v
          return (
            <button
              key={v}
              type="button"
              data-value={v}
              aria-pressed={on}
              aria-disabled={!enabled}
              onClick={() => {
                if (enabled) onSelect(v)
              }}
              className={`flex min-h-[44px] w-full items-center justify-center border-s-4 font-body text-[14px] tracking-[0.05em] transition-colors duration-150 ${FOCUS_RING} ${
                on && enabled ? 'border-copper bg-anthracite-mid text-offwhite' : 'border-transparent text-warmgrey'
              } ${enabled ? 'cursor-pointer hover:bg-anthracite-mid hover:text-offwhite' : 'cursor-not-allowed opacity-35'}`}
            >
              <bdi dir="ltr">{v}</bdi>
            </button>
          )
        })}
      </div>
    </div>
  )
}
