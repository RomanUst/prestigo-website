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
 * - amounts, times, references, contact line in <bdi dir="ltr">; localized dates and addresses in
 *   <bdi dir="auto"> so Latin text inside Arabic keeps its order
 * - every user-supplied string HTML-escaped; UTF-8 only, no named entities
 * - payment_failed is the only email with a filled button
 * - fee and refund wording is a positive allow-list (Phase 89, replaces the Phase 88 blanket ban): only the
 *   cancellation box (`policyBox.*` keys, rendered for templates flagged `policyBox` when the booking stored a
 *   policy) and the kinds of UI-SPEC 8.2 (cancelled, fee_charged, fee_waived, card_saved cash, payment_failed fee,
 *   with the shared `money.*` sentences) may state a fee, a percent or a refund. Every other line of card_saved,
 *   hold_placed and charged stays free of it; tests/payments-copy-i18n.test.ts enforces the list per locale.
 * - no template accepts or renders a reason or a note: operator text never reaches a client (T-89-13). A required
 *   var that is missing (freeUntil, waitMin, feeMinor) makes the render throw instead of leaving a parameter open.
 * - the contact pair of "Need assistance?" is built here with a localized "or" (`PaymentEmails.contactOr`);
 *   EMAIL_CONTACT_LINE stays for the English-only legacy emails of lib/email.ts.
 * - the Manage booking button is outlined (payment_failed stays the only filled button) and is present only when
 *   vars.manageUrl is set, which the sender does only for a booking that stored a policy (D-18)
 *
 * Server-only by usage (loads catalogs through dynamic imports and renders
 * HTML for Resend); it imports nothing that needs the browser.
 */
import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import { normalizeSiteLocale, rtlLocales, type AppLocale } from '@/i18n/locales'
import { formatLocaleDate, formatLocaleDateTime } from '@/lib/locale-date'
import { emailLogoImg, escapeHtml } from '@/lib/email'
import { BUSINESS_PHONE_DISPLAY, BUSINESS_TEL_URL } from '@/lib/contact-channels'
import { formatMinor, type PaymentCurrency } from '@/lib/payments/money'

export type PaymentEmailKind =
  | 'card_saved'
  | 'hold_placed'
  | 'charged'
  | 'payment_failed'
  | 'cancelled'
  | 'fee_charged'
  | 'fee_waived'

/**
 * Variants by kind (UI-SPEC 8.2): card_saved cash; cancelled free, by_prestigo, late; fee_charged late_cancel,
 * no_show, cash_unpaid, cash_card; payment_failed declined, auth_required, fee; hold_placed at_checkout, scheduled.
 */
export type PaymentEmailVariant =
  | 'at_checkout'
  | 'scheduled'
  | 'declined'
  | 'auth_required'
  | 'cash'
  | 'free'
  | 'by_prestigo'
  | 'late'
  | 'late_cancel'
  | 'no_show'
  | 'cash_unpaid'
  | 'cash_card'
  | 'fee'

/** What happened to the client's money when a booking was cancelled or a fee was waived. */
export type PaymentMoneyOutcome = 'released' | 'refunded' | 'none'

/** What a failed fee charge was for (payment_failed variant fee). */
export type PaymentFeeLabel = 'cancellation' | 'no_show' | 'trip'

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
  variant?: PaymentEmailVariant
  diffMinor?: number
  payUrl?: string
  calendarUrl?: string
  /** Localized absolute https URL of the manage page; absent unless the booking stored a policy (D-18). */
  manageUrl?: string
  /** Terms for the cancellation box, from the booking's stored policy; absent when it stored none. */
  policy?: PolicyBoxVars
  /**
   * Amount of the fee or charge the mail is about, minor units of `currency` (cancelled late: the proposed fee;
   * fee_charged late_cancel and no_show: the amount charged; payment_failed fee: the amount to pay). When absent,
   * cash_unpaid, cash_card and a "trip" fee fall back to `amountMinor`; the other variants refuse to render.
   * There is deliberately no reason or note field: nothing an operator typed can reach a client (T-89-13).
   */
  feeMinor?: number
  /** Amount refunded when moneyOutcome is 'refunded'; falls back to `amountMinor`. */
  refundMinor?: number
  /** cancelled and fee_waived: released the hold, refunded a payment, or nothing was taken. Default 'none'. */
  moneyOutcome?: PaymentMoneyOutcome
  /** payment_failed fee: what the fee was for. Default 'trip'. */
  feeLabel?: PaymentFeeLabel
  /** End of free cancellation: epoch ms or an ISO string. Required by cancelled late and fee_charged late_cancel. */
  freeUntil?: number | string
  /** Minutes the driver waited. Required by fee_charged no_show. */
  waitMin?: number
  /** Localized absolute https URL of the booking page, for the "Book another ride" button of cancelled and fee_waived. */
  bookAgainUrl?: string
}

export interface PolicyBoxVars {
  /** End of free cancellation, epoch ms; shown on the Europe/Prague wall clock. */
  freeUntilMs: number
  /** Share of the fare that applies after the free period, 1..100. */
  percent: number
  /** That share in minor units of vars.currency (never typed in the catalog). */
  feeAmountMinor: number
  /** Minutes the driver waits before a no-show. */
  waitMin: number
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

/**
 * Parameters that are localized words (a long date such as "12 نوفمبر 2026"), isolated with dir="auto" so an RTL reader
 * reads them in their own order (88-REVIEW C-IN-01). Amounts, references and times stay ltr.
 */
const AUTO_DIR_PARAMS: ReadonlySet<string> = new Set(['holdDate', 'freeUntil', 'contact'])

/**
 * The contact pair of "Need assistance?" with a localized "or" (88 deferred item: the shared EMAIL_CONTACT_LINE says
 * an English "or" in every language). Each link is isolated ltr; the word between them sets the direction of the pair.
 */
const CONTACT_LINK_STYLE = 'color: #BFA06A; text-decoration: none;'
function contactLine(t: Translator): string {
  const mail = `<bdi dir="ltr"><a href="mailto:info@rideprestigo.com" style="${CONTACT_LINK_STYLE}">info@rideprestigo.com</a></bdi>`
  const phone = `<bdi dir="ltr"><a href="${BUSINESS_TEL_URL}" style="${CONTACT_LINK_STYLE}">${BUSINESS_PHONE_DISPLAY}</a></bdi>`
  return `${mail} ${escapeHtml(t('contactOr'))} ${phone}`
}

/**
 * HTML message: catalog text escaped, parameters inserted as bdi ltr (localized dates: bdi auto).
 * `trustedHtml` parameters are our own markup (the contact links) and are inserted unescaped.
 */
function html(
  t: Translator,
  key: string,
  params: Record<string, string> = {},
  trustedHtml: Record<string, string> = {},
): string {
  const names = [...Object.keys(params), ...Object.keys(trustedHtml)]
  const tokens = Object.fromEntries(names.map((k) => [k, `${TOKEN_OPEN}${k}${TOKEN_CLOSE}`]))
  const out = escapeHtml(t(key, tokens))
  return out.replace(
    TOKEN_RE,
    (_m, name: string) =>
      `<bdi dir="${AUTO_DIR_PARAMS.has(name) ? 'auto' : 'ltr'}">${trustedHtml[name] ?? escapeHtml(params[name] ?? '')}</bdi>`,
  )
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
  locale: AppLocale
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
  /** Lines of the kind-specific box; none = no box (cancelled free and by_prestigo, fee_waived). */
  lines: string[]
  cta?: 'calendar' | 'pay' | 'book'
  /** Confirmation family: carries the cancellation box and the Manage booking button when the vars have them. */
  policyBox?: boolean
  /** Cash booking: the cancellation box gets the extra "you pay in cash" sentence (UI-SPEC 8.1). */
  cashBox?: boolean
  /** Amount on the pay button when it is not the booking amount (payment_failed fee). */
  payAmountMinor?: number
  /** Contact line of "Need assistance?" in the primary text colour (cancelled by Prestigo). */
  emphasiseContact?: boolean
}

// --- Phase 89 helpers: a missing required var is a render failure, never an unresolved parameter in a client mail. ---

function need<T>(value: T | null | undefined, kind: string, name: string): T {
  if (value === null || value === undefined) throw new Error(`payment email ${kind} needs ${name}`)
  return value
}

function needMinor(c: Ctx, kind: string, name: string, value: number | undefined): string {
  const minor = need(value, kind, name)
  if (!Number.isFinite(minor) || minor < 0) throw new Error(`payment email ${kind}: ${name} is not an amount`)
  return formatMinor(minor, c.vars.currency)
}

/** End of the free period on the Europe/Prague wall clock, from epoch ms or an ISO string. */
function freeUntilText(c: Ctx, kind: string): string {
  const raw = need(c.vars.freeUntil, kind, 'freeUntil')
  const ms = typeof raw === 'number' ? raw : Date.parse(raw)
  if (!Number.isFinite(ms)) throw new Error(`payment email ${kind}: freeUntil is not a date`)
  return formatLocaleDateTime(ms, c.locale)
}

function waitMinText(c: Ctx, kind: string): string {
  const min = need(c.vars.waitMin, kind, 'waitMin')
  if (!Number.isFinite(min) || min <= 0) throw new Error(`payment email ${kind}: waitMin is not a duration`)
  return String(Math.round(min))
}

/**
 * The money sentence of cancelled and fee_waived (UI-SPEC 8.2). `free`: "Nothing was charged. The hold on your card is
 * released." / refund / "Nothing was charged."; `sorry` (cancelled by Prestigo, already says "you are not charged"):
 * release or refund only; `waived`: release, refund, or "Nothing was charged."
 */
function moneySentence(c: Ctx, mode: 'free' | 'sorry' | 'waived'): string {
  const outcome = c.vars.moneyOutcome ?? 'none'
  const nothing = html(c.t, 'money.nothing')
  const released = html(c.t, 'money.released')
  if (outcome === 'refunded') {
    const minor = c.vars.refundMinor ?? c.vars.amountMinor
    return html(c.t, 'money.refunded', { amount: formatMinor(minor, c.vars.currency) })
  }
  if (outcome === 'released') return mode === 'free' ? `${nothing} ${released}` : released
  return mode === 'sorry' ? '' : nothing
}

const joinSentences = (parts: string[]): string => parts.filter((p) => p.length > 0).join(' ')

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
    policyBox: true,
  }),
  // Cash booking: the card is only a guarantee (UI-SPEC 8.2). No hold, no charge, no hold date.
  'card_saved:cash': (c) => ({
    subject: text(c.t, 'cardSaved.subject', { reference: c.vars.reference }),
    h1: html(c.t, 'cardSaved.h1'),
    intro: html(c.t, 'cardSaved.introCash'),
    highlightLabel: html(c.t, 'common.howPaymentWorksLabel'),
    lines: [
      html(c.t, 'cardSaved.cashLineToday'),
      html(c.t, 'cardSaved.cashLineDay', { amount: c.amount }),
      html(c.t, 'cardSaved.cashLineIfNeeded', { freeUntil: freeUntilText(c, 'card_saved:cash') }),
    ],
    cta: 'calendar',
    policyBox: true,
    cashBox: true,
  }),
  'cancelled:free': (c) => ({
    subject: text(c.t, 'cancelled.subject', { reference: c.vars.reference }),
    h1: html(c.t, 'cancelled.h1'),
    intro: moneySentence(c, 'free'),
    highlightLabel: '',
    lines: [],
    cta: 'book',
  }),
  'cancelled:by_prestigo': (c) => ({
    subject: text(c.t, 'cancelled.subject', { reference: c.vars.reference }),
    h1: html(c.t, 'cancelled.h1ByPrestigo'),
    intro: joinSentences([html(c.t, 'cancelled.introSorry'), moneySentence(c, 'sorry')]),
    highlightLabel: '',
    lines: [],
    cta: 'book',
    emphasiseContact: true,
  }),
  'cancelled:late': (c) => ({
    subject: text(c.t, 'cancelled.subject', { reference: c.vars.reference }),
    h1: html(c.t, 'cancelled.h1'),
    intro: html(c.t, 'cancelled.introLate', {
      freeUntil: freeUntilText(c, 'cancelled:late'),
      amount: needMinor(c, 'cancelled:late', 'feeMinor', c.vars.feeMinor),
    }),
    highlightLabel: html(c.t, 'common.whatNextLabel'),
    lines: [html(c.t, 'cancelled.lateNext')],
    cta: 'book',
  }),
  'fee_charged:late_cancel': (c) => {
    const freeUntil = freeUntilText(c, 'fee_charged:late_cancel')
    return {
      subject: text(c.t, 'feeCharged.subjectLateCancel', { reference: c.vars.reference }),
      h1: html(c.t, 'feeCharged.h1LateCancel'),
      intro: html(c.t, 'feeCharged.introLateCancel', {
        reference: c.vars.reference,
        freeUntil,
        amount: needMinor(c, 'fee_charged:late_cancel', 'feeMinor', c.vars.feeMinor),
      }),
      highlightLabel: html(c.t, 'common.receiptLabel'),
      lines: [
        html(c.t, 'charged.total', { amount: needMinor(c, 'fee_charged:late_cancel', 'feeMinor', c.vars.feeMinor) }),
        html(c.t, 'feeCharged.reasonLateCancel', { freeUntil }),
        html(c.t, 'common.decides'),
      ],
    }
  },
  'fee_charged:no_show': (c) => {
    const waitMin = waitMinText(c, 'fee_charged:no_show')
    const fee = needMinor(c, 'fee_charged:no_show', 'feeMinor', c.vars.feeMinor)
    return {
      subject: text(c.t, 'feeCharged.subjectNoShow', { reference: c.vars.reference }),
      h1: html(c.t, 'feeCharged.h1NoShow'),
      intro: html(c.t, 'feeCharged.introNoShow', { waitMin, amount: fee }),
      highlightLabel: html(c.t, 'common.receiptLabel'),
      lines: [
        html(c.t, 'charged.total', { amount: fee }),
        html(c.t, 'feeCharged.reasonNoShow', { waitMin }),
        html(c.t, 'common.decides'),
      ],
    }
  },
  'fee_charged:cash_unpaid': (c) => {
    const amount = formatMinor(c.vars.feeMinor ?? c.vars.amountMinor, c.vars.currency)
    return {
      subject: text(c.t, 'feeCharged.subjectCashUnpaid', { reference: c.vars.reference }),
      h1: html(c.t, 'feeCharged.h1CashUnpaid'),
      intro: html(c.t, 'feeCharged.introCashUnpaid', { pickupDate: c.pickupDate, amount }),
      highlightLabel: html(c.t, 'common.receiptLabel'),
      lines: [html(c.t, 'charged.total', { amount }), html(c.t, 'feeCharged.reasonCashUnpaid')],
    }
  },
  'fee_charged:cash_card': (c) => {
    const amount = formatMinor(c.vars.feeMinor ?? c.vars.amountMinor, c.vars.currency)
    return {
      subject: text(c.t, 'charged.subject', { reference: c.vars.reference }),
      h1: html(c.t, 'charged.h1'),
      intro: html(c.t, 'feeCharged.introCashCard', { amount }),
      highlightLabel: html(c.t, 'common.receiptLabel'),
      lines: [html(c.t, 'charged.total', { amount })],
    }
  },
  fee_waived: (c) => ({
    subject: text(c.t, 'feeWaived.subject', { reference: c.vars.reference }),
    h1: html(c.t, 'feeWaived.h1'),
    intro: joinSentences([html(c.t, 'feeWaived.intro'), moneySentence(c, 'waived')]),
    highlightLabel: '',
    lines: [],
    cta: 'book',
  }),
  'payment_failed:fee': (c) => {
    const label = c.vars.feeLabel ?? 'trip'
    const minor =
      label === 'trip'
        ? (c.vars.feeMinor ?? c.vars.amountMinor)
        : need(c.vars.feeMinor, 'payment_failed:fee', 'feeMinor')
    const introKey = label === 'cancellation' ? 'introFeeCancellation' : label === 'no_show' ? 'introFeeNoShow' : 'introFeeTrip'
    return {
      subject: text(c.t, 'paymentFailed.subjectFee', { reference: c.vars.reference }),
      h1: html(c.t, 'paymentFailed.h1Fee'),
      intro: html(c.t, `paymentFailed.${introKey}`, { amount: formatMinor(minor, c.vars.currency) }),
      highlightLabel: html(c.t, 'common.paySecurelyLabel'),
      lines: [html(c.t, 'paymentFailed.body')],
      cta: 'pay',
      payAmountMinor: minor,
    }
  },
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
    policyBox: true,
  }),
  'hold_placed:scheduled': (c) => ({
    subject: text(c.t, 'holdPlacedScheduled.subject', { reference: c.vars.reference }),
    h1: html(c.t, 'holdPlacedScheduled.h1'),
    intro: html(c.t, 'holdPlacedScheduled.intro', { amount: c.amount, pickupDate: c.pickupDate }),
    highlightLabel: html(c.t, 'common.whatNextLabel'),
    lines: [html(c.t, 'holdPlacedScheduled.next')],
    policyBox: true,
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
  cancelled: 'free',
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
  // C-IN-01: the localized date reads in its own direction; the clock time stays ltr.
  const dateTime = `<bdi dir="auto">${escapeHtml(date)}</bdi>, <bdi dir="ltr">${escapeHtml(vars.pickupTime)}</bdi>`

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
  const highlightBox =
    tpl.lines.length === 0
      ? ''
      : box(
          tpl.highlightLabel,
          tpl.lines
            .map(
              (line, i) =>
                `<div style="font-size: 14px; font-weight: 400; color: #F3EEE3; line-height: 1.6;${i > 0 ? ' margin-top: 8px;' : ''}">${line}</div>`,
            )
            .join(''),
        )

  // Cancellation box (UI-SPEC 8.1): only for a confirmation-family template whose booking stored a policy.
  let policyBox = ''
  if (tpl.policyBox && vars.policy) {
    const p = vars.policy
    const body = html(t, 'policyBox.body', {
      freeUntil: formatLocaleDateTime(p.freeUntilMs, locale),
      percent: String(p.percent),
      amount: formatMinor(p.feeAmountMinor, vars.currency),
      waitMin: String(p.waitMin),
    })
    // Cash booking (UI-SPEC 8.1): one more sentence, the card is only a guarantee.
    const cash = tpl.cashBox
      ? `<div style="font-size: 14px; font-weight: 400; color: #F3EEE3; line-height: 1.6; margin-top: 8px;">${html(t, 'policyBox.cash', { amount: formatMinor(vars.amountMinor, vars.currency) })}</div>`
      : ''
    policyBox = box(
      html(t, 'policyBox.label'),
      `<div style="font-size: 14px; font-weight: 400; color: #F3EEE3; line-height: 1.6;">${body}</div>${cash}`,
    )
  }

  // Manage booking: outlined, below Add to calendar (16px apart) when that button exists.
  const manageHref = tpl.policyBox && vars.manageUrl ? escapeHtml(safeHttpsUrl(vars.manageUrl, 'manageUrl')) : null
  const hasCalendar = tpl.cta === 'calendar' && Boolean(vars.calendarUrl)
  const manage = manageHref
    ? `
      <div style="text-align: center; padding: ${hasCalendar ? '0' : '8px'} 32px 24px;">
        <a href="${manageHref}" style="display: inline-block; border: 1px solid #BFA06A; color: #E6D6B0; padding: 16px 32px; text-decoration: none; font-size: 14px; font-weight: 400; letter-spacing: normal; font-family: 'Inter', Arial, sans-serif;">${html(t, 'manage.cta')}</a>
        <div style="font-size: 11px; font-weight: 400; color: #A9AEB0; line-height: 1.6; margin-top: 8px;">${html(t, 'manage.note')}</div>
      </div>`
    : ''

  let cta = ''
  if (tpl.cta === 'calendar' && vars.calendarUrl) {
    const href = escapeHtml(safeHttpsUrl(vars.calendarUrl, 'calendarUrl'))
    cta = `
      <div style="text-align: center; padding: 8px 32px ${manageHref ? '16px' : '24px'};">
        <a href="${href}" style="display: inline-block; border: 1px solid #BFA06A; color: #BFA06A; padding: 12px 24px; text-decoration: none; font-size: 11px; font-weight: 400; ${upper ? 'letter-spacing: 2px; text-transform: uppercase;' : 'letter-spacing: normal;'} font-family: 'Inter', Arial, sans-serif;">${html(t, 'common.calendarCta')}</a>
      </div>`
  } else if (tpl.cta === 'book') {
    // "Book another ride": outlined like Manage booking, so payment_failed stays the only filled button.
    if (vars.bookAgainUrl) {
      const href = escapeHtml(safeHttpsUrl(vars.bookAgainUrl, 'bookAgainUrl'))
      cta = `
      <div style="text-align: center; padding: 8px 32px 24px;">
        <a href="${href}" style="display: inline-block; border: 1px solid #BFA06A; color: #E6D6B0; padding: 16px 32px; text-decoration: none; font-size: 14px; font-weight: 400; letter-spacing: normal; font-family: 'Inter', Arial, sans-serif;">${html(t, 'common.bookAgainCta')}</a>
      </div>`
    }
  } else if (tpl.cta === 'pay') {
    if (!vars.payUrl) throw new Error('payUrl is required for payment_failed')
    const href = escapeHtml(safeHttpsUrl(vars.payUrl, 'payUrl'))
    const label = html(t, 'paymentFailed.cta', { amount: formatMinor(tpl.payAmountMinor ?? vars.amountMinor, vars.currency) })
    cta = `
      <div style="text-align: center; padding: 8px 32px 24px;">
        <a href="${href}" style="display: inline-block; background-color: #BFA06A; color: #0F1D2C; padding: 16px 32px; text-decoration: none; font-size: 14px; font-weight: 600; font-family: 'Inter', Arial, sans-serif;">${label}</a>
      </div>`
  }

  const assistance = `
      <div style="padding: 24px 32px; text-align: ${align};">
        <div style="${goldLabel} margin-bottom: 8px;">${html(t, 'common.assistanceLabel')}</div>
        <div style="font-size: 14px; font-weight: 400; color: ${tpl.emphasiseContact ? '#F3EEE3' : '#A9AEB0'}; line-height: 1.6;">${html(t, 'common.assistanceText', {}, { contact: contactLine(t) })}</div>
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

      <!-- A div, not a p: some mail apps close a p at the first bdi and leave the rest unstyled (black, no padding). -->
      <div style="font-size: 14px; font-weight: 400; color: #F3EEE3; line-height: 1.6; padding: 0 32px; margin: 0 0 24px; text-align: ${align};">${tpl.intro}</div>
${referenceBox}
${highlightBox}

      <div style="padding: 0 32px 24px; text-align: ${align};">
        <div style="${goldLabel} margin-bottom: 12px;">${html(t, 'common.journeyLabel')}</div>
        <table role="presentation" style="width: 100%; border-collapse: collapse;">${journey}
        </table>
      </div>
${policyBox}
${cta}${manage}
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
    locale,
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
