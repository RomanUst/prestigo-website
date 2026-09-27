#!/usr/bin/env python3
"""Unit tests for scripts/qa/en_leak_rendered.py (Phase 75 Plan 26, GAP-4b / WINDOWS #24).

Stdlib unittest only — no network, no browser. Run with:
    python3 -m unittest discover -s scripts/qa -p 'test_*.py'

The scanner module loads scripts/qa/en_leak_allowlist.json at import time, so
these tests exercise the REAL allowlist entries (properNouns, inlineTerms, …),
not fixtures — an over-broad allowlist entry makes an over-masking guard fail.
"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import en_leak_rendered as scanner  # noqa: E402


def text_leaks(text, locale, path='/'):
    return scanner.collect_leaks({'texts': [text]}, path, locale)


class ProperNounsTest(unittest.TestCase):
    def test_person_name_not_a_leak_ru(self):
        self.assertEqual(text_leaks('Roman Ustyugov — основатель PRESTIGO', 'ru'), [])

    def test_bare_person_name_not_a_leak_ar_hi_zh(self):
        for loc in ('ar', 'hi', 'zh'):
            self.assertEqual(text_leaks('Roman Ustyugov', loc), [], loc)

    def test_identical_en_sentence_still_leaks_es(self):
        s = 'Founder of PRESTIGO. 10+ years in luxury transportation and 5★ hospitality in Prague.'
        leaks = scanner.collect_es_fr_leaks({'texts': [s]}, {s}, 'es')
        self.assertEqual(len(leaks), 1)
        self.assertEqual(leaks[0]['kind'], 'identical-to-en')

    def test_identical_proper_noun_only_not_a_leak_fr(self):
        s = 'Roman Ustyugov'
        self.assertEqual(scanner.collect_es_fr_leaks({'texts': [s]}, {s}, 'fr'), [])


class BoundaryAwareStripTest(unittest.TestCase):
    def test_token_not_cut_out_of_longer_word(self):
        # 'Service' is a tierNames token; it must not be stripped out of 'Services'.
        stripped = scanner.strip_allow('Our Services here', 'fr')
        self.assertIn('Services', stripped)

    def test_token_stripped_when_standalone(self):
        stripped = scanner.strip_allow('Service client', 'fr')
        self.assertNotIn('Service', stripped)

    def test_token_stripped_next_to_non_latin_letters(self):
        stripped = scanner.strip_allow('Прага Prestigoв', 'ru')
        self.assertNotIn('Prestigo', stripped)

    def test_regex_metacharacters_in_tokens_are_literal(self):
        # 'Prague → {city}' and 'EUR — €' contain regex metacharacters.
        stripped = scanner.strip_allow('Prague → {city}', 'fr')
        self.assertNotIn('Prague', stripped)


class PagesFilterTest(unittest.TestCase):
    def test_default_is_full_page_list(self):
        self.assertEqual(scanner.parse_pages(None), scanner.PAGES)
        self.assertEqual(scanner.parse_pages(''), scanner.PAGES)

    def test_single_page(self):
        self.assertEqual(scanner.parse_pages('/authors/roman-ustyugov'), ['/authors/roman-ustyugov'])

    def test_comma_list(self):
        self.assertEqual(scanner.parse_pages('/faq, /book'), ['/faq', '/book'])


class InlineTermsTest(unittest.TestCase):
    def test_ar_usb_wifi_with_attached_connector(self):
        self.assertEqual(text_leaks('تتوفر في كل مركبة منافذ شحن USB-A وUSB-C، وشبكة Wi-Fi', 'ar'), [])

    def test_zh_payment_methods(self):
        s = '我们接受 Visa、Mastercard、American Express，以及通过 Stripe 支付的 Apple Pay / Google Pay'
        self.assertEqual(text_leaks(s, 'zh'), [])

    def test_ru_model_designations(self):
        s = 'PRESTIGO управляет автопарком Mercedes-Benz: E-Class (E 220 d или E 300 de Hybrid)'
        self.assertEqual(text_leaks(s, 'ru'), [])

    def test_ar_bare_mercedes_with_class(self):
        self.assertEqual(text_leaks('سيارة Mercedes E-Class أو Mercedes S-Class', 'ar'), [])


class StructuralStripTest(unittest.TestCase):
    def test_placeholder_email_attr_ar(self):
        self.assertEqual(scanner.collect_leaks({'attrs': ['ahmed@email.com']}, '/contact', 'ar'), [])

    def test_path_tokens_in_ru_prose(self):
        s = 'Забронируйте поездку на странице /book или /book/multi-day заранее'
        self.assertEqual(text_leaks(s, 'ru'), [])

    def test_https_url_in_zh(self):
        self.assertEqual(text_leaks('访问 https://rideprestigo.com/zh/book 预订', 'zh'), [])

    def test_slash_between_words_is_not_a_path(self):
        # 'and/or' and 'km/h' are not path tokens — the words must still count.
        self.assertTrue(scanner.has_significant_words('pickup and/or dropoff', 2, 'ru'))


class OverMaskingGuardTest(unittest.TestCase):
    def test_flight_tracking_still_leaks_ru(self):
        self.assertEqual(len(text_leaks('Flight tracking included', 'ru')), 1)

    def test_hi_latin_loanwords_still_leak(self):
        self.assertEqual(len(text_leaks('airport pickup के लिए फ़्लाइट ट्रैकिंग', 'hi')), 1)

    def test_page_not_found_still_leaks_everywhere(self):
        for loc in ('ru', 'ar', 'hi', 'zh'):
            self.assertEqual(len(text_leaks('Page not found', loc)), 1, loc)
        for loc in ('es', 'fr'):
            s = 'Page not found here'
            self.assertEqual(len(scanner.collect_es_fr_leaks({'texts': [s]}, {s}, loc)), 1, loc)

    def test_genuine_english_next_to_inline_terms_still_leaks(self):
        self.assertEqual(len(text_leaks('Free Wi-Fi and USB-C charging on board', 'ar')), 1)


class ClassifiedResidualTest(unittest.TestCase):
    ENTRY = {'value': 'Quoted Customer Name', 'reason': 'test: quoted customer name', 'pages': ['/p']}

    def test_page_scoped_match_moves_to_allowlisted(self):
        leaks = [{'kind': 'text', 'value': 'Quoted Customer Name'}, {'kind': 'text', 'value': 'Real leak here'}]
        remaining, moved = scanner.apply_classified_residual(leaks, 'ru', '/p', entries=[self.ENTRY])
        self.assertEqual(remaining, [{'kind': 'text', 'value': 'Real leak here'}])
        self.assertEqual(len(moved), 1)
        self.assertEqual(moved[0]['reason'], 'classified: test: quoted customer name')

    def test_other_page_unaffected(self):
        leaks = [{'kind': 'text', 'value': 'Quoted Customer Name'}]
        remaining, moved = scanner.apply_classified_residual(leaks, 'ru', '/q', entries=[self.ENTRY])
        self.assertEqual(remaining, leaks)
        self.assertEqual(moved, [])

    def test_locale_scoped_entry(self):
        entry = {**self.ENTRY, 'locales': ['hi']}
        leaks = [{'kind': 'text', 'value': 'Quoted Customer Name'}]
        self.assertEqual(scanner.apply_classified_residual(leaks, 'ru', '/p', entries=[entry])[0], leaks)
        self.assertEqual(scanner.apply_classified_residual(leaks, 'hi', '/p', entries=[entry])[0], [])

    def test_real_allowlist_category_exists(self):
        self.assertIsInstance(scanner.ALLOWLIST.get('classifiedResidual'), list)


class LocaleScopedTokensTest(unittest.TestCase):
    def setUp(self):
        self.patch = mock.patch.dict(
            scanner.ALLOWLIST,
            {'inlineTerms': list(scanner.ALLOWLIST.get('inlineTerms', []))
             + [{'value': 'zzqx wwvy', 'reason': 'test-only locale-scoped term', 'locales': ['hi']}]},
        )
        self.patch.start()
        scanner.reset_caches()

    def tearDown(self):
        self.patch.stop()
        scanner.reset_caches()

    def test_scoped_entry_honored_for_its_locale_only(self):
        self.assertEqual(text_leaks('zzqx wwvy', 'hi'), [])
        self.assertEqual(len(text_leaks('zzqx wwvy', 'ru')), 1)


if __name__ == '__main__':
    unittest.main()
