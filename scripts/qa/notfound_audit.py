#!/usr/bin/env python3
"""Localized-404 + catch-all non-shadowing audit (Phase 75, Plan 25 —
GAP-4a / WINDOWS #22).

Localized-404 block (Playwright, per locale; EN has no prefix): loads
/this-page-does-not-exist, /qa/nested/missing-page and the dynamic-segment
miss /blog/this-post-does-not-exist (Plan 75-32, WR-01 — an unknown blog slug
404s through blog/[slug]'s notFound(), not the catch-all) under the locale and
asserts
  - the navigation response status is 404 (no soft-404),
  - after hydration (load + 1500 ms) document.documentElement.lang equals the
    locale, dir is rtl for ar and not rtl otherwise,
  - the h1 contains that catalog's NotFound.headingLine1,
  - document.title equals that catalog's NotFound.metaTitle.
The raw SSR HTML of a notFound() response is Next's error shell, so these
checks are made in a real browser after hydration, never with curl.
The raw server HTML <title>/<meta> of these 404 paths (what crawlers and
link-preview bots see, incl. the brand-doubled title class) is checked by
scripts/qa/share_meta_audit.py, not here.

Non-shadowing block (plain HTTP status, no browser): the required
app/[locale]/[...rest] catch-all must shadow nothing — pages, static and
metadata files stay 200; /api/does-not-exist and an unknown locale prefix
(/de/foo) stay 404.

Usage: python3 scripts/qa/notfound_audit.py [base_url] [--locales en,ru,es,fr,ar,hi,zh]
  base_url   defaults to https://rideprestigo.com (use e.g.
             http://localhost:3100 for a local dev/prod server)
  --locales  comma-separated subset of the 7 locales for the localized block
Requires Python Playwright (certifi optional, used for TLS on status checks).
Writes scripts/qa/out/notfound_audit.json.

Exit codes: 0 = every check passes, 1 = findings present, 2 = infrastructure
error (browser launch / network failure unrelated to a specific check).
"""
import argparse
import json
import os
import ssl
import sys
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = None

# i18n/locales.ts routing order; 'ar' is the only rtlLocales entry.
LOCS = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh']
RTL_LOCALES = {'ar'}

MISSING_PATHS = ['/this-page-does-not-exist', '/qa/nested/missing-page', '/blog/this-post-does-not-exist']

# (path, expected status). Plain HTTP, redirects NOT followed — a redirect is
# reported as its own 3xx status, never silently resolved to a 200.
SHADOWING_CHECKS = [
    ('/', 200),
    ('/ru', 200),
    ('/ru/fleet', 200),
    ('/ru/routes/prague-vienna', 200),
    ('/ru/blog/beyond-transport-luxury-chauffeur-service-prague', 200),
    ('/sitemap.xml', 200),
    ('/robots.txt', 200),
    ('/llms.txt', 200),
    ('/favicon.ico', 200),
    ('/e-class-photo.avif', 200),
    ('/api/does-not-exist', 404),
    ('/de/foo', 404),
]

# T-75-01: never let a QA run send real analytics hits to production.
ABORT_SUBSTRINGS = [
    'google-analytics.com',
    'googletagmanager.com',
    '/g/collect',
    'facebook.com/tr',
    'connect.facebook.net',
]

INIT_SCRIPT = "localStorage.setItem('prestigo_consent_v2', JSON.stringify({analytics:false,marketing:false}));"

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join('scripts', 'qa', 'out')
OUT_PATH = os.path.join(OUT_DIR, 'notfound_audit.json')


def load_expected(loc: str) -> dict:
    with open(os.path.join(REPO_ROOT, 'messages', f'{loc}.json'), encoding='utf-8') as f:
        nf = json.load(f).get('NotFound', {})
    return {'headingLine1': nf.get('headingLine1'), 'metaTitle': nf.get('metaTitle')}


def build_url(base: str, loc: str, path: str) -> str:
    if loc == 'en':
        return base + path
    return base + '/' + loc + (path if path != '/' else '')


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _opener():
    handlers = [_NoRedirect()]
    if SSL_CONTEXT is not None:
        handlers.append(HTTPSHandler(context=SSL_CONTEXT))
    return build_opener(*handlers)


def fetch_status(url: str, timeout: int = 90, retries: int = 1) -> int:
    # 90 s matches the Playwright goto timeout: a local `next dev` compiles a
    # route on first hit (a blog page took ~35 s), and prod cold starts vary.
    opener = _opener()
    last_err = None
    for _ in range(retries + 1):
        try:
            req = Request(url, headers={'User-Agent': 'PrestigoQA/1.0'})
            with opener.open(req, timeout=timeout) as resp:
                return resp.status
        except HTTPError as e:
            return e.code
        except URLError as e:
            last_err = e
    raise last_err


def make_route_handler():
    def handler(route):
        url = route.request.url
        if any(s in url for s in ABORT_SUBSTRINGS):
            route.abort()
        else:
            route.continue_()
    return handler


def audit_localized(page, url: str, loc: str, expected: dict) -> dict:
    findings = []
    try:
        resp = page.goto(url, wait_until='load', timeout=90000)
        page.wait_for_timeout(1500)
        status = resp.status if resp else None
        lang = page.evaluate("document.documentElement.getAttribute('lang')")
        html_dir = page.evaluate("document.documentElement.getAttribute('dir')")
        h1 = page.evaluate("(document.querySelector('h1') || {}).textContent || ''")
        title = page.evaluate('document.title')

        if status != 404:
            findings.append(f'status={status} (expected 404)')
        if lang != loc:
            findings.append(f'lang={lang!r} (expected {loc!r})')
        if loc in RTL_LOCALES and html_dir != 'rtl':
            findings.append(f'dir={html_dir!r} (expected rtl for {loc})')
        if loc not in RTL_LOCALES and html_dir == 'rtl':
            findings.append(f'dir=rtl unexpected for {loc}')
        heading = expected.get('headingLine1')
        if not heading or heading not in h1:
            findings.append(f'h1={h1.strip()[:80]!r} (expected to contain {heading!r})')
        meta_title = expected.get('metaTitle')
        if not meta_title or title != meta_title:
            findings.append(f'title={title!r} (expected {meta_title!r})')

        return {
            'status': status,
            'lang': lang,
            'dir': html_dir,
            'h1': h1.strip()[:200],
            'title': title,
            'pass': not findings,
            'findings': findings,
        }
    except Exception as e:  # per-URL failure, not infra-fatal
        return {'error': str(e)[:200], 'pass': False, 'findings': [f'error: {str(e)[:200]}']}


def main() -> int:
    parser = argparse.ArgumentParser(
        description='notfound_audit — localized 404 (lang/dir/h1/title/status) + catch-all non-shadowing check',
    )
    parser.add_argument('base_url', nargs='?', default='https://rideprestigo.com',
                        help='site origin to audit (default: https://rideprestigo.com)')
    parser.add_argument('--locales', default=','.join(LOCS),
                        help='comma-separated locales for the localized-404 block (default: all 7)')
    args = parser.parse_args()

    requested = [l.strip() for l in args.locales.split(',') if l.strip()]
    unknown = [l for l in requested if l not in LOCS]
    if unknown:
        print(f'unknown locale(s): {unknown}', file=sys.stderr)
        return 2
    base = args.base_url.rstrip('/')
    os.makedirs(OUT_DIR, exist_ok=True)

    findings: list = []
    shadowing: dict = {}
    try:
        for path, expected_status in SHADOWING_CHECKS:
            status = fetch_status(base + path)
            ok = status == expected_status
            shadowing[path] = {'status': status, 'expected': expected_status, 'pass': ok}
            if not ok:
                findings.append(f'shadowing {path}: status={status} (expected {expected_status})')
    except (URLError, OSError) as e:
        print(f'infrastructure error during status checks: {e}', file=sys.stderr)
        return 2

    localized: dict = {}
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={'width': 1280, 'height': 900}, locale='en-US')
            context.add_init_script(INIT_SCRIPT)
            context.route('**/*', make_route_handler())
            page = context.new_page()
            for loc in requested:
                expected = load_expected(loc)
                localized[loc] = {}
                for path in MISSING_PATHS:
                    url = build_url(base, loc, path)
                    result = audit_localized(page, url, loc, expected)
                    localized[loc][path] = result
                    for f in result['findings']:
                        findings.append(f'localized {url}: {f}')
            browser.close()
    except Exception as e:
        print(f'infrastructure error (browser): {e}', file=sys.stderr)
        return 2

    report = {'base_url': base, 'localized': localized, 'shadowing': shadowing, 'findings': findings}
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    shadow_pass = sum(1 for r in shadowing.values() if r['pass'])
    loc_total = sum(len(v) for v in localized.values())
    loc_pass = sum(1 for v in localized.values() for r in v.values() if r.get('pass'))
    print(f'non-shadowing: {shadow_pass}/{len(shadowing)} PASS')
    print(f'localized 404: {loc_pass}/{loc_total} PASS')
    for f in findings:
        print(f'  - {f}')
    print(f'wrote {OUT_PATH}')
    return 0 if not findings else 1


if __name__ == '__main__':
    sys.exit(main())
