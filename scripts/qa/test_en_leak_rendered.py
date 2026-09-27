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

    def test_hi_kept_loanwords_are_hi_scoped_only(self):
        # 75-29 user decision keep-per-glossary: hi keeps Latin travel/tech
        # loanwords (hi-scoped inlineTerms). They must NOT be masked in any
        # other locale.
        self.assertEqual(text_leaks('airport pickup के लिए फ़्लाइट ट्रैकिंग', 'hi'), [])
        self.assertEqual(len(text_leaks('airport pickup для отслеживания рейса', 'ru')), 1)
        self.assertEqual(len(text_leaks('airport pickup 的航班追踪', 'zh')), 1)

    def test_hi_untranslated_english_still_leaks_next_to_kept_loanwords(self):
        # Genuine English phrases inside Hindi stay flagged even when they
        # sit next to kept loanwords.
        self.assertEqual(len(text_leaks('आपका driver live air-traffic-control डेटा देखता है', 'hi')), 1)
        self.assertEqual(len(text_leaks('अंतिम घंटे के भीतर last-minute रद्दीकरण', 'hi')), 1)
        self.assertEqual(len(text_leaks('Seamless from landing to hotel', 'hi')), 1)
        self.assertEqual(len(text_leaks('Flight tracking included', 'hi')), 1)

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


EN_DEFAULT_TITLE = 'PRESTIGO — Premium Chauffeur Service Prague'
EN_DEFAULT_DESCRIPTION = (
    'Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. '
    'Fixed prices, flight tracking, meet & greet.'
)


class TwitterMetaTest(unittest.TestCase):
    """Plan 75-32 Task 1 (WR-02/WR-03): twitter:* meta is read and English X cards are findings."""

    def test_extract_js_reads_twitter_meta(self):
        self.assertIn('twitter:title', scanner.EXTRACT_JS)
        self.assertIn('twitter:description', scanner.EXTRACT_JS)

    def test_english_twitter_title_is_meta_leak_ru(self):
        leaks = scanner.collect_leaks({'meta': [EN_DEFAULT_TITLE]}, '/fleet', 'ru')
        self.assertEqual([l['kind'] for l in leaks], ['meta'])

    def test_localized_title_not_a_leak_ru(self):
        s = 'Автопарк Mercedes — PRESTIGO'
        self.assertEqual(scanner.collect_leaks({'meta': [s]}, '/fleet', 'ru'), [])


class EsFrMetaIdenticalTest(unittest.TestCase):
    """Plan 75-32 Task 1: es/fr meta identical to the EN page's meta (2+ significant words)."""

    def test_identical_en_description_is_flagged_es(self):
        data = {'texts': [], 'meta': [EN_DEFAULT_DESCRIPTION]}
        leaks = scanner.collect_es_fr_leaks(data, set(), 'es', en_meta={EN_DEFAULT_DESCRIPTION})
        self.assertEqual([l['kind'] for l in leaks], ['meta-identical-to-en'])

    def test_spanish_description_not_flagged(self):
        s = 'Servicio de chófer premium en Praga. Traslados al aeropuerto y rutas interurbanas.'
        data = {'meta': [s]}
        self.assertEqual(scanner.collect_es_fr_leaks(data, set(), 'es', en_meta={EN_DEFAULT_DESCRIPTION}), [])

    def test_two_word_identical_meta_is_flagged_fr(self):
        # The legacy default title strips to 'Premium Chauffeur' (2 words) —
        # a 3-word threshold would miss it; the meta rule uses 2.
        self.assertFalse(scanner.has_significant_words(EN_DEFAULT_TITLE, 3, 'fr'))
        leaks = scanner.collect_es_fr_leaks({'meta': [EN_DEFAULT_TITLE]}, set(), 'fr', en_meta={EN_DEFAULT_TITLE})
        self.assertEqual([l['kind'] for l in leaks], ['meta-identical-to-en'])

    def test_brand_only_identical_meta_not_flagged(self):
        self.assertEqual(scanner.collect_es_fr_leaks({'meta': ['PRESTIGO']}, set(), 'es', en_meta={'PRESTIGO'}), [])

    def test_meta_not_in_en_meta_not_flagged(self):
        # An English-looking meta that differs from EN is not an identical-to-EN finding.
        self.assertEqual(
            scanner.collect_es_fr_leaks({'meta': ['Some other English words']}, set(), 'es', en_meta={EN_DEFAULT_TITLE}),
            [],
        )

    def test_positional_call_without_en_meta_unchanged(self):
        s = 'Founder of PRESTIGO. 10+ years in luxury transportation and 5★ hospitality in Prague.'
        self.assertEqual(len(scanner.collect_es_fr_leaks({'texts': [s]}, {s}, 'es')), 1)
        # meta is ignored when en_meta is not given
        self.assertEqual(scanner.collect_es_fr_leaks({'meta': [EN_DEFAULT_DESCRIPTION]}, set(), 'es'), [])


def kinds_values(leaks):
    return sorted((l['kind'], l['value']) for l in leaks)


class JoinedTextTest(unittest.TestCase):
    """Plan 75-32 Task 2 (WR-03): English split across JSX text nodes is caught at element level."""

    def test_split_byline_ru_is_joined_text_and_en_date(self):
        data = {'texts': ['Published', '13 July 2026'], 'joined': ['Published 13 July 2026']}
        leaks = scanner.collect_locale_leaks(data, '/blog/x', 'ru')
        self.assertEqual(kinds_values(leaks), [('en-date', '13 July 2026'), ('joined-text', 'Published 13 July 2026')])

    def test_localized_byline_ru_no_leak(self):
        data = {'texts': ['Опубликовано', '13 июля 2026 г.'], 'joined': ['Опубликовано 13 июля 2026 г.']}
        self.assertEqual(scanner.collect_locale_leaks(data, '/blog/x', 'ru'), [])

    def test_node_level_leak_not_double_reported(self):
        data = {'texts': ['Book your chauffeur now', 'today'], 'joined': ['Book your chauffeur now today']}
        leaks = scanner.collect_locale_leaks(data, '/', 'ru')
        self.assertEqual(kinds_values(leaks), [('text', 'Book your chauffeur now')])

    def test_joined_allowlisted_model_name_not_a_leak_ar(self):
        data = {'texts': ['Mercedes', 'E-Class'], 'joined': ['Mercedes E-Class']}
        self.assertEqual(scanner.collect_locale_leaks(data, '/fleet', 'ar'), [])

    def test_collect_joined_leaks_direct(self):
        data = {'joined': ['Published 13 July 2026', 'Book your chauffeur now today']}
        leaks = scanner.collect_joined_leaks(data, {'Book your chauffeur now'}, 'zh')
        self.assertEqual(kinds_values(leaks), [('joined-text', 'Published 13 July 2026')])

    def test_es_joined_identical_to_en(self):
        s = 'Published by Roman Ustyugov on the company blog'
        data = {'texts': ['Published by', 'Roman Ustyugov', 'on the company blog'], 'joined': [s]}
        leaks = scanner.collect_locale_leaks(data, '/blog/x', 'es', en_strings={s}, en_meta=set())
        self.assertIn(('identical-to-en', s), kinds_values(leaks))

    def test_es_joined_not_double_reported_with_identical_node(self):
        s = 'Book your chauffeur now'
        data = {'texts': [s], 'joined': [s + ' today']}
        leaks = scanner.collect_locale_leaks(data, '/', 'es', en_strings={s, s + ' today'}, en_meta=set())
        self.assertEqual(kinds_values(leaks), [('identical-to-en', s)])

    def test_missing_joined_key_is_tolerated(self):
        self.assertEqual(scanner.collect_locale_leaks({'texts': ['Прага']}, '/', 'ru'), [])


class EnglishDateTest(unittest.TestCase):
    """Plan 75-32 Task 2 (WR-04): English-formatted dates on non-EN locales."""

    def test_regex_symbol_exists(self):
        self.assertTrue(hasattr(scanner, 'ENGLISH_DATE_RE'))

    def test_day_month_year(self):
        leaks = scanner.collect_date_leaks({'texts': ['2 September 2026'], 'joined': []})
        self.assertEqual(kinds_values(leaks), [('en-date', '2 September 2026')])

    def test_us_order(self):
        leaks = scanner.collect_date_leaks({'texts': ['Updated July 13, 2026']})
        self.assertEqual(kinds_values(leaks), [('en-date', 'July 13, 2026')])

    def test_unique_across_texts_and_joined(self):
        leaks = scanner.collect_date_leaks({'texts': ['13 July 2026'], 'joined': ['Published 13 July 2026']})
        self.assertEqual(kinds_values(leaks), [('en-date', '13 July 2026')])

    def test_localized_dates_not_flagged(self):
        for loc, s in (
            ('zh', '2026年7月13日'),
            ('fr', '13 juillet 2026'),
            ('es', '13 de julio de 2026'),
            ('ar', '13 يوليو 2026'),
            ('hi', '13 जुलाई 2026'),
            ('ru', '13 июля 2026 г.'),
        ):
            self.assertEqual(scanner.collect_date_leaks({'texts': [s], 'joined': [s]}), [], loc)

    def test_en_date_applies_to_es_fr(self):
        for loc in ('es', 'fr'):
            leaks = scanner.collect_locale_leaks({'texts': ['29 August 2026']}, '/blog', loc, en_strings=set(), en_meta=set())
            self.assertEqual(kinds_values(leaks), [('en-date', '29 August 2026')], loc)


class ExtractJsBrowserTest(unittest.TestCase):
    """Optional: runs EXTRACT_JS in headless Chromium; skipped when Playwright/Chromium is unavailable."""

    def test_extract_js_twitter_and_joined(self):
        try:
            from playwright.sync_api import sync_playwright
        except Exception:  # pragma: no cover
            self.skipTest('playwright not installed')
        html = (
            '<html><head><title>t</title>'
            '<meta name="twitter:title" content="Twitter Title Here"></head>'
            '<body><p>Published <!-- --> 13 July 2026</p></body></html>'
        )
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.set_content(html)
                data = page.evaluate(scanner.EXTRACT_JS)
                browser.close()
        except Exception as e:  # pragma: no cover
            self.skipTest(f'chromium unavailable: {e}')
        self.assertIn('Twitter Title Here', data['meta'])
        self.assertIn('Published 13 July 2026', data['joined'])


if __name__ == '__main__':
    unittest.main()
