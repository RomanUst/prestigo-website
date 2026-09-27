#!/usr/bin/env python3
"""Unit tests for scripts/qa/share_meta_audit.py (Phase 75 Plan 32).

Stdlib unittest only — no network. Run with:
    python3 -m unittest discover -s scripts/qa -p 'test_*.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import share_meta_audit as audit  # noqa: E402

EN_T = 'PRESTIGO — Premium Chauffeur Service Prague'
EN_D = ('Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. '
        'Fixed prices, flight tracking, meet &amp; greet.')

RU_404_TITLE = 'Страница не найдена — PRESTIGO'


def head(title_tags, metas):
    parts = ['<!DOCTYPE html><html><head><meta charset="utf-8"/>']
    parts += [f'<title>{t}</title>' for t in title_tags]
    for attr, key, value in metas:
        parts.append(f'<meta {attr}="{key}" content="{value}"/>')
    parts.append('</head><body><p>x</p></body></html>')
    return ''.join(parts)


def kinds(findings):
    return sorted({f['kind'] for f in findings})


# The current production ru 404 shape (verifier curl, 2026-09-27).
PROD_RU_404 = head(
    ['Page Not Found — PRESTIGO | PRESTIGO'],
    [
        ('name', 'description', EN_D),
        ('property', 'og:title', EN_T),
        ('property', 'og:description', EN_D),
        ('property', 'og:image:alt', EN_T),
        ('name', 'twitter:title', EN_T),
        ('name', 'twitter:description', EN_D),
    ],
)

FIXED_RU_404 = head(
    [RU_404_TITLE],
    [
        ('name', 'description', 'Такой страницы нет. Вернитесь на главную или забронируйте поездку.'),
        ('property', 'og:title', RU_404_TITLE),
        ('property', 'og:description', 'Такой страницы нет. Вернитесь на главную или забронируйте поездку.'),
        ('name', 'twitter:title', RU_404_TITLE),
        ('name', 'twitter:description', 'Такой страницы нет. Вернитесь на главную или забронируйте поездку.'),
    ],
)


class ConstantsTest(unittest.TestCase):
    def test_constants(self):
        self.assertEqual(audit.EN_SITE_DEFAULT_TITLE, EN_T)
        self.assertTrue(audit.EN_SITE_DEFAULT_DESCRIPTION.startswith('Premium chauffeur service in Prague.'))
        self.assertIn('/blog/this-post-does-not-exist', audit.NOT_FOUND_PATHS)
        self.assertIn('/this-page-does-not-exist', audit.NOT_FOUND_PATHS)
        for p in audit.NOT_FOUND_PATHS:
            self.assertIn(p, audit.PAGES)
        self.assertEqual(audit.LOCS, ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'])


class ParseHeadMetaTest(unittest.TestCase):
    def test_entities_decoded_and_keys_lowercased(self):
        parsed = audit.parse_head_meta(head(['A &amp; B'], [('property', 'OG:Title', 'X &amp; Y')]))
        self.assertEqual(parsed['titles'], ['A & B'])
        self.assertEqual(parsed['meta']['og:title'], ['X & Y'])

    def test_title_inside_script_is_ignored(self):
        html = ('<html><head><title>Real</title><script>var s = "<title>Fake</title>";</script>'
                '</head><body></body></html>')
        self.assertEqual(audit.parse_head_meta(html)['titles'], ['Real'])

    def test_svg_title_is_ignored(self):
        html = '<html><head><title>Real</title></head><body><svg><title>Icon label</title></svg></body></html>'
        self.assertEqual(audit.parse_head_meta(html)['titles'], ['Real'])

    def test_repeated_title_and_meta_all_collected(self):
        html = head(['One', 'Two'], [('name', 'twitter:title', 'A'), ('name', 'twitter:title', 'B')])
        parsed = audit.parse_head_meta(html)
        self.assertEqual(parsed['titles'], ['One', 'Two'])
        self.assertEqual(parsed['meta']['twitter:title'], ['A', 'B'])

    def test_repeated_titles_all_checked(self):
        html = head([RU_404_TITLE, 'Page Not Found — PRESTIGO | PRESTIGO'],
                    [('property', 'og:title', RU_404_TITLE), ('name', 'twitter:title', RU_404_TITLE)])
        findings = audit.check_page(audit.parse_head_meta(html), 'ru', '/this-page-does-not-exist', 404, RU_404_TITLE)
        self.assertEqual(kinds(findings), ['notfound-title'])


class CheckPageTest(unittest.TestCase):
    def test_current_prod_ru_404_shape(self):
        findings = audit.check_page(audit.parse_head_meta(PROD_RU_404), 'ru',
                                    '/blog/this-post-does-not-exist', 404, RU_404_TITLE)
        self.assertIn('notfound-title', kinds(findings))
        self.assertIn('en-site-default', kinds(findings))
        self.assertNotIn('status', kinds(findings))

    def test_fixed_ru_404_has_no_findings(self):
        for path in audit.NOT_FOUND_PATHS:
            self.assertEqual(audit.check_page(audit.parse_head_meta(FIXED_RU_404), 'ru', path, 404, RU_404_TITLE), [], path)

    def test_ru_fleet_english_twitter_title(self):
        html = head(
            ['Наш автопарк | PRESTIGO'],
            [
                ('name', 'description', 'Автомобили Mercedes с водителем в Праге.'),
                ('property', 'og:title', 'Наш автопарк'),
                ('property', 'og:description', 'Автомобили Mercedes с водителем в Праге.'),
                ('name', 'twitter:title', EN_T),
                ('name', 'twitter:description', EN_D),
            ],
        )
        findings = audit.check_page(audit.parse_head_meta(html), 'ru', '/fleet', 200, RU_404_TITLE)
        self.assertEqual(kinds(findings), ['en-site-default', 'twitter-mirror'])

    def test_en_fleet_mirrored_has_no_findings(self):
        html = head(
            ['Our Fleet | PRESTIGO'],
            [
                ('name', 'description', EN_D),
                ('property', 'og:title', EN_T),
                ('property', 'og:description', EN_D),
                ('name', 'twitter:title', EN_T),
                ('name', 'twitter:description', EN_D),
            ],
        )
        self.assertEqual(audit.check_page(audit.parse_head_meta(html), 'en', '/fleet', 200, 'Page Not Found — PRESTIGO'), [])

    def test_missing_og_or_twitter_title_is_a_mirror_finding(self):
        html = head(['Наш автопарк'], [('name', 'twitter:title', 'Наш автопарк')])
        self.assertEqual(kinds(audit.check_page(audit.parse_head_meta(html), 'ru', '/fleet', 200, RU_404_TITLE)),
                         ['twitter-mirror'])
        html = head(['Наш автопарк'], [('property', 'og:title', 'Наш автопарк')])
        self.assertEqual(kinds(audit.check_page(audit.parse_head_meta(html), 'ru', '/fleet', 200, RU_404_TITLE)),
                         ['twitter-mirror'])

    def test_en_404_title_on_non_en_404_is_en_site_default(self):
        html = head([RU_404_TITLE], [('property', 'og:title', 'Page Not Found — PRESTIGO'),
                                     ('name', 'twitter:title', 'Page Not Found — PRESTIGO')])
        findings = audit.check_page(audit.parse_head_meta(html), 'ru', '/this-page-does-not-exist', 404, RU_404_TITLE)
        self.assertEqual(kinds(findings), ['en-site-default'])

    def test_wrong_status(self):
        parsed = audit.parse_head_meta(FIXED_RU_404)
        self.assertEqual(kinds(audit.check_page(parsed, 'ru', '/this-page-does-not-exist', 200, RU_404_TITLE)), ['status'])
        for code in (301, 302, 307, 308):
            fleet = audit.parse_head_meta(head(['Автопарк'], [('property', 'og:title', 'Автопарк'),
                                                               ('name', 'twitter:title', 'Автопарк')]))
            self.assertEqual(kinds(audit.check_page(fleet, 'ru', '/fleet', code, RU_404_TITLE)), ['status'], code)


class LoadExpectedTest(unittest.TestCase):
    def test_reads_catalog_not_found_title(self):
        self.assertEqual(audit.expected_404_title('en'), 'Page Not Found — PRESTIGO')
        self.assertTrue(audit.expected_404_title('ru'))


if __name__ == '__main__':
    unittest.main()
