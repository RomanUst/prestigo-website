/**
 * Booking-payment locale maps (D-07).
 *
 * Two independent third-party locale/language vocabularies, neither of which
 * matches our 7-locale AppLocale set exactly:
 *
 * - Stripe Elements supports a fixed locale list (see
 *   @stripe/stripe-js's StripeElementLocale) that does NOT include Hindi.
 *   'auto' tells Stripe to detect the browser's locale instead of forcing
 *   English — the fix for the pre-existing defect where every non-EN
 *   booking rendered Stripe's payment form in English.
 * - Google Places (New) `language` param supports Hindi directly, but
 *   expects the Simplified-Chinese-specific tag `zh-CN` rather than the
 *   bare `zh` this app uses as its AppLocale code.
 */
import type { StripeElementLocale } from '@stripe/stripe-js'
import type { AppLocale } from '@/i18n/locales'

export const STRIPE_ELEMENTS_LOCALE: Record<AppLocale, StripeElementLocale> = {
  en: 'en',
  ru: 'ru',
  es: 'es',
  fr: 'fr',
  ar: 'ar',
  hi: 'auto', // Stripe has no Hindi locale — let Stripe auto-detect instead of forcing English.
  zh: 'zh',
}

export const PLACES_LANGUAGE: Record<AppLocale, string> = {
  en: 'en',
  ru: 'ru',
  es: 'es',
  fr: 'fr',
  ar: 'ar',
  hi: 'hi',
  zh: 'zh-CN', // Google Places expects the Simplified-Chinese-specific tag.
}
