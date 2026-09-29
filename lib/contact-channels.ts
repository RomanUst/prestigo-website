/**
 * Public contact-channel constants (Phase 77 D-16, Phase 78 D-22 / WA-04).
 *
 * Single source of the public business number: BUSINESS_PHONE_E164_VALUE below
 * is the ONLY literal of it in code. Every wa.me link, tel: link, visible
 * number and form placeholder is derived from it. The value is changed only by
 * plan 78-14, after the go-live test and the owner's go decision. Locale
 * content JSON keeps literals; tests/business-number-guard.test.ts proves they
 * all equal this constant.
 *
 * Plain constants only: no env reads, no infrastructure hosts, no imports
 * (client components import this file). The wa.me link without prefilled text
 * is the launcher variant, so localized pages do not send English.
 * TELEGRAM_BOT_USERNAME must equal confirmedUsername in
 * infra/chatwoot/telegram/bot-profile.json (test-enforced).
 */
const BUSINESS_PHONE_E164_VALUE = '+420725986855'

/** E.164 form: '+420' followed by nine digits. */
export const BUSINESS_PHONE_E164 = BUSINESS_PHONE_E164_VALUE

/** E.164 without the leading plus (the wa.me path segment). */
export const BUSINESS_PHONE_DIGITS = BUSINESS_PHONE_E164.slice(1)

/** '+420 ddd ddd ddd' as shown to visitors. */
export const BUSINESS_PHONE_DISPLAY = [
  BUSINESS_PHONE_E164.slice(0, 4),
  BUSINESS_PHONE_E164.slice(4, 7),
  BUSINESS_PHONE_E164.slice(7, 10),
  BUSINESS_PHONE_E164.slice(10, 13),
].join(' ')

/** DISPLAY with hyphens: the contactPoint format used in structured data. */
export const BUSINESS_PHONE_SCHEMA_HYPHEN = BUSINESS_PHONE_DISPLAY.replace(/ /g, '-')

/** href for a tel: link. */
export const BUSINESS_TEL_URL = `tel:${BUSINESS_PHONE_E164}`

export const WHATSAPP_CHAT_URL = `https://wa.me/${BUSINESS_PHONE_DIGITS}`

/** wa.me link with a prefilled message (encodeURIComponent form). */
export function whatsappUrlWithText(text: string): string {
  return `${WHATSAPP_CHAT_URL}?text=${encodeURIComponent(text)}`
}

export const TELEGRAM_BOT_USERNAME = 'PrestigoChauffeurBot'

export const TELEGRAM_CHAT_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`
