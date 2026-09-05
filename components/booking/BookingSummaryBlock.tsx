'use client'

import { useTranslations } from 'next-intl'
import { useBookingStore } from '@/lib/booking-store'
import { EXTRAS_CONFIG, computeExtrasTotal } from '@/lib/extras'
import { eurToCzk, formatCZK, formatEUR } from '@/lib/currency'
import { VEHICLE_CLASS_KEY } from '@/types/booking'
import type { Extras } from '@/types/booking'

interface Props {
  selectedCurrency?: 'eur' | 'czk'
}

export default function BookingSummaryBlock({ selectedCurrency = 'eur' }: Props) {
  const t = useTranslations('Booking')
  const tripType = useBookingStore((s) => s.tripType)
  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const hours = useBookingStore((s) => s.hours)
  const pickupDate = useBookingStore((s) => s.pickupDate)
  const pickupTime = useBookingStore((s) => s.pickupTime)
  const returnDate = useBookingStore((s) => s.returnDate)
  const returnTime = useBookingStore((s) => s.returnTime)
  const vehicleClass = useBookingStore((s) => s.vehicleClass)
  const passengers = useBookingStore((s) => s.passengers)
  const priceBreakdown = useBookingStore((s) => s.priceBreakdown)
  const roundTripPriceBreakdown = useBookingStore((s) => s.roundTripPriceBreakdown)
  const returnDiscountPercent = useBookingStore((s) => s.returnDiscountPercent)
  const extras = useBookingStore((s) => s.extras)
  const promoCode = useBookingStore((s) => s.promoCode)
  const promoDiscount = useBookingStore((s) => s.promoDiscount)

  const selectedPrice = vehicleClass && priceBreakdown ? priceBreakdown[vehicleClass] : null
  const selectedReturnLegPrice =
    vehicleClass && roundTripPriceBreakdown ? roundTripPriceBreakdown[vehicleClass] : null
  const extrasTotal = computeExtrasTotal(extras)
  const totalEur = selectedPrice ? selectedPrice.base + extrasTotal : 0
  const totalCzk = eurToCzk(totalEur)

  const classLabel = vehicleClass ? t(`vehicleClasses.${VEHICLE_CLASS_KEY[vehicleClass]}.label`) : ''

  const isRoundTripMode = tripType === 'round_trip'
  const outboundWithExtras = selectedPrice ? selectedPrice.base + extrasTotal : 0
  const returnLegTotal = selectedReturnLegPrice ? selectedReturnLegPrice.total : 0
  const combinedBeforePromoEur = outboundWithExtras + returnLegTotal
  const discountedCombinedEur =
    promoDiscount > 0
      ? Math.round(combinedBeforePromoEur * (1 - promoDiscount / 100))
      : combinedBeforePromoEur
  const promoReductionEur = combinedBeforePromoEur - discountedCombinedEur

  const routeText =
    tripType === 'hourly'
      ? t('summaryBlock.hours', { hours })
      : origin && destination
      ? `${origin.address} \u2192 ${destination.address}`
      : origin
      ? origin.address
      : '\u2014'

  const returnRouteText =
    origin && destination
      ? `${destination.address} \u2192 ${origin.address}`
      : origin
      ? origin.address
      : '\u2014'

  const selectedExtras = EXTRAS_CONFIG.filter(({ key }) => extras[key as keyof Extras])

  const primaryAmount =
    selectedCurrency === 'czk'
      ? totalCzk > 0
        ? formatCZK(totalCzk)
        : '\u2014'
      : totalEur > 0
      ? formatEUR(totalEur)
      : '\u2014'

  const secondaryAmount =
    selectedCurrency === 'czk'
      ? totalEur > 0
        ? formatEUR(totalEur)
        : ''
      : totalCzk > 0
      ? formatCZK(totalCzk)
      : ''

  return (
    <div
      style={{
        background: 'var(--anthracite-mid)',
        borderRadius: 4,
        padding: 24,
      }}
    >
      {isRoundTripMode ? (
        <>
          {/* OUTBOUND block */}
          <span className="label" style={{ display: 'block', marginBottom: 12 }}>
            {t('summaryBlock.outbound')}
          </span>
          <p
            style={{
              fontSize: 14,
              fontWeight: 300,
              color: 'var(--warmgrey)',
              fontFamily: 'var(--font-montserrat)',
              marginBottom: 8,
              lineHeight: 1.5,
            }}
          >
            {routeText}
          </p>
          <p
            style={{
              fontSize: 14,
              fontWeight: 300,
              color: 'var(--warmgrey)',
              fontFamily: 'var(--font-montserrat)',
              marginBottom: 8,
              lineHeight: 1.5,
            }}
          >
            {pickupDate && pickupTime ? t('summaryBlock.dateTimeAt', { date: pickupDate, time: pickupTime }) : '\u2014'}
          </p>
          <p
            style={{
              fontSize: 14,
              fontWeight: 300,
              color: 'var(--warmgrey)',
              fontFamily: 'var(--font-montserrat)',
              marginBottom: 0,
              lineHeight: 1.5,
            }}
          >
            {vehicleClass
              ? t('summaryBlock.classPax', { className: classLabel, passengers })
              : '\u2014'}
          </p>

          {/* Divider between OUTBOUND and RETURN */}
          <div
            style={{
              borderTop: '1px solid var(--anthracite-light)',
              margin: '16px 0',
            }}
          />

          {/* RETURN block */}
          <span className="label" style={{ display: 'block', marginBottom: 12 }}>
            {t('summaryBlock.return')}
          </span>
          <p
            style={{
              fontSize: 14,
              fontWeight: 300,
              color: 'var(--warmgrey)',
              fontFamily: 'var(--font-montserrat)',
              marginBottom: 8,
              lineHeight: 1.5,
            }}
          >
            {returnRouteText}
          </p>
          <p
            style={{
              fontSize: 14,
              fontWeight: 300,
              color: 'var(--warmgrey)',
              fontFamily: 'var(--font-montserrat)',
              marginBottom: selectedExtras.length > 0 ? 8 : 0,
              lineHeight: 1.5,
            }}
          >
            {returnDate && returnTime ? t('summaryBlock.dateTimeAt', { date: returnDate, time: returnTime }) : '\u2014'}
          </p>

          {/* Extras list (outbound only) */}
          {selectedExtras.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {selectedExtras.map(({ key, price }) => (
                <p
                  key={key}
                  style={{
                    fontSize: 14,
                    fontWeight: 300,
                    color: 'var(--warmgrey)',
                    fontFamily: 'var(--font-montserrat)',
                    lineHeight: 1.5,
                  }}
                >
                  {t(`extras.${key}.label`)} +{formatEUR(price)}
                </p>
              ))}
            </div>
          )}

          {/* Divider before price breakdown */}
          <div
            style={{
              borderTop: '1px solid var(--anthracite-light)',
              margin: '16px 0',
            }}
          />

          {/* Outbound line */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 300,
                color: 'var(--warmgrey)',
                fontFamily: 'var(--font-montserrat)',
              }}
            >
              {t('summaryBlock.outboundLine')}
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 400,
                color: 'var(--offwhite)',
                fontFamily: 'var(--font-montserrat)',
              }}
            >
              {formatEUR(outboundWithExtras)}
            </span>
          </div>

          {/* Return leg line with discount badge */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 300,
                color: 'var(--warmgrey)',
                fontFamily: 'var(--font-montserrat)',
              }}
            >
              {t('summaryBlock.returnLeg')}{' '}
              <span
                style={{
                  color: 'var(--copper)',
                  letterSpacing: '0.1em',
                  marginLeft: 4,
                }}
              >
                &minus;{returnDiscountPercent}%
              </span>
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 400,
                color: 'var(--offwhite)',
                fontFamily: 'var(--font-montserrat)',
              }}
            >
              {formatEUR(returnLegTotal)}
            </span>
          </div>

          {/* Subtotal line */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: promoDiscount > 0 ? 8 : 0,
              paddingTop: 8,
              borderTop: '1px solid var(--anthracite-light)',
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 400,
                color: 'var(--offwhite)',
                fontFamily: 'var(--font-montserrat)',
              }}
            >
              {t('summaryBlock.subtotal')}
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 400,
                color: 'var(--offwhite)',
                fontFamily: 'var(--font-montserrat)',
              }}
            >
              {formatEUR(combinedBeforePromoEur)}
            </span>
          </div>

          {/* Promo + Final lines (only when promo applied) */}
          {promoDiscount > 0 && promoCode && (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 300,
                    color: 'var(--copper)',
                    fontFamily: 'var(--font-montserrat)',
                  }}
                >
                  {t('summaryBlock.promo', { code: promoCode })}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 400,
                    color: 'var(--copper)',
                    fontFamily: 'var(--font-montserrat)',
                  }}
                >
                  &minus;{formatEUR(promoReductionEur)}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 400,
                    color: 'var(--offwhite)',
                    fontFamily: 'var(--font-montserrat)',
                  }}
                >
                  {t('summaryBlock.final')}
                </span>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 400,
                    color: 'var(--offwhite)',
                    fontFamily: 'var(--font-montserrat)',
                  }}
                >
                  {selectedCurrency === 'czk'
                    ? formatCZK(eurToCzk(discountedCombinedEur))
                    : formatEUR(discountedCombinedEur)}
                </span>
              </div>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 300,
                  color: 'var(--warmgrey)',
                  fontFamily: 'var(--font-montserrat)',
                  marginTop: 4,
                  textAlign: 'right',
                }}
              >
                {selectedCurrency === 'czk'
                  ? formatEUR(discountedCombinedEur)
                  : formatCZK(eurToCzk(discountedCombinedEur))}
              </p>
            </>
          )}
        </>
      ) : (
        <>
          {/* YOUR JOURNEY label (one-way) */}
          <span className="label" style={{ display: 'block', marginBottom: 12 }}>
            {t('summaryBlock.yourJourney')}
          </span>

          {/* Route */}
          <p
            style={{
              fontSize: 14,
              fontWeight: 300,
              color: 'var(--warmgrey)',
              fontFamily: 'var(--font-montserrat)',
              marginBottom: 8,
              lineHeight: 1.5,
            }}
          >
            {routeText}
          </p>

          {/* Date + time */}
          <p
            style={{
              fontSize: 14,
              fontWeight: 300,
              color: 'var(--warmgrey)',
              fontFamily: 'var(--font-montserrat)',
              marginBottom: 8,
              lineHeight: 1.5,
            }}
          >
            {pickupDate && pickupTime ? t('summaryBlock.dateTimeAt', { date: pickupDate, time: pickupTime }) : '\u2014'}
          </p>

          {/* Vehicle class + passenger count */}
          <p
            style={{
              fontSize: 14,
              fontWeight: 300,
              color: 'var(--warmgrey)',
              fontFamily: 'var(--font-montserrat)',
              marginBottom: selectedExtras.length > 0 ? 8 : 0,
              lineHeight: 1.5,
            }}
          >
            {vehicleClass
              ? t('summaryBlock.classPax', { className: classLabel, passengers })
              : '\u2014'}
          </p>

          {/* Extras list */}
          {selectedExtras.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {selectedExtras.map(({ key, price }) => (
                <p
                  key={key}
                  style={{
                    fontSize: 14,
                    fontWeight: 300,
                    color: 'var(--warmgrey)',
                    fontFamily: 'var(--font-montserrat)',
                    lineHeight: 1.5,
                  }}
                >
                  {t(`extras.${key}.label`)} +{formatEUR(price)}
                </p>
              ))}
            </div>
          )}

          {/* Divider */}
          <div
            style={{
              borderTop: '1px solid var(--anthracite-light)',
              margin: '16px 0',
            }}
          />

          {/* Primary total */}
          <p
            style={{
              fontSize: 20,
              fontWeight: 400,
              color: 'var(--offwhite)',
              fontFamily: 'var(--font-montserrat)',
              marginBottom: 4,
            }}
          >
            {primaryAmount}
          </p>

          {/* Secondary total */}
          {secondaryAmount && (
            <p
              style={{
                fontSize: 14,
                fontWeight: 300,
                color: 'var(--warmgrey)',
                fontFamily: 'var(--font-montserrat)',
              }}
            >
              {secondaryAmount}
            </p>
          )}
        </>
      )}
    </div>
  )
}
