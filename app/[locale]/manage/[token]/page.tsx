import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { TriangleAlert } from 'lucide-react'
import { resolveManageToken } from '@/lib/manage-link'
import { loadManageView, type ManageView, type ManagePayment } from '@/lib/manage-view'
import { formatMinor } from '@/lib/payments/money'
import { formatLocaleDate, formatLocaleDateTime } from '@/lib/locale-date'
import { localizedHref } from '@/lib/localized-href'
import { BUSINESS_PHONE_DISPLAY, BUSINESS_TEL_URL } from '@/lib/contact-channels'
import { VEHICLE_CLASS_KEY, type VehicleClass } from '@/types/booking'
import { normalizeSiteLocale, type AppLocale } from '@/i18n/locales'
import ManageHeader from './ManageHeader'
import InvalidManageLinkView, { MANAGE_CONTACT_EMAIL } from './InvalidManageLinkView'

// Client's manage-booking page (Phase 89, plan 89-15; UI-SPEC Surface 1; D-01, D-02, HOLD-06, CANC-01).
//
// - Localized route (not under (internal)), so ar, hi and zh keep their fonts and dir.
// - Dynamic rendering (the export below): the booking is read per request with the service client, never at build time.
// - GET changes nothing. Mail scanners prefetch links, so every change is an explicit POST from a button (plan 89-28
//   mounts the cancel control and the change-request form into the two named slots below).
// - The token is resolved FIRST (resolveManageToken); only then is the booking read. Any failure, in any step, renders the
//   one invalid view. Nothing here logs or echoes the token.
// - The page receives the client-safe ManageView only: no email, phone, name, driver, reason or operator note exists in it.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ locale: string; token: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params
  const locale = normalizeSiteLocale(rawLocale)
  const t = await getTranslations({ locale, namespace: 'Manage.meta' })
  return {
    title: t('title'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}

const bdi = (chunks: ReactNode) => <bdi dir="auto">{chunks}</bdi>

const cardStyle = {
  boxSizing: 'border-box',
  backgroundColor: 'var(--anthracite-mid)',
  padding: 24,
} as const

const panelStyle = {
  ...cardStyle,
  border: '1px solid var(--anthracite-light)',
  borderInlineStart: '3px solid var(--copper)',
  borderRadius: 4,
  marginTop: 32,
} as const

const headingStyle = {
  fontFamily: 'var(--font-cormorant)',
  fontSize: 20,
  fontWeight: 400,
  lineHeight: 1.3,
  color: 'var(--offwhite)',
  margin: 0,
  overflowWrap: 'anywhere',
} as const

const bodyStyle = {
  margin: 0,
  fontSize: 14,
  fontWeight: 300,
  lineHeight: 1.6,
  color: 'var(--offwhite)',
  overflowWrap: 'anywhere',
} as const

const buttonStyle = { width: '100%', boxSizing: 'border-box' } as const

function validIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v)
}

function DetailRow({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div>
      <span className="label" style={{ display: 'block' }}>
        {label}
      </span>
      <div
        style={{
          marginTop: 4,
          fontSize: 14,
          fontWeight: strong ? 400 : 300,
          lineHeight: 1.5,
          color: 'var(--offwhite)',
          overflowWrap: 'anywhere',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** The booking, rendered. An async function (called by the page), so a test can await the element. */
async function ManageBookingView({ view, locale }: { view: ManageView; locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Manage' })
  const vt = await getTranslations({ locale, namespace: 'Booking.vehicleClasses' })

  const pickupDate = validIsoDate(view.pickupDate) ? formatLocaleDate(view.pickupDate, locale) : ''
  const money = (m: { amountMinor: number; currency: 'eur' | 'czk' }) => formatMinor(m.amountMinor, m.currency)

  // ── block 1: H1 and optional line ──────────────────────────────────────────────────────────────────────────────────
  let h1: ReactNode
  let h1Line: string | null = null
  switch (view.variant) {
    case 'on_board':
      h1 = t('title.onBoard')
      break
    case 'completed':
      h1 = t('title.completed')
      h1Line = t('titleLine.completed')
      break
    case 'cancelled':
      h1 = t('title.cancelled')
      break
    case 'no_show':
      h1 = t('title.noShow')
      h1Line = t('titleLine.noShow')
      break
    default:
      h1 = t.rich('title.trip', { pickupDate, bdi })
  }

  // ── block 2: status line ───────────────────────────────────────────────────────────────────────────────────────────
  const active = view.variant === 'active' || view.variant === 'on_board'
  const statusText = view.statusKey ? t(`status.${view.statusKey}`) : null

  // ── block 4: trip details (a null row is not rendered, E2) ─────────────────────────────────────────────────────────
  const classKey = view.vehicleClass ? VEHICLE_CLASS_KEY[view.vehicleClass as VehicleClass] : undefined
  const vehicleLabel = classKey ? vt(`${classKey}.label`) : null
  const paymentSentence = (p: ManagePayment): ReactNode =>
    t.rich(`payment.${p.key}`, {
      amount: money(p),
      holdDate: p.holdAtMs !== null ? formatLocaleDateTime(p.holdAtMs, locale) : '',
      bdi,
    })

  // ── block 5: the cancellation panel (anchor of the page) ───────────────────────────────────────────────────────────
  const callButton = (
    <a href={BUSINESS_TEL_URL} className="btn-secondary" style={{ ...buttonStyle, marginTop: 16, gap: 8 }}>
      <span>{t('callUs')}</span>
      <bdi dir="ltr" style={{ letterSpacing: 'normal' }}>
        {BUSINESS_PHONE_DISPLAY}
      </bdi>
    </a>
  )

  let panel: ReactNode = null
  const c = view.cancel
  if (c) {
    const freeUntil = c.freeUntilMs !== null ? formatLocaleDateTime(c.freeUntilMs, locale) : ''
    if (c.outcome === 'free') {
      const moneySentence =
        c.freeMoney === 'hold'
          ? t('panel.freeHold')
          : c.freeMoney === 'refund' && c.refundMinor !== null
            ? t.rich('panel.freeRefund', { amount: formatMinor(c.refundMinor, view.payment?.currency ?? view.fare?.currency ?? 'eur'), bdi })
            : t('panel.freeNone')
      panel = (
        <section data-testid="manage-panel-free" aria-labelledby="manage-panel-heading" style={panelStyle}>
          <h2 id="manage-panel-heading" style={headingStyle}>
            {t.rich('panel.freeHeading', { freeUntil, bdi })}
          </h2>
          <p style={{ ...bodyStyle, marginTop: 12 }}>
            {t('panel.freeIntro')} {moneySentence}
            {c.payNow ? ` ${t('panel.bankNote')}` : ''}
          </p>
          {/* Plan 89-28 mounts the Cancel booking control and its confirm region here. */}
          <div data-manage-slot="cancel-region" />
        </section>
      )
    } else if (c.outcome === 'late') {
      const fee = c.proposedFeeMinor !== null && c.currency !== null ? formatMinor(c.proposedFeeMinor, c.currency) : null
      panel = (
        <section data-testid="manage-panel-late" aria-labelledby="manage-panel-heading" style={panelStyle}>
          <h2 id="manage-panel-heading" style={{ ...headingStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TriangleAlert size={20} aria-hidden="true" style={{ flex: 'none', color: 'var(--copper-light)' }} />
            <span>{t('panel.lateHeading')}</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
            {freeUntil ? <p style={bodyStyle}>{t.rich('panel.late1', { freeUntil, bdi })}</p> : null}
            {fee !== null ? (
              <>
                <p style={bodyStyle}>{t.rich('panel.late2', { percent: c.feePercent, amount: fee, bdi })}</p>
                <p style={bodyStyle}>{t('panel.late3')}</p>
              </>
            ) : (
              <p style={bodyStyle}>{t('panel.lateNoFee')}</p>
            )}
          </div>
          {/* Plan 89-28 mounts the Cancel booking control and its confirm region here. */}
          <div data-manage-slot="cancel-region" />
        </section>
      )
    } else {
      panel = (
        <section data-testid="manage-panel-too-late" aria-labelledby="manage-panel-heading" style={panelStyle}>
          <h2 id="manage-panel-heading" style={{ ...headingStyle, fontSize: 16 }}>
            {t('panel.tooLate')}
          </h2>
          {callButton}
        </section>
      )
    }
  }

  // Cancelled summary (instead of the panel), also on a later visit. Operator reasons and notes never exist in the view.
  const k = view.cancelled
  if (k) {
    const amount = k.feeAmountMinor > 0 ? formatMinor(k.feeAmountMinor, k.currency ?? 'eur') : ''
    const freeUntil = k.freeUntilMs !== null ? formatLocaleDateTime(k.freeUntilMs, locale) : ''
    let sentence: ReactNode
    if (k.feeStatus === 'pending' && amount) {
      sentence = t.rich('cancelled.pending', { amount, bdi })
    } else if (k.feeStatus === 'charged' && amount) {
      sentence = freeUntil ? t.rich('cancelled.charged', { amount, freeUntil, bdi }) : t.rich('cancelled.chargedLate', { amount, bdi })
    } else if (k.feeStatus === 'waived') {
      sentence = t('cancelled.waived')
    } else if (k.refundedMinor !== null) {
      sentence = t.rich('cancelled.refunded', { amount: formatMinor(k.refundedMinor, k.currency ?? 'eur'), bdi })
    } else {
      sentence = t('cancelled.none')
    }
    const when = k.cancelledAtMs !== null ? formatLocaleDateTime(k.cancelledAtMs, locale) : ''
    panel = (
      <section data-testid="manage-cancelled" aria-labelledby="manage-panel-heading" style={panelStyle}>
        <h2 id="manage-panel-heading" style={headingStyle}>
          {when ? t.rich('cancelled.heading', { cancelledDate: when, bdi }) : t('status.cancelled')}
        </h2>
        <p style={{ ...bodyStyle, marginTop: 12 }}>{sentence}</p>
      </section>
    )
  }

  // ── block 7: book a new ride (primary in cancelled and completed, then directly under the status line) ─────────────
  const bookPrimary = view.variant === 'cancelled' || view.variant === 'completed'
  const bookButton = (
    <a
      href={localizedHref(locale, '/book')}
      className={bookPrimary ? 'btn-primary' : 'btn-ghost'}
      style={{ ...buttonStyle, marginTop: bookPrimary ? 24 : 16 }}
    >
      {t('bookNew')}
    </a>
  )

  // Change request (block 6): shown while the booking can still be changed.
  const showChangeSlot = view.variant === 'active'
  const emphasiseContact = view.variant === 'no_show'

  return (
    <>
      <ManageHeader locale={locale} homeLabel={t('header.homeAriaLabel')} />
      <main
        id="main-content"
        data-testid="manage-page"
        style={{
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: 560,
          margin: '0 auto',
          padding: '32px 24px 64px',
          fontFamily: 'var(--font-montserrat)',
        }}
      >
        <span className="label" style={{ display: 'block' }}>
          {t('eyebrow')}
        </span>
        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.2,
            color: 'var(--offwhite)',
            margin: '8px 0 0',
            overflowWrap: 'anywhere',
          }}
        >
          {h1}
        </h1>
        {h1Line ? <p style={{ ...bodyStyle, marginTop: 8, color: 'var(--warmgrey)' }}>{h1Line}</p> : null}

        {statusText ? (
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 24px', fontSize: 14, fontWeight: 400, color: 'var(--offwhite)' }}>
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                flex: 'none',
                backgroundColor: active ? 'var(--copper-light)' : 'var(--warmgrey)',
              }}
            />
            <span>{statusText}</span>
          </p>
        ) : (
          <div style={{ height: 24 }} />
        )}

        {bookPrimary ? <div style={{ marginBottom: 24 }}>{bookButton}</div> : null}

        {view.reference ? (
          <section
            aria-labelledby="manage-reference-label"
            style={{ ...cardStyle, borderInlineStart: '3px solid var(--copper)', marginBottom: 24 }}
          >
            <span id="manage-reference-label" className="label" style={{ display: 'block' }}>
              {t('reference')}
            </span>
            <div style={{ marginTop: 4, fontSize: 20, fontWeight: 400, color: 'var(--offwhite)', overflowWrap: 'anywhere' }}>
              <bdi dir="ltr">{view.reference}</bdi>
            </div>
          </section>
        ) : null}

        <section data-testid="manage-details" style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {view.from ? (
            <DetailRow label={t('details.from')}>
              <bdi dir="auto">{view.from}</bdi>
            </DetailRow>
          ) : null}
          {view.to ? (
            <DetailRow label={t('details.to')}>
              <bdi dir="auto">{view.to}</bdi>
            </DetailRow>
          ) : null}
          {pickupDate ? (
            <DetailRow label={t('details.pickup')} strong>
              <bdi dir="ltr">
                {pickupDate}
                {view.pickupTime ? `, ${view.pickupTime}` : ''}
              </bdi>
              <div style={{ fontSize: 12, fontWeight: 300, color: 'var(--warmgrey)' }}>{t('details.pragueTime')}</div>
            </DetailRow>
          ) : null}
          {vehicleLabel ? <DetailRow label={t('details.vehicle')}>{vehicleLabel}</DetailRow> : null}
          {view.passengers !== null ? (
            <DetailRow label={t('details.passengers')}>
              <bdi dir="ltr">{view.passengers}</bdi>
            </DetailRow>
          ) : null}
          {view.fare ? (
            <DetailRow label={t('details.fare')} strong>
              <bdi dir="ltr">{money(view.fare)}</bdi>
            </DetailRow>
          ) : null}
          {view.payment ? <DetailRow label={t('details.payment')}>{paymentSentence(view.payment)}</DetailRow> : null}
        </section>

        {panel}

        {showChangeSlot ? (
          <div style={{ marginTop: 16 }}>
            {/* Plan 89-28 mounts the change request form here. */}
            <div data-manage-slot="change-request" />
          </div>
        ) : null}

        {bookPrimary ? null : bookButton}

        <section
          aria-labelledby="manage-contact-label"
          style={{ marginTop: 40, fontSize: 14, fontWeight: 300, lineHeight: 1.6, color: 'var(--warmgrey)' }}
        >
          <span id="manage-contact-label" className="label" style={{ display: 'block' }}>
            {t('contact.label')}
          </span>
          {emphasiseContact ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <a href={`mailto:${MANAGE_CONTACT_EMAIL}`} className="btn-secondary" style={buttonStyle}>
                {t('emailUs')}
              </a>
              <a href={BUSINESS_TEL_URL} className="btn-secondary" style={{ ...buttonStyle, gap: 8 }}>
                <span>{t('callUs')}</span>
                <bdi dir="ltr" style={{ letterSpacing: 'normal' }}>
                  {BUSINESS_PHONE_DISPLAY}
                </bdi>
              </a>
            </div>
          ) : (
            <p style={{ margin: '8px 0 0', display: 'flex', flexWrap: 'wrap', columnGap: 16, rowGap: 4 }}>
              <a href={`mailto:${MANAGE_CONTACT_EMAIL}`} style={{ color: 'var(--copper-light)', textDecoration: 'underline' }}>
                <bdi dir="ltr">{MANAGE_CONTACT_EMAIL}</bdi>
              </a>
              <a href={BUSINESS_TEL_URL} style={{ color: 'var(--copper-light)', textDecoration: 'underline' }}>
                <bdi dir="ltr">{BUSINESS_PHONE_DISPLAY}</bdi>
              </a>
            </p>
          )}
          <p style={{ margin: '16px 0 0', fontSize: 12 }}>{t('contact.privacy')}</p>
          <p style={{ margin: '8px 0 0', fontSize: 12 }}>
            <a
              href={localizedHref(locale, '/terms')}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--copper-light)', textDecoration: 'underline' }}
            >
              {t('contact.terms')}
            </a>
          </p>
        </section>
      </main>
    </>
  )
}

export default async function ManageBookingPage({ params }: PageProps) {
  const { locale: rawLocale, token } = await params
  const locale = normalizeSiteLocale(rawLocale)
  setRequestLocale(locale)

  // E1 error: a lookup that throws is an invalid link, never a stack trace. Token first, booking second.
  let view: ManageView | null = null
  try {
    const bookingId = await resolveManageToken(token)
    if (bookingId) view = await loadManageView(bookingId)
  } catch {
    view = null
  }

  if (!view) return InvalidManageLinkView({ locale })
  return ManageBookingView({ view, locale })
}
