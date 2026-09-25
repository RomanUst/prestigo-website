#!/usr/bin/env python3
"""LocaleSwitcher end-to-end audit (VER-01, D-13).

Proves the header LocaleSwitcher (components/LocaleSwitcher.tsx) navigates
to the SAME page in the target locale, for every ordered (source, target)
pair on a deep content page (/routes/prague-vienna — 42 pairs, source !=
target), plus one rotating target per source locale on 3 extra pages
(/, /book, /fleet — 21 more cases). The switcher trigger/menu are located
via their stable id PREFIX (`locale-switcher-trigger-`/`locale-switcher-
menu-` — the suffix is a React useId() value, unpredictable per render),
never by aria-haspopup alone (which also matches the signed-in NAV-02
account-menu trigger).

The NEXT_LOCALE cookie is recorded for information only — next-intl sets it
on every response regardless of whether the switcher was used (see
project_nextintl_locale_cookie_always_set memory), so its presence is never
treated as a pass signal.

Usage: python3 scripts/qa/switcher_audit.py [base_url] [--locales en,ru,...]
`--locales` restricts the SOURCE locale set tested; targets are always
drawn from the full 7-locale set so a restricted run still exercises real
cross-locale switches.
Writes scripts/qa/out/switcher_audit.json.
Exit codes: 0 = clean, 1 = findings present, 2 = infrastructure error.
"""
import argparse
import json
import os
import sys
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

LOCS = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh']

LOCALE_ENDONYMS = {
    'en': 'English',
    'ru': 'Русский',
    'es': 'Español',
    'fr': 'Français',
    'ar': 'العربية',
    'hi': 'हिन्दी',
    'zh': '中文',
}

ABORT_SUBSTRINGS = [
    'google-analytics.com', 'googletagmanager.com', '/g/collect',
    'facebook.com/tr', 'connect.facebook.net',
]

INIT_SCRIPT = "localStorage.setItem('prestigo_consent_v2', JSON.stringify({analytics:false,marketing:false}));"

EXTRA_PAGES = ['/', '/book', '/fleet']
DEEP_PAGE = '/routes/prague-vienna'

OUT_DIR = os.path.join('scripts', 'qa', 'out')
OUT_PATH = os.path.join(OUT_DIR, 'switcher_audit.json')


def build_url(base: str, loc: str, path: str) -> str:
    if loc == 'en':
        return base + path
    return base + '/' + loc + (path if path != '/' else '')


def make_route_handler():
    def handler(route):
        url = route.request.url
        if any(s in url for s in ABORT_SUBSTRINGS):
            route.abort()
        else:
            route.continue_()
    return handler


def run_switch(page, context, base: str, source: str, target: str, path: str) -> dict:
    source_url = build_url(base, source, path)
    expected_url = build_url(base, target, path)
    expected_path = urlparse(expected_url).path or '/'
    record = {
        'sourceUrl': source_url,
        'target': target,
        'expectedPath': expected_path,
        'findings': [],
    }
    try:
        # One retry on the initial navigation: production occasionally hits a
        # transient slow/cold response under a rapid-fire test run — a retry
        # distinguishes a genuine functional failure from infra noise.
        try:
            page.goto(source_url, wait_until='load', timeout=90000)
        except Exception:
            page.goto(source_url, wait_until='load', timeout=90000)
        page.wait_for_timeout(500)

        trigger = page.locator('[id^="locale-switcher-trigger-"]:visible')
        if trigger.count() == 0:
            record['findings'].append('locale switcher trigger not found/visible')
            return record
        trigger_id = trigger.first.get_attribute('id')
        trigger.first.click()

        # The dropdown <div role="menu"> is always mounted (opacity/pointer-
        # events toggle, not conditional render) — explicitly wait for
        # aria-expanded="true" on THIS trigger before clicking a menuitem,
        # rather than relying on Playwright's default actionability retry
        # alone, which produced intermittent false failures under rapid-fire
        # testing (isolated single-case re-runs always succeeded).
        try:
            page.wait_for_function(
                "(id) => { const el = document.getElementById(id); return !!el && el.getAttribute('aria-expanded') === 'true'; }",
                arg=trigger_id,
                timeout=5000,
            )
        except Exception:
            record['findings'].append('switcher dropdown never reached aria-expanded=true after trigger click')
            return record

        menuitem = page.locator('[id^="locale-switcher-menu-"] [role="menuitem"]', has_text=LOCALE_ENDONYMS[target])
        if menuitem.count() == 0:
            record['findings'].append(f'menuitem for target locale {target!r} ({LOCALE_ENDONYMS[target]!r}) not found')
            return record
        menuitem.first.click()

        # Poll for the URL to actually reach the target locale/path (up to
        # 10s) instead of a single fixed sleep — a fixed short sleep produced
        # false failures under rapid-fire testing when a navigation was
        # merely slow, not broken (verified by isolated re-run).
        try:
            page.wait_for_url(
                lambda url: (urlparse(url).path or '/') == expected_path,
                timeout=10000,
            )
        except Exception:
            pass  # fall through — final state below still gets checked/recorded

        final_url = page.url
        final_path = urlparse(final_url).path or '/'
        html_lang = page.evaluate("document.documentElement.getAttribute('lang')")
        next_locale_cookie = next(
            (c['value'] for c in context.cookies() if c['name'] == 'NEXT_LOCALE'), None
        )

        record['finalUrl'] = final_url
        record['finalPath'] = final_path
        record['htmlLang'] = html_lang
        record['nextLocaleCookie'] = next_locale_cookie  # informational only

        if final_path != expected_path:
            record['findings'].append(f'final path {final_path!r} != expected {expected_path!r}')
        if html_lang != target:
            record['findings'].append(f'html lang={html_lang!r} (expected {target!r})')
    except Exception as e:
        record['findings'].append(f'error: {str(e)[:200]}')

    return record


def main() -> int:
    parser = argparse.ArgumentParser(description='switcher_audit — VER-01/D-13 LocaleSwitcher navigation check')
    parser.add_argument('base_url', nargs='?', default='https://rideprestigo.com')
    parser.add_argument('--locales', default=','.join(LOCS))
    args = parser.parse_args()
    base = args.base_url.rstrip('/')
    requested_sources = [l.strip() for l in args.locales.split(',') if l.strip()]

    os.makedirs(OUT_DIR, exist_ok=True)

    results: list = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={'width': 1280, 'height': 900}, locale='en-US')
            context.add_init_script(INIT_SCRIPT)
            context.route('**/*', make_route_handler())
            page = context.new_page()

            # Main matrix: every ordered (source, target) pair, source != target,
            # on the deep content page. Deterministic order: routing-locale order
            # for source, then routing-locale order for target.
            for source in requested_sources:
                for target in LOCS:
                    if target == source:
                        continue
                    results.append(run_switch(page, context, base, source, target, DEEP_PAGE))

            # Rotating-target extra coverage on 3 extra pages per source locale.
            for source in requested_sources:
                src_idx = LOCS.index(source)
                for offset, extra_path in enumerate(EXTRA_PAGES, start=1):
                    target = LOCS[(src_idx + offset) % len(LOCS)]
                    results.append(run_switch(page, context, base, source, target, extra_path))

            browser.close()
    except Exception as e:
        print(f'INFRA ERROR: {e}', file=sys.stderr)
        return 2

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=1)

    total_failures = 0
    for r in results:
        if r['findings']:
            total_failures += 1
            print(f"FAIL {r['sourceUrl']} -> {r['target']}")
            for finding in r['findings']:
                print('   ', finding)

    print(f'switcher_audit: {len(results)} switch operations tested, {total_failures} with findings')
    return 1 if total_failures else 0


if __name__ == '__main__':
    sys.exit(main())
