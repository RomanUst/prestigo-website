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


if __name__ == '__main__':
    unittest.main()
