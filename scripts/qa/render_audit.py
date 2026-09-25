#!/usr/bin/env python3
"""Production render audit: every locale x key page (7 locales x 21 pages,
copied verbatim from scripts/qa/overflow_audit.py's PAGES/LOCS lists).

For each URL, records HTTP status, <html lang>, <html dir>, canonical
presence, hreflang alternate count, and every securitypolicyviolation event
fired while the page was open. Fails a URL when: status != 200; lang does
not match the locale code; dir=rtl on any locale other than 'ar' (or
dir!=rtl on 'ar'); or a CSP violation fired.

Usage: python3 scripts/qa/render_audit.py [base_url] [--locales en,ru,es,fr,ar,hi,zh]
Requires Python Playwright. Writes scripts/qa/out/render_audit.json.

Exit codes: 0 = clean, 1 = findings present, 2 = infrastructure error
(browser launch / network failure unrelated to a specific page check).
"""
import argparse
import json
import os
import sys

from playwright.sync_api import sync_playwright

# Copied verbatim from scripts/qa/overflow_audit.py for coverage parity.
PAGES = [
    '/', '/about', '/fleet', '/services', '/services/airport-transfer',
    '/services/city-rides', '/services/intercity-routes', '/services/vip-events',
    '/services/group-transfers', '/services/concierge', '/routes',
    '/routes/prague-vienna', '/routes/prague-ceske-budejovice',
    '/routes/prague-marianske-lazne', '/corporate', '/contact', '/faq',
    '/book', '/book/multi-day', '/blog', '/login',
]
# i18n/locales.ts routing order: en, ru, es, fr, ar, hi, zh. 'ar' is the only
# rtlLocales entry (i18n/locales.ts).
LOCS = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh']
RTL_LOCALES = {'ar'}

# T-75-01: never let a QA run send real analytics hits to production.
ABORT_SUBSTRINGS = [
    'google-analytics.com',
    'googletagmanager.com',
    '/g/collect',
    'facebook.com/tr',
    'connect.facebook.net',
]

INIT_SCRIPT = """
localStorage.setItem('prestigo_consent_v2', JSON.stringify({analytics:false,marketing:false}));
window.__cspViolations = [];
document.addEventListener('securitypolicyviolation', function(e) {
  window.__cspViolations.push({
    violatedDirective: e.violatedDirective,
    blockedURI: e.blockedURI,
    sourceFile: e.sourceFile,
  });
});
"""

OUT_DIR = os.path.join('scripts', 'qa', 'out')
OUT_PATH = os.path.join(OUT_DIR, 'render_audit.json')


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


def audit_page(page, url: str, loc: str) -> dict:
    findings = []
    try:
        resp = page.goto(url, wait_until='load', timeout=90000)
        page.wait_for_timeout(1200)
        status = resp.status if resp else None
        html_lang = page.evaluate("document.documentElement.getAttribute('lang')")
        html_dir = page.evaluate("document.documentElement.getAttribute('dir')")
        has_canonical = page.evaluate("!!document.querySelector('link[rel=canonical]')")
        alt_count = page.evaluate("document.querySelectorAll('link[rel=alternate][hreflang]').length")
        csp_violations = page.evaluate("window.__cspViolations || []")

        if status != 200:
            findings.append(f'status={status} (expected 200)')
        if html_lang != loc:
            findings.append(f'lang={html_lang!r} (expected {loc!r})')
        expected_rtl = loc in RTL_LOCALES
        is_rtl = html_dir == 'rtl'
        if expected_rtl and not is_rtl:
            findings.append(f'dir={html_dir!r} (expected rtl for locale {loc})')
        if not expected_rtl and is_rtl:
            findings.append(f'dir=rtl unexpected for non-rtl locale {loc}')
        if not has_canonical:
            findings.append('missing canonical link')
        for v in csp_violations:
            findings.append(
                f"csp_violation directive={v.get('violatedDirective')} blocked={v.get('blockedURI')} source={v.get('sourceFile')}"
            )

        return {
            'status': status,
            'lang': html_lang,
            'dir': html_dir,
            'hasCanonical': has_canonical,
            'alternateCount': alt_count,
            'cspViolations': csp_violations,
            'findings': findings,
        }
    except Exception as e:  # per-URL failure, not infra-fatal
        return {'error': str(e)[:200], 'findings': [f'error: {str(e)[:200]}']}


def main() -> int:
    parser = argparse.ArgumentParser(description='render_audit — VER-01 render + CSP-violation check')
    parser.add_argument('base_url', nargs='?', default='https://rideprestigo.com')
    parser.add_argument('--locales', default=','.join(LOCS))
    args = parser.parse_args()

    requested_locales = [l.strip() for l in args.locales.split(',') if l.strip()]
    base = args.base_url.rstrip('/')

    os.makedirs(OUT_DIR, exist_ok=True)

    # locales dict preserves insertion order == deterministic output order.
    results: dict = {}

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={'width': 1280, 'height': 900}, locale='en-US')
            context.add_init_script(INIT_SCRIPT)
            context.route('**/*', make_route_handler())
            page = context.new_page()

            for loc in requested_locales:
                results[loc] = {}
                for path in PAGES:
                    url = build_url(base, loc, path)
                    results[loc][url] = audit_page(page, url, loc)

            browser.close()
    except Exception as e:
        print(f'INFRA ERROR: {e}', file=sys.stderr)
        return 2

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=1)

    total_urls = 0
    total_failures = 0
    for loc, urls in results.items():
        for url, r in urls.items():
            total_urls += 1
            findings = r.get('findings', [])
            if findings:
                total_failures += 1
                print(f'FAIL {url}')
                for finding in findings:
                    print('   ', finding)

    print(f'render_audit: {total_urls} URLs checked, {total_failures} with findings')
    return 1 if total_failures else 0


if __name__ == '__main__':
    sys.exit(main())
