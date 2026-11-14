-- Migration 090: the card consent record accepts every supported site locale.
--
-- booking_payment_consents.locale was limited to the 7 locales that existed when migration 085 was written. The site
-- now also serves zh-hant, and recordConsent() stores the page locale, so a card booking made on /zh-hant failed on
-- this CHECK ("consent record failed") before the client could save a card. Widening only: no row is changed.
--
-- Keep this list equal to `locales` in i18n/locales.ts (tests/consent-locale-check.test.ts fails when they differ).

ALTER TABLE public.booking_payment_consents
  DROP CONSTRAINT IF EXISTS booking_payment_consents_locale_check;

ALTER TABLE public.booking_payment_consents
  ADD CONSTRAINT booking_payment_consents_locale_check
  CHECK (locale IN ('en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh', 'zh-hant'));
