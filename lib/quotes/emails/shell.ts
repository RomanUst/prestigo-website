// The quote email shell (Phase 92, plan 92-13; QUOTE-07; D-09).
//
// One navy shell for every client email about a quote (sent, confirmed, remainder, cancelled, refunded). The per-locale
// rules are NOT kept here: the sentence joiner, the label style, the box, the contact line, the catalog loader and the
// message helpers all come from lib/payments/emails/render.ts (exported there), so a payment email and a quote email
// can never disagree about direction, label case or how Chinese sentences are joined. This module owns only the frame
// of a quote email and the sender.
//
// Copy comes from the QuoteEmails namespace (plan 92-29). Callers pass amounts as pre-formatted strings, escape every
// user value with `html()` (or the escapeHtml below) and never type an amount: there is no waiting amount anywhere.
//
// Server only (Resend, catalog imports). The Resend client is created on first send, never at module load.

import { Resend } from 'resend'
import type { AbstractIntlMessages } from 'next-intl'
import { normalizeSiteLocale, type AppLocale } from '@/i18n/locales'
import { CUSTOMER_REPLY_TO, emailLogoImg, escapeHtml } from '@/lib/email'
import {
  boxHtml,
  contactLine,
  html,
  joinLocaleSentences,
  loadMessages,
  makeTranslator,
  shellStyle,
  type Translator,
} from '@/lib/payments/emails/render'

export type { Translator }

/** The two translators every quote email needs: its own copy, and the shared payment-email brand strings. */
export interface QuoteEmailTranslators {
  locale: AppLocale
  /** Namespace QuoteEmails (plan 92-29). */
  t: Translator
  /** Namespace PaymentEmails: the tagline, the assistance label and the localized "or" of the contact line. */
  pay: Translator
}

function hasNamespaces(messages: AbstractIntlMessages): boolean {
  const m = messages as Record<string, unknown>
  return Boolean(m.QuoteEmails) && Boolean(m.PaymentEmails)
}

/**
 * Translators for the quote email language. An unknown or empty locale is English; a catalog without the QuoteEmails or
 * the PaymentEmails namespace renders in English instead of failing the send.
 */
export async function quoteEmailTranslator(localeInput: unknown): Promise<QuoteEmailTranslators> {
  let locale = normalizeSiteLocale(localeInput)
  let messages = await loadMessages(locale)
  if (locale !== 'en' && !hasNamespaces(messages)) {
    locale = 'en'
    messages = await loadMessages('en')
  }
  return {
    locale,
    t: makeTranslator(locale, messages, 'QuoteEmails'),
    pay: makeTranslator(locale, messages, 'PaymentEmails'),
  }
}

/** Only http(s) links go into a button: a scheme such as javascript: never reaches an href. */
function safeLink(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('quote email link is not a valid URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('quote email link must be an http(s) URL')
  return escapeHtml(value)
}

export interface QuoteEmailShellInput {
  tr: QuoteEmailTranslators
  /** Plain text; escaped into the title. Single line (the sender passes it on as the subject). */
  subject: string
  /** HTML built with html() from render.ts: every user value already escaped. */
  h1: string
  /** HTML paragraphs above the box. */
  paragraphs: string[]
  /** The Q-reference; shown as the label of the box. */
  reference?: string
  /** HTML lines of the highlight box (one total, the deposit ...). No box when empty. */
  lines?: string[]
  /** The one call to action. `label` is plain text, `url` an http(s) URL. */
  button?: { label: string; url: string }
  /** HTML sentences under the button. */
  footnotes?: string[]
}

const BODY_TEXT = 'font-size: 14px; font-weight: 400; color: #F3EEE3; line-height: 1.6;'

/** The navy shell of a quote email: gold line, logo, h1, paragraphs, box, button, contact, sign-off, tagline. */
export function renderQuoteEmailShell(input: QuoteEmailShellInput): string {
  const { tr, subject } = input
  const { locale, t, pay } = tr
  const st = shellStyle(locale)

  const paragraphs = input.paragraphs
    .map((p, i) => `<div style="${BODY_TEXT} padding: 0 32px; margin: 0 0 ${i === input.paragraphs.length - 1 ? '24px' : '12px'}; text-align: ${st.align};">${p}</div>`)
    .join('\n      ')

  const lines = input.lines ?? []
  const box =
    lines.length === 0
      ? ''
      : boxHtml(
          st,
          input.reference ? `<bdi dir="ltr">${escapeHtml(input.reference)}</bdi>` : '',
          lines.map((line, i) => `<div style="${BODY_TEXT}${i > 0 ? ' margin-top: 8px;' : ''}">${line}</div>`).join(''),
        )

  const button = input.button
    ? `
      <div style="text-align: center; padding: 8px 32px 24px;">
        <a href="${safeLink(input.button.url)}" style="display: inline-block; background-color: #BFA06A; color: #0F1D2C; padding: 16px 32px; text-decoration: none; font-size: 14px; font-weight: 600; font-family: 'Inter', Arial, sans-serif;">${escapeHtml(input.button.label)}</a>
      </div>`
    : ''

  const footnotes = (input.footnotes ?? []).filter((f) => f.length > 0)
  const notes =
    footnotes.length === 0
      ? ''
      : `
      <div style="${BODY_TEXT} padding: 0 32px 24px; text-align: ${st.align};">${joinLocaleSentences(locale, footnotes)}</div>`

  const assistance = `
      <div style="padding: 0 32px 24px; text-align: ${st.align};">
        <div style="${st.goldLabel} margin-bottom: 8px;">${html(pay, 'common.assistanceLabel')}</div>
        <div style="font-size: 14px; font-weight: 400; color: #A9AEB0; line-height: 1.6;">${joinLocaleSentences(locale, [escapeHtml(t('common.contact')), contactLine(pay)])}</div>
      </div>`

  return `<!DOCTYPE html>
<html lang="${locale}"${st.dirAttr}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400&family=Inter:wght@400;600&display=swap" rel="stylesheet">
</head>
<body${st.dirAttr} style="margin: 0; padding: 0; background-color: #0F1D2C;">
  <div style="background-color: #0F1D2C; padding: 0; margin: 0; font-family: 'Inter', Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #0F1D2C;">

      <div style="height: 2px; background: linear-gradient(90deg, #BFA06A 0%, #E6D6B0 50%, transparent 100%);"></div>

      <div style="padding: 32px 32px 16px; text-align: center;">
        ${emailLogoImg(28)}
      </div>

      <h1 style="font-family: 'Inter', Arial, sans-serif; font-size: 28px; font-weight: 400; color: #F3EEE3; text-align: center; margin: 0 0 16px; padding: 0 32px;">${input.h1}</h1>

      <!-- Divs, not p: some mail apps close a p at the first bdi and leave the rest unstyled. -->
      ${paragraphs}
${box}${button}${notes}
${assistance}

      <div style="${BODY_TEXT} padding: 0 32px 24px; text-align: ${st.align};">${escapeHtml(t('common.signoff'))}</div>

      <div style="padding-top: 8px; padding-bottom: 32px;">
        <div style="border-top: 1px solid #BFA06A; margin: 0 32px 24px;"></div>
        <div style="text-align: center; margin-bottom: 8px;">
          ${emailLogoImg(18)}
        </div>
        <div style="text-align: center; font-size: 11px; font-weight: 400; letter-spacing: 3px; color: #A9AEB0; font-family: 'Inter', Arial, sans-serif;">${escapeHtml(pay('common.tagline'))}</div>
      </div>

    </div>
  </div>
</body>
</html>`
}

// -- sender ------------------------------------------------------------------------------------------------------------

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY environment variable is not configured')
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

/**
 * Sends one quote email. The idempotency key makes a retry of the same message harmless. One attempt: the caller records
 * the outcome (email_sent / email_failed) and the operator can send again. Never throws; the log carries no address, no
 * subject and no link.
 */
export async function sendQuoteEmail(input: {
  to: string
  subject: string
  html: string
  idempotencyKey: string
  attachments?: Array<{ filename: string; content: Buffer }>
}): Promise<'sent' | 'failed'> {
  try {
    const result = await getResend().emails.send(
      {
        from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
        to: [input.to],
        replyTo: CUSTOMER_REPLY_TO,
        // Defence in depth: a header value never carries a line break.
        subject: input.subject.replace(/[\r\n]+/g, ' ').trim(),
        html: input.html,
        ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
      },
      { idempotencyKey: input.idempotencyKey },
    )
    if (result && result.error) throw new Error('resend rejected the message')
    return 'sent'
  } catch {
    console.error('[quote-email] send failed')
    return 'failed'
  }
}
