/**
 * lib/quotes/pdf-sample.ts — the per-locale sample document of the PDF spike (Phase 92, plan 92-07; D-14, B1, W4).
 *
 * A self-contained A4 page built ONLY from catalog strings that already exist on main (PaymentEmails.common.* labels,
 * PaymentEmails.policyBox.body formatted with sample values, LOCALE_ENDONYMS), an address in the locale's script and a
 * few amounts through formatMinor. It does not read the Quote namespace (92-03), so the early production proof PR of
 * 92-32 carries no new copy. Every value goes through escapeHtml; the document references nothing outside itself.
 */
import { createTranslator } from 'next-intl'
import { BCP47_TAG, LOCALE_ENDONYMS, rtlLocales, type AppLocale } from '@/i18n/locales'
import { escapeHtml } from '@/lib/email'
import { loadMessages } from '@/lib/payments/emails/render'
import { formatMinor } from '@/lib/payments/money'
import { fontFaceCss, fontStacks } from '@/lib/quotes/pdf-fonts'

/** Pickup and drop-off addresses written in the locale's own script (sample data, not a catalog string). */
const SAMPLE_ADDRESSES: Record<AppLocale, { from: string; to: string }> = {
  en: { from: 'Václav Havel Airport Prague, Aviatická 1017', to: 'Hotel Four Seasons, Veleslavínova 2a, Praha 1' },
  ru: { from: 'Аэропорт Вацлава Гавела Прага, Aviatická 1017', to: 'Отель Four Seasons, Veleslavínova 2a, Прага 1' },
  es: { from: 'Aeropuerto Václav Havel de Praga, Aviatická 1017', to: 'Hotel Four Seasons, Veleslavínova 2a, Praga 1' },
  fr: { from: 'Aéroport Václav Havel de Prague, Aviatická 1017', to: 'Hôtel Four Seasons, Veleslavínova 2a, Prague 1' },
  ar: { from: 'مطار فاتسلاف هافل براغ، أفياتيتسكا 1017', to: 'فندق فور سيزونز، فيليسلافينوفا 2أ، براغ 1' },
  hi: { from: 'वाक्लाव हावेल प्राग हवाई अड्डा, अविआतिका 1017', to: 'होटल फ़ोर सीज़न्स, वेलेस्लाविनोवा 2a, प्राग 1' },
  zh: { from: '布拉格瓦茨拉夫·哈维尔机场，Aviatická 1017', to: '布拉格四季酒店，老城区 Veleslavínova 2a' },
  'zh-hant': { from: '布拉格瓦茨拉夫·哈維爾機場，Aviatická 1017', to: '布拉格四季酒店，舊城區 Veleslavínova 2a' },
}

interface Translator {
  (key: string, values?: Record<string, string | number>): string
}

/** A fixed moment so the sample is stable: 2026-12-20 10:00 on the Europe/Prague wall clock, written per locale. */
function sampleDate(locale: AppLocale): string {
  return new Intl.DateTimeFormat(BCP47_TAG[locale], {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Prague',
  }).format(new Date('2026-12-20T09:00:00Z'))
}

export async function samplePdfHtml(locale: AppLocale): Promise<string> {
  const messages = await loadMessages(locale)
  const common = createTranslator({ locale, messages, namespace: 'PaymentEmails.common' } as never) as unknown as Translator
  const policy = createTranslator({ locale, messages, namespace: 'PaymentEmails.policyBox' } as never) as unknown as Translator

  const rtl = (rtlLocales as readonly string[]).includes(locale)
  const stacks = fontStacks(locale)
  const addr = SAMPLE_ADDRESSES[locale]
  const date = sampleDate(locale)

  const rows: Array<[string, string]> = [
    [common('referenceLabel'), 'PRG-2026-1220'],
    [common('dateLabel'), date],
    [common('fromLabel'), addr.from],
    [common('toLabel'), addr.to],
    [common('vehicleLabel'), 'Mercedes-Benz V-Class'],
    [common('passengersLabel'), '3'],
  ]
  const amounts: Array<[string, string]> = [
    [common('receiptLabel'), formatMinor(18500, 'eur')],
    [common('paySecurelyLabel'), formatMinor(4625, 'eur')],
    [LOCALE_ENDONYMS[locale], formatMinor(467500, 'czk')],
  ]
  const policyText = policy('body', {
    freeUntil: sampleDate(locale),
    percent: 50,
    amount: formatMinor(9250, 'eur'),
    waitMin: 60,
  })

  const rowHtml = rows
    .map(
      ([label, value]) =>
        `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join('')
  const amountHtml = amounts
    .map(
      ([label, value]) =>
        `<tr><th scope="row">${escapeHtml(label)}</th><td class="amt"><bdi dir="ltr">${escapeHtml(value)}</bdi></td></tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="${BCP47_TAG[locale]}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<title>Prestigo</title>
<style>
${fontFaceCss(locale)}
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: ${stacks.body}; font-size: 11pt; line-height: 1.6; color: #0F1D2C; background: #FFFFFF; }
.brand { font-family: ${stacks.heading}; font-size: 24pt; letter-spacing: .38em; color: #0F1D2C; margin: 0; font-weight: 400; }
.tagline { font-size: 8pt; letter-spacing: .24em; color: #8B6F3A; margin: 2mm 0 8mm; }
h2 { font-family: ${stacks.heading}; font-size: 15pt; font-weight: 500; color: #0F1D2C; border-bottom: 1px solid #BFA06A; padding-bottom: 2mm; margin: 8mm 0 4mm; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: start; padding: 2mm 0; vertical-align: top; border-bottom: 1px solid #E6D6B0; }
th { width: 34%; font-weight: 600; color: #4A5560; padding-inline-end: 4mm; }
td.amt { font-weight: 600; }
.box { background: #0F1D2C; color: #F3EEE3; padding: 5mm 6mm; margin-top: 8mm; border-inline-start: 1.2mm solid #BFA06A; }
.box strong { color: #E6D6B0; display: block; margin-bottom: 1mm; }
.foot { margin-top: 10mm; font-size: 9pt; color: #4A5560; }
</style>
</head>
<body>
<h1 class="brand">PRESTIGO</h1>
<p class="tagline">${escapeHtml(common('tagline'))}</p>
<h2>${escapeHtml(common('journeyLabel'))}</h2>
<table>${rowHtml}</table>
<h2>${escapeHtml(common('receiptLabel'))}</h2>
<table>${amountHtml}</table>
<div class="box"><strong>${escapeHtml(policy('label'))}</strong>${escapeHtml(policyText)}</div>
<p class="foot">${escapeHtml(common('assistanceLabel'))} ${escapeHtml(common('assistanceText', { contact: 'info@rideprestigo.com' }))}</p>
</body>
</html>`
}
