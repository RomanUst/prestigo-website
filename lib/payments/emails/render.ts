/**
 * lib/payments/emails/render.ts — language-aware client payment emails
 * (Phase 88-03, MAIL-01).
 *
 * One renderer builds every card-lifecycle email (card_saved, hold_placed,
 * charged, payment_failed) from ONE HTML shell and the `PaymentEmails`
 * catalog namespace. Phases 89 and 92 add kinds by adding an entry to
 * TEMPLATES and catalog keys, nothing else.
 *
 * Rules enforced here (88-UI-SPEC Surface 4):
 * - locale = normalizeSiteLocale(input), English for null / empty / unknown
 * - amounts via formatMinor, dates via formatLocaleDate (Latin digits)
 * - amounts, dates, references, contact line in <bdi dir="ltr">; addresses in
 *   <bdi dir="auto"> so Latin text inside Arabic keeps its order
 * - every user-supplied string HTML-escaped; UTF-8 only, no named entities
 * - payment_failed is the only email with a filled button
 * - no email states a cancellation fee, a refund promise or a cancellation
 *   threat (Phase 89 owns the policy)
 *
 * Server-only by usage (loads catalogs through dynamic imports and renders
 * HTML for Resend); it imports nothing that needs the browser.
 */
import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import { normalizeSiteLocale, rtlLocales, type AppLocale } from '@/i18n/locales'
import { formatLocaleDate } from '@/lib/locale-date'
import { EMAIL_CONTACT_LINE, emailLogoImg, escapeHtml } from '@/lib/email'
import { formatMinor, type PaymentCurrency } from '@/lib/payments/money'

export type PaymentEmailKind = 'card_saved' | 'hold_placed' | 'charged' | 'payment_failed'

export interface PaymentEmailVars {
  reference: string
  amountMinor: number
  currency: PaymentCurrency
  pickupDateIso: string
  pickupTime: string
  origin: string
  destination: string
  vehicleClass: string
  passengers: number
  holdDateIso?: string | null
  variant?: 'at_checkout' | 'scheduled' | 'declined' | 'auth_required'
  diffMinor?: number
  payUrl?: string
  calendarUrl?: string
}

// ---------------------------------------------------------------------------
// Catalog loading — a fixed locale -> import map (never a computed path).
// ---------------------------------------------------------------------------

const MESSAGE_LOADERS: Record<AppLocale, () => Promise<{ default: unknown }>> = {
  en: () => import('@/messages/en.json'),
  ru: () => import('@/messages/ru.json'),
  es: () => import('@/messages/es.json'),
  fr: () => import('@/messages/fr.json'),
  ar: () => import('@/messages/ar.json'),
  hi: () => import('@/messages/hi.json'),
  zh: () => import('@/messages/zh.json'),
}

/** Full message catalog of a site locale (shared with lib/payments/consent.ts). */
export async function loadMessages(locale: AppLocale): Promise<AbstractIntlMessages> {
  const mod = await MESSAGE_LOADERS[locale]()
  return mod.default as AbstractIntlMessages
}

// ---------------------------------------------------------------------------
// Message helpers
// ---------------------------------------------------------------------------

// Narrow structural view of next-intl's translator: the catalog is a runtime
// JSON import, so keys are plain strings rather than the generated union.
interface Translator {
  (key: string, values?: Record<string, string>): string
  has(key: string): boolean
}

function makeTranslator(locale: AppLocale, messages: AbstractIntlMessages, namespace: string): Translator {
  return createTranslator({ locale, messages, namespace, onError: throwOnError } as never) as unknown as Translator
}

// Private-use sentinels carry ICU parameters through translation so the final
// text can be HTML-escaped once and the parameters then re-inserted as
// <bdi dir="ltr"> fragments.
const TOKEN_OPEN = ''
const TOKEN_CLOSE = ''
const TOKEN_RE = /(\w+)/g

function throwOnError(error: unknown): never {
  throw error instanceof Error ? error : new Error(String(error))
}

/** Plain-text message (subject line). Control characters are stripped. */
function text(t: Translator, key: string, params: Record<string, string> = {}): string {
  const safe = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()]),
  )
  return t(key, safe)
}

/** HTML message: catalog text escaped, parameters inserted as bdi ltr. */
function html(t: Translator, key: string, params: Record<string, string> = {}): string {
  const tokens = Object.fromEntries(Object.keys(params).map((k) => [k, `${TOKEN_OPEN}${k}${TOKEN_CLOSE}`]))
  const out = escapeHtml(t(key, tokens))
  return out.replace(TOKEN_RE, (_m, name: string) => `<bdi dir="ltr">${escapeHtml(params[name] ?? '')}</bdi>`)
}

function safeHttpsUrl(value: string, what: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${what} is not a valid URL`)
  }
  if (url.protocol !== 'https:') throw new Error(`${what} must be an https URL`)
  return value
}

// ---------------------------------------------------------------------------
// Templates (kind + variant) — the only place that differs between emails.
// ---------------------------------------------------------------------------

interface Ctx {
  t: Translator
  vars: PaymentEmailVars
  amount: string
  pickupDate: string
  holdDate: string
  diff: string | null
}

interface Template {
  subject: string
  h1: string
  intro: string
  highlightLabel: string
  lines: string[]
  cta?: 'calendar' | 'pay'
}

const TEMPLATES: Record<string, (c: Ctx) => Template> = {
  card_saved: (c) => ({
    subject: text(c.t, 'cardSaved.subject', { reference: c.vars.reference }),
    h1: html(c.t, 'cardSaved.h1'),
    intro: html(c.t, 'cardSaved.intro'),
    highlightLabel: html(c.t, 'common.howPaymentWorksLabel'),
    lines: [
      html(c.t, 'cardSaved.lineToday'),
      ...(c.holdDate ? [html(c.t, 'cardSaved.lineHoldDay', { holdDate: c.holdDate, amount: c.amount })] : []),
      html(c.t, 'cardSaved.lineAfterTrip'),
    ],
    cta: 'calendar',
  }),
  'hold_placed:at_checkout': (c) => ({
    subject: text(c.t, 'holdPlacedAtCheckout.subject', { reference: c.vars.reference }),
    h1: html(c.t, 'holdPlacedAtCheckout.h1'),
    intro: html(c.t, 'holdPlacedAtCheckout.intro', { amount: c.amount }),
    highlightLabel: html(c.t, 'common.howPaymentWorksLabel'),
    lines: [
      html(c.t, 'holdPlacedAtCheckout.lineToday', { amount: c.amount }),
      html(c.t, 'holdPlacedAtCheckout.lineAfterTrip'),
    ],
    cta: 'calendar',
  }),
  'hold_placed:scheduled': (c) => ({
    subject: text(c.t, 'holdPlacedScheduled.subject', { reference: c.vars.reference }),
    h1: html(c.t, 'holdPlacedScheduled.h1'),
    intro: html(c.t, 'holdPlacedScheduled.intro', { amount: c.amount, pickupDate: c.pickupDate }),
    highlightLabel: html(c.t, 'common.whatNextLabel'),
    lines: [html(c.t, 'holdPlacedScheduled.next')],
  }),
  charged: (c) => ({
    subject: text(c.t, 'charged.subject', { reference: c.vars.reference }),
    h1: html(c.t, 'charged.h1'),
    intro: html(c.t, 'charged.intro', { amount: c.amount, pickupDate: c.pickupDate }),
    highlightLabel: html(c.t, 'common.receiptLabel'),
    lines: [
      html(c.t, 'charged.total', { amount: c.amount }),
      ...(c.diff ? [html(c.t, 'charged.includesDiff', { diff: c.diff })] : []),
    ],
  }),
  'payment_failed:declined': (c) => ({
    subject: text(c.t, 'paymentFailed.subject', { reference: c.vars.reference }),
    h1: html(c.t, 'paymentFailed.h1Declined'),
    intro: html(c.t, 'paymentFailed.introDeclined', { amount: c.amount, pickupDate: c.pickupDate }),
    highlightLabel: html(c.t, 'common.paySecurelyLabel'),
    lines: [html(c.t, 'paymentFailed.body')],
    cta: 'pay',
  }),
  'payment_failed:auth_required': (c) => ({
    subject: text(c.t, 'paymentFailed.subject', { reference: c.vars.reference }),
    h1: html(c.t, 'paymentFailed.h1AuthRequired'),
    intro: html(c.t, 'paymentFailed.introAuthRequired', { amount: c.amount, pickupDate: c.pickupDate }),
    highlightLabel: html(c.t, 'common.paySecurelyLabel'),
    lines: [html(c.t, 'paymentFailed.body')],
    cta: 'pay',
  }),
}

const DEFAULT_VARIANT: Partial<Record<PaymentEmailKind, NonNullable<PaymentEmailVars['variant']>>> = {
  hold_placed: 'at_checkout',
  payment_failed: 'declined',
}

function templateKey(kind: PaymentEmailKind, variant: PaymentEmailVars['variant']): string {
  const v = variant ?? DEFAULT_VARIANT[kind]
  const key = v ? `${kind}:${v}` : kind
  if (!TEMPLATES[key]) throw new Error(`No payment email template for ${key}`)
  return key
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

const LABEL_UPPERCASE_LOCALES: readonly AppLocale[] = ['en', 'es', 'fr', 'ru']

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase())
}

function vehicleLabel(tv: Translator, vehicleClass: string): string {
  const key = `${snakeToCamel(vehicleClass)}.label`
  try {
    if (tv.has(key)) return tv(key)
  } catch {
    // fall through to the raw class
  }
  return vehicleClass
}

function buildShell(args: {
  locale: AppLocale
  tpl: Template
  t: Translator
  tv: Translator
  vars: PaymentEmailVars
  subject: string
}): string {
  const { locale, tpl, t, tv, vars, subject } = args
  const rtl = (rtlLocales as readonly string[]).includes(locale)
  const upper = LABEL_UPPERCASE_LOCALES.includes(locale)
  const align = rtl ? 'right' : 'left'
  const lead = rtl ? 'right' : 'left'
  const dirAttr = rtl ? ' dir="rtl"' : ''

  const labelBase = upper
    ? 'font-size: 11px; font-weight: 400; letter-spacing: 2px; text-transform: uppercase;'
    : 'font-size: 11px; font-weight: 400; letter-spacing: normal;'
  const goldLabel = `${labelBase} color: #BFA06A;`
  const greyLabel = `${labelBase} color: #A9AEB0;`

  const reference = `<bdi dir="ltr">${escapeHtml(vars.reference)}</bdi>`
  const date = formatLocaleDate(vars.pickupDateIso, locale)
  const dateTime = `<bdi dir="ltr">${escapeHtml(`${date}, ${vars.pickupTime}`)}</bdi>`

  const row = (label: string, value: string) => `
          <tr>
            <td style="${greyLabel} padding: 8px 16px 8px 0; width: 40%; vertical-align: top; text-align: ${align};">${label}</td>
            <td style="font-size: 14px; font-weight: 400; color: #F3EEE3; padding: 8px 0; vertical-align: top; text-align: ${align}; word-break: break-word; overflow-wrap: anywhere;">${value}</td>
          </tr>`

  const journey = [
    row(html(t, 'common.fromLabel'), `<bdi dir="auto">${escapeHtml(vars.origin)}</bdi>`),
    row(html(t, 'common.toLabel'), `<bdi dir="auto">${escapeHtml(vars.destination)}</bdi>`),
    row(html(t, 'common.dateLabel'), dateTime),
    row(html(t, 'common.vehicleLabel'), escapeHtml(vehicleLabel(tv, vars.vehicleClass))),
    row(html(t, 'common.passengersLabel'), `<bdi dir="ltr">${escapeHtml(String(vars.passengers))}</bdi>`),
  ].join('')

  const box = (label: string, body: string) => `
      <div style="background-color: #17293B; border-${lead}: 3px solid #BFA06A; padding: 24px; margin: 0 32px 24px; text-align: ${align};">
        <div style="${goldLabel} margin-bottom: 8px;">${label}</div>
        ${body}
      </div>`

  const referenceBox = box(
    html(t, 'common.referenceLabel'),
    `<div style="font-size: 22px; font-weight: 600; color: #BFA06A;">${reference}</div>`,
  )
  const highlightBox = box(
    tpl.highlightLabel,
    tpl.lines
      .map(
        (line, i) =>
          `<div style="font-size: 14px; font-weight: 400; color: #F3EEE3; line-height: 1.6;${i > 0 ? ' margin-top: 8px;' : ''}">${line}</div>`,
      )
      .join(''),
  )

  let cta = ''
  if (tpl.cta === 'calendar' && vars.calendarUrl) {
    const href = escapeHtml(safeHttpsUrl(vars.calendarUrl, 'calendarUrl'))
    cta = `
      <div style="text-align: center; padding: 8px 32px 24px;">
        <a href="${href}" style="display: inline-block; border: 1px solid #BFA06A; color: #BFA06A; padding: 12px 24px; text-decoration: none; font-size: 11px; font-weight: 400; ${upper ? 'letter-spacing: 2px; text-transform: uppercase;' : 'letter-spacing: normal;'} font-family: 'Inter', Arial, sans-serif;">${html(t, 'common.calendarCta')}</a>
      </div>`
  } else if (tpl.cta === 'pay') {
    if (!vars.payUrl) throw new Error('payUrl is required for payment_failed')
    const href = escapeHtml(safeHttpsUrl(vars.payUrl, 'payUrl'))
    const label = html(t, 'paymentFailed.cta', { amount: formatMinor(vars.amountMinor, vars.currency) })
    cta = `
      <div style="text-align: center; padding: 8px 32px 24px;">
        <a href="${href}" style="display: inline-block; background-color: #BFA06A; color: #0F1D2C; padding: 16px 32px; text-decoration: none; font-size: 14px; font-weight: 600; font-family: 'Inter', Arial, sans-serif;">${label}</a>
      </div>`
  }

  const assistance = `
      <div style="padding: 24px 32px; text-align: ${align};">
        <div style="${goldLabel} margin-bottom: 8px;">${html(t, 'common.assistanceLabel')}</div>
        <div style="font-size: 14px; font-weight: 400; color: #A9AEB0; line-height: 1.6;">${html(t, 'common.assistanceText', { contact: EMAIL_CONTACT_LINE })}</div>
      </div>`

  return `<!DOCTYPE html>
<html lang="${locale}"${dirAttr}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400&family=Inter:wght@400;600&display=swap" rel="stylesheet">
</head>
<body${dirAttr} style="margin: 0; padding: 0; background-color: #0F1D2C;">
  <div style="background-color: #0F1D2C; padding: 0; margin: 0; font-family: 'Inter', Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #0F1D2C;">

      <div style="height: 2px; background: linear-gradient(90deg, #BFA06A 0%, #E6D6B0 50%, transparent 100%);"></div>

      <div style="padding: 32px 32px 16px; text-align: center;">
        ${emailLogoImg(28)}
      </div>

      <h1 style="font-family: 'Inter', Arial, sans-serif; font-size: 28px; font-weight: 400; color: #F3EEE3; text-align: center; margin: 0 0 16px; padding: 0 32px;">${tpl.h1}</h1>

      <p style="font-size: 14px; font-weight: 400; color: #F3EEE3; line-height: 1.6; padding: 0 32px; margin: 0 0 24px; text-align: ${align};">${tpl.intro}</p>
${referenceBox}
${highlightBox}

      <div style="padding: 0 32px 24px; text-align: ${align};">
        <div style="${goldLabel} margin-bottom: 12px;">${html(t, 'common.journeyLabel')}</div>
        <table role="presentation" style="width: 100%; border-collapse: collapse;">${journey}
        </table>
      </div>
${cta}
${assistance}

      <div style="padding-top: 32px; padding-bottom: 32px;">
        <div style="border-top: 1px solid #BFA06A; margin: 0 32px 24px;"></div>
        <div style="text-align: center; margin-bottom: 8px;">
          ${emailLogoImg(18)}
        </div>
        <div style="text-align: center; font-size: 11px; font-weight: 400; letter-spacing: 3px; color: #A9AEB0; font-family: 'Inter', Arial, sans-serif;">${escapeHtml(t('common.tagline'))}</div>
      </div>

    </div>
  </div>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function hasPaymentEmails(messages: AbstractIntlMessages): boolean {
  return Boolean((messages as Record<string, unknown>).PaymentEmails)
}

export async function renderPaymentEmail(
  kind: PaymentEmailKind,
  localeInput: unknown,
  vars: PaymentEmailVars,
): Promise<{ subject: string; html: string; locale: AppLocale }> {
  let locale = normalizeSiteLocale(localeInput)
  let messages = await loadMessages(locale)
  if (locale !== 'en' && !hasPaymentEmails(messages)) {
    // A locale whose catalog has no PaymentEmails namespace yet renders in
    // English rather than failing the send.
    locale = 'en'
    messages = await loadMessages('en')
  }

  const t = makeTranslator(locale, messages, 'PaymentEmails')
  const tv = makeTranslator(locale, messages, 'Booking.vehicleClasses')

  const ctx: Ctx = {
    t,
    vars,
    amount: formatMinor(vars.amountMinor, vars.currency),
    pickupDate: formatLocaleDate(vars.pickupDateIso, locale),
    holdDate: vars.holdDateIso ? formatLocaleDate(vars.holdDateIso, locale) : '',
    diff: typeof vars.diffMinor === 'number' && vars.diffMinor > 0 ? formatMinor(vars.diffMinor, vars.currency) : null,
  }

  const tpl = TEMPLATES[templateKey(kind, vars.variant)](ctx)
  const body = buildShell({ locale, tpl, t, tv, vars, subject: tpl.subject })
  return { subject: tpl.subject, html: body, locale }
}
