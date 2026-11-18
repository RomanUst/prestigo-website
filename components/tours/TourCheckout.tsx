'use client'

// Phase 93 (plan 93-18; TRIP-04; D-09, D-10, D-11; UI-SPEC Surface 4): the two-stage tour checkout.
// Stage A collects the pickup address in Prague, the contact details and the wishes; 'Continue to payment' asks
// /api/card-checkout/init (tripType 'tour') whether and how this trip can be booked, then Stage B mounts the shared
// CardPaymentStage (card hold or cash with card guarantee) with the server's amount and the tour terms.
// Own state only: this page is never the /book wizard and never reads its store (RESEARCH Pitfall 6). The client
// sends no amount, ever: the server prices the trip from the tour row and tour_settings; the payment stage sends
// only the displayed values for its cross-check. Every price shown here is the server's init amount, or the client
// fare the server page computed with the same pure tourFare until init answers.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { LoaderCircle } from 'lucide-react'
import AddressInputNew from '@/components/booking/AddressInputNew'
import { CardPaymentStage, type PaymentChoice } from '@/components/booking/CardPaymentStage'
import { parseInitPolicy, type InitEligible } from '@/components/booking/steps/cardCheckoutApi'
import PickupRefusalPanel, { GuidancePanel, type PickupRefusal } from '@/components/tours/PickupRefusalPanel'
import TourTripSummary from '@/components/tours/TourTripSummary'
import { Link } from '@/i18n/routing'
import { localizedHref } from '@/lib/localized-href'
import { formatEUR } from '@/lib/currency'
import { formatMinor } from '@/lib/payments/money'
import { MIN_BOOKING_LEAD_MS } from '@/lib/payments/timing'
import { isValidIntlPhone, normalizePhone, PHONE_PLACEHOLDER } from '@/lib/phone'
import { tourBoxStorageKey, type TourCheckoutQuery } from '@/lib/tours/checkout-query'
import { writeTourConfirmation } from '@/lib/tours/confirmation-snapshot'
import { customTourHref } from '@/lib/tours/custom-tour-link'
import { checkTourPickup } from '@/lib/tours/pickup-area'
import type { PlaceResult } from '@/types/booking'

export interface TourCheckoutProps {
  tour: { slug: string; title: string; hoursIncluded: number; coverUrl: string | null }
  query: TourCheckoutQuery
  /** The client fare in EUR (the shared tourFare, computed on the server page); shown until init answers. */
  fareEur: number
  /** tour_settings.pickup_radius_km: the client-side pickup check (UX only; the server repeats it). */
  pickupRadiusKm: number
}

type Field = 'pickup' | 'firstName' | 'lastName' | 'email' | 'phone'
type Phase = 'details' | 'checking' | 'payment'

/** A UUID for the attempt (the init / intent schema wants a well-formed one). */
function newAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper'

const inputClass = (invalid: boolean) =>
  `block w-full min-h-[44px] rounded-[4px] border bg-anthracite px-4 py-3 font-body text-[16px] font-light text-offwhite ${
    invalid ? 'border-[#f87171]' : 'border-anthracite-light'
  } ${FOCUS_RING}`

/** Why init refused a tour past the eligibility gate (93-17); absent for the opaque { eligible: false }. */
type RefusalReason = 'TOUR_UNAVAILABLE' | 'AIRPORT_PICKUP' | 'PICKUP_OUT_OF_AREA' | 'LEAD_TIME'
const REFUSAL_REASONS: readonly string[] = ['TOUR_UNAVAILABLE', 'AIRPORT_PICKUP', 'PICKUP_OUT_OF_AREA', 'LEAD_TIME']

type InitOutcome =
  | { kind: 'eligible'; init: InitEligible }
  | { kind: 'refused'; reason: RefusalReason | null }
  | { kind: 'network' }
  | { kind: 'server' }

/** POST /api/card-checkout/init for a tour. A non-2xx or malformed answer is a server error, a throw a network error. */
async function postInit(body: Record<string, unknown>): Promise<InitOutcome> {
  let res: Response
  try {
    res = await fetch('/api/card-checkout/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { kind: 'network' }
  }
  if (!res.ok) return { kind: 'server' }
  let data: Record<string, unknown>
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    return { kind: 'server' }
  }
  if (data.eligible === false) {
    const reason = typeof data.reason === 'string' && REFUSAL_REASONS.includes(data.reason) ? (data.reason as RefusalReason) : null
    return { kind: 'refused', reason }
  }
  const policy = parseInitPolicy(data.policy)
  if (
    data.eligible === true &&
    (data.mode === 'setup' || data.mode === 'hold_now') &&
    typeof data.amountMinor === 'number' &&
    (data.currency === 'eur' || data.currency === 'czk') &&
    policy
  ) {
    return {
      kind: 'eligible',
      init: {
        eligible: true,
        mode: data.mode,
        holdAtIso: typeof data.holdAtIso === 'string' ? data.holdAtIso : null,
        holdDateIso: typeof data.holdDateIso === 'string' ? data.holdDateIso : null,
        amountMinor: data.amountMinor,
        currency: data.currency,
        policy,
        cashAvailable: data.cashAvailable === true,
      },
    }
  }
  return { kind: 'server' }
}

export default function TourCheckout({ tour, query, fareEur, pickupRadiusKm }: TourCheckoutProps) {
  const t = useTranslations('Tours.checkout')
  const tv = useTranslations('Booking.validation')
  const tp = useTranslations('Booking.step6')
  const tc = useTranslations('Booking.step5')
  const tf = useTranslations('Footer')
  const locale = useLocale()

  const [pickup, setPickup] = useState<PlaceResult | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [wishes, setWishes] = useState('')
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [phase, setPhase] = useState<Phase>('details')
  const [init, setInit] = useState<InitEligible | null>(null)
  const [payment, setPayment] = useState<PaymentChoice>('card')
  const [serverRefusal, setServerRefusal] = useState<PickupRefusal | null>(null)
  const [panel, setPanel] = useState<'tooLate' | 'bookingOff' | 'unavailable' | null>(null)
  const [requestError, setRequestError] = useState<'network' | 'server' | null>(null)
  /** A 409 PRICE_CHANGED inside the stage: the summary follows the server's new amount. */
  const [amountMinor, setAmountMinor] = useState<number | null>(null)

  const stageBHeadingRef = useRef<HTMLHeadingElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const focusPhoneNext = useRef(false)

  // The attempt of this checkout: one id per attempt, renewed when the stage asks (payment switch, closed attempt).
  const attemptIdRef = useRef<string | null>(null)
  const attempt = useMemo(
    () => ({
      ensure: () => {
        if (!attemptIdRef.current) attemptIdRef.current = newAttemptId()
        return attemptIdRef.current
      },
      mark: () => {},
      renew: () => {
        attemptIdRef.current = newAttemptId()
      },
    }),
    [],
  )

  /** The trip part of the init and intent bodies; never carries an amount. */
  const buildBookingData = useCallback(
    (attemptId: string) => ({
      attemptId,
      tripType: 'tour',
      tourSlug: query.tour,
      extraHours: String(query.xh),
      vehicleClass: query.car,
      passengers: String(query.pax),
      pickupDate: query.date,
      pickupTime: query.time,
      originAddress: pickup?.address ?? '',
      originLat: pickup ? String(pickup.lat) : '',
      originLng: pickup ? String(pickup.lng) : '',
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: normalizePhone(phone) ?? phone.trim(),
      specialRequests: wishes,
      locale,
    }),
    [query, pickup, firstName, lastName, email, phone, wishes, locale],
  )

  const buildIntentBody = useCallback(
    (attemptId: string) => ({ bookingData: buildBookingData(attemptId) }),
    [buildBookingData],
  )

  const validate = (): boolean => {
    const next: Partial<Record<Field, string>> = {}
    if (!pickup) next.pickup = tv('originRequired')
    if (!firstName.trim()) next.firstName = tv('firstNameRequired')
    if (!lastName.trim()) next.lastName = tv('lastNameRequired')
    if (!EMAIL_RE.test(email.trim())) next.email = tv('invalidEmail')
    if (!isValidIntlPhone(phone)) next.phone = tv('invalidPhone')
    setErrors(next)
    const first = (['pickup', 'firstName', 'lastName', 'email', 'phone'] as Field[]).find((f) => next[f])
    if (first) document.getElementById(`tour-${first}`)?.focus()
    return !first
  }

  const handleContinue = async () => {
    if (phase !== 'details') return
    if (refusal) return
    if (!validate()) return
    setPhase('checking')
    setPanel(null)
    setRequestError(null)
    const outcome = await postInit({ bookingData: buildBookingData(attempt.ensure()), currency: 'eur' })
    if (outcome.kind === 'eligible') {
      setInit(outcome.init)
      setAmountMinor(null)
      setPhase('payment')
      return
    }
    if (outcome.kind === 'refused') {
      if (outcome.reason === 'AIRPORT_PICKUP') setServerRefusal('airport')
      else if (outcome.reason === 'PICKUP_OUT_OF_AREA') setServerRefusal('out_of_area')
      else if (outcome.reason === 'LEAD_TIME') setPanel('tooLate')
      else if (outcome.reason === 'TOUR_UNAVAILABLE') setPanel('unavailable')
      else setPanel('bookingOff')
    } else {
      setRequestError(outcome.kind)
    }
    setPhase('details')
  }

  const handleEdit = () => {
    setInit(null)
    setAmountMinor(null)
    setPhase('details')
  }

  /** The stage asked to leave the card flow (NOT_ELIGIBLE / MODE_UNSUPPORTED): the trip can no longer be booked online. */
  const handleFallback = useCallback(() => {
    setInit(null)
    setAmountMinor(null)
    setPanel('bookingOff')
    setPhase('details')
  }, [])

  // Focus: Stage B heading when it opens; the phone field when the server refused the phone.
  useEffect(() => {
    if (phase === 'payment') stageBHeadingRef.current?.focus()
  }, [phase])
  useEffect(() => {
    if (phase === 'details' && focusPhoneNext.current) {
      focusPhoneNext.current = false
      phoneRef.current?.focus()
    }
  }, [phase])

  const handleInvalidPhone = useCallback(() => {
    focusPhoneNext.current = true
    setErrors((e) => ({ ...e, phone: tv('invalidPhone') }))
    setInit(null)
    setPhase('details')
  }, [tv])

  const shownMinor = init ? (amountMinor ?? init.amountMinor) : null
  const totalLabel = init && shownMinor !== null ? formatMinor(shownMinor, init.currency) : formatEUR(fareEur)
  /**
   * The payment is confirmed: leave the confirmation page what it shows (T-93-51, display only), before the stage
   * navigates to /book/confirmation?ref=. A cash booking is the one with a cash label.
   */
  const handleConfirmed = ({ ref, cashLabel }: { ref: string; cashLabel: string | null }) => {
    if (!init || !pickup || shownMinor === null) return
    writeTourConfirmation({
      ref,
      title: tour.title,
      date: query.date,
      time: query.time,
      pickupAddress: pickup.address,
      carLabelKey: query.car,
      hoursIncluded: tour.hoursIncluded,
      extraHours: query.xh,
      payment: cashLabel ? 'cash' : 'card',
      amountLabel: cashLabel ?? formatMinor(shownMinor, init.currency),
    })
  }
  const customHref = customTourHref({ tour: tour.slug, date: query.date, pax: query.pax })
  // Client check of the picked address (UX only; init / intent repeat it on the server, T-93-49).
  const clientCheck = pickup
    ? checkTourPickup({ lat: pickup.lat, lng: pickup.lng, address: pickup.address }, pickupRadiusKm)
    : 'ok'
  const refusal: PickupRefusal | null =
    clientCheck === 'airport' ? 'airport' : clientCheck === 'out_of_area' ? 'out_of_area' : serverRefusal
  const leadHours = Math.round(MIN_BOOKING_LEAD_MS / 3_600_000)
  const tourHref = `${localizedHref(locale, `/services/${tour.slug}`) ?? `/services/${tour.slug}`}#book`
  const rememberBox = () => {
    try {
      window.sessionStorage.setItem(
        tourBoxStorageKey(tour.slug),
        JSON.stringify({ date: query.date, time: query.time, pax: query.pax, car: query.car, xh: query.xh }),
      )
    } catch {
      /* storage blocked: the tour page opens with an empty box */
    }
  }

  const totalEur = shownMinor !== null ? shownMinor / 100 : fareEur
  const analyticsItems = [
    {
      item_id: tour.slug,
      item_name: tour.title,
      item_category: 'tour',
      item_variant: query.car,
      price: totalEur,
      quantity: 1,
    },
  ]

  const busy = phase === 'checking'
  const labelClass = 'label mb-2 block'
  const errorClass = 'mt-2 text-[14px] font-light text-[#f87171]'
  const helperClass = 'mt-2 text-[11px] font-light leading-[1.5] text-warmgrey'

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
      <div className="order-2 lg:order-1 lg:col-span-7">
        {phase !== 'payment' ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void handleContinue()
            }}
            className="flex flex-col gap-8"
          >
            {/* 1. Pickup address in Prague */}
            <div>
              <AddressInputNew
                label={t('pickupLabel')}
                placeholder={t('pickupPlaceholder')}
                ariaLabel={t('pickupLabel')}
                value={pickup}
                onSelect={(place) => {
                  setPickup(place)
                  setServerRefusal(null)
                  setErrors((e) => ({ ...e, pickup: undefined }))
                }}
                onClear={() => {
                  setPickup(null)
                  setServerRefusal(null)
                }}
                hasError={Boolean(errors.pickup)}
                errorMessage={errors.pickup}
                required
              />
              {errors.pickup ? (
                <p id="tour-pickup" tabIndex={-1} className={errorClass}>
                  {errors.pickup}
                </p>
              ) : null}
              {refusal ? (
                <div className="mt-3">
                  <PickupRefusalPanel kind={refusal} customHref={customHref} />
                </div>
              ) : (
                <p className={helperClass}>{t('pickupHelper')}</p>
              )}
            </div>

            {/* 2. Your details */}
            <fieldset className="m-0 border-0 p-0">
              <legend className="label mb-4 block p-0">{t('details')}</legend>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="tour-firstName" className={labelClass}>
                    {tc('firstNameLabel')}
                  </label>
                  <input
                    id="tour-firstName"
                    type="text"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    aria-required="true"
                    aria-invalid={errors.firstName ? true : undefined}
                    aria-describedby={errors.firstName ? 'tour-firstName-error' : undefined}
                    className={inputClass(Boolean(errors.firstName))}
                  />
                  {errors.firstName ? (
                    <p id="tour-firstName-error" className={errorClass}>
                      {errors.firstName}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor="tour-lastName" className={labelClass}>
                    {tc('lastNameLabel')}
                  </label>
                  <input
                    id="tour-lastName"
                    type="text"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    aria-required="true"
                    aria-invalid={errors.lastName ? true : undefined}
                    aria-describedby={errors.lastName ? 'tour-lastName-error' : undefined}
                    className={inputClass(Boolean(errors.lastName))}
                  />
                  {errors.lastName ? (
                    <p id="tour-lastName-error" className={errorClass}>
                      {errors.lastName}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-6">
                <label htmlFor="tour-email" className={labelClass}>
                  {tc('emailLabel')}
                </label>
                <input
                  id="tour-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-required="true"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? 'tour-email-error' : undefined}
                  className={inputClass(Boolean(errors.email))}
                />
                {errors.email ? (
                  <p id="tour-email-error" className={errorClass}>
                    {errors.email}
                  </p>
                ) : null}
              </div>
              <div className="mt-6">
                <label htmlFor="tour-phone" className={labelClass}>
                  {tc('phoneLabel')}
                </label>
                <input
                  id="tour-phone"
                  ref={phoneRef}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={PHONE_PLACEHOLDER}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={(e) => {
                    const normalized = normalizePhone(e.target.value)
                    if (normalized && normalized !== e.target.value) setPhone(normalized)
                  }}
                  aria-required="true"
                  aria-invalid={errors.phone ? true : undefined}
                  aria-describedby={errors.phone ? 'tour-phone-error' : undefined}
                  className={inputClass(Boolean(errors.phone))}
                />
                {errors.phone ? (
                  <p id="tour-phone-error" className={errorClass}>
                    {errors.phone}
                  </p>
                ) : null}
              </div>
            </fieldset>

            {/* 3. Wishes */}
            <div>
              <label htmlFor="tour-wishes" className={labelClass}>
                {t('wishes')}
              </label>
              <textarea
                id="tour-wishes"
                value={wishes}
                onChange={(e) => setWishes(e.target.value)}
                maxLength={490}
                placeholder={t('wishesPlaceholder')}
                className={`${inputClass(false)} min-h-[120px]`}
              />
              <p className={helperClass}>
                {t.rich('wishesHelper', {
                  link: (chunks) => (
                    <Link href={customHref} className={`text-copper-light underline underline-offset-2 ${FOCUS_RING}`}>
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
              {wishes.length >= 440 ? (
                <p className={`${helperClass} text-end`} aria-live="polite">
                  {t('counter', { count: wishes.length })}
                </p>
              ) : null}
            </div>

            {panel ? (
              <GuidancePanel
                actions={
                  <>
                    <Link
                      href={customHref}
                      className={`btn-secondary inline-flex min-h-[44px] items-center ${FOCUS_RING}`}
                    >
                      {t('refusalCta')}
                    </Link>
                    {panel === 'tooLate' ? (
                      <Link href="/contact" className={`cta-text inline-flex min-h-[44px] items-center ${FOCUS_RING}`}>
                        {tf('contactHeading')}
                      </Link>
                    ) : null}
                  </>
                }
              >
                {panel === 'tooLate'
                  ? t('tooLate', { hours: leadHours })
                  : panel === 'unavailable'
                    ? t('unavailableTitle')
                    : t('bookingOff')}
              </GuidancePanel>
            ) : null}

            {requestError ? (
              <p role="alert" className="m-0 text-[14px] font-light leading-[1.5] text-[#f87171]">
                {requestError === 'network' ? t('networkError') : t('serverError')}
              </p>
            ) : null}

            <button
              type="submit"
              className="btn-primary w-full min-h-[44px] sm:w-auto"
              aria-busy={busy}
              aria-disabled={refusal ? true : undefined}
              disabled={busy}
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                  {t('checking')}
                </span>
              ) : (
                t('continue')
              )}
            </button>
          </form>
        ) : (
          <div>
            <dl className="mb-8 flex flex-col gap-3 rounded-[4px] border border-anthracite-light bg-anthracite-mid p-4">
              <div>
                <dt className="label">{t('pickupLabel')}</dt>
                <dd className="mt-1 text-[14px] font-light text-offwhite">
                  <bdi dir="auto">{pickup?.address}</bdi>
                </dd>
              </div>
              <div>
                <dt className="label">{t('details')}</dt>
                <dd className="mt-1 text-[14px] font-light text-offwhite">
                  {firstName.trim()} {lastName.trim()}
                  <br />
                  <bdi dir="auto">{email.trim()}</bdi>
                  <br />
                  <bdi dir="ltr">{normalizePhone(phone) ?? phone.trim()}</bdi>
                </dd>
              </div>
              {wishes.trim() ? (
                <div>
                  <dt className="label">{t('wishes')}</dt>
                  <dd className="mt-1 truncate text-[14px] font-light text-offwhite">{wishes.trim().split('\n')[0]}</dd>
                </div>
              ) : null}
              <button
                type="button"
                onClick={handleEdit}
                className={`cta-text self-start min-h-[44px] ${FOCUS_RING}`}
              >
                {t('editDetails')}
              </button>
            </dl>

            <h2
              ref={stageBHeadingRef}
              tabIndex={-1}
              className="label mb-6 block outline-none"
              id="tour-stage-b-heading"
            >
              {tp('securePaymentLabel')}
            </h2>

            {init ? (
              <CardPaymentStage
                init={init}
                payment={payment}
                onPaymentChange={setPayment}
                buildIntentBody={buildIntentBody}
                attempt={attempt}
                onInvalidPhone={handleInvalidPhone}
                onFallback={handleFallback}
                onAmountChange={setAmountMinor}
                onConfirmed={handleConfirmed}
                totalEur={totalEur}
                analyticsItems={analyticsItems}
              />
            ) : null}
          </div>
        )}
      </div>

      <div className="order-1 lg:order-2 lg:col-span-5">
        <TourTripSummary
          title={tour.title}
          coverUrl={tour.coverUrl}
          date={query.date}
          time={query.time}
          pax={query.pax}
          car={query.car}
          hoursIncluded={tour.hoursIncluded}
          extraHours={query.xh}
          pickupAddress={pickup?.address ?? null}
          totalLabel={totalLabel}
          changeHref={tourHref}
          onChangeTrip={rememberBox}
        />
      </div>
    </div>
  )
}
