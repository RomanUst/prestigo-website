// The quote as a document (Phase 92, plan 92-20; QUOTE-07; D-03, D-09, D-14; T-92-64).
//
// renderQuoteDocumentHtml builds ONE self-contained HTML document of a frozen quote version in the version's language:
// dir rtl for Arabic, the embedded font faces of that language (lib/quotes/pdf-fonts.ts), inline CSS for A4, no script
// and no external URL. lib/quotes/documents.ts renders it once into the stored PDF that the email attaches and the quote
// page offers for download, so the attached file, the download and what was accepted are the same document.
//
// Every operator and client value is HTML-escaped. Server only (reads the font files and the catalogs).

import { BCP47_TAG, normalizeSiteLocale, rtlLocales, type AppLocale } from '@/i18n/locales'
import { escapeHtml } from '@/lib/email'
import { formatLocaleDate } from '@/lib/locale-date'
import { html, loadMessages, makeTranslator, type Translator } from '@/lib/payments/emails/render'
import { getPragueTodayISO } from '@/lib/prague-date'
import { fontFaceCss, fontStacks } from '@/lib/quotes/pdf-fonts'
import type { QuoteLineRow, QuoteRow, QuoteStopRow, QuoteVersionRow } from '@/lib/quotes/types'

export interface QuoteDocumentInput {
  quote: QuoteRow
  version: QuoteVersionRow
  lines: Array<QuoteLineRow & { stops: QuoteStopRow[] }>
}

/** The Prague calendar date the version was issued (frozen); today for a version that is not frozen. */
function issueDate(version: QuoteVersionRow, locale: AppLocale): string {
  const at = version.frozen_at && Number.isFinite(Date.parse(version.frozen_at)) ? new Date(version.frozen_at) : new Date()
  return formatLocaleDate(getPragueTodayISO(at), locale)
}

function documentCss(locale: AppLocale): string {
  const stacks = fontStacks(locale)
  return `${fontFaceCss(locale)}
@page { size: A4; margin: 16mm 16mm 18mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: ${stacks.body}; font-size: 10pt; line-height: 1.55; color: #0F1D2C; background: #FFFFFF; }
.brand { font-family: ${stacks.heading}; font-size: 22pt; letter-spacing: .38em; font-weight: 400; margin: 0; color: #0F1D2C; }
.rule { height: 0.6mm; background: #BFA06A; margin: 3mm 0 6mm; }
h1 { font-family: ${stacks.heading}; font-size: 18pt; font-weight: 400; margin: 0 0 2mm; color: #0F1D2C; }
.meta { margin: 0; color: #4A5560; }`
}

/** The heading block: brand, title, reference, version, issue date. */
function headerHtml(t: Translator, quote: QuoteRow, version: QuoteVersionRow, locale: AppLocale): string {
  return `<header>
<p class="brand">PRESTIGO</p>
<div class="rule"></div>
<h1>${escapeHtml(t('document.title'))}</h1>
<p class="meta">${escapeHtml(t('document.reference'))}: <bdi dir="ltr">${escapeHtml(quote.reference)}</bdi></p>
<p class="meta">${html(t, 'version', { number: String(version.version_no) })}</p>
<p class="meta">${html(t, 'document.issued', { date: issueDate(version, locale) })}</p>
</header>`
}

/**
 * The document of one quote version, in the version's language. Throws when a catalog key is missing (the translator
 * fails loudly): the caller renders no PDF rather than a document with holes.
 */
export async function renderQuoteDocumentHtml(input: QuoteDocumentInput): Promise<string> {
  const { quote, version } = input
  const locale = normalizeSiteLocale(version.locale)
  const messages = await loadMessages(locale)
  const t = makeTranslator(locale, messages, 'Quote')
  const rtl = (rtlLocales as readonly string[]).includes(locale)
  const dir = rtl ? 'rtl' : 'ltr'

  const title = `${t('document.title')} ${quote.reference}`

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
${documentCss(locale)}
</style>
</head>
<body>
${headerHtml(t, quote, version, locale)}
</body>
</html>`
}
